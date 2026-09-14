// ---------------------------------------------------------------------------
// ELVOID Intelligence — Self Performance Monitor, pure aggregation (Phase
// 8.6.1, Part 1+2+3)
//
// Pure, deterministic, synchronous functions only. Zero database/network/
// LLM/fetch calls, zero Date.now()/timestamp generation, zero randomness
// — mirrors lib/ai/failurePatterns/detect.ts's own discipline exactly.
// Both exported functions take an already-fetched
// `readonly DecisionMemoryJoinedRow[]` (from
// lib/ai/decisionMemory/repository.ts's getDecisionMemoryJoinedExperiences())
// and derive a result for exactly ONE (source, symbol) pair — never pools
// across sources or symbols, never re-derives decisionQuality/
// marketOutcome/evaluationClass/confidenceAlignment (those are read
// verbatim from each row's existing `evaluation`, exactly as
// decisionEvaluation/evaluate.ts already computed and persisted them).
//
// Deliberately does NOT compute a single "accuracy" or "performance
// score". decisionQuality and marketOutcome are two independent,
// structurally distinct axes (see decisionEvaluation/contracts.ts's own
// header): a GOOD decision can have a BAD outcome and vice versa, and
// folding both into one number would hide exactly the disagreement a
// reader most needs to see — the same reasoning that already keeps
// `evaluationClass` from collapsing into a win/loss boolean anywhere
// else in this pipeline. This module reports distributions only;
// interpreting them is left entirely to the reader.
// ---------------------------------------------------------------------------

import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";
import type {
  DecisionSource,
  EvaluationClass,
  DecisionQuality,
  MarketOutcome,
  ConfidenceAlignment,
  SelfPerformanceAggregate,
  EvaluationCoverageReport,
  EvaluationCoverageStatus,
} from "./contracts";

const EVALUATION_CLASSES: readonly EvaluationClass[] = [
  "GOOD_DECISION_GOOD_OUTCOME",
  "GOOD_DECISION_BAD_OUTCOME",
  "BAD_DECISION_GOOD_OUTCOME",
  "BAD_DECISION_BAD_OUTCOME",
  "NEUTRAL_OUTCOME",
  "INSUFFICIENT_EVIDENCE",
];
const DECISION_QUALITIES: readonly DecisionQuality[] = ["GOOD", "BAD", "UNKNOWN"];
const MARKET_OUTCOMES: readonly MarketOutcome[] = ["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"];
const CONFIDENCE_ALIGNMENTS: readonly ConfidenceAlignment[] = ["ALIGNED", "MISALIGNED", "UNKNOWN"];

/** Every member starts at exactly 0 — never omitted, so "not yet seen" and "zero occurrences" are never confused by an absent key. */
function zeroedCounts<T extends string>(members: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const member of members) counts[member] = 0;
  return counts;
}

function isInScope(row: DecisionMemoryJoinedRow, source: DecisionSource, symbol: string): boolean {
  return row.experience.source === source && row.experience.symbol === symbol;
}

/**
 * Coverage of `decision_evaluations` against closed `decision_experiences`
 * for one (source, symbol) pair. Pure count/ratio arithmetic only — never
 * triggers, requests, or simulates an evaluation. See Phase 8.5's existing
 * evaluationBacklog.ts (lib/ai/autonomousRuntime) for the only module that
 * actually closes this gap; this function only measures it.
 */
export function computeEvaluationCoverage(source: DecisionSource, symbol: string, rows: readonly DecisionMemoryJoinedRow[]): EvaluationCoverageReport {
  const scoped = rows.filter((row) => isInScope(row, source, symbol));
  const closed = scoped.filter((row) => row.experience.outcome !== null);
  const evaluated = closed.filter((row) => row.evaluation !== null);

  const closedExperienceCount = closed.length;
  const evaluatedExperienceCount = evaluated.length;
  const unevaluatedExperienceCount = closedExperienceCount - evaluatedExperienceCount;
  const coverageRatio = closedExperienceCount === 0 ? 0 : Math.round((evaluatedExperienceCount / closedExperienceCount) * 10000) / 10000;

  // INSUFFICIENT_DATA reuses MIN_OCCURRENCE_COUNT (failurePatterns' own
  // existing "enough occurrences to be more than incidental" bar) rather
  // than inventing a new threshold — see this file's header.
  const status: EvaluationCoverageStatus = closedExperienceCount < MIN_OCCURRENCE_COUNT ? "INSUFFICIENT_DATA" : coverageRatio === 1 ? "COMPLETE" : "PARTIAL";

  return { source, symbol, closedExperienceCount, evaluatedExperienceCount, unevaluatedExperienceCount, coverageRatio, status };
}

/**
 * Distribution of the 4 existing evaluation axes across evaluated
 * decisions for one (source, symbol) pair. Rows with no `evaluation` are
 * excluded from every count here (they are unevaluated, not
 * `INSUFFICIENT_EVIDENCE` — see `computeEvaluationCoverage` for tracking
 * that separately). Never mutates `rows` or anything nested inside it.
 */
export function aggregatePerformance(source: DecisionSource, symbol: string, rows: readonly DecisionMemoryJoinedRow[]): SelfPerformanceAggregate {
  const evaluatedRows = rows.filter((row) => isInScope(row, source, symbol) && row.evaluation !== null);

  const evaluationClassCounts = zeroedCounts(EVALUATION_CLASSES);
  const decisionQualityCounts = zeroedCounts(DECISION_QUALITIES);
  const marketOutcomeCounts = zeroedCounts(MARKET_OUTCOMES);
  const confidenceAlignmentCounts = zeroedCounts(CONFIDENCE_ALIGNMENTS);

  for (const row of evaluatedRows) {
    const evaluation = row.evaluation;
    if (!evaluation) continue; // unreachable given the filter above; narrows the type for strict null checks.
    evaluationClassCounts[evaluation.evaluationClass]++;
    decisionQualityCounts[evaluation.decisionQuality]++;
    marketOutcomeCounts[evaluation.marketOutcome]++;
    confidenceAlignmentCounts[evaluation.confidenceAlignment]++;
  }

  return {
    source,
    symbol,
    totalEvaluated: evaluatedRows.length,
    evaluationClassCounts,
    decisionQualityCounts,
    marketOutcomeCounts,
    confidenceAlignmentCounts,
  };
}
