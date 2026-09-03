// ---------------------------------------------------------------------------
// ELVOID Intelligence — Learning Validation (Phase 8.1.5)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` — the "as of" instant is always the caller-
// supplied `asOf` parameter, never the wall clock read internally (see
// `validatedAt` — added by repository.ts, not here, mirroring how
// `generatedAt` is added by adaptiveConstraint/repository.ts, not
// generate.ts). Zero randomness. Zero imports from lib/ai/oracle/*,
// lib/ai/cognitive/*, lib/elvoid/*, or any trading-execution module — this
// file depends ONLY on the plain `AdaptiveConstraint` it's given (plus the
// closed-enum/basis types re-exported from contracts.ts).
//
// This module NEVER reimplements or imports `MIN_OCCURRENCE_COUNT`
// (lib/ai/failurePatterns/detect.ts), `HIGH_DOMINANCE_SHARE`, or
// `HIGH_OCCURRENCE_COUNT` (lib/ai/adaptiveConstraint/generate.ts) — every
// threshold below is a new, locally-scoped v1 validation tier, distinct in
// name and purpose from every upstream qualification/labeling threshold.
// `basis` fields are read straight off the `AdaptiveConstraint` it is
// given and never recomputed from raw `decision_evaluations`/
// `decision_experiences` rows — this module has no access to, and takes
// no dependency on, either of those tables.
// ---------------------------------------------------------------------------

import type { AdaptiveConstraint, AdaptiveConstraintBasis, ConstraintValidationSignals, ConstraintValidationStatus, ConstraintValidationWithoutTimestamp } from "./contracts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A validated group must carry at least this many `basis.occurrenceCount`
 * samples to be considered adequately sampled by THIS phase's (stricter,
 * post-hoc) standard. Deliberately distinct from, and higher than,
 * `lib/ai/failurePatterns/detect.ts`'s `MIN_OCCURRENCE_COUNT` (5) — that
 * threshold already gated whether a candidate exists at all; this one
 * gates whether an already-existing constraint's sample size is adequate
 * for ongoing trust, a strictly separate, later-stage concern.
 */
export const MIN_VALIDATION_SAMPLE_SIZE = 10;

/**
 * A constraint's `basis.lastObservedAt` must fall within this many days of
 * `asOf` to be considered fresh. Beyond this window, the underlying
 * pattern may no longer reflect current conditions — validation fails
 * closed to `STALE` rather than assuming continued relevance.
 */
export const FRESHNESS_WINDOW_DAYS = 30;

/**
 * Overfit-risk detection is a three-part, closed structural signature —
 * a small sample, concentrated almost entirely in one outcome class,
 * observed only within a narrow calendar span. Any one part alone is not
 * suspicious (a wide-span, small-but-representative sample is fine; a
 * large, ordinarily-dominant sample is fine); all three together are the
 * classic small-sample/short-window overfit signature this phase flags.
 */
export const OVERFIT_SAMPLE_SIZE_CEILING = 7;
export const OVERFIT_DOMINANCE_SHARE_THRESHOLD = 0.95;
export const OVERFIT_MAX_SPAN_DAYS = 3;

/**
 * Pure structural sanity check over `basis` plus the constraint's own
 * closed-enum fields. This is NOT a re-check of upstream qualification
 * logic (occurrence-count minimums, temporal-spread minimums) — those
 * already ran once in `lib/ai/failurePatterns/detect.ts`. This is a
 * narrower, purely-structural check: are the values internally coherent
 * at all (finite, in-range, correctly ordered, non-empty)? A constraint
 * that fails this check is not just "weak evidence" — it is malformed,
 * which is why `INCONSISTENT` outranks every other status.
 */
function isStructurallyConsistent(constraint: AdaptiveConstraint): boolean {
  const { basis } = constraint;

  if (constraint.version !== 1) return false;
  if (!constraint.source || !constraint.evidenceTag || !constraint.constraintType) return false;

  if (!Number.isFinite(basis.occurrenceCount) || basis.occurrenceCount <= 0) return false;
  if (!Number.isFinite(basis.dominantClassShare) || basis.dominantClassShare < 0 || basis.dominantClassShare > 1) return false;
  if (!Number.isFinite(basis.statisticalConfidence) || basis.statisticalConfidence < 0 || basis.statisticalConfidence > 1) return false;

  const firstMs = Date.parse(basis.firstObservedAt);
  const lastMs = Date.parse(basis.lastObservedAt);
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return false;
  if (firstMs > lastMs) return false;

  return true;
}

/**
 * Pure freshness check: is `basis.lastObservedAt` within
 * `FRESHNESS_WINDOW_DAYS` of the caller-supplied `asOf`? `asOf` earlier
 * than `lastObservedAt` (a caller validating "as of" a moment before the
 * pattern's own last observation) is treated as within-window — this
 * check only fails closed on the forward-staleness direction, never on a
 * caller-chosen historical `asOf`.
 *
 * Requires `basis.lastObservedAt`/`asOf` to already be well-formed — this
 * function is only ever called after `isStructurallyConsistent()` has
 * passed, so it never itself needs to guard against unparseable input.
 */
