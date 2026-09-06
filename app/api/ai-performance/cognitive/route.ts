import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { listAutonomousIntelligenceSnapshots } from "@/lib/ai/autonomousSnapshot/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { listCognitiveTracesBySymbol } from "@/lib/ai/cognitiveTrace/repository";
import { getStatistics } from "@/lib/elvoid/paperTrader";
import { buildCognitiveMap } from "@/lib/ai/cognitiveMap/build";

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
// classification in buildCognitiveMap(). Same read-only guarantee: this
// never triggers a fresh cycle, it only reads what the autonomous runtime
// already wrote.
//
// ELVOID PRO Oracle telemetry (snapshots + validations) is membership-gated,
// same as the existing autonomous routes — but paper trader statistics are
// NOT gated (see lib/elvoid/paperTrader.ts), so a non-member still sees an
// honest Execution/Learning picture instead of an empty page.
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

  const snapshot = buildCognitiveMap({
    now: new Date().toISOString(),
    hasOracleMembership,
    snapshots,
    validations,
    stats,
    traces,
  });

  return NextResponse.json(snapshot);
}
