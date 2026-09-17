// ---------------------------------------------------------------------------
// ELVOID Intelligence — Replay Engine, pure comparison (Phase 8.6.5 B3)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. Takes an already-fetched
// `DecisionMemoryJoinedRow[]` (the SAME population selfPerformance/
// cognitiveGap already read) and produces a `ReplayComparison` for one
// (source, symbol, gapCategory) triple.
//
// METHODOLOGY (read before changing anything here): there is no
// executable "candidate" to run — see contracts.ts's header for the full
// forensic-audit finding. This function instead splits the scoped
// historical population into two temporal halves by
// `experience.decisionTimestamp` (older half = BASELINE, newer half =
// CANDIDATE) and runs the SAME already-existing pure functions
// (`computeEvaluationCoverage`, `aggregatePerformance`,
// `detectCognitiveGaps`) on each half independently — a split-sample
// replication check, not a counterfactual re-execution. It answers "does
// this gap's evidence still hold up in the more recent half of what
// actually happened", never "what would have happened if the code were
// different".
//
// PATTERN_GAP WITHIN A SLICE — deliberately narrower than
// cognitiveGap/detect.ts's own full definition: `matchedPatternCount` and
// `constraintValidations` are ALWAYS passed as `0`/`[]` to
// `detectCognitiveGaps` here, never the real (all-time) values. Those two
// signals come from `failure_pattern_candidates`/`constraint_validations`
// — already-aggregated, ALL-TIME statistics with no per-window
// granularity available anywhere in this repository. Mixing a whole-
// history aggregate into one half of a split-sample comparison would
// contaminate exactly the number meant to isolate a time-windowed signal
// — precisely the kind of manufactured-looking metric this phase's brief
// forbids. Within a replay slice, PATTERN_GAP is judged on repeated
// negative evaluation classes ALONE, honestly narrowed and documented
// rather than silently approximated.
// ---------------------------------------------------------------------------

import { computeEvaluationCoverage, aggregatePerformance } from "@/lib/ai/selfPerformance/aggregate";
import { detectCognitiveGaps } from "@/lib/ai/cognitiveGap/detect";
import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionSource, GapCategory, ReplaySlice, ReplayComparison } from "./contracts";

function isInScope(row: DecisionMemoryJoinedRow, source: DecisionSource, symbol: string): boolean {
  return row.experience.source === source && row.experience.symbol === symbol;
}

function buildSlice(windowLabel: ReplaySlice["windowLabel"], source: DecisionSource, symbol: string, halfRows: readonly DecisionMemoryJoinedRow[], gapCategory: GapCategory): ReplaySlice {
  const coverage = computeEvaluationCoverage(source, symbol, halfRows);
  const performance = aggregatePerformance(source, symbol, halfRows);
  const gaps = detectCognitiveGaps({ source, symbol, rows: halfRows, matchedPatternCount: 0, constraintValidations: [] });

  const targetGap = gaps.find((g) => g.category === gapCategory);
  const targetGapOccurrenceCount = targetGap?.evidence.occurrenceCount ?? 0;
  const targetGapRate = performance.totalEvaluated === 0 ? 0 : targetGapOccurrenceCount / performance.totalEvaluated;
  const otherActiveGapCount = gaps.filter((g) => g.category !== gapCategory).length;

  const timestamps = halfRows.map((r) => r.experience.decisionTimestamp).sort();

  return {
    windowLabel,
    decisionTimestampFrom: timestamps[0] ?? null,
    decisionTimestampTo: timestamps[timestamps.length - 1] ?? null,
    coverage,
    performance,
    targetGapOccurrenceCount,
    targetGapRate,
    otherActiveGapCount,
  };
}

/**
 * Splits the scoped (source, symbol) population by `decisionTimestamp`
 * into two halves (older = BASELINE, newer = CANDIDATE) and compares
 * `gapCategory`'s evidence rate plus the count of OTHER active gap
 * categories across the split. `rows` is the full, unfiltered population
 * — this function scopes and sorts it itself, matching every prior
 * 8.1.x/8.6.x pure function's own convention.
 */
export function buildReplayComparison(source: DecisionSource, symbol: string, gapCategory: GapCategory, rows: readonly DecisionMemoryJoinedRow[]): ReplayComparison {
  const scoped = rows.filter((row) => isInScope(row, source, symbol));
  const sorted = [...scoped].sort((a, b) => (a.experience.decisionTimestamp < b.experience.decisionTimestamp ? -1 : a.experience.decisionTimestamp > b.experience.decisionTimestamp ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const newerHalf = sorted.slice(mid);

  const baseline = buildSlice("BASELINE", source, symbol, olderHalf, gapCategory);
  const candidate = buildSlice("CANDIDATE", source, symbol, newerHalf, gapCategory);

  return {
    baseline,
    candidate,
    targetGapRateDelta: candidate.targetGapRate - baseline.targetGapRate,
    otherActiveGapCountDelta: candidate.otherActiveGapCount - baseline.otherActiveGapCount,
  };
}
