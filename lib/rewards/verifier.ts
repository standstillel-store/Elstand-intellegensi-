import { isAddress, isHash, decodeEventLog, parseAbiItem, encodeAbiParameters, keccak256, type Hash } from "viem";
import { getRewardChainClient } from "./chainClient";
import { LIQUIDITY_QUEST_CHAIN_CONFIG, LIQUIDITY_QUEST_CONFIGURED, BUY_ELS_QUEST_CONFIG, BUY_ELS_QUEST_CONFIGURED, ELS_BNB_POOL_KEY, MINIMUM_USD_VALUE } from "./config";
import { getHistoricalNativeUsdPrice, weiToUsd } from "./pricing";

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
/** Uniswap v4 PoolManager's core.Swap event — https://docs.uniswap.org/contracts/v4/reference/core/interfaces/IPoolManager#swap-event. amount0/amount1 are signed deltas to the POOL's balance: positive = pool received (swapper paid in), negative = pool paid out (swapper received). */
const V4_SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
);

/**
 * Computes a Uniswap V4 PoolId exactly as v4-core's PoolIdLibrary does on
 * -chain: `keccak256(abi.encode(poolKey))`, where poolKey is the tuple
 * (currency0, currency1, fee, tickSpacing, hooks) in that order — abi.encode
 * of a struct is equivalent to abi.encode of its fields as a plain tuple.
 * This lets the verifier prove a Swap event's `id` belongs to the specific
 * ELS/native pool configured in ELS_BNB_POOL_KEY, rather than trusting that
 * "any Swap event on the PoolManager, in a tx that also happens to move
 * ELS to the wallet" is good enough — two independent V4 pools could
 * otherwise coincidentally satisfy that weaker check in one crafted tx.
 */
function computePoolId(poolKey: typeof ELS_BNB_POOL_KEY): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  return keccak256(encoded);
}

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
 * Section 6 — "$10 is USD value, not 10 ELS/10 BNB/10 wei." Converts the
 * transaction's native-currency leg (tx.value) into a real USD figure
 * using the price AT THE TRANSACTION'S OWN BLOCK (never "now" — Section 6:
 * "do not silently use an arbitrary current price if that makes historical
 * verification inconsistent"), and checks it against MINIMUM_USD_VALUE.
 *
 * Prices tx.value specifically because both quests' UI flows send the
 * native-currency leg directly as msg.value (Section 4/5's "currencyA=
 * NATIVE" Add Liquidity URL; a direct BNB-in purchase for Buy ELS) — see
 * lib/rewards/pricing.ts's header for why the ELS leg itself isn't priced.
 * If a future routing shape moves native currency some other way (e.g. via
 * wrapped BNB as an ERC20 instead of msg.value), this check would
 * under-count it — flagged in the final report's BLOCKERS, not silently
 * assumed away.
 *
 * Returns either the priced metadata to merge into a VALID outcome's
 * `data` (block number, tx hash's own amount, price source, price used,
 * calculated USD value, verification timestamp — exactly what Section 6
 * asks to be stored), or a terminal SYSTEM_ERROR/INVALID outcome for the
 * caller to return as-is.
 */
async function verifyUsdValue(
  chainId: number,
  tx: any,
  receipt: any
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; outcome: VerificationOutcome }> {
  const nativeAmountWei = (tx.value ?? BigInt(0)) as bigint;

  let block;
  try {
    const client = getRewardChainClient(chainId);
    block = await client.getBlock({ blockNumber: receipt.blockNumber });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, outcome: { status: "SYSTEM_ERROR", reason: `Unable to fetch block for USD valuation: ${message}` } };
  }

  const priceResult = await getHistoricalNativeUsdPrice(chainId, Number(block.timestamp));
  if (!priceResult) {
    // Section 6: a missing price provider must fail closed as a retryable
    // system state, never silently pass the $10 check.
    return {
      ok: false,
      outcome: { status: "SYSTEM_ERROR", reason: "USD price verification is temporarily unavailable. This transaction was not rejected — retry shortly." },
    };
  }

  const usdValue = weiToUsd(nativeAmountWei, priceResult.price);
  if (usdValue < MINIMUM_USD_VALUE) {
    return {
      ok: false,
      outcome: {
        status: "INVALID",
        reason: `Transaction value (~$${usdValue.toFixed(2)}) is below the required minimum ($${MINIMUM_USD_VALUE.toFixed(2)}).`,
      },
    };
  }

  return {
    ok: true,
    data: {
      nativeAmountWei: nativeAmountWei.toString(),
      priceSource: priceResult.source,
      priceUsed: priceResult.price,
      usdValue,
      priceTimestamp: priceResult.priceTimestamp,
      verifiedAt: new Date().toISOString(),
    },
  };
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
    normalize(tx.to ?? "") === poolManager || receipt.logs.some((log: any) => normalize(log.address) === poolManager);
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

  const usdCheck = await verifyUsdValue(chainId, tx, receipt);
  if (!usdCheck.ok) return usdCheck.outcome;

  return {
    status: "VALID",
    blockNumber: receipt.blockNumber,
    data: {
      poolId: liquidityPoolId,
      elsAmountIn: elsAmountIn.toString(),
      to: tx.to,
      ...usdCheck.data,
    },
  };
}

