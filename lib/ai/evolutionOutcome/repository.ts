// ---------------------------------------------------------------------------
// Evolution post-deploy loop — outcome + learning persistence.
//
// Persistence-aware adapters ONLY (no decisions — see evaluate.ts / learning.ts).
// Learning Database only. Append-only; idempotency is the database's:
// unique (patch_run_id, evaluation_no), at most one TERMINAL outcome per run,
// at most one learning per run. A unique violation is reported as `conflict`
// (a concurrent sweep already wrote it), never as a failure.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { EvolutionLearningRecord, EvolutionLineage, EvolutionOutcomeRecord, LearningKind, NextEvolutionState, OutcomeStatus, OutcomeWindow } from "./contracts";
import type { GapCategory, DecisionSource } from "@/lib/ai/evolutionCandidate/contracts";
import type { RegressionCheck, ValidationGateOutcome } from "@/lib/ai/evolutionValidation/contracts";

export type WriteResult =
  | { readonly written: true }
  | { readonly written: false; readonly reason: "not_configured" | "conflict" | "error"; readonly error?: string };

const UNIQUE_VIOLATION = "23505";

export async function insertOutcome(o: EvolutionOutcomeRecord): Promise<WriteResult> {
  const db = getLearningSupabase();
  if (!db) return { written: false, reason: "not_configured" };
  const { error } = await db.from("evolution_outcomes").insert({
    outcome_id: o.outcomeId,
    patch_run_id: o.patchRunId,
    verification_id: o.verificationId,
    record_hash: o.recordHash,
    artifact_id: o.artifactId,
    proposal_id: o.proposalId,
    candidate_id: o.candidateId,
    source: o.source,
    symbol: o.symbol,
    gap_category: o.gapCategory,
    commit_sha: o.commitSha,
    deployment_id: o.deploymentId,
    deployed_at: o.deployedAt,
    evaluation_no: o.evaluationNo,
    outcome_status: o.status,
    metric: o.metric,
    baseline: o.baseline,
    post: o.post,
    gates: o.gates,
    regression_check: o.regressionCheck,
    reasons: o.reasons,
    evaluated_at: o.evaluatedAt,
  });
  if (error) return error.code === UNIQUE_VIOLATION ? { written: false, reason: "conflict", error: error.message } : { written: false, reason: "error", error: error.message };
  return { written: true };
}

export async function insertLearning(l: EvolutionLearningRecord): Promise<WriteResult> {
  const db = getLearningSupabase();
  if (!db) return { written: false, reason: "not_configured" };
  const { error } = await db.from("evolution_learnings").insert({
    learning_id: l.learningId,
    patch_run_id: l.patchRunId,
    record_hash: l.recordHash,
    artifact_id: l.artifactId,
    proposal_id: l.proposalId,
    candidate_id: l.candidateId,
    source: l.source,
    symbol: l.symbol,
    gap_category: l.gapCategory,
    commit_sha: l.commitSha,
    deployment_id: l.deploymentId,
    derived_from: l.derivedFrom,
    outcome_id: l.outcomeId,
    verification_id: l.verificationId,
    learning_kind: l.learningKind,
    next_evolution_state: l.nextEvolutionState,
    summary: l.summary,
    lineage: l.lineage,
    recorded_at: l.recordedAt,
  });
  if (error) return error.code === UNIQUE_VIOLATION ? { written: false, reason: "conflict", error: error.message } : { written: false, reason: "error", error: error.message };
  return { written: true };
}

function outcomeFromRow(d: Record<string, unknown>): EvolutionOutcomeRecord {
  return {
    outcomeId: d.outcome_id as string,
    patchRunId: d.patch_run_id as string,
    verificationId: d.verification_id as string,
    recordHash: d.record_hash as string,
    artifactId: d.artifact_id as string,
    proposalId: d.proposal_id as string,
    candidateId: d.candidate_id as string,
    source: d.source as DecisionSource,
    symbol: d.symbol as string,
    gapCategory: d.gap_category as GapCategory,
    commitSha: d.commit_sha as string,
    deploymentId: d.deployment_id as string,
    deployedAt: d.deployed_at as string,
    evaluationNo: d.evaluation_no as number,
    status: d.outcome_status as OutcomeStatus,
    metric: d.metric as string,
    baseline: d.baseline as OutcomeWindow,
    post: d.post as OutcomeWindow,
    gates: (d.gates as readonly ValidationGateOutcome[]) ?? [],
    regressionCheck: d.regression_check as RegressionCheck,
    reasons: (d.reasons as readonly string[]) ?? [],
    evaluatedAt: d.evaluated_at as string,
  };
}

function learningFromRow(d: Record<string, unknown>): EvolutionLearningRecord {
  return {
    learningId: d.learning_id as string,
    patchRunId: d.patch_run_id as string,
    recordHash: d.record_hash as string,
    artifactId: d.artifact_id as string,
    proposalId: d.proposal_id as string,
    candidateId: d.candidate_id as string,
    source: d.source as DecisionSource,
    symbol: d.symbol as string,
    gapCategory: d.gap_category as GapCategory,
    commitSha: d.commit_sha as string,
    deploymentId: d.deployment_id as string,
    derivedFrom: d.derived_from as EvolutionLearningRecord["derivedFrom"],
    outcomeId: (d.outcome_id as string | null) ?? null,
    verificationId: (d.verification_id as string | null) ?? null,
    learningKind: d.learning_kind as LearningKind,
    nextEvolutionState: d.next_evolution_state as NextEvolutionState,
    summary: d.summary as string,
    lineage: d.lineage as EvolutionLineage,
    recordedAt: d.recorded_at as string,
  };
}

/** Every evaluation for a run, newest first. `null` = Learning DB unreachable (distinct from "none yet" = `[]`). */
export async function listOutcomesForRun(patchRunId: string): Promise<EvolutionOutcomeRecord[] | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_outcomes").select("*").eq("patch_run_id", patchRunId).order("evaluation_no", { ascending: false });
  if (error || !data) return null;
  return data.map(outcomeFromRow);
}

export async function getLearningForRun(patchRunId: string): Promise<EvolutionLearningRecord | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_learnings").select("*").eq("patch_run_id", patchRunId).maybeSingle();
  if (error || !data) return null;
  return learningFromRow(data);
}

/**
 * The most recent learning for one (source, symbol, gapCategory) — what the
 * NEXT evolution observation of that gap should know before anything is
 * proposed again. `null` when none exists or the Learning DB is unreachable.
 */
export async function getLatestLearningForGap(source: string, symbol: string, gapCategory: string): Promise<EvolutionLearningRecord | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db.from("evolution_learnings").select("*").eq("source", source).eq("symbol", symbol).eq("gap_category", gapCategory).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return learningFromRow(data);
}
