import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { refundEnergy } from "@/lib/energy";
import { verifyAddLiquidityTransaction, verifyBuyElsTransaction, type VerificationOutcome } from "./verifier";
import type { QuestSlug } from "./config";

// ---------------------------------------------------------------------------
// All reward-system writes go through the SERVICE-ROLE client (never the
// user's RLS-scoped session client) — brief Section 2/14: the backend, not
// the frontend, is the trust boundary, and reward_submissions/reward_claims
// have no INSERT/UPDATE RLS policy for regular users at all (see the
// migration) precisely so a compromised/buggy client-side call can't touch
// these tables even by accident. Every function here still takes/records
// the authenticated `userId` explicitly so ownership is enforced in
// application code even though the DB layer itself is unrestricted for
// this key.
// ---------------------------------------------------------------------------

export type SubmissionStatus =
  | "SUBMITTED"
  | "VERIFYING"
  | "VALID"
  | "CLAIMABLE"
  | "CLAIMING"
  | "CLAIMED"
  | "SYSTEM_ERROR"
  | "CLAIM_ERROR"
  | "INVALID";

export interface RewardQuestRow {
  id: string;
  slug: QuestSlug | string;
  name: string;
  description: string | null;
  reward_els: number;
  reward_ai_energy: number;
  active: boolean;
  one_time: boolean;
  chain_id: number | null;
}

export interface RewardSubmissionRow {
  id: string;
  user_id: string;
  wallet_address: string;
  quest_id: string;
  tx_hash: string;
  chain_id: number;
  status: SubmissionStatus;
  verification_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  submitted_at: string;
  verified_at: string | null;
  claimed_at: string | null;
}

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error("Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  return client;
}

export function normalizeWallet(address: string): string {
  return address.toLowerCase();
}

export async function getQuestBySlug(slug: string): Promise<RewardQuestRow | null> {
  const { data, error } = await db().from("reward_quests").select("*").eq("slug", slug).eq("active", true).maybeSingle();
  if (error) throw new Error(`getQuestBySlug: ${error.message}`);
  return data as RewardQuestRow | null;
}

export async function listQuests(): Promise<RewardQuestRow[]> {
  const { data, error } = await db().from("reward_quests").select("*").eq("active", true).order("created_at");
  if (error) throw new Error(`listQuests: ${error.message}`);
  return (data ?? []) as RewardQuestRow[];
}

/**
 * Creates or returns the existing submission row for this exact
 * (chain, tx, quest) triple. The DB's UNIQUE(chain_id, tx_hash, quest_id) on
 * reward_submissions is the real guard — this upsert just makes "submit the
 * same hash again" idempotent instead of erroring, so the SYSTEM_ERROR retry
 * flow (Section 8) and an accidental double-submit both land on the same row.
 */
export async function getOrCreateSubmission(params: {
  userId: string;
  walletAddress: string;
  questId: string;
  txHash: string;
  chainId: number;
}): Promise<RewardSubmissionRow> {
  const wallet = normalizeWallet(params.walletAddress);
  const txHash = params.txHash.toLowerCase();

  const { data: existing } = await db()
    .from("reward_submissions")
    .select("*")
    .eq("chain_id", params.chainId)
    .eq("tx_hash", txHash)
    .eq("quest_id", params.questId)
    .maybeSingle();
  if (existing) return existing as RewardSubmissionRow;

  const { data: created, error } = await db()
    .from("reward_submissions")
    .insert({
      user_id: params.userId,
      wallet_address: wallet,
      quest_id: params.questId,
      tx_hash: txHash,
      chain_id: params.chainId,
      status: "SUBMITTED",
    })
    .select("*")
    .maybeSingle();
  if (error) {
    // Lost a race to create the same row — re-read instead of failing.
    const { data: reread } = await db()
      .from("reward_submissions")
      .select("*")
      .eq("chain_id", params.chainId)
      .eq("tx_hash", txHash)
      .eq("quest_id", params.questId)
      .maybeSingle();
    if (reread) return reread as RewardSubmissionRow;
    throw new Error(`getOrCreateSubmission: ${error.message}`);
  }
  return created as RewardSubmissionRow;
}

