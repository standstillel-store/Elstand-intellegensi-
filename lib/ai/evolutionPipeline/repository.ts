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

/** Read-only lookup by the run's own merge commit SHA — used by the Vercel deployment webhook to find which run a completed deployment belongs to. `null` when not configured or not found. */
export async function getPatchRunByMergeCommitSha(mergeCommitSha: string): Promise<PatchRun | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_patch_runs").select("*").eq("merge_commit_sha", mergeCommitSha).maybeSingle();
  if (error || !data) return null;
  return {
    patchRunId: data.patch_run_id,
    recordHash: data.record_hash,
    artifactId: data.artifact_id,
    proposalId: data.proposal_id,
    status: data.status,
    branch: data.branch,
    baseSha: data.base_sha,
    commitSha: data.commit_sha,
    mergeCommitSha: data.merge_commit_sha,
    deploymentId: data.deployment_id,
    deploymentUrl: data.deployment_url,
    failedStage: data.failed_stage,
    errorSummary: data.error_summary,
    startedAt: data.started_at,
    updatedAt: data.updated_at,
  };
}
