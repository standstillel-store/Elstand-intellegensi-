// ---------------------------------------------------------------------------
// Evolution post-deploy loop — OUTCOME evaluation (pure).
//
// Splits the (source, symbol) decision population at the moment the verified
// deployment became READY: decisions made BEFORE are the baseline, decisions
// made AT/AFTER are the post-deploy window. Both windows are built with
// evolutionCandidate/replay.ts's own buildSlice and judged by
// evolutionValidation/gates.ts's own evaluateValidationGates — the exact
// functions and thresholds validation used. No threshold is defined, copied
// or lowered here.
//
// FAIL-CLOSED: anything that makes the measurement unreliable (gap category
// not measurable by raw counts, a possibly-truncated population, an unusable
// deployment timestamp, too few eligible decisions in either window) is
// INSUFFICIENT_EVIDENCE — never IMPROVED. Only a measured, gate-clearing drop
// is IMPROVED. A newly active gap category is REGRESSED regardless of how the
// target rate moved, the same precedence validation applies.
//
// No I/O, no clock, no randomness.
// ---------------------------------------------------------------------------

import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";
import { buildSlice, compareReplayRows, isInScope } from "@/lib/ai/evolutionCandidate/replay";
import { isPopulationPossiblyTruncated, replayApplicabilityFor } from "@/lib/ai/evolutionCandidate/semantics";
import { evaluateValidationGates, VALIDATION_GATE_THRESHOLDS } from "@/lib/ai/evolutionValidation/gates";
import type { DecisionSource, GapCategory, ReplaySlice, ReplayComparison } from "@/lib/ai/evolutionCandidate/contracts";
import type { RegressionCheck } from "@/lib/ai/evolutionValidation/contracts";
import type { GapOutcomeEvaluation, OutcomeWindow } from "./contracts";

export interface EvaluateGapOutcomeInput {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  /** The full, unfiltered joined population (same input shape the validator's replay takes). */
  readonly rows: readonly DecisionMemoryJoinedRow[];
  /** ISO time the verified deployment became READY (Vercel's own `ready`). */
  readonly deployedAtIso: string | null;
}

const NOT_EVALUATED: RegressionCheck = { evaluated: false, regressionDetected: false, newlyActiveGapCategories: [], otherActiveGapCountDelta: 0, reasons: [] };

function toWindow(label: OutcomeWindow["label"], slice: ReplaySlice): OutcomeWindow {
  return {
    label,
    decisionTimestampFrom: slice.decisionTimestampFrom,
    decisionTimestampTo: slice.decisionTimestampTo,
    eligibleCount: slice.performance.totalEvaluated,
    targetOccurrenceCount: slice.targetRawOccurrenceCount ?? null,
    targetRate: slice.targetRawGapRate ?? null,
    otherActiveGapCategories: slice.otherActiveGapCategories ?? [],
  };
}

const EMPTY_WINDOW = (label: OutcomeWindow["label"]): OutcomeWindow => ({ label, decisionTimestampFrom: null, decisionTimestampTo: null, eligibleCount: 0, targetOccurrenceCount: null, targetRate: null, otherActiveGapCategories: [] });

function unmeasurable(gapCategory: GapCategory, reason: string): GapOutcomeEvaluation {
  return {
    status: "INSUFFICIENT_EVIDENCE",
    metric: `raw ${gapCategory} occurrence rate over eligible (evaluated) decisions, before vs after the verified deployment`,
    baseline: EMPTY_WINDOW("BASELINE"),
    post: EMPTY_WINDOW("POST_DEPLOY"),
    gates: [],
    regressionCheck: NOT_EVALUATED,
    reasons: [reason],
  };
}

