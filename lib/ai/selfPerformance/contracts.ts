// ---------------------------------------------------------------------------
// ELVOID Intelligence — Self Performance Monitor (Phase 8.6.1, Part 1+2+3)
//
// ARCHITECTURE / AUTHORITY:
//   - Read-only, observational aggregation over `decision_experiences` +
//     `decision_evaluations` (ELVOID Learning Database, Phase 8.1.0/8.1.1).
//     This module computes NOTHING that decisionEvaluation/evaluate.ts
//     doesn't already compute per-decision — it only counts existing,
//     already-persisted `evaluationClass`/`decisionQuality`/`marketOutcome`/
//     `confidenceAlignment` values across a population. It never
//     re-evaluates a single decision and never derives a new axis.
//   - `decisionQuality` and `marketOutcome` remain independent dimensions
//     here exactly as decisionEvaluation/contracts.ts defines them — this
//     module reports their DISTRIBUTIONS, never collapses them into one
//     derived "accuracy"/"win rate" figure. See aggregate.ts's own header
//     for why no single score is computed.
//   - Source isolation and symbol isolation (established by every prior
//     8.1.x/8.3.x module) apply here identically: every aggregate and
//     every coverage report is scoped to exactly one (source, symbol)
//     pair, never pooled across sources or symbols.
//   - Reuses lib/ai/decisionMemory/repository.ts's existing
//     getDecisionMemoryJoinedExperiences() as its sole data source (the
//     same full-population decision_experiences x decision_evaluations
//     join, by source_signal_id, decisionMemory itself already performs)
//     — this module adds no new database query shape, matching
//     lib/ai/causalGraph/repository.ts's own precedent of reusing that
//     same function rather than re-deriving the join.
//   - Observational only: nothing in this module is read by
//     decisionQualification, arbitration, execution, or risk. See
//     repository.ts's own header.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionQuality, MarketOutcome, EvaluationClass, ConfidenceAlignment } from "@/lib/ai/decisionEvaluation/contracts";

// Re-exported so aggregate.ts/repository.ts (and fixtures) have a single
// import source for the shapes they consume — matches
// decisionMemory/contracts.ts's own re-export convention.
export type { DecisionSource, DecisionQuality, MarketOutcome, EvaluationClass, ConfidenceAlignment };

/**
 * Distribution of `decision_evaluations.evaluation_class` values across
 * the scoped population. Every one of the 6 closed `EvaluationClass`
 * members is always present as a key, even at 0 — never omitted, so a
 * caller can never mistake "not counted" for "zero occurrences".
 */
export type EvaluationClassCounts = Readonly<Record<EvaluationClass, number>>;
export type DecisionQualityCounts = Readonly<Record<DecisionQuality, number>>;
export type MarketOutcomeCounts = Readonly<Record<MarketOutcome, number>>;
export type ConfidenceAlignmentCounts = Readonly<Record<ConfidenceAlignment, number>>;

/**
 * Observational-only aggregate for one (source, symbol) pair. Deliberately
 * has no single top-line "score" or "accuracy" field — see aggregate.ts's
 * header for why a single number would misrepresent two independent axes
 * (decisionQuality, marketOutcome) as one. Never called "accuracy"
 * anywhere in this module, per Phase 8.6.1's own instruction: this is a
 * distribution report, not an accuracy metric.
 */
export interface SelfPerformanceAggregate {
  readonly source: DecisionSource;
  readonly symbol: string;
  /**
   * Count of `decision_evaluations` rows contributing to the counts
   * below — i.e. evaluated decisions only, never unevaluated closed
   * experiences (see `EvaluationCoverageReport` for those).
   */
  readonly totalEvaluated: number;
  readonly evaluationClassCounts: EvaluationClassCounts;
  readonly decisionQualityCounts: DecisionQualityCounts;
  readonly marketOutcomeCounts: MarketOutcomeCounts;
  /**
   * Distribution of the existing per-decision `confidenceAlignment`
   * field only. This is NOT population-level confidence calibration
   * (a reliability curve / Brier score) — no such metric is computed
   * anywhere in this module. See classify.ts-equivalent discipline in
   * noveltyDetection: do not claim more than the existing field
   * supports.
   */
  readonly confidenceAlignmentCounts: ConfidenceAlignmentCounts;
}

/**
 * Whether `decision_evaluations` coverage for this (source, symbol) pair
 * is complete enough to treat `SelfPerformanceAggregate` above as
 * trustworthy.
 *   - INSUFFICIENT_DATA: fewer than `MIN_OCCURRENCE_COUNT` (reused from
 *     lib/ai/failurePatterns/detect.ts — the repository's own existing
 *     bar for "enough occurrences to be more than incidental", not a
 *     new invented threshold) closed `decision_experiences` exist at
 *     all, regardless of how many of those were evaluated.
 *   - PARTIAL: at least `MIN_OCCURRENCE_COUNT` closed experiences exist,
 *     but one or more of them has no `decision_evaluations` row yet.
 *   - COMPLETE: every closed experience in scope has a corresponding
 *     evaluation.
 */
export type EvaluationCoverageStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_DATA";

/**
 * closedExperienceCount = decision_experiences rows in scope with a
 * non-null outcome (i.e. the trade closed, whether or not it was ever
 * evaluated). evaluatedExperienceCount = the subset of those that also
 * have a decision_evaluations row. This function never backfills or
 * triggers evaluation — see repository.ts's header and Phase 8.5's
 * existing evaluationBacklog.ts for the only place that does that.
 */
export interface EvaluationCoverageReport {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly closedExperienceCount: number;
  readonly evaluatedExperienceCount: number;
  readonly unevaluatedExperienceCount: number;
  /** evaluatedExperienceCount / closedExperienceCount, rounded to 4dp. 0 when closedExperienceCount is 0 — never NaN, never silently 1. */
  readonly coverageRatio: number;
  readonly status: EvaluationCoverageStatus;
}

/**
 * The combined report one (source, symbol) query returns. `coverage` is
 * listed first deliberately: a caller should check it before treating
 * `performance` as representative — an INSUFFICIENT_DATA or PARTIAL
 * coverage status means `performance` is computed from a smaller or
 * incomplete slice of what has actually closed.
 */
export interface SelfPerformanceReport {
  readonly coverage: EvaluationCoverageReport;
  readonly performance: SelfPerformanceAggregate;
}
