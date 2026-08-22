import { NextResponse } from "next/server";
import { assembleOracleContext } from "@/lib/ai/oracle/dataAdapters";
import { computeConfluence } from "@/lib/ai/oracle/confluence";
import { runInsightEngine } from "@/lib/ai/insights/engine";

/**
 * GET /api/elvoid-pro/insights?symbol=BTC&interval=15m
 *
 * Reuses the exact same assembleOracleContext (5s in-process cache — see
 * dataAdapters.ts) + computeConfluence pipeline the Oracle route uses, so
 * mounting both the Oracle panel and this Insights panel on the same page
 * does not double the Binance/footprint/orderbook load (spec §16).
 */
export async function GET(req: Request) {
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
