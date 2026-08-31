// ---------------------------------------------------------------------------
// ELVOID Intelligence — Failure Pattern Detection (Phase 8.1.2)
//
// ARCHITECTURE / AUTHORITY:
//   - `decision_experiences` (Phase 8.1.0) + `decision_evaluations`
//     (Phase 8.1.1), joined by `source_signal_id`, remain the sole source
//     of historical decision/outcome/evaluation truth. Nothing here
//     duplicates or reinterprets those tables' fields — a
//     `FailurePatternCandidate` stores only a DERIVED, AGGREGATE
//     STATISTIC computed over many already-frozen `decision_evaluations`
//     rows. It is not a third source of decision/outcome truth.
//   - This module is OBSERVATIONAL / STATISTICAL ONLY. It never claims or
//     implies causation ("X caused Y") anywhere — there is deliberately
//     no free-text/narrative/explanation field anywhere in this file's
//     types, only closed enums, counts, shares, and timestamps. A
//     `FailurePatternCandidate` reports "this evidence tag recurred
//     alongside a negative outcome N times, across multiple calendar
//     days, for this source" — nothing about why.
//   - `source` (AI_SIGNAL vs ELVOID_PRO_ORACLE) is part of every
//     candidate's identity. The two sources are NEVER merged into the
//     same candidate/sample group — see detect.ts's grouping key.
//   - Grouping is single-tag only: `(source, evidenceTag)`. No
//     multi-tag/combinatorial grouping exists anywhere in this phase.
//   - NAMING: deliberately does NOT reuse `Pattern` / `PatternKind` /
//     `InsightPattern` — those names are already owned by
//     lib/ai/insights/types.ts for a fully unrelated concept (live
//     market-structure pattern detection over `OracleContext`/
//     `ConfluenceResult`, e.g. liquidity sweeps, order-block reactions).
//     Every exported type here is prefixed `FailurePattern*` to keep the
//     two concepts textually and semantically unambiguous.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { EvaluationEvidenceTag, EvaluationClass } from "@/lib/ai/decisionEvaluation/contracts";

// Re-exported so detect.ts/repository.ts (and fixtures) have a single
// import source for the shapes they consume — this module does not
// define its own competing source/evidence-tag/evaluation-class types,
// matching decisionEvaluation/contracts.ts's own re-export convention.
export type FailurePatternSource = DecisionSource;
export type FailurePatternEvidenceTag = EvaluationEvidenceTag;
export type FailurePatternEvaluationClass = EvaluationClass;

/**
 * One joined (decision_experiences x decision_evaluations) row, read by
 * repository.ts and fed into detect.ts's pure aggregation. `evidenceTags`
 * is the full `decision_evaluations.evidence` array for this decision —
 * detect.ts fans a multi-tag row out into one contribution PER TAG (never
 * per tag-combination — see detect.ts's single-tag-grouping rule).
 */
export interface FailurePatternObservationInput {
  readonly source: FailurePatternSource;
  readonly sourceSignalId: string;
  readonly evaluationClass: FailurePatternEvaluationClass;
  readonly evidenceTags: readonly FailurePatternEvidenceTag[];
  /**
   * = `decision_experiences.decision_timestamp` — the decision-TIME
   * timestamp, used for temporal-recurrence qualification and for
   * `firstObservedAt`/`lastObservedAt`. Deliberately never
   * `outcome_closed_at`/`evaluated_at`: a recurring failure pattern is
   * about when the DECISIONS were made, not when they later resolved or
   * were scored.
   */
  readonly decisionTimestamp: string;
}

/**
 * The pure detector's output shape — deliberately WITHOUT `computedAt`.
 * `detect.ts` must remain a pure function of its input; a timestamp is
 * added only by the repository/persistence layer (see `FailurePatternCandidate`
 * below), exactly mirroring how `evaluate.ts` never generates
 * `evaluatedAt` itself in Phase 8.1.1.
 */
export interface FailurePatternCandidateWithoutTimestamp {
  readonly version: 1;
  readonly source: FailurePatternSource;
  readonly evidenceTag: FailurePatternEvidenceTag;
  /**
   * The most frequent evaluation class among this group's qualifying
   * negative-outcome rows (ties broken by `NEGATIVE_EVALUATION_CLASSES`'
   * declaration order in detect.ts — deterministic, never random).
   */
  readonly dominantEvaluationClass: FailurePatternEvaluationClass;
  /**
   * Count of qualifying negative-outcome rows in this `(source,
   * evidenceTag)` group. Always >= `MIN_OCCURRENCE_COUNT` (5) — groups
   * below that threshold are excluded entirely by detect.ts, never
   * persisted as a low-confidence row.
   */
  readonly occurrenceCount: number;
  /**
   * `dominantEvaluationClass`'s own count divided by `occurrenceCount` —
   * a plain frequency share (0..1), never a probability estimate and
   * never a causal-strength score.
   */
  readonly dominantClassShare: number;
  /**
   * Scales linearly with `occurrenceCount` up to 30 samples, capped at
   * 0.7 — see detect.ts's `CONFIDENCE_SAMPLE_CAP`/`MAX_CONFIDENCE`. Never
   * reaches 1.0 by construction: this module's output is always
   * explicitly partial/observational, never asserted as certain.
   */
  readonly confidence: number;
  /** Earliest `decisionTimestamp` among this group's qualifying rows. */
  readonly firstObservedAt: string;
  /** Latest `decisionTimestamp` among this group's qualifying rows. */
  readonly lastObservedAt: string;
}

/**
 * The full, persisted shape — detect.ts's pure output plus a
 * repository-stamped `computedAt`. This is what `recomputeFailurePatterns()`
 * writes and what `failure_pattern_candidates` rows represent.
 *
 * Unlike `decision_evaluations` (Phase 8.1.1, append-only,
 * one-row-per-experience-forever), this is AGGREGATE STATE over the
 * entire historical population for its `(source, evidenceTag)` group —
 * recompute-and-upsert is the correct and only persistence model; see
 * repository.ts.
 */
export interface FailurePatternCandidate extends FailurePatternCandidateWithoutTimestamp {
  readonly computedAt: string;
}
