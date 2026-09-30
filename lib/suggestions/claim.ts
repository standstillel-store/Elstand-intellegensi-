import { getSupabase } from "@/lib/supabase";
import { refundEnergy } from "@/lib/energy";
import { getSuggestionById, markSuggestionAiEnergyGranted } from "./store";
import { distributeSuggestionRewardServerSide } from "./distribute";
import type { SuggestionRow } from "./store";

// ---------------------------------------------------------------------------
// Phase 6.6.4b — Suggestion ELS claim (legacy/manual fallback).
//
// Model B (see distribute.ts) now distributes automatically the moment an
// admin approves — a user no longer needs to call this. This endpoint is
// kept only as a safe, idempotent fallback (e.g. an older client still
// calling it, or a manual "nudge" if the automatic attempt hasn't run yet
// for some reason): it does the SAME ownership check as before, then
// delegates the actual distribution to distributeSuggestionRewardServerSide
// — the single source of truth for the on-chain call and its idempotency
// guards, shared with the admin approve/retry routes. It never runs a
// second, separate distributor call path.
// ---------------------------------------------------------------------------

export type ClaimSuggestionResult =
  | { outcome: "CLAIMED"; txHash: `0x${string}`; rewardAmount: number }
  | { outcome: "NOT_FOUND" }
  | { outcome: "FORBIDDEN" }
  | { outcome: "NOT_APPROVED" }
  | { outcome: "ALREADY_CLAIMED" }
  | { outcome: "CLAIM_IN_PROGRESS" }
  | { outcome: "DISTRIBUTOR_NOT_CONFIGURED" }
  | { outcome: "CLAIM_ERROR"; reason: string; detail?: string };

export async function claimSuggestionReward(params: {
  suggestionId: string;
  userId: string | null;
  walletAddress: string;
}): Promise<ClaimSuggestionResult> {
  const suggestion = await getSuggestionById(params.suggestionId);
  if (!suggestion) return { outcome: "NOT_FOUND" };

  const isOwner = suggestion.user_id
    ? suggestion.user_id === params.userId
    : suggestion.wallet_address.toLowerCase() === params.walletAddress.toLowerCase();
  if (!isOwner) return { outcome: "FORBIDDEN" };

  const result = await distributeSuggestionRewardServerSide(suggestion.id);
  switch (result.outcome) {
    case "REWARDED":
      return { outcome: "CLAIMED", txHash: result.txHash, rewardAmount: result.rewardAmount };
    case "ALREADY_REWARDED":
      return { outcome: "ALREADY_CLAIMED" };
    case "IN_PROGRESS":
      return { outcome: "CLAIM_IN_PROGRESS" };
    case "NOT_APPROVED":
      return { outcome: "NOT_APPROVED" };
    case "DISTRIBUTOR_NOT_CONFIGURED":
      return { outcome: "DISTRIBUTOR_NOT_CONFIGURED" };
    case "DISTRIBUTE_ERROR":
      return { outcome: "CLAIM_ERROR", reason: result.reason, detail: result.detail };
  }
}

/** Grants the AI Energy portion of an approved suggestion's reward — separate ledger from ELS, only ever called from the admin approve route, only once (ai_energy_granted_at guard), and only when the suggestion has a signed-in user_id (AI Energy is an account balance; an anonymous submission has no account to credit). */
export async function grantSuggestionAiEnergy(suggestion: SuggestionRow): Promise<{ ok: boolean; error?: string }> {
  if (suggestion.ai_energy_amount <= 0) return { ok: true };
  if (!suggestion.user_id) return { ok: true }; // nothing to credit — anonymous submission
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "supabase_not_configured" };

  const result = await refundEnergy(sb, suggestion.user_id, suggestion.ai_energy_amount, "reward:suggestion");
  if (!result.ok) return { ok: false, error: result.error ?? "grant_failed" };

  await markSuggestionAiEnergyGranted(suggestion.id);
  return { ok: true };
}