function isWithinFreshnessWindow(basis: AdaptiveConstraintBasis, asOf: string): boolean {
  const asOfMs = Date.parse(asOf);
  const lastObservedMs = Date.parse(basis.lastObservedAt);
  const ageMs = asOfMs - lastObservedMs;
  if (ageMs <= 0) return true;
  return ageMs <= FRESHNESS_WINDOW_DAYS * MS_PER_DAY;
}

/**
 * Pure overfit-risk check: a small sample (`occurrenceCount` at or below
 * `OVERFIT_SAMPLE_SIZE_CEILING`), concentrated almost entirely in one
 * class (`dominantClassShare` at or above
 * `OVERFIT_DOMINANCE_SHARE_THRESHOLD`), observed only within a narrow
 * calendar span (`lastObservedAt - firstObservedAt` at or below
 * `OVERFIT_MAX_SPAN_DAYS`). All three must hold for the flag to raise.
 */
function isOverfitRisk(basis: AdaptiveConstraintBasis): boolean {
  const spanMs = Date.parse(basis.lastObservedAt) - Date.parse(basis.firstObservedAt);
  const spanDays = spanMs / MS_PER_DAY;

  return basis.occurrenceCount <= OVERFIT_SAMPLE_SIZE_CEILING && basis.dominantClassShare >= OVERFIT_DOMINANCE_SHARE_THRESHOLD && spanDays <= OVERFIT_MAX_SPAN_DAYS;
}

/**
 * Deterministic, fail-closed status selection from the four independently
 * computed signals. Priority order (first match wins) — most-fundamental
 * concern first:
 *   1. `!structurallyConsistent` -> `INCONSISTENT` (the basis itself
 *      cannot be trusted; every other signal is moot).
 *   2. `!withinFreshnessWindow` -> `STALE` (structurally sound, but the
 *      evidence is too old to trust as current).
 *   3. `overfitRiskFlag` -> `OVERFIT_RISK` (structurally sound and fresh,
 *      but the small-sample/narrow-span/high-concentration signature
 *      suggests the pattern may not generalize).
 *   4. `!sampleSizeAdequate` -> `PROVISIONAL` (no structural, staleness,
 *      or overfit concern, but the sample is not yet large enough for
 *      full confidence).
 *   5. Otherwise -> `VALID` (every concern cleared).
 * Exactly one status is ever returned; there is no fallthrough case that
 * silently defaults to `VALID`.
 */
function selectStatus(signals: ConstraintValidationSignals): ConstraintValidationStatus {
  if (!signals.structurallyConsistent) return "INCONSISTENT";
  if (!signals.withinFreshnessWindow) return "STALE";
  if (signals.overfitRiskFlag) return "OVERFIT_RISK";
  if (!signals.sampleSizeAdequate) return "PROVISIONAL";
  return "VALID";
}

/**
 * Pure, deterministic, synchronous. The same `(constraint, asOf)` pair
 * always produces byte-identical output. Never mutates `constraint` or
 * anything nested inside it. Holds no state across calls.
 *
 * `source`/`symbol`/`evidenceTag`/`constraintType`/`basis` are carried forward
 * verbatim from `constraint` — never re-derived. `signals` are four
 * independently computed booleans; `status` is a deterministic function
 * of `signals` alone (see `selectStatus()`), fail-closed and
 * priority-ordered so that exactly one status is ever produced and
 * `VALID` is only ever reached when every concern has cleared.
 *
 * When `!isStructurallyConsistent(constraint)`, the freshness and overfit
 * checks are still computed (they are pure functions of already-present
 * fields and cannot themselves throw), but `status` resolves to
 * `INCONSISTENT` regardless of what they report — a malformed basis makes
 * every other signal unreliable to act on, per the priority order above.
 */
export function validateConstraint(constraint: AdaptiveConstraint, asOf: string): ConstraintValidationWithoutTimestamp {
  const structurallyConsistent = isStructurallyConsistent(constraint);
  const withinFreshnessWindow = structurallyConsistent ? isWithinFreshnessWindow(constraint.basis, asOf) : false;
  const overfitRiskFlag = structurallyConsistent ? isOverfitRisk(constraint.basis) : false;
  const sampleSizeAdequate = structurallyConsistent ? constraint.basis.occurrenceCount >= MIN_VALIDATION_SAMPLE_SIZE : false;

  const signals: ConstraintValidationSignals = {
    sampleSizeAdequate,
    withinFreshnessWindow,
    structurallyConsistent,
    overfitRiskFlag,
  };

  return {
    version: 1,
    source: constraint.source,
    symbol: constraint.symbol,
    evidenceTag: constraint.evidenceTag,
    constraintType: constraint.constraintType,
    status: selectStatus(signals),
    signals,
    basis: constraint.basis,
  };
}
