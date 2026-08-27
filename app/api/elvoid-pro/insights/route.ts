import { NextResponse } from "next/server";
import { assembleOracleContext } from "@/lib/ai/oracle/dataAdapters";
import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { runInsightEngine } from "@/lib/ai/insights/engine";
import { hasActiveMembership, MEMBERSHIP_REQUIRED_BODY } from "@/lib/membership";

/**
 * GET /api/elvoid-pro/insights?symbol=BTC&interval=15m
 *
 * Reuses the exact same assembleOracleContext (5s in-process cache — see
 * dataAdapters.ts) + computeConfluence pipeline the Oracle route uses, so
 * mounting both the Oracle panel and this Insights panel on the same page
 * does not double the Binance/footprint/orderbook load (spec §16).
 *
 * Server-side entitlement guard — the ELVOID PRO page itself is already
 * gated (app/elvoid-pro/page.tsx), but this endpoint is directly
 * reachable by URL, so it must not trust that the request came from the
 * gated page.
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
      return NextResponse.json({ error: `Candle history untuk ${symbol} tidak cukup untuk AI Insights.` }, { status: 422 });
    }
    const confluence = computeConfluence(context);
    const result = runInsightEngine(context, confluence);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menjalankan AI Insights & Patterns." }, { status: 500 });
  }
}
