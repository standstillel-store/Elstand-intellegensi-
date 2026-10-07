// ---------------------------------------------------------------------------
// Evolution post-deploy loop — OUTCOME + LEARNING contracts.
//
// TYPES + SMALL PURE CONSTANTS ONLY.
//
// An OUTCOME answers one question: after this change was deployed AND
// verified live, did the gap it was meant to fix actually shrink? It is NOT
// "the deployment succeeded" — that is PRODUCTION_VERIFICATION's job and says
// nothing about whether the change helped.
//
// The measurement reuses the SAME primitives and the SAME gate thresholds
// validation used to decide the change was worth attempting
// (evolutionCandidate/replay.ts buildSlice, evolutionValidation/gates.ts
// evaluateValidationGates): decisions made BEFORE the verified deployment are
// the baseline window, decisions made AFTER are the post-deploy window. A
// change "worked" only if it clears the same bar a candidate had to clear:
// >= 20 eligible decisions per window, the raw target rate fell by >= 5
// percentage points and >= 20% relative, and no other gap category became
// active. Nothing here lowers or re-derives those thresholds.
//
// Observational, not causal — same honesty as validation: "the rate fell
// after the deploy" is reported, never "the deploy caused it".
// ---------------------------------------------------------------------------

import type { GapCategory, DecisionSource } from "@/lib/ai/evolutionCandidate/contracts";
import type { RegressionCheck, ValidationGateOutcome } from "@/lib/ai/evolutionValidation/contracts";

export type OutcomeStatus = "IMPROVED" | "NOT_IMPROVED" | "REGRESSED" | "INSUFFICIENT_EVIDENCE";

/** Terminal = a verdict was reached; INSUFFICIENT_EVIDENCE means "still waiting for enough post-deploy decisions". */
export function isTerminalOutcome(status: OutcomeStatus): boolean {
  return status !== "INSUFFICIENT_EVIDENCE";
}

export interface OutcomeWindow {
  readonly label: "BASELINE" | "POST_DEPLOY";
  readonly decisionTimestampFrom: string | null;
  readonly decisionTimestampTo: string | null;
  readonly eligibleCount: number;
  /** Raw target-gap occurrence count (before the detection threshold), null when the category has no raw count. */
  readonly targetOccurrenceCount: number | null;
  readonly targetRate: number | null;
  readonly otherActiveGapCategories: readonly GapCategory[];
}

export interface GapOutcomeEvaluation {
  readonly status: OutcomeStatus;
  /** Plain statement of what was measured, so a stored outcome is self-describing. */
  readonly metric: string;
  readonly baseline: OutcomeWindow;
  readonly post: OutcomeWindow;
  readonly gates: readonly ValidationGateOutcome[];
  readonly regressionCheck: RegressionCheck;
  readonly reasons: readonly string[];
}

export interface EvolutionOutcomeRecord extends GapOutcomeEvaluation {
  readonly outcomeId: string;
  readonly patchRunId: string;
  readonly verificationId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly deployedAt: string;
  readonly evaluationNo: number;
  readonly evaluatedAt: string;
}

export type LearningKind = "CHANGE_EFFECTIVE" | "CHANGE_INEFFECTIVE" | "CHANGE_HARMFUL" | "CHANGE_UNVERIFIED";

/**
 * What the evolution cycle should treat this gap as from now on. These are
 * OBSERVATIONS for the next cycle and for the human — none of them triggers
 * anything automatically (no auto-revert, no auto-proposal, no threshold
 * change).
 */
export type NextEvolutionState = "GAP_ADDRESSED_MONITOR" | "GAP_PERSISTS_REVISION_NEEDED" | "REGRESSION_REVIEW_REQUIRED" | "PRODUCTION_REVIEW_REQUIRED";

export interface EvolutionLineage {
  readonly proposalId: string;
  readonly candidateId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly patchRunId: string;
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly verificationId: string;
  readonly outcomeId: string | null;
}

export interface EvolutionLearningRecord {
  readonly learningId: string;
  readonly patchRunId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly derivedFrom: "OUTCOME" | "PRODUCTION_VERIFICATION";
  readonly outcomeId: string | null;
  readonly verificationId: string | null;
  readonly learningKind: LearningKind;
  readonly nextEvolutionState: NextEvolutionState;
  readonly summary: string;
  readonly lineage: EvolutionLineage;
  readonly recordedAt: string;
}

export function outcomeIdFor(patchRunId: string, evaluationNo: number): string {
  return `outcome:${patchRunId}:${evaluationNo}`;
}

export function learningIdFor(patchRunId: string): string {
  return `learning:${patchRunId}`;
}