/**
 * Buy ELS quest verifier — reuses the same Uniswap V4 ELS/native pool as
 * Add Liquidity (operator decision: no new purchase/presale contract, no
 * new deployment). "Buying ELS" = swapping native BNB for ELS in that
 * pool. Structurally: fetch → chain/status/sender checks → PoolManager
 * contact check → pool-specific Swap event with the correct direction →
 * ELS actually received → USD floor. The Swap event's `id` is checked
 * against the ELS/native pool's own computed PoolId (not just "some Swap
 * happened on the PoolManager") so an unrelated pool's swap combined with
 * an incidental ELS transfer in the same tx cannot be mistaken for a
 * genuine purchase.
 */
export async function verifyBuyElsTransaction(txHash: string, walletAddress: string): Promise<VerificationOutcome> {
  if (!BUY_ELS_QUEST_CONFIGURED) {
    return { status: "SYSTEM_ERROR", reason: "Buy ELS verification is not configured on this deployment yet." };
  }

  const { chainId, elsTokenAddress, purchaseContract, minimumElsAmountRaw } = BUY_ELS_QUEST_CONFIG;
  const basics = await fetchAndCheckBasics(chainId, txHash, walletAddress);
  if (!basics.ok) return basics.outcome;
  const { tx, receipt } = basics;

  if (tx.chainId != null && tx.chainId !== chainId) {
    return { status: "INVALID", reason: `Transaction is on chain ${tx.chainId}, expected ${chainId}.` };
  }

  // Rule 6: correct contract/pool/router is involved — same PoolManager
  // singleton the Add Liquidity quest verifies against (see config.ts).
  const touchesPurchaseContract =
    normalize(tx.to ?? "") === normalize(purchaseContract) || receipt.logs.some((log: any) => normalize(log.address) === normalize(purchaseContract));
  if (!touchesPurchaseContract) {
    return { status: "INVALID", reason: "Transaction does not interact with the configured ELS purchase infrastructure." };
  }

  // Rule 7/8/9: an actual Swap occurred, in the specific ELS/native pool
  // (not just any V4 pool), in the BNB→ELS direction — currency0 is the
  // native sentinel (always the lower address), so a genuine BNB-in/ELS-out
  // swap must show amount0 > 0 (pool received native BNB) and amount1 < 0
  // (pool paid out ELS to the swapper).
  const expectedPoolId = computePoolId(ELS_BNB_POOL_KEY);
  let sawCorrectDirectionSwap = false;
  let elsOutFromSwap = BigInt(0);
  for (const log of receipt.logs) {
    if (normalize(log.address) !== normalize(purchaseContract)) continue;
    try {
      const decoded = decodeEventLog({ abi: [V4_SWAP], data: log.data, topics: log.topics });
      if (decoded.eventName !== "Swap") continue;
      const args = decoded.args as any;
      if (normalize(args.id as string) !== normalize(expectedPoolId)) continue; // a different pool's swap — not this quest's pool
      const amount0 = args.amount0 as bigint;
      const amount1 = args.amount1 as bigint;
      if (amount0 > BigInt(0) && amount1 < BigInt(0)) {
        sawCorrectDirectionSwap = true;
        elsOutFromSwap += -amount1;
      }
    } catch {
      // Not a Swap log (could be ModifyLiquidity/Donate/Initialize/etc.) — ignore and keep scanning.
    }
  }
  if (!sawCorrectDirectionSwap) {
    return { status: "INVALID", reason: "Transaction does not contain a valid BNB → ELS swap in the configured ELS/BNB pool." };
  }

  // Cross-check against the ERC20 side: ELS must actually land in the
  // connected wallet (defense in depth — the Swap event proves the POOL's
  // side of the trade; this proves the SWAPPER actually received it,
  // guarding against exotic routing where the pool-level swap succeeds but
  // the output is redirected elsewhere instead of to the buyer).
  let elsReceivedByWallet = BigInt(0);
  for (const log of receipt.logs) {
    if (normalize(log.address) !== elsTokenAddress) continue;
    try {
      const decoded = decodeEventLog({ abi: [ERC20_TRANSFER], data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer" && normalize((decoded.args as any).to) === normalize(walletAddress)) {
        elsReceivedByWallet += (decoded.args as any).value as bigint;
      }
    } catch {
      // ignore non-Transfer logs on the token contract
    }
  }
  if (elsReceivedByWallet === BigInt(0)) {
    return { status: "INVALID", reason: "No ELS was received by the connected wallet in this transaction." };
  }
  if (minimumElsAmountRaw > BigInt(0) && elsReceivedByWallet < minimumElsAmountRaw) {
    return { status: "INVALID", reason: "ELS amount purchased is below the configured minimum." };
  }

  const usdCheck = await verifyUsdValue(chainId, tx, receipt);
  if (!usdCheck.ok) return usdCheck.outcome;

  return {
    status: "VALID",
    blockNumber: receipt.blockNumber,
    data: {
      poolId: expectedPoolId,
      elsOutFromSwap: elsOutFromSwap.toString(),
      elsReceivedByWallet: elsReceivedByWallet.toString(),
      to: tx.to,
      ...usdCheck.data,
    },
  };
}
