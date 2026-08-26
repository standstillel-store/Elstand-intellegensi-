import { getSupabase } from "@/lib/supabase";
import { PAYMENT_PRODUCTS, type PaymentProductId } from "./config";

// ---------------------------------------------------------------------------
// Grants Premium / AI Energy AFTER on-chain verification has already
// happened in lib/payments/verifier.ts — this file never re-checks the
// chain, it only turns an already-VALID PaymentVerificationOutcome into a
// database effect, exactly once per tx hash.
//
// Idempotency has two independent layers, matching the contract's own
// belt-and-suspenders design:
//   1. DB: UNIQUE(chain_id, tx_hash) on payment_purchases — a second
//      request for the same tx hash fails the insert and is treated as
//      "already processed", not re-granted.
//   2. Chain: contracts/ELSTestnetPayment.sol's processedPayments mapping
//      already prevented the SAME paymentId from producing two
//      PaymentExecuted events in the first place.
// Either layer alone would be enough; both together mean a bug in one
// doesn't silently double-grant.
// ---------------------------------------------------------------------------

export class PurchaseAlreadyProcessedError extends Error {}

export async function recordAndGrantPurchase(params: {
  userId: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  paymentId: string;
  productId: PaymentProductId;
  amountElsRaw: bigint;
  blockNumber: bigint;
}): Promise<{ granted: PaymentProductId; premiumExpiresAt?: string; aiEnergyCredited?: number }> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");

  const { error: insertError } = await client.from("payment_purchases").insert({
    user_id: params.userId,
    wallet_address: params.walletAddress.toLowerCase(),
    chain_id: params.chainId,
    tx_hash: params.txHash.toLowerCase(),
    payment_id: params.paymentId,
    product_id: params.productId,
    amount_els_raw: params.amountElsRaw.toString(),
    block_number: Number(params.blockNumber),
  });

  if (insertError) {
    // Postgres unique_violation. Treat as "already processed" rather than
    // a generic 500 — a retried request (double-click, network blip) for
    // a tx we've already granted should be a no-op, not an error the user
    // sees as a failure.
    if (insertError.code === "23505") {
      throw new PurchaseAlreadyProcessedError("This transaction has already been processed.");
    }
    throw new Error(`Failed to record purchase: ${insertError.message}`);
  }

  const product = PAYMENT_PRODUCTS[params.productId];

  if (product.kind === "premium") {
    const { data: existing } = await client
      .from("premium_memberships")
      .select("expires_at")
      .eq("user_id", params.userId)
      .maybeSingle();

    const now = new Date();
    const base = existing?.expires_at && new Date(existing.expires_at) > now ? new Date(existing.expires_at) : now;
    const newExpiry = new Date(base.getTime() + product.durationDays * 24 * 60 * 60 * 1000);

    const { error: upsertError } = await client
      .from("premium_memberships")
      .upsert({ user_id: params.userId, expires_at: newExpiry.toISOString(), updated_at: now.toISOString() }, { onConflict: "user_id" });
    if (upsertError) throw new Error(`Failed to grant premium membership: ${upsertError.message}`);

    return { granted: params.productId, premiumExpiresAt: newExpiry.toISOString() };
  }

  // kind === "ai_energy" — additive credit onto the same ai_token /
  // ai_token_transactions tables lib/energy.ts already uses (see that
  // file's header: "no new table"). Read-modify-write here mirrors
  // lib/energy.ts's applyDelta() shape (balance, then balance_after logged
  // to the ledger) rather than introducing a second accounting mechanism.
  const { data: tokenRow, error: fetchError } = await client.from("ai_token").select("balance").eq("user_id", params.userId).maybeSingle();
  if (fetchError) throw new Error(`Failed to read AI Energy balance: ${fetchError.message}`);

  const currentBalance = tokenRow ? Number(tokenRow.balance) : 10; // ai_token.balance defaults to 10 for a brand-new row, per schema.sql
  const nextBalance = currentBalance + product.aiEnergyAmount;

  const { error: creditError } = await client
    .from("ai_token")
    .upsert({ user_id: params.userId, balance: nextBalance, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (creditError) throw new Error(`Failed to credit AI Energy: ${creditError.message}`);

  await client.from("ai_token_transactions").insert({
    user_id: params.userId,
    delta: product.aiEnergyAmount,
    reason: "payment_purchase",
    balance_after: nextBalance,
  });

  return { granted: params.productId, aiEnergyCredited: product.aiEnergyAmount };
}
