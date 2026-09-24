import type { SupabaseClient } from "@supabase/supabase-js";
import { keccak256, toHex } from "viem";
import { getSupabase } from "@/lib/supabase";
import { SUGGESTION_BASE_ELS_REWARD, SUGGESTION_AI_ENERGY_REWARD } from "./config";

// ---------------------------------------------------------------------------
// Phase 6.6.4 — Suggestions store.
//
// Same rule as lib/bugHunter/store.ts: every state transition is a
// conditional UPDATE (`.eq("status", X)` before setting the new status),
// never read-then-write in application code — this is what actually
// prevents two concurrent admin clicks or two concurrent claim requests
// from double-applying a transition. `.select()` on the update tells the
// caller whether a row was actually matched.
// ---------------------------------------------------------------------------

export type SuggestionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLAIMING" | "CLAIMED";

export interface SuggestionRow {
  id: string;
  public_id: string;
  user_id: string | null;
  wallet_address: string;
  email: string | null;
  title: string;
  category: string;
  description: string;
  supporting_info: string | null;
  status: SuggestionStatus;
  base_reward_els: string;
  admin_bonus_els: string;
  reward_amount: string | null;
  claim_id: string | null;
  tx_hash: string | null;
  ai_energy_amount: number;
  ai_energy_granted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  claimed_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSuggestionInput {
  userId: string | null;
  walletAddress: string;
  email: string | null;
  title: string;
  category: string;
  description: string;
  supportingInfo: string | null;
}

function requireSupabase(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase_not_configured");
  return sb;
}

export async function createSuggestion(input: CreateSuggestionInput): Promise<SuggestionRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("suggestions")
    .insert({
      user_id: input.userId,
      wallet_address: input.walletAddress.toLowerCase(),
      email: input.email,
      title: input.title,
      category: input.category,
      description: input.description,
      supporting_info: input.supportingInfo,
      status: "PENDING",
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert_failed");
  return data as SuggestionRow;
}

export async function getSuggestionById(id: string): Promise<SuggestionRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("suggestions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}

export async function listSuggestions(status?: SuggestionStatus): Promise<SuggestionRow[]> {
  const sb = requireSupabase();
  let query = sb.from("suggestions").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as SuggestionRow[]) ?? [];
}

export async function listSuggestionsForUser(userId: string): Promise<SuggestionRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("suggestions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SuggestionRow[]) ?? [];
}

/** Derives this row's own claimId, in its own id-space — never reused from bug_reports or eligible_reward_claims. */
export function claimIdForSuggestion(suggestionId: string): `0x${string}` {
  return keccak256(toHex(`suggestion:${suggestionId}`));
}

/**
 * PENDING -> APPROVED ("reward available"). Computes and PERSISTS the
 * reward server-side — the only admin-controlled input is adminBonusEls
 * (clamped to >= 0 here, defense in depth alongside the route's own
 * validation); everything else is a fixed constant:
 *
 *   base_reward_els  = SUGGESTION_BASE_ELS_REWARD   (40, fixed)
 *   admin_bonus_els  = max(0, opts.adminBonusEls)   (admin-supplied, >= 0)
 *   reward_amount    = base_reward_els + admin_bonus_els  <- what claim.ts pays
 *   ai_energy_amount = SUGGESTION_AI_ENERGY_REWARD  (10, fixed — never
 *                      admin- or client-suppliable)
 *
 * Sets reward_amount/claim_id/ai_energy_amount in the SAME conditional
 * UPDATE (`.eq("status", "PENDING")`) as the PENDING -> APPROVED
 * transition, so this is a single atomic step: a second concurrent approve
 * call (or the same call retried) matches zero rows and returns null
 * rather than recomputing/overwriting an already-approved reward.
 */
export async function approveSuggestion(id: string, opts: { adminBonusEls: number; approvedBy: string }): Promise<SuggestionRow | null> {
  const sb = requireSupabase();
  const adminBonusEls = Math.max(0, opts.adminBonusEls);
  const baseRewardEls = SUGGESTION_BASE_ELS_REWARD;
  const totalRewardEls = baseRewardEls + adminBonusEls;

  const { data, error } = await sb
    .from("suggestions")
    .update({
      status: "APPROVED",
      base_reward_els: baseRewardEls.toString(),
      admin_bonus_els: adminBonusEls.toString(),
      reward_amount: totalRewardEls.toString(),
      ai_energy_amount: SUGGESTION_AI_ENERGY_REWARD,
      claim_id: claimIdForSuggestion(id),
      approved_by: opts.approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}

/** Records that the AI Energy grant for this suggestion has been made — call ONLY after lib/energy.ts refundEnergy() actually succeeded, so a failed grant can be retried instead of silently marked done. */
export async function markSuggestionAiEnergyGranted(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("suggestions").update({ ai_energy_granted_at: new Date().toISOString() }).eq("id", id).is("ai_energy_granted_at", null);
  if (error) throw new Error(error.message);
}

/** PENDING -> REJECTED. Returns null if the row wasn't PENDING. */
export async function rejectSuggestion(id: string, reason: string): Promise<SuggestionRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("suggestions")
    .update({ status: "REJECTED", rejected_reason: reason })
    .eq("id", id)
    .eq("status", "PENDING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}

/** APPROVED -> CLAIMING, guarding against two concurrent claim attempts starting at once. Returns null if status wasn't APPROVED. */
export async function markSuggestionClaiming(id: string): Promise<SuggestionRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("suggestions").update({ status: "CLAIMING" }).eq("id", id).eq("status", "APPROVED").select().maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}

/** CLAIMING -> CLAIMED, only after the distributor tx is confirmed. */
export async function markSuggestionClaimed(id: string, txHash: string): Promise<SuggestionRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("suggestions")
    .update({ status: "CLAIMED", tx_hash: txHash, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "CLAIMING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}

/** Roll CLAIMING back to APPROVED if the distributor call failed — lets the user retry instead of getting stuck, same pattern as revertBugReportClaiming. */
export async function revertSuggestionClaiming(id: string, errorMessage?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("suggestions")
    .update({ status: "APPROVED", last_error_message: errorMessage ?? null })
    .eq("id", id)
    .eq("status", "CLAIMING");
  if (error) throw new Error(error.message);
}
