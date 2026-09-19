// ---------------------------------------------------------------------------
// ELVOID Intelligence — Reject-Dominance Gap Detector (Phase 8.6 P1)
//
// Deliberately a SEPARATE pure function from `detect.ts::detectCognitiveGaps()`,
// not a 7th branch added inside it. `detectCognitiveGaps()` and its input
// (`DecisionMemoryJoinedRow[]`, the EXECUTE/evaluated population) are
// completely unchanged by this file — this function takes a
// `DecisionPopulationReport` (lib/ai/decisionPopulation, the FULL
// EXECUTE+WAIT+REJECT population) instead, a genuinely different evidence
// source, so it is kept genuinely separate rather than forced into the
// existing function's shape. Its one output, when present, is surfaced on
// `CognitiveGapReport.populationGaps` (contracts.ts) — never appended to
// `gaps`, so `reasoningGap`/`evolutionNeed` (both existing, unchanged
// consumers of `gaps` specifically) are entirely unaffected by this file
// existing at all.
//
// Pure, deterministic, synchronous. Zero database/network/LLM/fetch
// calls, zero Date.now(), zero randomness.
// ---------------------------------------------------------------------------

import { MIN_OCCURRENCE_COUNT, CONFIDENCE_SAMPLE_CAP } from "@/lib/ai/failurePatterns/detect";
import type { DecisionPopulationReport } from "@/lib/ai/decisionPopulation/contracts";
import type { CognitiveGap, GapSeverity } from "./contracts";

/**
 * The plain-language definition of "REJECT dominates the population" —
 * REJECT strictly more common than EXECUTE+WAIT combined. Unlike P0's
 * `NEGATIVE_MEMORY_*` constants or `learningValidation`'s freshness/
 * sample-size constants, this is not a statistically-calibrated
 * parameter with an existing repository convention to cite — "more than
 * half" is definitionally what "dominant" means for a 3-way split, so no
 * external baseline is borrowed here the way P0 borrowed
 * `MIN_OCCURRENCE_COUNT`/`FRESHNESS_WINDOW_DAYS`.
 */
export const REJECT_DOMINANCE_SHARE_THRESHOLD = 0.5;

/**
 * PROVISIONAL CALIBRATION BASELINE — mirrors
 * `lib/ai/learningValidation/validate.ts::OVERFIT_DOMINANCE_SHARE_THRESHOLD`
 * (0.95), reused as a starting "overwhelming, not just majority" bar for
 * HIGH severity specifically, same reuse reasoning `lib/ai/decisionQualification/contracts.ts`'s
 * `NEGATIVE_MEMORY_DOMINANCE_SHARE_THRESHOLD` already documents for a
 * different signal. A distinct, locally-scoped constant — not an import
 * of either existing one — so all three can be recalibrated
 * independently.
 */
export const REJECT_DOMINANCE_HIGH_SEVERITY_SHARE = 0.95;

function severityFor(rejectCount: number, rejectShare: number): GapSeverity {
  if (rejectCount >= CONFIDENCE_SAMPLE_CAP || rejectShare >= REJECT_DOMINANCE_HIGH_SEVERITY_SHARE) return "HIGH";
  return "MEDIUM"; // the gate below never lets this function fire below REJECT_DOMINANCE_SHARE_THRESHOLD, so LOW is never returned here.
}

/**
 * Returns 0 or 1 `CognitiveGap` (category `REJECT_DOMINANCE_GAP`) for one
 * (source, symbol) pair's `DecisionPopulationReport`. Never fires on:
 *   - `observationCoverage === "INSUFFICIENT_DATA"` (fewer than
 *     `MIN_OCCURRENCE_COUNT` successfully-parsed cycles at all);
 *   - fewer than `MIN_OCCURRENCE_COUNT` REJECTs specifically (a handful
 *     of rejects in an otherwise-small population is not "dominance",
 *     matching every other gap category's own evidence-count floor);
 *   - a REJECT share at or below `REJECT_DOMINANCE_SHARE_THRESHOLD`.
 * `report === null` (no population data supplied) also returns `[]`.
 */
export function detectDecisionPopulationGap(report: DecisionPopulationReport | null): readonly CognitiveGap[] {
  if (report === null) return [];
  if (report.observationCoverage === "INSUFFICIENT_DATA") return [];

  const rejectCount = report.decisionCounts.REJECT;
  if (rejectCount < MIN_OCCURRENCE_COUNT) return [];

  const rejectShare = report.totalCycles > 0 ? rejectCount / report.totalCycles : 0;
  if (rejectShare <= REJECT_DOMINANCE_SHARE_THRESHOLD) return [];

  const learningMemoryCount = report.decisionPathAttribution.LEARNING_MEMORY_REJECTION;
  const marketContextCount = report.decisionPathAttribution.MARKET_CONTEXT_REJECTION;
  const unknownAttributionCount = report.decisionPathAttribution.UNKNOWN + report.decisionPathAttribution.OTHER_OBSERVABLE_PATH;

  const gap: CognitiveGap = {
    source: report.source,
    symbol: report.symbol,
    category: "REJECT_DOMINANCE_GAP",
    severity: severityFor(rejectCount, rejectShare),
    evidence: { occurrenceCount: rejectCount, evaluatedCount: report.totalCycles, triggeringTags: [] },
    reasons: [
      `${rejectCount} of ${report.totalCycles} observed cycles (${Math.round(rejectShare * 10000) / 100}%) resolved to REJECT, for a source/symbol population with ${report.observationCoverage} observation coverage.`,
      `Of those REJECTs: ${learningMemoryCount} attributed to LEARNING_MEMORY_REJECTION, ${marketContextCount} to MARKET_CONTEXT_REJECTION, ${unknownAttributionCount} not further attributable from persisted evidence.`,
    ],
  };

  return [gap];
}
