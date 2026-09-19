// ---------------------------------------------------------------------------
// ELVOID Intelligence — Confluence Attribution Repository (Phase 8.6 P2)
//
// The only DB-touching function in this module. Read-only — calls
// `listCognitiveTracesBySymbol()` (lib/ai/cognitiveTrace/repository.ts,
// Phase 8.3.2, already read-only) then hands the result to derive.ts's
// pure `deriveConfluenceAttribution()`. Never writes (the one new write —
// `confluenceEvidence` — was added to the orchestrator's EXISTING
// `persistCognitiveTrace()` call, not to this module), never triggers a
// cycle, never imported by anything on the production decision path —
// see contracts.ts's own header.
// ---------------------------------------------------------------------------

import { listCognitiveTracesBySymbol } from "@/lib/ai/cognitiveTrace/repository";
import { isLearningSupabaseConfigured } from "@/lib/ai/learning/db";
import { deriveConfluenceAttribution } from "./derive";
import type { DecisionSource, ConfluenceAttributionReport } from "./contracts";

/**
 * `listCognitiveTracesBySymbol` has no `since` parameter today (Phase
 * 8.3.2) — `limit` is the only bound available. 200 is chosen to give a
 * meaningfully larger population sample than that function's own
 * UI-facing default (50), while staying well under a size that would
 * make a single read expensive; revisit if that function ever gains a
 * `since` parameter (P1's `listRuntimeEvents` did, for the same reason —
 * see that phase's own additive `components` filter).
 */
const DEFAULT_LIMIT = 200;

export interface FetchConfluenceAttributionReportOptions {
  /** Passed straight through to `listCognitiveTracesBySymbol`. */
  readonly limit?: number;
}

/**
 * Returns a valid, zero-filled report (never throws) when the Learning
 * DB is unconfigured or no rows are found — `listCognitiveTracesBySymbol()`
 * itself already returns `[]` in both cases, and
 * `deriveConfluenceAttribution()` correctly reports
 * `cyclesInScope: 0`/both statuses `NOT_RECORDED` for that input.
 */
export async function fetchConfluenceAttributionReport(source: DecisionSource, symbol: string, options: FetchConfluenceAttributionReportOptions = {}): Promise<ConfluenceAttributionReport> {
  const traces = await listCognitiveTracesBySymbol(symbol, options.limit ?? DEFAULT_LIMIT);
  return deriveConfluenceAttribution(source, symbol, traces, isLearningSupabaseConfigured());
}
