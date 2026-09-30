import { distributeToWallet } from "@/lib/rewards/distributor";
import { REWARD_DISTRIBUTOR_CONFIGURED } from "@/lib/rewards/config";
import { getSuggestionById, markSuggestionClaiming, markSuggestionRewarded, revertSuggestionClaiming, type SuggestionRow } from "./store";

// ---------------------------------------------------------------------------
// Phase 6.6.4b — Suggestion ELS auto-distribution (Model B).
//
// Reuses the EXACT SAME generic distributor lib/rewards/distributor.ts
// already uses for Buy ELS / Eligible Reward / (previously) the
// user-initiated Suggestion claim — no second token distribution
// architecture, per the scope lock. The only thing that changed from the
// old lib/suggestions/claim.ts flow is WHO triggers it: the admin approve
// route calls this immediately after approval, instead of waiting for a
// user to hit a "Claim" button. The on-chain call, the idempotency guard,
// and the error handling are identical to before.
//
// Idempotency / double-reward protection (three independent layers, same
// pattern as Bug Hunter):
//   1. Atomic APPROVED -> CLAIMING acquire (store.ts's conditional UPDATE
//      `.eq("status", "APPROVED")`) — only one caller can ever win this,
//      so two concurrent approve/retry calls can't both reach the
//      distributor for the same row.
//   2. The distributor's own on-chain replay guard, keyed off claim_id
//      (bytes32, unique in the DB via suggestions_claim_id_key AND
//      enforced by the ELSTestnetRewardDistributor contract itself) — even
//      if this function were somehow invoked twice with two different
//      CLAIMING acquisitions (it can't be, per #1), the second on-chain
//      call would revert.
//   3. This function itself is a no-op (returns ALREADY_REWARDED /
//      IN_PROGRESS) for any row not currently sitting in APPROVED —
//      calling it again on a REWARDED or CLAIMING row never re-attempts
//      distribution.
// ---------------------------------------------------------------------------

export type DistributeSuggestionResult =
  | { outcome: "REWARDED"; txHash: `0x${string}`; rewardAmount: number }
  | { outcome: "ALREADY_REWARDED" }
  | { outcome: "IN_PROGRESS" }
  | { outcome: "NOT_APPROVED" }
  | { outcome: "DISTRIBUTOR_NOT_CONFIGURED" }
  | { outcome: "DISTRIBUTE_ERROR"; reason: string; detail?: string };

/**
 * Attempts to distribute an approved Suggestion's ELS reward on-chain and
 * persist the result. Safe to call multiple times for the same suggestion
 * id (see idempotency notes above) — called once, synchronously, from the
 * admin approve route right after approveSuggestion() succeeds, and again
 * from the admin "retry distribution" route if the first attempt failed
 * (e.g. distributor temporarily out of funds).
 */
export async function distributeSuggestionRewardServerSide(suggestionId: string): Promise<DistributeSuggestionResult> {
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) return { outcome: "NOT_APPROVED" };

  if (suggestion.status === "REWARDED" || suggestion.status === "CLAIMED") return { outcome: "ALREADY_REWARDED" };
  if (suggestion.status === "CLAIMING") return { outcome: "IN_PROGRESS" };
  if (suggestion.status !== "APPROVED") return { outcome: "NOT_APPROVED" };
  if (!suggestion.reward_amount || !suggestion.claim_id) return { outcome: "NOT_APPROVED" };

  if (!REWARD_DISTRIBUTOR_CONFIGURED) return { outcome: "DISTRIBUTOR_NOT_CONFIGURED" };

  // Atomic APPROVED -> CLAIMING acquire. Only one concurrent caller wins.
  const acquired: SuggestionRow | null = await markSuggestionClaiming(suggestion.id);
  if (!acquired) {
    const latest = await getSuggestionById(suggestion.id);
    if (latest?.status === "REWARDED" || latest?.status === "CLAIMED") return { outcome: "ALREADY_REWARDED" };
    return { outcome: "IN_PROGRESS" };
  }

  try {
    const result = await distributeToWallet({
      walletAddress: acquired.wallet_address,
      amountElsTestnet: Number(acquired.reward_amount),
      claimId: acquired.claim_id as `0x${string}`,
    });

    if (!result.ok) {
      await revertSuggestionClaiming(acquired.id, `${result.reason}${result.detail ? `: ${result.detail}` : ""}`);
      return { outcome: "DISTRIBUTE_ERROR", reason: result.reason, detail: result.detail };
    }

    await markSuggestionRewarded(acquired.id, result.txHash);
    return { outcome: "REWARDED", txHash: result.txHash, rewardAmount: Number(acquired.reward_amount) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await revertSuggestionClaiming(acquired.id, message);
    return { outcome: "DISTRIBUTE_ERROR", reason: message };
  }
}
