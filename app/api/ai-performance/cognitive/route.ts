import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { listAutonomousIntelligenceSnapshots } from "@/lib/ai/autonomousSnapshot/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { listCognitiveTracesBySymbol } from "@/lib/ai/cognitiveTrace/repository";
import { queryDecisionMemory } from "@/lib/ai/decisionMemory/repository";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import { getStatistics } from "@/lib/elvoid/paperTrader";
import { buildCognitiveMap } from "@/lib/ai/cognitiveMap/build";
import { deriveAxisConflictReport } from "@/lib/ai/cognitiveConflict/axisAnalysis";
import { buildLearningLoopChains } from "@/lib/ai/learningLoop/traceChain";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/cognitive
//
// Phase 8.3.1-B/D — READ-ONLY runtime telemetry for the ELVOID Cognitive
// Visualization (AI Performance page). This route calls NOTHING that
// triggers a fresh Oracle cycle, a paper trade, or a learning recompute —
// it only reads tables that other, already-scheduled processes already
// wrote to (`autonomous_intelligence_snapshot` via the autonomous runtime,
// `constraint_validations` via the learning validation job, `ai_statistics`
// via the paper trader). A page load here can never itself cause a trade,
// matching the same guarantee documented on
// app/api/elvoid-pro/autonomous/{snapshots,status}/route.ts.
//
// Phase 8.3.3 addition: also reads `cognitive_trace` (8.3.2, one row per
// symbol, most recent only) — purely for evidence-grounded dynamic edge
// classification in buildCognitiveMap().
//
// Phase 8.3.4/8.3.5/8.3.6 addition: also calls `queryDecisionMemory()`
// (8.1.3 — a real DB read, but the SAME read the autonomous runtime already
// performs live every cycle; calling it here does not trigger a cycle, an
// Oracle assessment, or a decision) per symbol, then composes three
// read-only, presentation-only views over already-fetched data:
// `memory` (feeds the new "memory" cognitiveMap node), `axisConflicts`
// (lib/ai/cognitiveConflict/axisAnalysis.ts), and `learningLoop`
// (lib/ai/learningLoop/traceChain.ts). None of the three compute a new
// score, trigger a cycle, or write anything.
//
// ELVOID PRO Oracle telemetry (snapshots + validations + memory + trace)
// is membership-gated, same as the existing autonomous routes — but paper
// trader statistics are NOT gated (see lib/elvoid/paperTrader.ts), so a
// non-member still sees an honest Execution/Learning picture instead of an
// empty page.
// ---------------------------------------------------------------------------

export async function GET() {
  const hasOracleMembership = await hasActiveMembership();

  const [snapshots, stats] = await Promise.all([hasOracleMembership ? listAutonomousIntelligenceSnapshots("ELVOID_PRO_ORACLE") : Promise.resolve([]), getStatistics()]);

  const symbols = Array.from(new Set(snapshots.map((s) => s.symbol)));
  const validationLists = hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map((symbol) => getConstraintValidations("ELVOID_PRO_ORACLE", symbol))) : [];
  const validations = validationLists.flatMap((list) => list ?? []);

  // Phase 8.3.3 — most-recent trace per symbol only (limit 1); the same
  // membership gate as snapshots/validations, since cognitive_trace is
  // ELVOID_PRO_ORACLE-only data (see lib/ai/cognitiveTrace/contracts.ts).
  const traceLists = hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map((symbol) => listCognitiveTracesBySymbol(symbol, 1))) : [];
  const traces = traceLists.flatMap((list) => list ?? []);
  const latestTraceBySymbol = new Map(symbols.map((symbol) => [symbol, traces.find((t) => t.symbol === symbol) ?? null]));

  // Phase 8.3.4 — one live queryDecisionMemory() per symbol, same call the
  // autonomous runtime already makes every cycle (Step 3). ELVOID_PRO_ORACLE
  // only, same gate as everything else on this route.
  const memoryEntries: [string, DecisionMemoryResult][] =
    hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map(async (symbol): Promise<[string, DecisionMemoryResult]> => [symbol, await queryDecisionMemory({ source: "ELVOID_PRO_ORACLE", symbol })])) : [];
  const memoryBySymbol = new Map(memoryEntries);

  const snapshot = buildCognitiveMap({
    now: new Date().toISOString(),
    hasOracleMembership,
    snapshots,
    validations,
    stats,
    traces,
    memory: memoryBySymbol,
  });

  // Phase 8.3.5 — pure derivation over the trace + memory already fetched
  // above. One report per tracked symbol.
  const axisConflicts = symbols.map((symbol) => deriveAxisConflictReport(symbol, latestTraceBySymbol.get(symbol) ?? null, memoryBySymbol.get(symbol) ?? null));

  // Phase 8.3.6 — pure composition over `validations` + `memoryBySymbol`
  // already fetched above, joined by symbol so each validation's memory
  // evidence comes from its own symbol's query result (never cross-symbol).
  const learningLoop = validations.flatMap((v) => buildLearningLoopChains([v], memoryBySymbol.get(v.symbol) ?? null));

  return NextResponse.json({ ...snapshot, axisConflicts, learningLoop });
}
