import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { getSymbolFilters } from "@/lib/binance/futuresClient";
import { buildTpoSessions, TPO_BLOCK_SIZES_MS, TPO_PROFILE_PERIODS_MS } from "@/lib/elvoid/tpo";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const days = Math.min(10, Math.max(1, Number(searchParams.get("days") ?? 6)));
  const blockSize = searchParams.get("blockSize") ?? "30m";
  const period = searchParams.get("period") ?? "1D";
  const valueAreaPct = Math.min(0.95, Math.max(0.1, Number(searchParams.get("va") ?? 70) / 100));
  const ibrBlocks = Math.min(12, Math.max(1, Number(searchParams.get("ibrBlocks") ?? 2)));
  // The chart's own candlestick timeframe — a separate concept from the TPO
  // bracket size, but it DOES decide which real candle interval we pull
  // trade-range data from: we always fetch at the finer of (chart interval,
  // TPO bracket), so switching the chart to a finer timeframe genuinely
  // changes the underlying block traversal instead of silently reusing
  // whatever the previous request happened to fetch.
  const chartInterval = (searchParams.get("chartInterval") ?? "5m").toLowerCase();
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  const blockMs = TPO_BLOCK_SIZES_MS[blockSize] ?? TPO_BLOCK_SIZES_MS["30m"];
  const sessionMs = TPO_PROFILE_PERIODS_MS[period] ?? TPO_PROFILE_PERIODS_MS["1D"];
  const chartIntervalMs = INTERVAL_MS[chartInterval] ?? INTERVAL_MS["5m"];

  // Only intervals Binance actually serves as klines are candidates. Pick
  // the finest one that's still <= both the TPO bracket and the chart
  // timeframe, so a finer chart timeframe can only ever sharpen the TPO
  // traversal data, never coarsen it below what the bracket needs.
  const candidateIntervals: [string, number][] = [
    ["1m", 60_000],
    ["5m", 300_000],
    ["15m", 900_000],
    ["30m", 1_800_000],
  ];
  const ceiling = Math.min(blockMs, chartIntervalMs);
  let sourceInterval = "30m";
  let sourceIntervalMs = 1_800_000;
  for (const [name, ms] of candidateIntervals) {
    if (ms <= ceiling) {
      sourceInterval = name;
      sourceIntervalMs = ms;
    }
  }

  try {
    const blocksNeeded = Math.ceil((days * sessionMs) / blockMs) + 4;
    const sourceCandlesNeeded = Math.min(1000, Math.ceil((blocksNeeded * blockMs) / sourceIntervalMs) + 10);

    const [candles, filters] = await Promise.all([
      getKlines(symbol, sourceInterval, sourceCandlesNeeded),
      getSymbolFilters(`${symbol}USDT`).catch(() => null),
    ]);

    const sessions = buildTpoSessions(candles, {
      blockMs,
      sessionMs,
      tickSize: filters?.tickSize,
      valueAreaPct,
      ibrBlocks,
    });
    return NextResponse.json({
      sessions: sessions.slice(-days),
      tickSize: filters?.tickSize ?? null,
      debug: { sourceInterval, sourceCandlesFetched: candles.length, blockSize, period, chartInterval },
    });
  } catch (err) {
    console.error("[ElVoid AI] tpo-sessions error:", err);
    return NextResponse.json({ error: "Gagal membangun TPO sessions." }, { status: 502 });
  }
}