export function evaluateGapOutcome(input: EvaluateGapOutcomeInput): GapOutcomeEvaluation {
  const { source, symbol, gapCategory, rows, deployedAtIso } = input;

  const applicability = replayApplicabilityFor(gapCategory);
  if (!applicability.applicable) return unmeasurable(gapCategory, `Outcome cannot be measured for ${gapCategory}: ${applicability.reason ?? "replay is not applicable to this gap category."}`);

  const deployedMs = deployedAtIso === null ? Number.NaN : Date.parse(deployedAtIso);
  if (!Number.isFinite(deployedMs)) return unmeasurable(gapCategory, "No usable deployment-ready timestamp: the pre/post split point is unknown, so nothing was split.");

  if (isPopulationPossiblyTruncated(rows.length)) return unmeasurable(gapCategory, `The decision population (${rows.length} rows) is at or above the truncation guard; a truncated read would silently corrupt both windows, so nothing was evaluated.`);

  const scoped = rows.filter((row) => isInScope(row, source, symbol)).sort(compareReplayRows);
  const before = scoped.filter((row) => Date.parse(row.experience.decisionTimestamp) < deployedMs);
  const after = scoped.filter((row) => Date.parse(row.experience.decisionTimestamp) >= deployedMs);

  const baselineSlice = buildSlice("BASELINE", source, symbol, before, gapCategory);
  const postSlice = buildSlice("CANDIDATE", source, symbol, after, gapCategory);

  const baselineOthers = baselineSlice.otherActiveGapCategories ?? [];
  const newlyActive = (postSlice.otherActiveGapCategories ?? []).filter((category) => !baselineOthers.includes(category)).sort();
  const comparison: ReplayComparison = {
    baseline: baselineSlice,
    candidate: postSlice,
    targetGapRateDelta: postSlice.targetGapRate - baselineSlice.targetGapRate,
    otherActiveGapCountDelta: postSlice.otherActiveGapCount - baselineSlice.otherActiveGapCount,
    newlyActiveGapCategories: newlyActive,
  };

  // Same rule validation applies: any extra active category, or any newly active one, is a regression.
  const regressionReasons: string[] = [];
  if (comparison.otherActiveGapCountDelta > 0) regressionReasons.push(`${comparison.otherActiveGapCountDelta} additional gap categor${comparison.otherActiveGapCountDelta === 1 ? "y" : "ies"} became active after the deployment that were not active before it.`);
  if (newlyActive.length > 0) regressionReasons.push(`Newly active gap categor${newlyActive.length === 1 ? "y" : "ies"} after the deployment: ${newlyActive.join(", ")}.`);
  const regressionCheck: RegressionCheck = { evaluated: true, regressionDetected: regressionReasons.length > 0, newlyActiveGapCategories: newlyActive, otherActiveGapCountDelta: comparison.otherActiveGapCountDelta, reasons: regressionReasons };

  const gates = evaluateValidationGates(comparison, regressionCheck);
  const baseline = toWindow("BASELINE", baselineSlice);
  const post = toWindow("POST_DEPLOY", postSlice);
  const minSamples = VALIDATION_GATE_THRESHOLDS.minEligibleSamplesPerWindow;
  const enough = baseline.eligibleCount >= minSamples && post.eligibleCount >= minSamples;

  const metric = `raw ${gapCategory} occurrence rate over eligible (evaluated) decisions, before vs after the verified deployment at ${deployedAtIso}`;
  const failedGates = gates.filter((g) => !g.passed).map((g) => g.gate);

  if (!enough) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      metric,
      baseline,
      post,
      gates,
      regressionCheck,
      reasons: [`Waiting for post-deploy decisions: ${baseline.eligibleCount} eligible before, ${post.eligibleCount} eligible after the deployment; at least ${minSamples} are required in each window before any verdict.`],
    };
  }
  if (regressionCheck.regressionDetected) {
    return { status: "REGRESSED", metric, baseline, post, gates, regressionCheck, reasons: regressionReasons };
  }
  if (failedGates.length === 0) {
    return { status: "IMPROVED", metric, baseline, post, gates, regressionCheck, reasons: [`Every validation gate was met on the post-deploy window (${gates.length} of ${gates.length}); the raw ${gapCategory} rate fell from ${baseline.targetOccurrenceCount}/${baseline.eligibleCount} to ${post.targetOccurrenceCount}/${post.eligibleCount}. Observational only — this does not establish that the change caused the drop.`] };
  }
  return { status: "NOT_IMPROVED", metric, baseline, post, gates, regressionCheck, reasons: [`Enough post-deploy decisions were observed, but gate(s) not met: ${failedGates.join(", ")}. The ${gapCategory} rate went from ${baseline.targetOccurrenceCount}/${baseline.eligibleCount} to ${post.targetOccurrenceCount}/${post.eligibleCount}.`] };
}
