// ---------------------------------------------------------------------------
// ELVOID Intelligence — Adaptive Constraint Engine (Phase 8.1.4)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - Adaptive Constraints OBSERVE validated historical learning
//     (`failure_pattern_candidates`, Phase 8.1.2) and MUST NOT mutate or
//     influence canonical intelligence in this phase. This module never
//     imports from, and never writes to, `OracleAssessment`, grading.ts,
//     any canonical `grade`/`confidence`/`score`/`riskStatus`/`entry`/
//     `stopLoss`/`takeProfit` field, execute.ts, paperTrader.ts,
//     `ai_signals`, or any decision-lifecycle/autonomous-execution path.
//   - An `AdaptiveConstraint` is ADVISORY METADATA ONLY, never behavior.
//     It carries a closed `constraintType` plus verbatim-copied pattern
//     statistics — nothing here computes a new number, adjusts an
//     existing one, or blocks anything.
//   - `source` and `evidenceTag` are inherited verbatim from the
//     originating `FailurePatternCandidate` — never re-derived, never
//     recomputed, never loosened. See lib/ai/failurePatterns/detect.ts
//     for the sole place `MIN_OCCURRENCE_COUNT`/temporal-spread/
//     confidence-cap qualification logic lives; this module never
//     reimplements or re-checks any of it.
//   - `basis` is a closed, numeric/timestamp-only record — verbatim
//     copies of `occurrenceCount`, `dominantClassShare`,
//     `statisticalConfidence` (== the source candidate's `confidence`
//     field, renamed here to avoid ever reading as a NEW confidence
//     score computed by this phase), `firstObservedAt`, and
//     `lastObservedAt`. No free-text/reason/explanation/narrative/
//     causal-claim field exists anywhere in this file's types, by
//     design — matching failurePatterns/contracts.ts's and
//     decisionMemory/contracts.ts's own "closed enums, counts,
//     timestamps only" convention.
//   - `constraintType` is a CLOSED, deliberately small v1 enum:
//     FLAG_HISTORICAL_UNRELIABILITY | INCREASE_CAUTION |
//     REQUIRE_STRONGER_CONFIRMATION. Explicitly excluded from v1 (do
//     not add): BLOCK_AUTONOMOUS_EXECUTION, any confidence-adjustment
//     value, any grade-adjustment value, any risk-adjustment value, and
//     any execution-blocking field/flag.
//   - Recency-window/duration semantics are explicitly OUT OF SCOPE for
//     8.1.4: this phase only carries `firstObservedAt`/`lastObservedAt`
//     forward from the validated basis, verbatim. Constraint expiry,
//     retirement, efficacy, and recency enforcement belong to a future,
//     separately-approved Phase 8.1.5 and are not modeled here.
//   - This phase GENERATES AND STORES advisory constraints only. It does
//     NOT apply them to future decisions — there is deliberately no
//     "consumer"/qualification-gate type anywhere in this file. A future
//     qualification consumer is a separately-approved phase, not started.
// ---------------------------------------------------------------------------

import type { FailurePatternCandidate, FailurePatternSource, FailurePatternEvidenceTag } from "@/lib/ai/failurePatterns/contracts";

// Re-exported so generate.ts/repository.ts (and fixtures) have a single
// import source for the shapes they consume — matching
// failurePatterns/contracts.ts's and decisionMemory/contracts.ts's own
// re-export convention. This module does not define its own competing
// source/evidence-tag types.
export type AdaptiveConstraintSource = FailurePatternSource;
export type AdaptiveConstraintEvidenceTag = FailurePatternEvidenceTag;

/**
 * Closed v1 constraint-type enum. Deliberately small and non-behavioral —
 * every member is a "flag this for a human/future consumer to weigh",
 * never an instruction that changes a number or blocks an action.
 *
 * Explicitly excluded from v1 (do not add without a separately-approved
 * phase): BLOCK_AUTONOMOUS_EXECUTION, any confidence/grade/risk
 * adjustment member, any execution-blocking member.
 */
export type AdaptiveConstraintType = "FLAG_HISTORICAL_UNRELIABILITY" | "INCREASE_CAUTION" | "REQUIRE_STRONGER_CONFIRMATION";

/**
 * Verbatim-copied pattern statistics from the originating
 * `FailurePatternCandidate` — nothing here is recomputed, rounded
 * differently, or reinterpreted. `statisticalConfidence` is intentionally
 * NOT named `confidence` on this type: the value is copied unchanged from
 * `FailurePatternCandidate.confidence`, but the rename makes it
 * unambiguous at every call site that this is inherited observational
 * confidence, never a new score this phase computes or a canonical
 * decision-confidence value.
 */
export interface AdaptiveConstraintBasis {
  readonly occurrenceCount: number;
  readonly dominantClassShare: number;
  readonly statisticalConfidence: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
}

/**
 * The pure generator's output shape — deliberately WITHOUT `generatedAt`.
 * `generate.ts` must remain a pure function of its input; a timestamp is
 * added only by the repository/persistence layer (see `AdaptiveConstraint`
 * below), exactly mirroring how `detect.ts` never generates `computedAt`
 * itself in Phase 8.1.2 and `evaluate.ts` never generates `evaluatedAt`
 * itself in Phase 8.1.1.
 */
export interface AdaptiveConstraintWithoutTimestamp {
  readonly version: 1;
  readonly source: AdaptiveConstraintSource;
  readonly evidenceTag: AdaptiveConstraintEvidenceTag;
  readonly constraintType: AdaptiveConstraintType;
  readonly basis: AdaptiveConstraintBasis;
}

/**
 * The full, persisted shape — generate.ts's pure output plus a
 * repository-stamped `generatedAt`. This is what
 * `recomputeAdaptiveConstraints()` writes and what `adaptive_constraints`
 * rows represent.
 *
 * Like `failure_pattern_candidates` (and unlike append-only
 * `decision_evaluations`), this is AGGREGATE STATE for its
 * `(source, evidenceTag)` group — recompute-and-upsert is the correct and
 * only persistence model; see repository.ts.
 */
export interface AdaptiveConstraint extends AdaptiveConstraintWithoutTimestamp {
  readonly generatedAt: string;
}

// Re-exported purely for generate.ts/repository.ts/fixture convenience —
// this module reads `FailurePatternCandidate` rows as its sole input type
// and never redeclares a competing shape for them.
export type { FailurePatternCandidate };
