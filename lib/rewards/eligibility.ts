import type { SupabaseClient } from "@supabase/supabase-js";
import { keccak256, toHex } from "viem";
import { getSupabase } from "@/lib/supabase";
import { getWalletRank } from "@/lib/leaderboard";
import { normalizeWallet } from "./store";
import { distributeToWallet } from "./distributor";
import { REWARD_DISTRIBUTOR_CONFIGURED } from "./config";

// ---------------------------------------------------------------------------
// Phase 6.6.3.2 — Eligible Reward Center.
//
// This is a SEPARATE reward system from Buy ELS/Add Liquidity quest
// rewards (reward_submissions/reward_quests, lib/rewards/store.ts) — those
// are untouched by anything in this file. Eligible Reward is a computed
// status over three EXISTING sources:
//
//   1. Leaderboard rank        — lib/leaderboard.ts (same ranking as
//                                 /api/leaderboard, not a second board)
//   2. Verified Buy ELS        — reward_submissions JOIN reward_quests,
//                                 slug IN (buy_els, buy_els_testnet),
//                                 status = CLAIMED
//   3. Rewarded bug bounty     — bug_reports, status = REWARDED,
//                                 bonus = that row's own reward_amount
//                                 (never a hardcoded severity map)
//
// Base reward is a fixed constant (200 ELS) by explicit operator decision
// — not stored in reward_quests, since Eligible Reward is not a quest.
// ---------------------------------------------------------------------------

export const ELIGIBLE_BASE_REWARD_ELS = 200;

export type EligibleClaimStatus = "PENDING" | "CLAIMING" | "CLAIMED" | "CLAIM_ERROR";

export interface EligibilityResult {
  wallet: string;
  rank: number | null;
  isTop10: boolean;
  hasVerifiedBuy: boolean;
  bugBountyCount: number;
  bugBountyBonus: number;
  baseReward: number;
  totalReward: number;
  eligible: boolean;
  alreadyClaimed: boolean;
  reasons: string[];
}

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error("Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  return client;
}

/**
 * Has this wallet ever had a Buy ELS quest (mainnet or testnet) reach
 * CLAIMED? Reuses reward_submissions/reward_quests exactly as they already
 * exist — no new verification logic, no new table.
 */
async function hasVerifiedBuyEls(walletAddress: string): Promise<boolean> {
  const wallet = normalizeWallet(walletAddress);
  const { data: quests, error: questsError } = await db().from("reward_quests").select("id, slug").in("slug", ["buy_els", "buy_els_testnet"]);
  if (questsError) throw new Error(`hasVerifiedBuyEls (quests): ${questsError.message}`);
  const questIds = (quests ?? []).map((q) => q.id as string);
  if (questIds.length === 0) return false;

  const { data, error } = await db()
    .from("reward_submissions")
    .select("id")
    .eq("wallet_address", wallet)
    .in("quest_id", questIds)
    .eq("status", "CLAIMED")
    .limit(1);
  if (error) throw new Error(`hasVerifiedBuyEls (submissions): ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Sum of reward_amount across every bug_reports row this wallet has that's
 * reached status REWARDED. reward_amount is admin-set per report (Phase
 * 6.6.1) — never a hardcoded severity → amount map, per the brief.
 */
async function getBugBountyBonus(walletAddress: string): Promise<{ count: number; bonus: number }> {
  const wallet = normalizeWallet(walletAddress);
  const { data, error } = await db().from("bug_reports").select("reward_amount").eq("wallet_address", wallet).eq("status", "REWARDED");
  if (error) throw new Error(`getBugBountyBonus: ${error.message}`);
  const rows = data ?? [];
  const bonus = rows.reduce((sum, r) => sum + Number(r.reward_amount ?? 0), 0);
  return { count: rows.length, bonus };
}

/** Has this wallet already CLAIMED an Eligible Reward before? (the one-per-wallet-ever rule) */
async function getExistingClaim(walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  const { data, error } = await db()
    .from("eligible_reward_claims")
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getExistingClaim: ${error.message}`);
  return data as EligibleRewardClaimRow | null;
}

