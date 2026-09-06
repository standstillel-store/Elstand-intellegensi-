// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Replay repository (Phase 8.3.7)
//
// Read-only orchestration only — no domain logic lives here (that's
// entirely in build.ts's pure `buildCognitiveReplay()`). Reuses existing
// read paths verbatim, zero duplication:
//   - `getCognitiveTraceById()` / `listCognitiveTracesBySymbol()` (Phase
//     8.3.2, lib/ai/cognitiveTrace/repository.ts) for the trace itself.
//   - `getDecisionExperienceForEvaluation()` (Phase 8.1.1,
//     lib/ai/decisionEvaluation/repository.ts) for the OUTCOME join.
//   - `getDecisionEvaluationBySignalId()` (Phase 8.3.7 addition to that
//     same file) for the LEARNING join.
//
// Every function degrades gracefully — never throws — same convention as
// every repository.ts in this tree.
// ---------------------------------------------------------------------------

import { getCognitiveTraceById, listCognitiveTracesBySymbol } from "@/lib/ai/cognitiveTrace/repository";
import { getDecisionExperienceForEvaluation, getDecisionEvaluationBySignalId } from "@/lib/ai/decisionEvaluation/repository";
import { getLearningSupabase } from "@/lib/ai/learning/db";
import { buildCognitiveReplay } from "./build";
import type { CognitiveReplayResult, ReplayableCycleSummary } from "./contracts";

/**
 * Replays one cycle in full, joining OUTCOME/LEARNING at read time when the
 * cycle executed a paper trade. Returns `null` only when no `cognitive_trace`
 * row matches `traceId` — every other honest gap is represented inside the
 * returned `CognitiveReplayResult` (see build.ts / contracts.ts), never by
 * returning `null` for a partially-available cycle.
 */
export async function replayCognitiveCycle(traceId: string): Promise<CognitiveReplayResult | null> {
  const trace = await getCognitiveTraceById(traceId);
  if (!trace) return null;

  const learningDbConfigured = getLearningSupabase() !== null;
  const paperTradeId = trace.execution?.paperTradeId ?? null;
  const wasExecuted = trace.execution?.outcome === "EXECUTED" && paperTradeId !== null;

  if (!wasExecuted || !learningDbConfigured) {
    return buildCognitiveReplay({ trace, learningDbConfigured });
  }

  const [experience, evaluation] = await Promise.all([getDecisionExperienceForEvaluation(paperTradeId), getDecisionEvaluationBySignalId(paperTradeId)]);

  return buildCognitiveReplay({ trace, experience, evaluation, learningDbConfigured });
}

/**
 * Read-only listing of replayable cycles for a symbol, most recent first —
 * a cheap index over `listCognitiveTracesBySymbol()` (never joins
 * OUTCOME/LEARNING for every row; call `replayCognitiveCycle(traceId)` on
 * a chosen entry for the full reconstruction). Never throws; returns an
 * empty array when the Learning DB is unconfigured or no trace rows exist.
 */
export async function listReplayableCycles(symbol: string, limit = 50): Promise<readonly ReplayableCycleSummary[]> {
  const traces = await listCognitiveTracesBySymbol(symbol, limit);
  return traces.map((t) => ({
    traceId: t.id,
    symbol: t.symbol,
    cycleAt: t.cycleAt,
    reachedDecision: t.decision !== null,
    hasPaperTrade: t.execution?.outcome === "EXECUTED" && t.execution.paperTradeId !== null,
  }));
}
