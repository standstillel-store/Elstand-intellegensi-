// ---------------------------------------------------------------------------
// ELVOID Intelligence — Self Performance Monitor, persistence-aware read
// (Phase 8.6.1, Part 1+2)
//
// Persistence-aware adapter ONLY — zero aggregation logic lives here
// (that's entirely in aggregate.ts's pure computeEvaluationCoverage()/
// aggregatePerformance()). Reuses lib/ai/decisionMemory/repository.ts's
// existing getDecisionMemoryJoinedExperiences() as its sole data source —
// the SAME full-population `decision_experiences` x `decision_evaluations`
// join, by `source_signal_id`, decisionMemory itself already performs
// (see that file's own header for why that join has no SQL foreign key
// to rely on). Introduces NO new table, NO new query shape, and performs
// NO write/upsert/insert/update/delete of any kind, anywhere in this
// file.
//
// Not wired into decisionQualification, arbitration, execution, or risk
// — this module is read only by observability surfaces (the AI
// Performance API route), exactly like decisionMemory's own
// `queryDecisionMemory()` before Phase 8.2's qualification layer chose,
// separately, to also read it.
// ---------------------------------------------------------------------------

import { getDecisionMemoryJoinedExperiences } from "@/lib/ai/decisionMemory/repository";
import { computeEvaluationCoverage, aggregatePerformance } from "./aggregate";
import type { DecisionSource, SelfPerformanceReport } from "./contracts";

/**
 * Reads the current Learning DB population (via decisionMemory's
 * existing reader) and computes a coverage + performance report scoped
 * to exactly one (source, symbol) pair. Read-only, no caching — every
 * call re-reads the current population, matching queryDecisionMemory()'s
 * own "query-time, never materialized" convention.
 *
 * Returns `null` only when the Learning DB is not configured (never
 * falls back to Main Supabase — there is nothing to fall back to). A
 * configured-but-empty population resolves to a valid, zeroed
 * `SelfPerformanceReport` (status `INSUFFICIENT_DATA`), never `null` and
 * never thrown.
 */
export async function getSelfPerformanceReport(source: DecisionSource, symbol: string): Promise<SelfPerformanceReport | null> {
  const rows = await getDecisionMemoryJoinedExperiences();
  if (rows === null) return null;

  return {
    coverage: computeEvaluationCoverage(source, symbol, rows),
    performance: aggregatePerformance(source, symbol, rows),
  };
}