export interface EligibleRewardClaimRow {
  id: string;
  user_id: string | null;
  wallet_address: string;
  status: EligibleClaimStatus;
  rank: number | null;
  base_reward: number;
  bug_bounty_bonus: number;
  total_reward: number;
  claim_id: string;
  tx_hash: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The full eligibility computation. Never fabricates a value — every field
 * comes straight from an existing source table. Safe to call repeatedly
 * (read-only); the claim endpoint calls this again itself rather than
 * trusting a client-supplied result (Section 17's "server-side eligibility
 * recalculation" requirement).
 */
export async function checkEligibility(walletAddress: string): Promise<EligibilityResult> {
  const wallet = normalizeWallet(walletAddress);
  const [rank, hasVerifiedBuy, bugBounty, existingClaim] = await Promise.all([
    getWalletRank(wallet),
    hasVerifiedBuyEls(wallet),
    getBugBountyBonus(wallet),
    getExistingClaim(wallet),
  ]);

  const isTop10 = rank !== null && rank <= 10;
  const alreadyClaimed = existingClaim?.status === "CLAIMED";

  const reasons: string[] = [];
  if (!isTop10) reasons.push(rank === null ? "Wallet is not yet ranked on the leaderboard." : `Wallet rank is #${rank} — TOP 10 required.`);
  if (!hasVerifiedBuy) reasons.push("No verified Buy ELS transaction found for this wallet.");
  if (alreadyClaimed) reasons.push("This wallet has already claimed its Eligible Reward.");

  const eligible = isTop10 && hasVerifiedBuy && !alreadyClaimed;
  const baseReward = ELIGIBLE_BASE_REWARD_ELS;
  const totalReward = baseReward + bugBounty.bonus;

  return {
    wallet,
    rank,
    isTop10,
    hasVerifiedBuy,
    bugBountyCount: bugBounty.count,
    bugBountyBonus: bugBounty.bonus,
    baseReward,
    totalReward,
    eligible,
    alreadyClaimed,
    reasons,
  };
}

export type ClaimEligibleRewardResult =
  | { outcome: "CLAIMED"; txHash: `0x${string}`; totalReward: number }
  | { outcome: "NOT_ELIGIBLE"; reasons: string[] }
  | { outcome: "ALREADY_CLAIMED" }
  | { outcome: "CLAIM_IN_PROGRESS" }
  | { outcome: "DISTRIBUTOR_NOT_CONFIGURED" }
  | { outcome: "CLAIM_ERROR"; reason: string; detail?: string };

/**
 * Claim flow — Section 14/17. Recalculates eligibility itself (never
 * trusts a client-supplied amount/eligible flag), atomically locks a
 * PENDING->CLAIMING transition (same conditional-UPDATE pattern
 * lib/rewards/store.ts's claimReward() uses), then calls the existing
 * distributor with a claimId derived from THIS table's own row id — never
 * reward_submissions.id — so this payout can't collide with a Buy ELS
 * quest payout.
 */
export async function claimEligibleReward(userId: string | null, walletAddress: string): Promise<ClaimEligibleRewardResult> {
  const wallet = normalizeWallet(walletAddress);

  // Step 1 — recompute eligibility server-side, from scratch.
  const eligibility = await checkEligibility(wallet);
  if (eligibility.alreadyClaimed) return { outcome: "ALREADY_CLAIMED" };
  if (!eligibility.eligible) return { outcome: "NOT_ELIGIBLE", reasons: eligibility.reasons };

  if (!REWARD_DISTRIBUTOR_CONFIGURED) return { outcome: "DISTRIBUTOR_NOT_CONFIGURED" };

  // Step 2 — check for an in-flight or already-terminal row for this wallet
  // before creating a new one (covers refresh/double-tab/retry).
  const existing = await getExistingClaim(wallet);
  if (existing?.status === "CLAIMED") return { outcome: "ALREADY_CLAIMED" };
  if (existing?.status === "CLAIMING") return { outcome: "CLAIM_IN_PROGRESS" };

  // Step 3 — create (or reuse a CLAIM_ERROR row via retry) and atomically
  // acquire CLAIMING, same "conditional UPDATE ... WHERE status IN (...)"
  // guard store.ts's claimReward() uses so only one concurrent request can
  // win the row.
  let row: EligibleRewardClaimRow;
  if (existing && existing.status === "CLAIM_ERROR") {
    const { data: acquired, error } = await db()
      .from("eligible_reward_claims")
      .update({ status: "CLAIMING", rank: eligibility.rank, base_reward: eligibility.baseReward, bug_bounty_bonus: eligibility.bugBountyBonus, total_reward: eligibility.totalReward })
      .eq("id", existing.id)
      .in("status", ["PENDING", "CLAIM_ERROR"])
      .select("*")
      .maybeSingle();
    if (error) return { outcome: "CLAIM_ERROR", reason: error.message };
    if (!acquired) return { outcome: "CLAIM_IN_PROGRESS" }; // lost the race
    row = acquired as EligibleRewardClaimRow;
  } else {
    const claimId = keccak256(toHex(`eligible:${wallet}:${Date.now()}`));
    const { data: created, error } = await db()
      .from("eligible_reward_claims")
      .insert({
        user_id: userId,
        wallet_address: wallet,
        status: "CLAIMING",
        rank: eligibility.rank,
        base_reward: eligibility.baseReward,
        bug_bounty_bonus: eligibility.bugBountyBonus,
        total_reward: eligibility.totalReward,
        claim_id: claimId,
      })
      .select("*")
      .maybeSingle();
    if (error) {
      // Unique violation on wallet_address (partial unique index) means a
      // concurrent request beat us to CLAIMED between our check and this
      // insert — report it as such rather than a generic error.
      if (error.code === "23505") return { outcome: "ALREADY_CLAIMED" };
      return { outcome: "CLAIM_ERROR", reason: error.message };
    }
    if (!created) return { outcome: "CLAIM_ERROR", reason: "insert_failed" };
    row = created as EligibleRewardClaimRow;
  }

  // Step 4 — call the existing distributor. Non-recoverable failure here
  // reverts the row to CLAIM_ERROR so a later retry can re-acquire it
  // rather than leaving it permanently stuck in CLAIMING.
  try {
    const result = await distributeToWallet({
      walletAddress: wallet,
      amountElsTestnet: row.total_reward,
      claimId: row.claim_id as `0x${string}`,
    });

    if (!result.ok) {
      await db().from("eligible_reward_claims").update({ status: "CLAIM_ERROR", last_error_message: `${result.reason}${result.detail ? `: ${result.detail}` : ""}` }).eq("id", row.id);
      return { outcome: "CLAIM_ERROR", reason: result.reason, detail: result.detail };
    }

    await db().from("eligible_reward_claims").update({ status: "CLAIMED", tx_hash: result.txHash }).eq("id", row.id);
    return { outcome: "CLAIMED", txHash: result.txHash, totalReward: row.total_reward };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("eligible_reward_claims").update({ status: "CLAIM_ERROR", last_error_message: message }).eq("id", row.id);
    return { outcome: "CLAIM_ERROR", reason: message };
  }
}
