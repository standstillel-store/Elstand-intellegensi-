// ---------------------------------------------------------------------------
// Evolution post-deploy loop — LEARNING derivation (pure).
//
// Turns a TERMINAL result into exactly one learning record. Both good and bad
// results are learned: an effective change, an ineffective one, a harmful
// one, and a deployment that could not be verified live all produce a record
// that names what the next evolution cycle should treat this gap as.
//
// The kind <-> next-state mapping is deliberately a closed 1:1 table. The
// database repeats it in evolution_learnings_guard_insert, so a row that
// disagrees with its own outcome cannot be stored.
//
// A learning is an OBSERVATION. It does not revert a change, open a
// proposal, or move any threshold — a human reads it.
// ---------------------------------------------------------------------------

import type { EvolutionLearningRecord, EvolutionLineage, EvolutionOutcomeRecord, LearningKind, NextEvolutionState, OutcomeStatus } from "./contracts";
import { learningIdFor } from "./contracts";

export const OUTCOME_LEARNING_MAP: Readonly<Record<Exclude<OutcomeStatus, "INSUFFICIENT_EVIDENCE">, { readonly kind: LearningKind; readonly next: NextEvolutionState }>> = {
  IMPROVED: { kind: "CHANGE_EFFECTIVE", next: "GAP_ADDRESSED_MONITOR" },
  NOT_IMPROVED: { kind: "CHANGE_INEFFECTIVE", next: "GAP_PERSISTS_REVISION_NEEDED" },
  REGRESSED: { kind: "CHANGE_HARMFUL", next: "REGRESSION_REVIEW_REQUIRED" },
};

export const UNVERIFIED_LEARNING = { kind: "CHANGE_UNVERIFIED" as const, next: "PRODUCTION_REVIEW_REQUIRED" as const };

export interface UnverifiedLearningInput {
  readonly patchRunId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: EvolutionLearningRecord["source"];
  readonly symbol: string;
  readonly gapCategory: EvolutionLearningRecord["gapCategory"];
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly verificationId: string;
  readonly failureReasons: readonly string[];
  readonly attempts: number;
  readonly nowIso: string;
}

/** Learning from a terminal OUTCOME. Returns null for INSUFFICIENT_EVIDENCE — nothing is learned until a verdict exists. */
export function deriveLearningFromOutcome(outcome: EvolutionOutcomeRecord, verificationId: string, nowIso: string): EvolutionLearningRecord | null {
  if (outcome.status === "INSUFFICIENT_EVIDENCE") return null;
  const mapped = OUTCOME_LEARNING_MAP[outcome.status];
  const lineage: EvolutionLineage = {
    proposalId: outcome.proposalId,
    candidateId: outcome.candidateId,
    recordHash: outcome.recordHash,
    artifactId: outcome.artifactId,
    patchRunId: outcome.patchRunId,
    commitSha: outcome.commitSha,
    deploymentId: outcome.deploymentId,
    verificationId,
    outcomeId: outcome.outcomeId,
  };
  const rate = `${outcome.baseline.targetOccurrenceCount ?? "n/a"}/${outcome.baseline.eligibleCount} -> ${outcome.post.targetOccurrenceCount ?? "n/a"}/${outcome.post.eligibleCount}`;
  const summary =
    outcome.status === "IMPROVED"
      ? `${outcome.gapCategory} on ${outcome.symbol} fell after commit ${outcome.commitSha.slice(0, 12)} (${rate}). Keep the change; monitor the gap rather than re-proposing it.`
      : outcome.status === "NOT_IMPROVED"
        ? `${outcome.gapCategory} on ${outcome.symbol} did not fall enough after commit ${outcome.commitSha.slice(0, 12)} (${rate}). The change did not address this gap; a revised proposal is warranted.`
        : `Commit ${outcome.commitSha.slice(0, 12)} was followed by a regression on ${outcome.symbol} (${outcome.regressionCheck.reasons.join(" ") || "other gap categories became active"}). Human review of the change is required.`;
  return {
    learningId: learningIdFor(outcome.patchRunId),
    patchRunId: outcome.patchRunId,
    recordHash: outcome.recordHash,
    artifactId: outcome.artifactId,
    proposalId: outcome.proposalId,
    candidateId: outcome.candidateId,
    source: outcome.source,
    symbol: outcome.symbol,
    gapCategory: outcome.gapCategory,
    commitSha: outcome.commitSha,
    deploymentId: outcome.deploymentId,
    derivedFrom: "OUTCOME",
    outcomeId: outcome.outcomeId,
    verificationId,
    learningKind: mapped.kind,
    nextEvolutionState: mapped.next,
    summary,
    lineage,
    recordedAt: nowIso,
  };
}

/** Learning from a deployment whose production verification failed every permitted attempt. */
export function deriveLearningFromFailedVerification(input: UnverifiedLearningInput): EvolutionLearningRecord {
  return {
    learningId: learningIdFor(input.patchRunId),
    patchRunId: input.patchRunId,
    recordHash: input.recordHash,
    artifactId: input.artifactId,
    proposalId: input.proposalId,
    candidateId: input.candidateId,
    source: input.source,
    symbol: input.symbol,
    gapCategory: input.gapCategory,
    commitSha: input.commitSha,
    deploymentId: input.deploymentId,
    derivedFrom: "PRODUCTION_VERIFICATION",
    outcomeId: null,
    verificationId: input.verificationId,
    learningKind: UNVERIFIED_LEARNING.kind,
    nextEvolutionState: UNVERIFIED_LEARNING.next,
    summary: `Deployment ${input.deploymentId} of commit ${input.commitSha.slice(0, 12)} could not be verified live after ${input.attempts} attempt(s): ${input.failureReasons.join(" | ") || "no reason recorded"}. The change's effect on ${input.gapCategory} was NOT measured.`,
    lineage: { proposalId: input.proposalId, candidateId: input.candidateId, recordHash: input.recordHash, artifactId: input.artifactId, patchRunId: input.patchRunId, commitSha: input.commitSha, deploymentId: input.deploymentId, verificationId: input.verificationId, outcomeId: null },
    recordedAt: input.nowIso,
  };
}
