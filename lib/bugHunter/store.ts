import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { hashClaimToken } from "@/lib/bugHunter/claimToken";

// ---------------------------------------------------------------------------
// Phase 6.6.1 — Bug Hunter store.
//
// Every state transition here is a conditional UPDATE (`.eq("status", X)`
// before setting the new status), never a read-then-write in application
// code — that's what actually prevents two concurrent admin clicks or two
// concurrent claim confirmations from double-applying a transition (Section
// 13/14). `.select()` on the update tells the caller whether a row was
// actually matched; zero rows back means "someone else already moved it".
// ---------------------------------------------------------------------------

export const EVIDENCE_BUCKET = "bug-hunter-evidence";

export type BugReportStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLAIMING" | "REWARDED";

export interface BugReportRow {
  id: string;
  public_id: string;
  user_id: string | null;
  wallet_address: string;
  email: string;
  title: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  reproduction_steps: string;
  expected_behavior: string;
  actual_behavior: string;
  impact: string;
  evidence_path: string;
  status: BugReportStatus;
  reward_amount: string | null;
  bounty_id: string | null;
  tx_hash: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBugReportInput {
  userId: string | null;
  walletAddress: string;
  email: string;
  title: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  reproductionSteps: string;
  expectedBehavior: string;
  actualBehavior: string;
  impact: string;
  evidencePath: string;
}

function requireSupabase(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase_not_configured");
  return sb;
}

export async function createBugReport(input: CreateBugReportInput): Promise<BugReportRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("bug_reports")
    .insert({
      user_id: input.userId,
      wallet_address: input.walletAddress.toLowerCase(),
      email: input.email,
      title: input.title,
      category: input.category,
      severity: input.severity,
      description: input.description,
      reproduction_steps: input.reproductionSteps,
      expected_behavior: input.expectedBehavior,
      actual_behavior: input.actualBehavior,
      impact: input.impact,
      evidence_path: input.evidencePath,
      status: "PENDING",
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert_failed");
  return data as BugReportRow;
}

export async function getBugReportById(id: string): Promise<BugReportRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("bug_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BugReportRow) ?? null;
}

export async function listBugReports(status?: BugReportStatus): Promise<BugReportRow[]> {
  const sb = requireSupabase();
  let query = sb.from("bug_reports").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as BugReportRow[]) ?? [];
}

export async function listBugReportsForUser(userId: string): Promise<BugReportRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("bug_reports").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as BugReportRow[]) ?? [];
}

/** PENDING -> APPROVED. Returns null if the row wasn't PENDING (already handled by another admin action). */
export async function approveBugReport(id: string, opts: { rewardAmount: string; approvedBy: string }): Promise<BugReportRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("bug_reports")
    .update({
      status: "APPROVED",
      reward_amount: opts.rewardAmount,
      approved_by: opts.approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BugReportRow) ?? null;
}

/** PENDING -> REJECTED. Returns null if the row wasn't PENDING. */
export async function rejectBugReport(id: string, reason: string): Promise<BugReportRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("bug_reports")
    .update({ status: "REJECTED", rejected_reason: reason })
    .eq("id", id)
    .eq("status", "PENDING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BugReportRow) ?? null;
}

/** Records the on-chain bounty ID once prepared (create+fund+approve done by the operational signer). Does not change status — status only moves to CLAIMING/REWARDED around the researcher's own claim tx. */
export async function setBugReportBountyId(id: string, bountyId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("bug_reports").update({ bounty_id: bountyId }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** APPROVED -> CLAIMING, guarding against two concurrent claim attempts starting at once. Returns null if status wasn't APPROVED. */
export async function markBugReportClaiming(id: string): Promise<BugReportRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("bug_reports").update({ status: "CLAIMING" }).eq("id", id).eq("status", "APPROVED").select().maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BugReportRow) ?? null;
}

/** CLAIMING -> REWARDED, only after the on-chain tx is confirmed. */
export async function markBugReportRewarded(id: string, txHash: string): Promise<BugReportRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("bug_reports")
    .update({ status: "REWARDED", tx_hash: txHash, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "CLAIMING")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BugReportRow) ?? null;
}

/** Roll CLAIMING back to APPROVED if the on-chain tx failed/reverted — lets the researcher retry instead of getting stuck (Section 20 "retry harus idempotent"). */
export async function revertBugReportClaiming(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("bug_reports").update({ status: "APPROVED" }).eq("id", id).eq("status", "CLAIMING");
  if (error) throw new Error(error.message);
}

// --------------------------- claim tokens ---------------------------------

export interface CreateClaimTokenInput {
  bugReportId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createClaimToken(input: CreateClaimTokenInput): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("bug_claim_tokens").insert({
    bug_report_id: input.bugReportId,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);
}

export interface ClaimTokenRow {
  id: string;
  bug_report_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/** Looks up a token by its raw value (hashes it first — the DB only ever stores the hash) and returns it together with the linked report. Does NOT mark it used; call markClaimTokenUsed separately, atomically, only at the point the claim is actually finalized. */
export async function getClaimTokenWithReport(
  rawToken: string
): Promise<{ token: ClaimTokenRow; report: BugReportRow } | null> {
  const sb = requireSupabase();
  const tokenHash = hashClaimToken(rawToken);
  const { data: token, error: tokenError } = await sb.from("bug_claim_tokens").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (tokenError) throw new Error(tokenError.message);
  if (!token) return null;

  const { data: report, error: reportError } = await sb.from("bug_reports").select("*").eq("id", (token as ClaimTokenRow).bug_report_id).maybeSingle();
  if (reportError) throw new Error(reportError.message);
  if (!report) return null;

  return { token: token as ClaimTokenRow, report: report as BugReportRow };
}

/** One-time-use enforcement point: succeeds (returns true) only if the token wasn't already used. The `.eq("used_at", null)` in the WHERE clause is what makes two simultaneous requests race safely — only one UPDATE can match. */
export async function markClaimTokenUsed(tokenId: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("bug_claim_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("used_at", null)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
