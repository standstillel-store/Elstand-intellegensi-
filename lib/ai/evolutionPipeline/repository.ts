// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, patch-run persistence (Step 4)
//
// Persistence-aware adapters ONLY — zero orchestration logic here (that is
// run.ts). Writes to the SAME isolated ELVOID Learning Database every other
// evolution_* table lives in (lib/ai/learning/db.ts) — never Main Supabase.
//
// TWO TABLES, deliberately different mutability (see the 2026-09d
// migration's own header for why):
//   - evolution_patch_runs: ONE mutable row per artifact, recompute-and-
//     upsert on patch_run_id — the live status of an in-progress or
//     completed run. This is the first genuinely mutable evolution_* row in
//     the codebase; every upstream table is append-only because upstream is
//     pure/synchronous, but a multi-stage async pipeline has no honest way
//     to be append-only for its OWN live status without either losing the
//     "current state" query or duplicating rows per stage.
//   - evolution_patch_events: append-only log, one row per stage
//     transition — the durable lineage Section M requires, independent of
//     whatever the mutable row above currently says.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { PatchRunStatus, PatchRunWithoutTimestamp, PatchRun } from "./contracts";

export type PersistResult = { readonly persisted: true } | { readonly persisted: false; readonly reason: "not_configured" | "error"; readonly error?: string };

export async function upsertPatchRun(run: PatchRunWithoutTimestamp): Promise<PersistResult> {
  const db = getLearningSupabase();
  if (!db) return { persisted: false, reason: "not_configured" };

  const row = {
    patch_run_id: run.patchRunId,
    record_hash: run.recordHash,
    artifact_id: run.artifactId,
    proposal_id: run.proposalId,
    status: run.status,
    branch: run.branch,
    base_sha: run.baseSha,
    commit_sha: run.commitSha,
    merge_commit_sha: run.mergeCommitSha,
    deployment_id: run.deploymentId,
    deployment_url: run.deploymentUrl,
    failed_stage: run.failedStage,
    error_summary: run.errorSummary,
    checks_run_url: run.checksRunUrl ?? null,
    authorized_by: run.authorizedBy ?? null,
    authorized_at: run.authorizedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("evolution_patch_runs").upsert(row, { onConflict: "patch_run_id" });
  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true };
}

export async function appendPatchEvent(recordHash: string, patchRunId: string, stage: string, outcome: PatchRunStatus | "STARTED", detail: string): Promise<PersistResult> {
  const db = getLearningSupabase();
  if (!db) return { persisted: false, reason: "not_configured" };

  const { error } = await db.from("evolution_patch_events").insert({
    record_hash: recordHash,
    patch_run_id: patchRunId,
    stage,
    outcome,
    detail,
  });
  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true };
}

function fromRow(data: Record<string, unknown>): PatchRun {
  return {
    patchRunId: data.patch_run_id as string,
    recordHash: data.record_hash as string,
    artifactId: data.artifact_id as string,
    proposalId: data.proposal_id as string,
    status: data.status as PatchRunStatus,
    branch: data.branch as string | null,
    baseSha: data.base_sha as string | null,
    commitSha: data.commit_sha as string | null,
    mergeCommitSha: data.merge_commit_sha as string | null,
    deploymentId: data.deployment_id as string | null,
    deploymentUrl: data.deployment_url as string | null,
    failedStage: data.failed_stage as string | null,
    errorSummary: data.error_summary as string | null,
    checksRunUrl: (data.checks_run_url as string | null) ?? null,
    authorizedBy: (data.authorized_by as number | null) ?? null,
    authorizedAt: (data.authorized_at as string | null) ?? null,
    startedAt: data.started_at as string,
    updatedAt: data.updated_at as string,
  };
}

/** Read-only lookup by the run's own merge commit SHA — used by the Vercel deployment webhook to find which run a completed deployment belongs to. `null` when not configured or not found. */
export async function getPatchRunByMergeCommitSha(mergeCommitSha: string): Promise<PatchRun | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_patch_runs").select("*").eq("merge_commit_sha", mergeCommitSha).maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

/**
 * Read-only lookup by a record_hash PREFIX (>=16 hex chars — same "prefix is
 * only a lookup key, the full recordHash is what's actually used" rule as
 * lib/ai/evolutionApproval/telegramPayload.ts's callback data). Zero or
 * more than one match is reported as `null` rather than guessing which row
 * the caller meant — added 2026-09-28 for the authorization callback.
 */
export async function getPatchRunByRecordHashPrefix(prefix: string): Promise<PatchRun | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  if (!/^[0-9a-f]{16,64}$/.test(prefix)) return null;
  const { data, error } = await db.from("evolution_patch_runs").select("*").ilike("record_hash", `${prefix}%`).limit(2);
  if (error || !data || data.length !== 1) return null;
  return fromRow(data[0]);
}

/** Every current row in one status — added 2026-09-28 for checks.ts's poll loop (find every run still awaiting CI, in one query, instead of tracking run ids anywhere else). */
export async function getPatchRunsByStatus(status: PatchRunStatus): Promise<PatchRun[]> {
  const db = getLearningSupabase();
  if (!db) return [];
  const { data, error } = await db.from("evolution_patch_runs").select("*").eq("status", status).order("started_at", { ascending: true });
  if (error || !data) return [];
  return data.map(fromRow);
}

/**
 * Atomic claim of the authorization decision — added 2026-09-28. A single
 * conditional UPDATE: it only matches while the run is STILL
 * AWAITING_HUMAN_AUTHORIZATION and has never been authorized, so two
 * concurrent/redelivered "Authorize" presses cannot both proceed to merge —
 * exactly one UPDATE matches a row. Returns `true` only if THIS call won.
 */
export async function claimPatchAuthorization(patchRunId: string, telegramUserId: number): Promise<boolean> {
  const db = getLearningSupabase();
  if (!db) return false;
  const { data, error } = await db
    .from("evolution_patch_runs")
    .update({ authorized_by: telegramUserId, authorized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("patch_run_id", patchRunId)
    .eq("status", "AWAITING_HUMAN_AUTHORIZATION")
    .is("authorized_at", null)
    .select("patch_run_id");
  if (error || !data) return false;
  return data.length === 1;
}

/** Conditional status transition (compare-and-set) — `true` only if the row was still in `expected` when the UPDATE ran. Used for decline/expiry so a late press can never overwrite a decision that already exists. */
export async function transitionPatchRunIfStatus(patchRunId: string, expected: PatchRunStatus, next: PatchRunStatus, fields: { failedStage?: string | null; errorSummary?: string | null } = {}): Promise<boolean> {
  const db = getLearningSupabase();
  if (!db) return false;
  const { data, error } = await db
    .from("evolution_patch_runs")
    .update({ status: next, failed_stage: fields.failedStage ?? null, error_summary: fields.errorSummary ?? null, updated_at: new Date().toISOString() })
    .eq("patch_run_id", patchRunId)
    .eq("status", expected)
    .select("patch_run_id");
  if (error || !data) return false;
  return data.length === 1;
}
