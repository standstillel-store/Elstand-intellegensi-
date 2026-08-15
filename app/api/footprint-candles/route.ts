import { NextResponse } from "next/server";
import { getKlines, getRecentTrades } from "@/lib/binance";
import { buildFootprintByCandle } from "@/lib/elvoid/footprint";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(150, Math.max(20, Number(searchParams.get("limit") ?? 80)));
  const intervalMs = INTERVAL_MS[interval] ?? 300_000;
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const [candles, trades] = await Promise.all([getKlines(symbol, interval, limit), getRecentTrades(symbol, 1000)]);
    const footprintMap = buildFootprintByCandle(candles, trades, intervalMs, 5);
    const footprintByTime: Record<number, { cells: unknown; poc: unknown; delta: number; totalVolume: number }> = {};
    footprintMap.forEach((v, k) => {
      footprintByTime[k] = { cells: v.cells, poc: v.poc, delta: v.delta, totalVolume: v.totalVolume };
    });
    const oldestTradeTime = trades.length > 0 ? Math.min(...trades.map((t) => t.time)) : null;

    return NextResponse.json({ candles, footprintByTime, oldestTradeTime });
  } catch (err) {
    console.error("[ElVoid AI] footprint-candles error:", err);
    return NextResponse.json({ error: "Gagal membangun footprint per-candle." }, { status: 502 });
  }
}
