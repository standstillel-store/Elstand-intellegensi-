import { isAddress, isHash, decodeEventLog, parseAbiItem, type Hash } from "viem";
import { getRewardChainClient } from "./chainClient";
import { LIQUIDITY_QUEST_CHAIN_CONFIG, LIQUIDITY_QUEST_CONFIGURED, BUY_ELS_QUEST_CONFIG, BUY_ELS_QUEST_CONFIGURED } from "./config";

// ---------------------------------------------------------------------------
// Brief Section 2 / 4 / 5: "Do NOT trust the frontend ... blockchain is
// source of truth ... backend is a deterministic verification engine."
// Everything in this file reads directly from chain (tx, receipt, decoded
// logs) and returns a small closed set of outcomes. No LLM call anywhere in
// this file, on purpose — see lib/rewards/README in the final report for
// where an AI layer is allowed to sit (after this, read-only).
// ---------------------------------------------------------------------------

export type VerificationOutcome =
  | { status: "VALID"; blockNumber: bigint; data: Record<string, unknown> }
  | { status: "INVALID"; reason: string; data?: Record<string, unknown> }
  | { status: "SYSTEM_ERROR"; reason: string };

const ERC20_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
/** Uniswap v4 PoolManager's core.ModifyLiquidity event — https://docs.uniswap.org/contracts/v4/reference/core/interfaces/IPoolManager#modifyliquidity-event */
const V4_MODIFY_LIQUIDITY = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
);

function normalize(address: string): string {
  return address.toLowerCase();
}

/** Shared plumbing: fetch tx + receipt, and run the input checks common to every quest (Section 4/5 rules 1-4). Returns either a terminal outcome (INVALID/SYSTEM_ERROR) or the fetched tx/receipt to let the caller run quest-specific rules on. Loosely typed (any) deliberately — viem's exact generic return shape for getTransaction/getTransactionReceipt varies by chain formatter and isn't worth fighting here; every field actually read below (from/to/chainId/status/logs/blockNumber) is present on the base Transaction/TransactionReceipt shape regardless. */
async function fetchAndCheckBasics(
  chainId: number,
  txHash: string,
  walletAddress: string
): Promise<{ ok: true; tx: any; receipt: any } | { ok: false; outcome: VerificationOutcome }> {
  if (!isHash(txHash)) return { ok: false, outcome: { status: "INVALID", reason: "Malformed transaction hash." } };
  if (!isAddress(walletAddress)) return { ok: false, outcome: { status: "INVALID", reason: "Malformed wallet address." } };

  let client;
  try {
    client = getRewardChainClient(chainId);
  } catch (err) {
    return { ok: false, outcome: { status: "SYSTEM_ERROR", reason: `Unsupported/misconfigured chain ${chainId}.` } };
  }

  let tx;
  try {
    tx = await client.getTransaction({ hash: txHash as Hash });
  } catch (err) {
    // Rule 1: tx exists. A "not found" style error from the RPC is treated
    // as INVALID (non-retryable — the hash genuinely doesn't exist on this
    // chain), while anything else (timeout, connection refused, 5xx) is a
    // SYSTEM_ERROR the user can retry per Section 8.
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|could not be found/i.test(message)) {
      return { ok: false, outcome: { status: "INVALID", reason: "Transaction not found on chain." } };
    }
    return { ok: false, outcome: { status: "SYSTEM_ERROR", reason: `RPC error fetching transaction: ${message}` } };
  }
  if (!tx) return { ok: false, outcome: { status: "INVALID", reason: "Transaction not found on chain." } };

  // Rule 4: sender matches connected wallet — the ONLY identity signal this
  // whole flow trusts is "who signed this on-chain tx", never a
  // frontend-asserted wallet address.
  if (normalize(tx.from) !== normalize(walletAddress)) {
    return { ok: false, outcome: { status: "INVALID", reason: "Transaction sender does not match the connected wallet." } };
  }

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A tx that exists but has no receipt yet is still pending — that's a
    // legitimate SYSTEM_ERROR/retry case (Section 19's "pending
    // transaction" test), not INVALID.
    return { ok: false, outcome: { status: "SYSTEM_ERROR", reason: `Transaction is pending or receipt unavailable: ${message}` } };
  }
  if (!receipt) {
    return { ok: false, outcome: { status: "SYSTEM_ERROR", reason: "Transaction is still pending." } };
  }

  // Rule 3: transaction succeeded.
  if (receipt.status !== "success") {
    return { ok: false, outcome: { status: "INVALID", reason: "Transaction failed on chain (reverted)." } };
  }

  return { ok: true, tx, receipt };
}

