// ---------------------------------------------------------------------------
// Evolution post-deploy loop — production verification persistence.
//
// Persistence-aware adapters ONLY — no decision logic (that is verify.ts and
// run.ts). Same isolated Learning Database as every evolution_* table
// (lib/ai/learning/db.ts), never Main Supabase. Append-only: one row per
// ATTEMPT, never updated. Idempotency comes from the database: a unique
// (patch_run_id, attempt_no), and at most one VERIFIED row per run.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { ProductionVerificationEvidence, RuntimeProbe, VerificationCheck } from "./contracts";

export type InsertVerificationResult =
  | { readonly inserted: true }
  | { readonly inserted: false; readonly reason: "not_configured" | "conflict" | "error"; readonly error?: string };

const UNIQUE_VIOLATION = "23505";

export async function insertVerification(evidence: ProductionVerificationEvidence): Promise<InsertVerificationResult> {
  const db = getLearningSupabase();
  if (!db) return { inserted: false, reason: "not_configured" };

  const { error } = await db.from("evolution_production_verifications").insert({
    verification_id: evidence.verificationId,
    patch_run_id: evidence.patchRunId,
    record_hash: evidence.recordHash,
    artifact_id: evidence.artifactId,
    proposal_id: evidence.proposalId,
    candidate_id: evidence.candidateId,
    attempt_no: evidence.attemptNo,
    status: evidence.status,
    deployment_id: evidence.deploymentId,
    deployment_state: evidence.deploymentState,
    deployment_target: evidence.deploymentTarget,
    deployment_ready_at: evidence.deploymentReadyAt,
    expected_commit_sha: evidence.expectedCommitSha,
    deployed_commit_sha: evidence.deployedCommitSha,
    affected_endpoints: evidence.affectedEndpoints,
    runtime_probes: evidence.runtimeProbes,
    checks: evidence.checks,
    failure_reasons: evidence.failureReasons,
    verified_at: evidence.verifiedAt,
  });
  if (error) {
    // A concurrent sweep already recorded this attempt (or a VERIFIED row already exists): a safe no-op, not a failure.
    if (error.code === UNIQUE_VIOLATION) return { inserted: false, reason: "conflict", error: error.message };
    return { inserted: false, reason: "error", error: error.message };
  }
  return { inserted: true };
}

function fromRow(data: Record<string, unknown>): ProductionVerificationEvidence {
  return {
    verificationId: data.verification_id as string,
    patchRunId: data.patch_run_id as string,
    recordHash: data.record_hash as string,
    artifactId: data.artifact_id as string,
    proposalId: data.proposal_id as string,
    candidateId: data.candidate_id as string,
    attemptNo: data.attempt_no as number,
    status: data.status as ProductionVerificationEvidence["status"],
    deploymentId: (data.deployment_id as string | null) ?? null,
    deploymentState: (data.deployment_state as ProductionVerificationEvidence["deploymentState"]) ?? null,
    deploymentTarget: (data.deployment_target as string | null) ?? null,
    deploymentReadyAt: (data.deployment_ready_at as string | null) ?? null,
    expectedCommitSha: data.expected_commit_sha as string,
    deployedCommitSha: (data.deployed_commit_sha as string | null) ?? null,
    affectedEndpoints: (data.affected_endpoints as readonly string[]) ?? [],
    runtimeProbes: (data.runtime_probes as readonly RuntimeProbe[]) ?? [],
    checks: (data.checks as readonly VerificationCheck[]) ?? [],
    failureReasons: (data.failure_reasons as readonly string[]) ?? [],
    verifiedAt: data.verified_at as string,
  };
}

/** Every attempt for one patch run, newest first. `null` when the Learning DB is unreachable (distinct from "no attempts yet" = `[]`). */
export async function listVerificationsForRun(patchRunId: string): Promise<ProductionVerificationEvidence[] | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_production_verifications").select("*").eq("patch_run_id", patchRunId).order("attempt_no", { ascending: false });
  if (error || !data) return null;
  return data.map(fromRow);
}

/** The one VERIFIED row for a run, or null. */
export function pickVerified(attempts: readonly ProductionVerificationEvidence[]): ProductionVerificationEvidence | null {
  return attempts.find((a) => a.status === "VERIFIED") ?? null;
}

/**
 * Appends one lineage event (stage PRODUCTION_VERIFICATION / OUTCOME /
 * LEARNING) to the existing evolution_patch_events log — the same durable
 * trail every earlier stage writes to. Never throws; a failed event write is
 * reported to the caller, never swallowed silently as success.
 */
export async function appendLineageEvent(recordHash: string, patchRunId: string, stage: "PRODUCTION_VERIFICATION" | "OUTCOME" | "LEARNING", outcome: string, detail: string): Promise<{ readonly persisted: boolean }> {
  const db = getLearningSupabase();
  if (!db) return { persisted: false };
  const { error } = await db.from("evolution_patch_events").insert({ record_hash: recordHash, patch_run_id: patchRunId, stage, outcome, detail });
  return { persisted: !error };
}
