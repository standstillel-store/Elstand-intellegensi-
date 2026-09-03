// ---------------------------------------------------------------------------
// ELVOID Intelligence — Learning Validation (Phase 8.1.5)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This phase VALIDATES already-generated `AdaptiveConstraint` rows
//     (Phase 8.1.4) — it never generates a constraint, never mutates one,
//     and never influences canonical intelligence. This module never
//     imports from, and never writes to, `OracleAssessment`, grading.ts,
//     any canonical `grade`/`confidence`/`score`/`riskStatus`/`entry`/
//     `stopLoss`/`takeProfit` field, execute.ts, paperTrader.ts,
//     `ai_signals`, or any decision-lifecycle/autonomous-execution path.
//   - A `ConstraintValidation` is a TIMESTAMPED SNAPSHOT, never a
//     retroactive judgment applied to the source constraint. It carries
//     `source`/`evidenceTag`/`constraintType` verbatim from the
//     originating `AdaptiveConstraint` — never re-derived, never
//     recomputed. `validatedAt` is what makes it a snapshot: freshness
//     can decay between recomputes, so a stale validation is expected to
//     become inaccurate over time and is only trustworthy as of the
//     `validatedAt` it carries.
//   - Basis statistics (`occurrenceCount`, `dominantClassShare`,
//     `statisticalConfidence`, `firstObservedAt`, `lastObservedAt`) are
//     copied verbatim from the source `AdaptiveConstraint.basis` —
//     never recomputed from raw `decision_evaluations`/
//     `decision_experiences` rows. This module reads only already-
//     aggregated `AdaptiveConstraint` state.
//   - `status` is a CLOSED, fail-closed, priority-ordered enum:
//     `INCONSISTENT` | `STALE` | `OVERFIT_RISK` | `PROVISIONAL` |
//     `VALID`. Exactly one status per validation — see
//     `validate.ts::validateConstraint()` for the deterministic
//     selection order. `VALID` is only ever produced when every concern
//     clears; any single unresolved concern fails closed to a
//     non-`VALID` status, never defaults to `VALID`.
//   - `signals` is a closed, boolean-only record — no free-text/reason/
//     explanation/narrative/causal-claim field exists anywhere in this
//     file's types, by design — matching `adaptiveConstraint/contracts.ts`'s,
//     `failurePatterns/contracts.ts`'s, and `decisionMemory/contracts.ts`'s
//     own "closed enums, counts, booleans, timestamps only" convention.
//   - This phase is deliberately a CONSUMER-FREE validation layer: there
//     is no "qualification gate"/"apply constraint" type anywhere in this
//     file. A future consumer of validated constraints is a separately-
//     approved, not-started phase — this module only produces the
//     snapshot that such a future consumer would eventually read.
// ---------------------------------------------------------------------------

import type { AdaptiveConstraint, AdaptiveConstraintSource, AdaptiveConstraintEvidenceTag, AdaptiveConstraintType, AdaptiveConstraintBasis } from "@/lib/ai/adaptiveConstraint/contracts";

// Re-exported so validate.ts/repository.ts (and fixtures) have a single
// import source for the shapes they consume — matching
// adaptiveConstraint/contracts.ts's own re-export convention. This module
// does not define its own competing source/evidence-tag/constraint-type
// types.
export type ConstraintValidationSource = AdaptiveConstraintSource;
export type ConstraintValidationEvidenceTag = AdaptiveConstraintEvidenceTag;
export type ConstraintValidationConstraintType = AdaptiveConstraintType;

/**
 * Closed, fail-closed, priority-ordered v1 status enum. Exactly one member
 * is ever selected per validation — see `validate.ts` for the
 * deterministic priority order (first-match-wins, most-fundamental-concern
 * first). `VALID` sits last in priority and is only reached when every
 * other concern has already cleared; there is no code path that defaults
 * to `VALID` on an unhandled case.
 */
export type ConstraintValidationStatus = "INCONSISTENT" | "STALE" | "OVERFIT_RISK" | "PROVISIONAL" | "VALID";

/**
 * Closed, boolean-only signal record. Each field is one independently
 * computed concern; `status` is a deterministic function of this record
 * (see `validate.ts`), never an independent judgment call. No signal here
 * is a score/confidence/probability — every member is a plain boolean.
 */
export interface ConstraintValidationSignals {
  readonly sampleSizeAdequate: boolean;
  readonly withinFreshnessWindow: boolean;
  readonly structurallyConsistent: boolean;
  readonly overfitRiskFlag: boolean;
}

/**
 * The pure validator's output shape — deliberately WITHOUT `validatedAt`.
 * `validate.ts` must remain a pure function of its two inputs
 * (`constraint`, `asOf`); a persisted-row timestamp is added only by the
 * repository/persistence layer (see `ConstraintValidation` below), exactly
 * mirroring how `generate.ts` never generates `generatedAt` itself in
 * Phase 8.1.4.
 */
export interface ConstraintValidationWithoutTimestamp {
  readonly version: 1;
  readonly source: ConstraintValidationSource;
  /** Phase 8.3.0.1 §7 — inherited verbatim from the originating AdaptiveConstraint.symbol. */
  readonly symbol: string;
  readonly evidenceTag: ConstraintValidationEvidenceTag;
  readonly constraintType: ConstraintValidationConstraintType;
  readonly status: ConstraintValidationStatus;
  readonly signals: ConstraintValidationSignals;

  // Verbatim copy of the originating AdaptiveConstraint's basis — never
  // recomputed here. Carried forward so a future reader of
  // `constraint_validations` never needs a second join back to
  // `adaptive_constraints` just to see the numbers a given status was
  // computed from.
  readonly basis: AdaptiveConstraintBasis;
}

/**
 * The full, persisted shape — validate.ts's pure output plus a
 * repository-stamped `validatedAt`. This is what
 * `recomputeConstraintValidations()` writes and what
 * `constraint_validations` rows represent.
 *
 * Like `adaptive_constraints` (and unlike append-only
 * `decision_evaluations`), this is AGGREGATE STATE for its
 * `(source, symbol, evidenceTag)` group — recompute-and-upsert is the correct and
 * only persistence model; see repository.ts. `validatedAt` is the "as of"
 * marker for the snapshot: because freshness/overfit signals can shift as
 * new evaluations accumulate upstream, a validation is only ever
 * trustworthy as of this timestamp, never assumed to still hold later.
 */
export interface ConstraintValidation extends ConstraintValidationWithoutTimestamp {
  readonly validatedAt: string;
}

// Re-exported purely for validate.ts/repository.ts/fixture convenience —
// this module reads `AdaptiveConstraint` rows as its sole input type and
// never redeclares a competing shape for them.
export type { AdaptiveConstraint, AdaptiveConstraintBasis };
