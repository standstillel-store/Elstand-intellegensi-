import { NextResponse } from "next/server";
import { assembleOracleContext } from "@/lib/ai/oracle/dataAdapters";
import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { gradeConfluence } from "@/lib/ai/oracle/grading";
import { buildMarketInsight } from "@/lib/ai/oracle/insight";
import { buildOracleRiskPlan } from "@/lib/ai/oracle/risk";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

/**
 * GET /api/elvoid-pro/oracle?symbol=BTC&interval=15m
 *
 * Runs the full ELVOID PRO ORACLE pipeline for one symbol, live:
 *   assembleOracleContext (Phase 1, real data)
 *   -> computeConfluence (Phase 2, evidence per side)
 *   -> buildOracleRiskPlan (real S/R + ATR — same methodology as the
 *      normal AI Signal engine, never invented)
 *   -> gradeConfluence (Phase 3, deterministic — NO_TRADE/B+/A/A+)
 *   -> buildMarketInsight (Phase 4, narrative + pattern names)
 *
 * Returns everything the ELVOID Pro dashboard needs to render the Oracle
 * card AND everything the Execute Signal button needs to POST straight to
 * /api/elvoid-pro/execute-signal without recomputing anything client-side.
 *
 * Server-side entitlement guard — reachable directly by URL regardless of
 * whether the ELVOID PRO page rendered it.
 */
export async function GET(req: Request) {
  if (!(await hasActiveMembership())) {
    return NextResponse.json(MEMBERSHIP_REQUIRED_BODY, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const interval = searchParams.get("interval") ?? "15m";
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi, contoh: ?symbol=BTC" }, { status: 400 });

  try {
    const context = await assembleOracleContext(symbol, interval);
    if (context.candles.length < 30) {
      return NextResponse.json({ error: `Candle history untuk ${symbol} tidak cukup untuk analisis Oracle.` }, { status: 422 });
    }

    const confluence = computeConfluence(context);
    const dominantSide = confluence.dominantSide === "NEUTRAL" ? null : confluence.dominantSide;
    const risk = buildOracleRiskPlan(context, dominantSide);
    const assessment = gradeConfluence(confluence, risk ?? undefined);
    const insight = buildMarketInsight(confluence, assessment);

    return NextResponse.json({ assessment, confluence, insight, risk });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menjalankan ELVOID PRO ORACLE." }, { status: 500 });
  }
}
