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
//
// SAMPLE ACCOUNTING (Phase 8.6.5b): every slice reports exactly which of
// its scoped rows fed its metrics and which did not, and why — see
// `SampleAccounting` in contracts.ts. This adds numbers about rows that
// were ALREADY being counted or skipped; it changes none of the existing
// slice fields, none of the comparison deltas, and no sufficiency gate.
//
// DETERMINISM (Phase 8.6.6b): rows are ordered by `compareReplayRows` —
// decisionTimestamp, then sourceSignalId, then experience id — before the
// midpoint split. The database read that feeds this function has no ORDER
// BY, so before 8.6.6b two rows with the same timestamp could land in
// either half depending on the order the database happened to return them
// (probed: the same rows and timestamps gave VALID in one order and
// INCONCLUSIVE in the other). Now the same SET of rows always produces the
// byte-identical comparison, in any input order.
//
// RAW RATE (Phase 8.6.6b): `targetGapOccurrenceCount`/`targetGapRate` are
// the THRESHOLDED figures (0 whenever the count is below the detection
// threshold), kept unchanged. `targetRawOccurrenceCount`/`targetRawGapRate`
// are the same measurement before that threshold — the figures the
// validation gates use, so 5 -> 4 occurrences reads as a change of one
// row, not as 0.5 -> 0.0.
//
// REGRESSION IDENTITY (Phase 8.6.6b): each slice lists WHICH other gap
// categories were active; the comparison lists the newly active ones.
// ---------------------------------------------------------------------------

import { computeEvaluationCoverage, aggregatePerformance } from "@/lib/ai/selfPerformance/aggregate";
import { detectCognitiveGaps, countRawGapOccurrences } from "@/lib/ai/cognitiveGap/detect";
import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import { SAMPLE_EXCLUSION_REASONS } from "./semantics";
import type { DecisionSource, GapCategory, ReplaySlice, ReplayComparison, SampleAccounting, SampleExclusionReason } from "./contracts";

function isInScope(row: DecisionMemoryJoinedRow, source: DecisionSource, symbol: string): boolean {
  return row.experience.source === source && row.experience.symbol === symbol;
}

/**
 * Every scoped row is either ELIGIBLE (carries a persisted evaluation —
 * exactly the set `aggregatePerformance()`/`detectCognitiveGaps()`
 * consume) or excluded for exactly one reason:
 *   - `OPEN_NO_OUTCOME`: no evaluation and no recorded outcome yet.
 *   - `CLOSED_UNEVALUATED`: an outcome exists but no evaluation does.
 * Pure; never mutates `halfRows`.
 */
export function buildSampleAccounting(halfRows: readonly DecisionMemoryJoinedRow[]): SampleAccounting {
  const counts: Record<SampleExclusionReason, number> = { OPEN_NO_OUTCOME: 0, CLOSED_UNEVALUATED: 0 };
  let eligible = 0;
  for (const row of halfRows) {
    if (row.evaluation !== null) eligible++;
    else if (row.experience.outcome === null) counts.OPEN_NO_OUTCOME++;
    else counts.CLOSED_UNEVALUATED++;
  }
  return {
    scopedTotal: halfRows.length,
    eligible,
    excluded: halfRows.length - eligible,
    exclusionReasons: SAMPLE_EXCLUSION_REASONS.map((reason) => ({ reason, count: counts[reason] })),
  };
}

/**
 * Normalizes a replay read back from a jsonb column. A slice persisted
 * before 8.6.5b has no `sampleAccounting`; it is reported as `null` (not
 * recorded) — never reconstructed from `coverage`, which cannot tell open
 * rows from closed-unevaluated ones for the whole scoped slice.
 */
export function normalizePersistedReplay(raw: ReplayComparison | null): ReplayComparison | null {
  if (raw === null || raw === undefined) return null;
  const normalizeSlice = (slice: ReplaySlice): ReplaySlice => ({
    ...slice,
    sampleAccounting: slice.sampleAccounting ?? null,
    targetRawOccurrenceCount: slice.targetRawOccurrenceCount ?? null,
    targetRawGapRate: slice.targetRawGapRate ?? null,
    otherActiveGapCategories: slice.otherActiveGapCategories ?? null,
  });
  return {
    ...raw,
    baseline: normalizeSlice(raw.baseline),
    candidate: normalizeSlice(raw.candidate),
    newlyActiveGapCategories: raw.newlyActiveGapCategories ?? null,
  };
}

/**
 * Total, deterministic row order: decisionTimestamp, then sourceSignalId,
 * then experience id (string comparison, ascending). Pure.
 */
export function compareReplayRows(a: DecisionMemoryJoinedRow, b: DecisionMemoryJoinedRow): number {
  const keys: readonly (readonly [string, string])[] = [
    [a.experience.decisionTimestamp, b.experience.decisionTimestamp],
    [a.experience.sourceSignalId, b.experience.sourceSignalId],
    [a.experience.id, b.experience.id],
  ];
  for (const [left, right] of keys) {
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

function buildSlice(windowLabel: ReplaySlice["windowLabel"], source: DecisionSource, symbol: string, halfRows: readonly DecisionMemoryJoinedRow[], gapCategory: GapCategory): ReplaySlice {
  const coverage = computeEvaluationCoverage(source, symbol, halfRows);
  const performance = aggregatePerformance(source, symbol, halfRows);
  const gaps = detectCognitiveGaps({ source, symbol, rows: halfRows, matchedPatternCount: 0, constraintValidations: [] });

  const targetGap = gaps.find((g) => g.category === gapCategory);
  const targetGapOccurrenceCount = targetGap?.evidence.occurrenceCount ?? 0;
  const targetGapRate = performance.totalEvaluated === 0 ? 0 : targetGapOccurrenceCount / performance.totalEvaluated;
  const otherActiveGapCategories = gaps
    .filter((g) => g.category !== gapCategory)
    .map((g) => g.category)
    .sort();
  const otherActiveGapCount = otherActiveGapCategories.length;

  const evaluations: readonly DecisionEvaluation[] = halfRows.filter((r) => r.evaluation !== null).map((r) => r.evaluation as DecisionEvaluation);
  const targetRawOccurrenceCount = countRawGapOccurrences(evaluations, gapCategory);
  const targetRawGapRate = targetRawOccurrenceCount === null ? null : performance.totalEvaluated === 0 ? 0 : targetRawOccurrenceCount / performance.totalEvaluated;

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
    sampleAccounting: buildSampleAccounting(halfRows),
    targetRawOccurrenceCount,
    targetRawGapRate,
    otherActiveGapCategories,
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
  const sorted = [...scoped].sort(compareReplayRows);
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const newerHalf = sorted.slice(mid);

  const baseline = buildSlice("BASELINE", source, symbol, olderHalf, gapCategory);
  const candidate = buildSlice("CANDIDATE", source, symbol, newerHalf, gapCategory);

  const baselineOthers = baseline.otherActiveGapCategories ?? [];
  const newlyActiveGapCategories = (candidate.otherActiveGapCategories ?? []).filter((category) => !baselineOthers.includes(category)).sort();

  return {
    baseline,
    candidate,
    targetGapRateDelta: candidate.targetGapRate - baseline.targetGapRate,
    otherActiveGapCountDelta: candidate.otherActiveGapCount - baseline.otherActiveGapCount,
    newlyActiveGapCategories,
  };
}
