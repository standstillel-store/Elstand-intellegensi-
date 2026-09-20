// ---------------------------------------------------------------------------
// ELVOID Intelligence — Validation gates (Phase 8.6.6b)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// timestamp generation, zero randomness.
//
// WHAT THESE ARE: ENGINEERING VALIDATION GATES for an observational
// split-history replay. They are fixed, stated thresholds that a replay must
// clear before `VALID` may be reported.
//
// WHAT THESE ARE NOT: statistical significance, a confidence interval, a
// power calculation, or evidence that a proposed change caused anything.
// Meeting every gate means exactly one thing — "every gate was met on the
// observational evidence available". It does NOT mean the proposed change is
// demonstrated, that profit rose, that a counterfactual was shown, that
// anything is safe for production, or that anything may be promoted.
//
// GATES (all must pass for VALID; fixed order):
//   1. MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS — at least 20 eligible (evaluated)
//      decisions in EACH window.
//   2. TARGET_RATE_DECREASED — the raw target gap rate must actually fall.
//   3. MIN_ABSOLUTE_REDUCTION — by at least 5 percentage points.
//   4. MIN_RELATIVE_REDUCTION — and by at least 20% of the older window's rate.
//   5. NO_NEWLY_ACTIVE_GAP_CATEGORIES — no other gap category became active.
//   6. REGRESSION_CHECK_EVALUATED — the regression axis was actually evaluated.
//   7. NO_DETECTED_REGRESSION — and it found none.
//
// The rate is the RAW target occurrence count over eligible decisions (before
// the gap-detection threshold — see evolutionCandidate/replay.ts), so a change
// of one occurrence never reads as a cliff.
//
// Comparisons use exact integer cross-multiplication, never floating-point
// division, so a value that sits exactly on a threshold (e.g. exactly 5
// percentage points) cannot flip because of rounding.
// ---------------------------------------------------------------------------

import type { ReplayComparison, ValidationGateName, ValidationGateOutcome, ValidationGateThresholds, RegressionCheck } from "./contracts";

export const VALIDATION_GATE_THRESHOLDS: ValidationGateThresholds = {
  minEligibleSamplesPerWindow: 20,
  minAbsoluteReductionPercentagePoints: 5,
  minRelativeReductionPercent: 20,
};

/** Fixed evaluation/reporting order. */
export const VALIDATION_GATE_ORDER: readonly ValidationGateName[] = [
  "MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS",
  "TARGET_RATE_DECREASED",
  "MIN_ABSOLUTE_REDUCTION",
  "MIN_RELATIVE_REDUCTION",
  "NO_NEWLY_ACTIVE_GAP_CATEGORIES",
  "REGRESSION_CHECK_EVALUATED",
  "NO_DETECTED_REGRESSION",
];

