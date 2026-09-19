// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Population Repository (Phase 8.6 P1)
//
// The only DB-touching function in this module. Read-only — calls
// `listRuntimeEvents()` (lib/ai/runtimeEvents/repository.ts, Phase 8.5,
// already read-only, already bounded) with a `DECISION`-component filter,
// then hands the result to observe.ts's pure `observeDecisionPopulation()`.
// Never writes, never triggers a cycle, never imported by anything on the
// production decision path — see contracts.ts's own header.
// ---------------------------------------------------------------------------

import { listRuntimeEvents } from "@/lib/ai/runtimeEvents/repository";
import { isLearningSupabaseConfigured } from "@/lib/ai/learning/db";
import { observeDecisionPopulation } from "./observe";
import type { DecisionSource, DecisionPopulationReport } from "./contracts";

const DEFAULT_LIMIT = 500; // = listRuntimeEvents' own MAX_LIMIT — a population report wants as much of the recent window as that function allows, unlike the terminal UI's smaller default.

export interface FetchDecisionPopulationReportOptions {
  /** ISO timestamp — passed straight through to `listRuntimeEvents`. Omit for "most recent `limit` DECISION rows". */
  readonly since?: string;
  /** Passed straight through to `listRuntimeEvents`; capped there at 500 regardless of what is passed here. */
  readonly limit?: number;
  /**
   * A caller-supplied `SelfPerformanceReport.coverage.evaluatedExperienceCount`
   * for the SAME (source, symbol) — copied verbatim into
   * `dataQuality.evaluatedExperienceCount`. Omit when the caller does not
   * already have one; this function never fetches it itself (see
   * `DecisionPopulationDataQuality`'s own doc comment for why).
   */
  readonly evaluatedExperienceCount?: number | null;
}

/**
 * Returns `[]`-safe: on a Learning DB that isn't configured,
 * `listRuntimeEvents()` itself already returns `[]` (never throws), and
 * `observeDecisionPopulation()` correctly reports `totalCycles: 0`,
 * `observationCoverage: "INSUFFICIENT_DATA"`, and
 * `dataQuality.learningDbConfigured: false` for that case — never a
 * thrown error, never a fabricated non-empty report.
 */
export async function fetchDecisionPopulationReport(source: DecisionSource, symbol: string, options: FetchDecisionPopulationReportOptions = {}): Promise<DecisionPopulationReport> {
  const events = await listRuntimeEvents({ symbol, since: options.since, limit: options.limit ?? DEFAULT_LIMIT, components: ["DECISION"] });
  return observeDecisionPopulation(source, symbol, events, isLearningSupabaseConfigured(), options.evaluatedExperienceCount ?? null);
}