/**
 * Add Liquidity quest verifier — brief Section 4, rules 1-9 (rules 10/11,
 * the replay/one-time checks, live at the DB layer in lib/rewards/store.ts
 * against verified_transactions/reward_submissions, not here — this
 * function is pure "is this transaction itself valid", stateless and
 * side-effect-free so it can be re-run freely on SYSTEM_ERROR retry).
 */
export async function verifyAddLiquidityTransaction(txHash: string, walletAddress: string): Promise<VerificationOutcome> {
  if (!LIQUIDITY_QUEST_CONFIGURED) {
    return { status: "SYSTEM_ERROR", reason: "Add Liquidity verification is not configured on this deployment yet." };
  }

  const { chainId, poolManager, positionManager, elsTokenAddress, minimumElsAmountRaw } = LIQUIDITY_QUEST_CHAIN_CONFIG;
  const basics = await fetchAndCheckBasics(chainId, txHash, walletAddress);
  if (!basics.ok) return basics.outcome;
  const { tx, receipt } = basics;

  // Rule 2: correct chain. getRewardChainClient(chainId) already scopes the
  // RPC call to the right chain, but double-check the tx's own chainId
  // field where present (some RPCs omit it on legacy-typed txs, so this is
  // best-effort — the RPC endpoint itself is the authoritative chain scope).
  if (tx.chainId != null && tx.chainId !== chainId) {
    return { status: "INVALID", reason: `Transaction is on chain ${tx.chainId}, expected ${chainId}.` };
  }

  // Rule 5: interacts with the expected Uniswap V4 infrastructure. Verify
  // against the PoolManager singleton (present in every V4 pool
  // interaction, unlike a PositionManager address which Uniswap's own docs
  // warn is not guaranteed stable across deployments) — either as the
  // direct `to` of the tx, or as the emitter of a log in the receipt
  // (covers routing through a PositionManager/UniversalRouter that calls
  // into PoolManager internally). If positionManager IS configured,
  // additionally require it as the tx target for a tighter check.
  const touchesPoolManager =
    normalize(tx.to ?? "") === poolManager || receipt.logs.some((log) => normalize(log.address) === poolManager);
  if (!touchesPoolManager) {
    return { status: "INVALID", reason: "Transaction does not interact with the Uniswap V4 PoolManager." };
  }
  if (positionManager && normalize(tx.to ?? "") !== normalize(positionManager)) {
    return { status: "INVALID", reason: "Transaction was not sent to the configured Uniswap V4 Position Manager." };
  }

  // Rule 7: represents the required liquidity-provision activity — must
  // contain a ModifyLiquidity event from the PoolManager with a POSITIVE
  // liquidityDelta (negative = removing liquidity, which must not reward
  // this quest).
  let sawPositiveModifyLiquidity = false;
  let liquidityPoolId: string | null = null;
  for (const log of receipt.logs) {
    if (normalize(log.address) !== poolManager) continue;
    try {
      const decoded = decodeEventLog({ abi: [V4_MODIFY_LIQUIDITY], data: log.data, topics: log.topics });
      if (decoded.eventName === "ModifyLiquidity" && (decoded.args as any).liquidityDelta > BigInt(0)) {
        sawPositiveModifyLiquidity = true;
        liquidityPoolId = (decoded.args as any).id as string;
      }
    } catch {
      // Not a ModifyLiquidity log (could be Swap/Donate/Initialize/etc.) — ignore and keep scanning.
    }
  }
  if (!sawPositiveModifyLiquidity) {
    return { status: "INVALID", reason: "Transaction does not represent a liquidity-provision (ModifyLiquidity) action." };
  }

  // Rule 6/8/9: the ELS token is involved, moved INTO the pool, and meets
  // the minimum amount. V4 uses flash accounting — the ERC20-side transfer
  // for a non-native currency leg lands as a standard Transfer log with
  // `to == poolManager` (settling the delta) within the same tx.
  let elsAmountIn = BigInt(0);
  for (const log of receipt.logs) {
    if (normalize(log.address) !== elsTokenAddress) continue;
    try {
      const decoded = decodeEventLog({ abi: [ERC20_TRANSFER], data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer" && normalize((decoded.args as any).to) === poolManager) {
        elsAmountIn += (decoded.args as any).value as bigint;
      }
    } catch {
      // Non-Transfer log on the ELS token contract — ignore.
    }
  }
  if (elsAmountIn === BigInt(0)) {
    return { status: "INVALID", reason: "The configured ELS token was not moved into the liquidity pool by this transaction." };
  }
  if (minimumElsAmountRaw > BigInt(0) && elsAmountIn < minimumElsAmountRaw) {
    return { status: "INVALID", reason: "ELS liquidity amount is below the configured minimum." };
  }

  return {
    status: "VALID",
    blockNumber: receipt.blockNumber,
    data: {
      poolId: liquidityPoolId,
      elsAmountIn: elsAmountIn.toString(),
      to: tx.to,
    },
  };
}

/**
 * Buy ELS quest verifier — brief Section 5. Structurally identical shape to
 * Add Liquidity (fetch → chain/status/sender checks → contract check →
 * activity check → amount check), but against a purchase
 * router/contract/pool instead of the V4 PoolManager, and checking that ELS
 * moved TO the buyer rather than into a pool.
 */
export async function verifyBuyElsTransaction(txHash: string, walletAddress: string): Promise<VerificationOutcome> {
  if (!BUY_ELS_QUEST_CONFIGURED) {
    return { status: "SYSTEM_ERROR", reason: "Buy ELS verification is not configured on this deployment yet (no purchase contract deployed)." };
  }

  const { chainId, elsTokenAddress, purchaseContract, minimumElsAmountRaw } = BUY_ELS_QUEST_CONFIG;
  const basics = await fetchAndCheckBasics(chainId, txHash, walletAddress);
  if (!basics.ok) return basics.outcome;
  const { tx, receipt } = basics;

  if (tx.chainId != null && tx.chainId !== chainId) {
    return { status: "INVALID", reason: `Transaction is on chain ${tx.chainId}, expected ${chainId}.` };
  }

  // Rule 6: correct contract/pool/router is involved.
  const touchesPurchaseContract =
    normalize(tx.to ?? "") === normalize(purchaseContract!) ||
    receipt.logs.some((log) => normalize(log.address) === normalize(purchaseContract!));
  if (!touchesPurchaseContract) {
    return { status: "INVALID", reason: "Transaction does not interact with the configured ELS purchase contract." };
  }

  // Rule 7/8: actual purchase/swap activity occurred and the user RECEIVED
  // the required ELS — an ERC20 Transfer of the ELS token with `to ==
  // walletAddress`, originating from the purchase contract's flow within
  // this same transaction.
  let elsReceived = BigInt(0);
  for (const log of receipt.logs) {
    if (normalize(log.address) !== elsTokenAddress) continue;
    try {
      const decoded = decodeEventLog({ abi: [ERC20_TRANSFER], data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer" && normalize((decoded.args as any).to) === normalize(walletAddress)) {
        elsReceived += (decoded.args as any).value as bigint;
      }
    } catch {
      // ignore non-Transfer logs on the token contract
    }
  }
  if (elsReceived === BigInt(0)) {
    return { status: "INVALID", reason: "No ELS was received by the connected wallet in this transaction." };
  }
  if (minimumElsAmountRaw > BigInt(0) && elsReceived < minimumElsAmountRaw) {
    return { status: "INVALID", reason: "ELS amount purchased is below the configured minimum." };
  }

  return {
    status: "VALID",
    blockNumber: receipt.blockNumber,
    data: { elsReceived: elsReceived.toString(), to: tx.to },
  };
}
