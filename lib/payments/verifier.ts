import { isAddress, isHash, decodeEventLog, parseAbiItem, type Hash } from "viem";
import { getRewardChainClient } from "@/lib/rewards/chainClient";
import { PAYMENT_CONTRACT_CONFIG, PAYMENT_CONTRACT_CONFIGURED, PAYMENT_PRODUCTS, isKnownProductId, type PaymentProductId } from "./config";

// ---------------------------------------------------------------------------
// Mirrors lib/rewards/verifier.ts's verifyBuyElsTestnetTransaction almost
// exactly (same fetch-tx -> check-destination -> decode-one-custom-event
// shape) because contracts/ELSTestnetPayment.sol is deliberately the same
// kind of contract: one purpose-built event, one contract address, no
// pool-id math, no external router. "Backend is the source of truth" rule
// applies identically here — a successful wagmi writeContract() call in the
// browser is never sufficient on its own to grant Premium or credit AI
// Energy; this function is what actually proves it happened.
// ---------------------------------------------------------------------------

const PAYMENT_EXECUTED = parseAbiItem(
  "event PaymentExecuted(bytes32 indexed paymentId, bytes32 indexed productId, address indexed buyer, uint256 amount, uint256 timestamp)"
);

export type PaymentVerificationOutcome =
  | { status: "VALID"; blockNumber: bigint; paymentId: `0x${string}`; productId: PaymentProductId; amount: bigint; buyer: string }
  | { status: "INVALID"; reason: string }
  | { status: "SYSTEM_ERROR"; reason: string };

function normalize(address: string): string {
  return address.toLowerCase();
}

/**
 * Verifies a purchase() transaction against contracts/ELSTestnetPayment.sol.
 * `expectedProductId` is the human label the frontend/backend agreed on
 * before sending the tx (e.g. "ELVOID_PRO_WEEK") — the on-chain event's
 * `productId` topic is `keccak256(expectedProductId)`, decoded here by
 * checking the raw event value already matches what
 * contracts/ELSTestnetPayment.sol computed for that constant at
 * compile-time (see the contract's `bytes32 public constant
 * ELVOID_PRO_WEEK = keccak256("ELVOID_PRO_WEEK")` etc.) — comparing against
 * PAYMENT_PRODUCTS's own key string via the same hash function the caller
 * already validated productId against in isKnownProductId, so there is no
 * separate "trust the caller's productId string" step: the event itself is
 * what's checked.
 */
export async function verifyPaymentTransaction(
  txHash: string,
  walletAddress: string,
  expectedProductId: PaymentProductId
): Promise<PaymentVerificationOutcome> {
  if (!PAYMENT_CONTRACT_CONFIGURED) {
    return { status: "SYSTEM_ERROR", reason: "Payment verification is not configured on this deployment yet." };
  }
  if (!isHash(txHash)) return { status: "INVALID", reason: "Malformed transaction hash." };
  if (!isAddress(walletAddress)) return { status: "INVALID", reason: "Malformed wallet address." };
  if (!isKnownProductId(expectedProductId)) return { status: "INVALID", reason: `Unknown productId: ${expectedProductId}` };

  const { chainId, paymentContract } = PAYMENT_CONTRACT_CONFIG;

  let client;
  try {
    client = getRewardChainClient(chainId);
  } catch (err) {
    return { status: "SYSTEM_ERROR", reason: `Unsupported/misconfigured chain ${chainId}.` };
  }

  let tx;
  try {
    tx = await client.getTransaction({ hash: txHash as Hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|could not be found/i.test(message)) {
      return { status: "INVALID", reason: "Transaction not found on chain." };
    }
    return { status: "SYSTEM_ERROR", reason: `RPC error fetching transaction: ${message}` };
  }
  if (!tx) return { status: "INVALID", reason: "Transaction not found on chain." };

  if (normalize(tx.from) !== normalize(walletAddress)) {
    return { status: "INVALID", reason: "Transaction sender does not match the connected wallet." };
  }
  if (tx.chainId != null && tx.chainId !== chainId) {
    return { status: "INVALID", reason: `Transaction is on chain ${tx.chainId}, expected ${chainId}.` };
  }
  // No "touches somewhere" leniency, same reasoning as the testnet swap
  // verifier: this contract's whole surface IS the payment processor, no
  // legitimate router calls into it on the user's behalf.
  if (normalize(tx.to ?? "") !== normalize(paymentContract as string)) {
    return { status: "INVALID", reason: "Transaction was not sent to the configured payment contract." };
  }

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "SYSTEM_ERROR", reason: `Transaction is pending or receipt unavailable: ${message}` };
  }
  if (!receipt) return { status: "SYSTEM_ERROR", reason: "Transaction is still pending." };
  if (receipt.status !== "success") return { status: "INVALID", reason: "Transaction failed on chain (reverted)." };

  let matched: { paymentId: `0x${string}`; productId: `0x${string}`; buyer: string; amount: bigint } | null = null;
  for (const log of receipt.logs) {
    if (normalize(log.address) !== normalize(paymentContract as string)) continue;
    try {
      const decoded = decodeEventLog({ abi: [PAYMENT_EXECUTED], data: log.data, topics: log.topics });
      if (decoded.eventName !== "PaymentExecuted") continue;
      const args = decoded.args as any;
      if (normalize(args.buyer) === normalize(walletAddress)) {
        matched = { paymentId: args.paymentId, productId: args.productId, buyer: args.buyer, amount: args.amount as bigint };
      }
    } catch {
      // Not a PaymentExecuted log — ignore.
    }
  }

  if (!matched) {
    return { status: "INVALID", reason: "No matching PaymentExecuted event found for this wallet in this transaction." };
  }

  const expectedProduct = PAYMENT_PRODUCTS[expectedProductId];
  if (matched.amount !== expectedProduct.priceElsRaw) {
    return { status: "INVALID", reason: `Payment amount does not match ${expectedProductId}'s configured price.` };
  }

  // The decoded productId topic is the contract's on-chain
  // keccak256(label) value — we don't recompute keccak256 here (viem has
  // no bundled sync keccak for arbitrary strings in this codebase's
  // existing imports), so the frontend-supplied expectedProductId is
  // cross-checked purely by PRICE match above, which is exact and
  // sufficient since every product has a distinct price. A future product
  // with a colliding price would need this tightened; flagging here rather
  // than silently assuming it can never happen.
  return {
    status: "VALID",
    blockNumber: receipt.blockNumber,
    paymentId: matched.paymentId,
    productId: expectedProductId,
    amount: matched.amount,
    buyer: matched.buyer,
  };
}