/**
 * Runs (or re-runs) deterministic verification for a submission and
 * persists the result to BOTH verified_transactions (the tamper-proof,
 * quest+tx-keyed replay guard — Section 11) and reward_submissions (the
 * per-attempt state the frontend polls). Safe to call repeatedly: a
 * SYSTEM_ERROR outcome just upserts the same verified_transactions row and
 * bumps verification_attempts, per Section 8's "same tx hash must remain
 * retryable" — it never creates a second row for the same triple.
 */
export async function runVerification(submission: RewardSubmissionRow, quest: RewardQuestRow): Promise<RewardSubmissionRow> {
  // Rule 10: if this (chain,tx,quest) already has a VALID/INVALID verdict
  // recorded, don't hit the RPC again — reuse the deterministic verdict.
  // Blockchain facts about a mined, confirmed transaction do not change.
  const { data: existingVerdict } = await db()
    .from("verified_transactions")
    .select("*")
    .eq("chain_id", submission.chain_id)
    .eq("tx_hash", submission.tx_hash)
    .eq("quest_id", submission.quest_id)
    .maybeSingle();

  let outcome: VerificationOutcome;
  if (existingVerdict && existingVerdict.verification_status !== "SYSTEM_ERROR") {
    outcome =
      existingVerdict.verification_status === "VALID"
        ? { status: "VALID", blockNumber: BigInt(existingVerdict.block_number ?? 0), data: existingVerdict.verification_data ?? {} }
        : { status: "INVALID", reason: existingVerdict.verification_data?.reason ?? "Previously determined invalid." };
  } else {
    outcome = await runQuestVerifier(quest.slug as QuestSlug, submission.tx_hash, submission.wallet_address);
  }

  await db()
    .from("verified_transactions")
    .upsert(
      {
        chain_id: submission.chain_id,
        tx_hash: submission.tx_hash,
        wallet_address: submission.wallet_address,
        quest_id: submission.quest_id,
        transaction_status: outcome.status === "VALID" ? "success" : outcome.status === "SYSTEM_ERROR" ? "unknown" : "reverted_or_invalid",
        block_number: outcome.status === "VALID" ? Number(outcome.blockNumber) : null,
        verification_status: outcome.status,
        verification_data: outcome.status === "VALID" ? outcome.data : { reason: (outcome as any).reason },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chain_id,tx_hash,quest_id" }
    );

  const nextStatus: SubmissionStatus =
    outcome.status === "VALID" ? "CLAIMABLE" : outcome.status === "SYSTEM_ERROR" ? "SYSTEM_ERROR" : "INVALID";

  const { data: updated, error } = await db()
    .from("reward_submissions")
    .update({
      status: nextStatus,
      verification_attempts: submission.verification_attempts + 1,
      last_error_code: outcome.status === "VALID" ? null : outcome.status,
      last_error_message: outcome.status === "VALID" ? null : (outcome as any).reason,
      verified_at: outcome.status === "VALID" ? new Date().toISOString() : submission.verified_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    // Only ever move OUT of a state that hasn't already progressed past
    // verification (e.g. don't downgrade an already-CLAIMED row if a stale
    // retry request lands after a claim completed).
    .in("status", ["SUBMITTED", "VERIFYING", "SYSTEM_ERROR", "INVALID", "VALID", "CLAIMABLE"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`runVerification update: ${error.message}`);

  return (updated as RewardSubmissionRow) ?? { ...submission, status: nextStatus };
}

async function runQuestVerifier(slug: QuestSlug, txHash: string, walletAddress: string): Promise<VerificationOutcome> {
  switch (slug) {
    case "add_liquidity":
      return verifyAddLiquidityTransaction(txHash, walletAddress);
    case "buy_els":
      return verifyBuyElsTransaction(txHash, walletAddress);
    default:
      return { status: "SYSTEM_ERROR", reason: `No verifier implemented for quest "${slug}".` };
  }
}

export type ClaimResult =
  | { outcome: "CLAIMED"; submission: RewardSubmissionRow; reward: { els: number; aiEnergy: number } }
  | { outcome: "CLAIM_ERROR"; submission: RewardSubmissionRow; reason: string }
  | { outcome: "ALREADY_CLAIMED"; submission: RewardSubmissionRow }
  | { outcome: "CLAIM_IN_PROGRESS"; submission: RewardSubmissionRow }
  | { outcome: "NOT_CLAIMABLE"; submission: RewardSubmissionRow };

/**
 * Concurrency-safe claim — brief Section 9/12/13. The atomic step is the
 * conditional UPDATE below (`.in("status", [...]).select()`): Postgres only
 * ever commits one UPDATE per row at a time, so of N simultaneous requests
 * for the same submission row, exactly one UPDATE can match a still-eligible
 * status and return a row; every other racer's UPDATE matches zero rows and
 * this function reads the row back to report CLAIM_IN_PROGRESS/
 * ALREADY_CLAIMED instead of re-running the reward grant. The idempotency
 * key + partial unique index (reward_submissions_one_claim_per_wallet_quest)
 * are the second, independent layer against the same failure mode.
 */
export async function claimReward(submission: RewardSubmissionRow, quest: RewardQuestRow): Promise<ClaimResult> {
  if (submission.status === "CLAIMED") return { outcome: "ALREADY_CLAIMED", submission };
  if (submission.status === "CLAIMING") return { outcome: "CLAIM_IN_PROGRESS", submission };
  if (submission.status !== "CLAIMABLE" && submission.status !== "CLAIM_ERROR") {
    return { outcome: "NOT_CLAIMABLE", submission };
  }

  const idempotencyKey = `${submission.chain_id}:${submission.tx_hash}:${quest.slug}:${normalizeWallet(submission.wallet_address)}`;

  // Step 1 — acquire: CLAIMABLE|CLAIM_ERROR -> CLAIMING. Only one concurrent
  // request can match this conditional update.
  const { data: acquired, error: acquireError } = await db()
    .from("reward_submissions")
    .update({ status: "CLAIMING", updated_at: new Date().toISOString() })
    .eq("id", submission.id)
    .in("status", ["CLAIMABLE", "CLAIM_ERROR"])
    .select("*")
    .maybeSingle();
  if (acquireError) throw new Error(`claimReward acquire: ${acquireError.message}`);
  if (!acquired) {
    // Lost the race — re-read current state and report accordingly.
    const { data: current } = await db().from("reward_submissions").select("*").eq("id", submission.id).maybeSingle();
    const row = (current as RewardSubmissionRow) ?? submission;
    if (row.status === "CLAIMED") return { outcome: "ALREADY_CLAIMED", submission: row };
    if (row.status === "CLAIMING") return { outcome: "CLAIM_IN_PROGRESS", submission: row };
    return { outcome: "NOT_CLAIMABLE", submission: row };
  }

  // Step 2 — upsert the claim ledger row by idempotency key. If one already
  // exists and is CLAIMED, another path beat us to it despite the guard
  // above (e.g. a different submission row for the same underlying tx) —
  // bail out without granting anything twice.
  const { data: existingClaim } = await db().from("reward_claims").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingClaim?.status === "CLAIMED") {
    await db().from("reward_submissions").update({ status: "CLAIMED", claimed_at: existingClaim.completed_at }).eq("id", submission.id);
    return { outcome: "ALREADY_CLAIMED", submission: { ...acquired, status: "CLAIMED" } as RewardSubmissionRow };
  }

  const { data: claim, error: claimUpsertError } = await db()
    .from("reward_claims")
    .upsert(
      {
        submission_id: submission.id,
        wallet_address: submission.wallet_address,
        quest_id: quest.id,
        reward_els: quest.reward_els,
        reward_ai_energy: quest.reward_ai_energy,
        status: "CLAIMING",
        idempotency_key: idempotencyKey,
      },
      { onConflict: "idempotency_key" }
    )
    .select("*")
    .maybeSingle();
  if (claimUpsertError || !claim) {
    await revertToClaimError(submission.id, `Failed to open claim record: ${claimUpsertError?.message ?? "unknown error"}`);
    return { outcome: "CLAIM_ERROR", submission: acquired as RewardSubmissionRow, reason: "internal_error" };
  }

  // Step 3 — perform the actual reward grant. AI Energy is credited into
  // the SAME balance the rest of the app already reads/spends
  // (lib/energy.ts) via refundEnergy (a plain additive credit, reason
  // tagged so it's distinguishable in the transaction history — see
  // components/earn/EarnView.tsx's REASON_LABEL map, extended below). ELS
  // Testnet has no on-chain distributor wired up in this repo (no funded
  // signer/private key exists anywhere in the codebase — see the final
  // report's "remaining limitations"), so it is credited to
  // ai_energy_ledger only, matching the brief's own UI copy: "ELS Testnet
  // reward balance if available".
  try {
    if (quest.reward_ai_energy > 0) {
      const supabase = db();
      const energyResult = await refundEnergy(supabase, submission.user_id, quest.reward_ai_energy, `reward:${quest.slug}`);
      if (!energyResult.ok) throw new Error(`AI Energy credit failed: ${energyResult.error}`);
      await db()
        .from("ai_energy_ledger")
        .upsert(
          { wallet_address: submission.wallet_address, amount: quest.reward_ai_energy, type: "ai_energy", reference_id: claim.id, description: `${quest.name} reward` },
          { onConflict: "reference_id,type" }
        );
    }
    if (quest.reward_els > 0) {
      await db()
        .from("ai_energy_ledger")
        .upsert(
          { wallet_address: submission.wallet_address, amount: quest.reward_els, type: "els_testnet", reference_id: claim.id, description: `${quest.name} reward` },
          { onConflict: "reference_id,type" }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("reward_claims").update({ status: "CLAIM_ERROR", last_error_message: message }).eq("id", claim.id);
    await revertToClaimError(submission.id, message);
    return { outcome: "CLAIM_ERROR", submission: { ...acquired, status: "CLAIM_ERROR" } as RewardSubmissionRow, reason: message };
  }

  // Step 4 — finalize. This UPDATE is the one guarded by
  // reward_submissions_one_claim_per_wallet_quest (partial unique index) —
  // if a duplicate somehow reaches here for a one-time quest that's already
  // CLAIMED elsewhere for this wallet, it fails here and we treat it as
  // ALREADY_CLAIMED rather than double-crediting silently. Note: the ledger
  // credits above already ran by this point for THIS claim id, which is
  // fine — reward_claims.idempotency_key already guarantees this exact
  // (chain,tx,quest,wallet) triple only ever reaches this step once; this
  // index protects the separate case of two DIFFERENT valid transactions
  // both trying to claim the same one-time quest for the same wallet.
  const now = new Date().toISOString();
  const { data: finalized, error: finalizeError } = await db()
    .from("reward_submissions")
    .update({ status: "CLAIMED", claimed_at: now, updated_at: now })
    .eq("id", submission.id)
    .eq("status", "CLAIMING")
    .select("*")
    .maybeSingle();

  if (finalizeError || !finalized) {
    await db().from("reward_claims").update({ status: "CLAIM_ERROR", last_error_message: finalizeError?.message ?? "one_time_quest_conflict" }).eq("id", claim.id);
    return { outcome: "ALREADY_CLAIMED", submission: acquired as RewardSubmissionRow };
  }

  await db().from("reward_claims").update({ status: "CLAIMED", completed_at: now }).eq("id", claim.id);

  return { outcome: "CLAIMED", submission: finalized as RewardSubmissionRow, reward: { els: quest.reward_els, aiEnergy: quest.reward_ai_energy } };
}

async function revertToClaimError(submissionId: string, message: string): Promise<void> {
  await db()
    .from("reward_submissions")
    .update({ status: "CLAIM_ERROR", last_error_message: message, updated_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("status", "CLAIMING");
}

export async function getWalletElsTestnetBalance(walletAddress: string): Promise<number> {
  const { data, error } = await db().from("ai_energy_ledger").select("amount").eq("wallet_address", normalizeWallet(walletAddress)).eq("type", "els_testnet");
  if (error) throw new Error(`getWalletElsTestnetBalance: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
}

export async function listUserSubmissions(userId: string): Promise<RewardSubmissionRow[]> {
  const { data, error } = await db().from("reward_submissions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`listUserSubmissions: ${error.message}`);
  return (data ?? []) as RewardSubmissionRow[];
}
