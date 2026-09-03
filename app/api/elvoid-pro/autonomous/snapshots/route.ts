import { NextResponse } from "next/server";
import { listAutonomousIntelligenceSnapshots } from "@/lib/ai/autonomousSnapshot/repository";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

/**
 * GET /api/elvoid-pro/autonomous/snapshots
 *
 * Phase 8.3.0.1, Module 2 — READ-ONLY. Returns the latest persisted
 * intelligence snapshot for every symbol the autonomous runtime has
 * analyzed, source = "ELVOID_PRO_ORACLE" only.
 *
 * This route calls `listAutonomousIntelligenceSnapshots()` and NOTHING
 * else — no `assembleOracleContext`, no `computeConfluence`, no
 * `gradeConfluence`, no Oracle call of any kind. A page load hitting this
 * endpoint must never trigger a fresh analysis cycle (spec §10/§16); the
 * only writer of this table is `runAutonomousCycle()` in
 * `lib/ai/autonomousRuntime/orchestrator.ts`, on its own schedule.
 */
export async function GET() {
  if (!(await hasActiveMembership())) {
    return NextResponse.json(MEMBERSHIP_REQUIRED_BODY, { status: 403 });
  }

  try {
    const snapshots = await listAutonomousIntelligenceSnapshots("ELVOID_PRO_ORACLE");
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengambil AI Signal Intelligence snapshot." }, { status: 500 });
  }
}
