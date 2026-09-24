import { getSupabase } from "@/lib/supabase";
import { refundEnergy } from "@/lib/energy";
import { distributeToWallet } from "@/lib/rewards/distributor";
import { REWARD_DISTRIBUTOR_CONFIGURED } from "@/lib/rewards/config";
import {
  getSuggestionById,
  markSuggestionClaiming,
  markSuggestionClaimed,
  markSuggestionAiEnergyGranted,
  revertSuggestionClaiming,
  type SuggestionRow,
} from "./store";

// ---------------------------------------------------------------------------
// Phase 6.6.4 — Suggestion ELS claim.
//
// Reuses the EXACT SAME generic distributor lib/rewards/distributor.ts
// already uses for Buy ELS / Eligible Reward payouts — no second token
// distribution architecture. The only per-call difference from
// lib/rewards/eligibility.ts's claimEligibleReward() is the claimId space
// (this table's own row id, via claimIdForSuggestion in store.ts) and that
// the reward amount here is an admin decision made at approval time, not
// something recomputed from a formula at claim time.
//
// Ownership check: the claimant must be either the user who submitted the
// suggestion (signed-in match) or, for an anonymous submission, the exact
// wallet on file — never a client-supplied "trust me" wallet.
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

  if (suggestion.status === "CLAIMED") return { outcome: "ALREADY_CLAIMED" };
  if (suggestion.status === "CLAIMING") return { outcome: "CLAIM_IN_PROGRESS" };
  if (suggestion.status !== "APPROVED") return { outcome: "NOT_APPROVED" };
  if (!suggestion.reward_amount || !suggestion.claim_id) return { outcome: "NOT_APPROVED" };

  if (!REWARD_DISTRIBUTOR_CONFIGURED) return { outcome: "DISTRIBUTOR_NOT_CONFIGURED" };

  // Atomic APPROVED -> CLAIMING acquire. Only one concurrent request wins.
  const acquired: SuggestionRow | null = await markSuggestionClaiming(suggestion.id);
  if (!acquired) {
    // Someone else's request already moved it — report the current truth.
    const latest = await getSuggestionById(suggestion.id);
    if (latest?.status === "CLAIMED") return { outcome: "ALREADY_CLAIMED" };
    return { outcome: "CLAIM_IN_PROGRESS" };
  }

  try {
    const result = await distributeToWallet({
      walletAddress: params.walletAddress,
      amountElsTestnet: Number(acquired.reward_amount),
      claimId: acquired.claim_id as `0x${string}`,
    });

    if (!result.ok) {
      await revertSuggestionClaiming(acquired.id, `${result.reason}${result.detail ? `: ${result.detail}` : ""}`);
      return { outcome: "CLAIM_ERROR", reason: result.reason, detail: result.detail };
    }

    await markSuggestionClaimed(acquired.id, result.txHash);
    return { outcome: "CLAIMED", txHash: result.txHash, rewardAmount: Number(acquired.reward_amount) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await revertSuggestionClaiming(acquired.id, message);
    return { outcome: "CLAIM_ERROR", reason: message };
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