function percent(numerator: number, denominator: number): string {
  return denominator === 0 ? "n/a" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * Evaluates every gate against one replay. `regressionCheck` must be the one
 * built from the SAME replay. Returns all seven outcomes in
 * `VALIDATION_GATE_ORDER` — a failing gate never short-circuits the rest, so
 * a record always shows every gate's observed value.
 */
export function evaluateValidationGates(replay: ReplayComparison, regressionCheck: RegressionCheck, thresholds: ValidationGateThresholds = VALIDATION_GATE_THRESHOLDS): readonly ValidationGateOutcome[] {
  const baselineEligible = replay.baseline.performance.totalEvaluated;
  const candidateEligible = replay.candidate.performance.totalEvaluated;
  const baselineRaw = replay.baseline.targetRawOccurrenceCount;
  const candidateRaw = replay.candidate.targetRawOccurrenceCount;

  const measurable = baselineRaw != null && candidateRaw != null && baselineEligible > 0 && candidateEligible > 0;
  // rateBaseline = b / nb, rateCandidate = c / nc.  reduction numerator over (nb*nc): b*nc - c*nb.
  const reductionNumerator = measurable ? baselineRaw * candidateEligible - candidateRaw * baselineEligible : 0;
  const crossDenominator = baselineEligible * candidateEligible;

  const rateObserved = measurable
    ? `baseline ${baselineRaw}/${baselineEligible} (${percent(baselineRaw, baselineEligible)}), candidate ${candidateRaw}/${candidateEligible} (${percent(candidateRaw, candidateEligible)})`
    : "raw target occurrence counts not available for one or both windows";

  const decreased = measurable && reductionNumerator > 0;
  const absoluteReductionPoints = measurable ? (reductionNumerator / crossDenominator) * 100 : 0;
  const absolutePassed = measurable && 100 * reductionNumerator >= thresholds.minAbsoluteReductionPercentagePoints * crossDenominator;
  // relative reduction = (b*nc - c*nb) / (b*nc); requires b > 0.
  const baselineTerm = measurable ? baselineRaw * candidateEligible : 0;
  const relativePassed = measurable && baselineTerm > 0 && 100 * reductionNumerator >= thresholds.minRelativeReductionPercent * baselineTerm;
  const relativeReductionPercent = measurable && baselineTerm > 0 ? (reductionNumerator / baselineTerm) * 100 : 0;

  const newly = replay.newlyActiveGapCategories;

  const outcomes: Record<ValidationGateName, ValidationGateOutcome> = {
    MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS: {
      gate: "MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS",
      passed: baselineEligible >= thresholds.minEligibleSamplesPerWindow && candidateEligible >= thresholds.minEligibleSamplesPerWindow,
      observed: `baseline window ${baselineEligible} eligible, candidate window ${candidateEligible} eligible, required at least ${thresholds.minEligibleSamplesPerWindow} in each.`,
    },
    TARGET_RATE_DECREASED: {
      gate: "TARGET_RATE_DECREASED",
      passed: decreased,
      observed: `${rateObserved}.`,
    },
    MIN_ABSOLUTE_REDUCTION: {
      gate: "MIN_ABSOLUTE_REDUCTION",
      passed: absolutePassed,
      observed: measurable ? `reduction of ${absoluteReductionPoints.toFixed(1)} percentage points, required at least ${thresholds.minAbsoluteReductionPercentagePoints}.` : `${rateObserved}.`,
    },
    MIN_RELATIVE_REDUCTION: {
      gate: "MIN_RELATIVE_REDUCTION",
      passed: relativePassed,
      observed:
        measurable && baselineTerm > 0
          ? `reduction of ${relativeReductionPercent.toFixed(1)}% of the older window's rate, required at least ${thresholds.minRelativeReductionPercent}%.`
          : measurable
            ? "the older window's raw rate is 0, so a relative reduction is not defined."
            : `${rateObserved}.`,
    },
    NO_NEWLY_ACTIVE_GAP_CATEGORIES: {
      gate: "NO_NEWLY_ACTIVE_GAP_CATEGORIES",
      passed: newly != null && newly.length === 0,
      observed: newly == null ? "newly active gap categories were not recorded." : newly.length === 0 ? "no other gap category became active in the newer window." : `newly active in the newer window: ${newly.join(", ")}.`,
    },
    REGRESSION_CHECK_EVALUATED: {
      gate: "REGRESSION_CHECK_EVALUATED",
      passed: regressionCheck.evaluated,
      observed: regressionCheck.evaluated ? "the regression axis was evaluated for this replay." : "the regression axis was not evaluated for this replay.",
    },
    NO_DETECTED_REGRESSION: {
      gate: "NO_DETECTED_REGRESSION",
      passed: regressionCheck.evaluated && !regressionCheck.regressionDetected,
      observed: !regressionCheck.evaluated ? "not evaluated." : regressionCheck.regressionDetected ? `regression detected (${regressionCheck.reasons.length} reason(s) recorded).` : "no regression detected.",
    },
  };

  return VALIDATION_GATE_ORDER.map((name) => outcomes[name]);
}

export function allGatesPassed(gates: readonly ValidationGateOutcome[]): boolean {
  return gates.length === VALIDATION_GATE_ORDER.length && gates.every((g) => g.passed);
}
