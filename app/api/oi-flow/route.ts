import { NextResponse } from "next/server";
import { getOpenInterestHistory } from "@/lib/binance";

/**
 * Real proxy for "net positioning flow": Binance Futures Open Interest
 * change over the last ~24h for a symbol. This is NOT institutional/ETF
 * flow (no free legitimate source for that exists — see IntelligenceRail
 * comment) — it's real exchange derivatives data used as an honest stand-in
 * for "is leveraged positioning building up or unwinding", labeled as such
 * in the UI rather than presented as something it isn't.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const history = await getOpenInterestHistory(symbol, "1h", 24);
    if (history.length < 2) return NextResponse.json({ error: "insufficient_history" }, { status: 502 });
    const first = history[0];
    const last = history[history.length - 1];
    const deltaValueUsd = last.openInterestValue - first.openInterestValue;
    const deltaPct = first.openInterestValue !== 0 ? (deltaValueUsd / first.openInterestValue) * 100 : 0;
    return NextResponse.json({
      symbol,
      openInterestValue: last.openInterestValue,
      deltaValueUsd,
      deltaPct,
      windowHours: history.length,
    });
  } catch {
    return NextResponse.json({ error: "oi_history_fetch_failed" }, { status: 502 });
  }
}
