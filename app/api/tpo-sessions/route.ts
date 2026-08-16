import { NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import { getSymbolFilters } from "@/lib/binance/futuresClient";
import { buildTpoSessions, defaultBlockSizeForChartInterval, TPO_BLOCK_SIZES_MS, TPO_PROFILE_PERIODS_MS, type TpoSession } from "@/lib/elvoid/tpo";
import { persistTpoSessions, loadStoredTpoSessions } from "@/lib/marketHistory/store";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

const RETENTION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // matches Phase 1's market_history retention — no point asking further back than what's kept
const MAX_RETURNED_SESSIONS = 30; // generous ceiling once history is merged in; retention + days already bound this in practice

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

    const liveSessions = buildTpoSessions(candles, {
      blockMs,
      sessionMs,
      tickSize: filters?.tickSize,
      valueAreaPct,
      ibrBlocks,
    });

    // History only backs the CANONICAL view (default bracket size for this
    // chart timeframe, default 1D period) — see persistTpoSessions for why
    // a manually-overridden bracket size isn't cached under the same key.
    const isCanonicalView = blockSize === defaultBlockSizeForChartInterval(chartInterval) && period === "1D";
    let sessions: TpoSession[];
    let storedSessionsUsed = 0;

    if (isCanonicalView) {
      const stored = await loadStoredTpoSessions(symbol, chartInterval, Date.now() - RETENTION_LOOKBACK_MS);
      storedSessionsUsed = stored.length;
      const merged = new Map<number, TpoSession>();
      for (const s of stored) merged.set(s.sessionStart, s);
      for (const s of liveSessions) merged.set(s.sessionStart, s); // live always wins on overlap — freshest real data
      sessions = [...merged.values()].sort((a, b) => a.sessionStart - b.sessionStart).slice(-MAX_RETURNED_SESSIONS);
      // Best-effort, awaited (not fire-and-forget) for the same serverless-
      // freeze reason as persistFootprintCandles: a response can end the
      // function before an un-awaited write finishes.
      await persistTpoSessions(symbol, chartInterval, liveSessions);
    } else {
      sessions = liveSessions.slice(-days);
    }

    return NextResponse.json({
      sessions,
      tickSize: filters?.tickSize ?? null,
      debug: {
        sourceInterval,
        sourceCandlesFetched: candles.length,
        blockSize,
        period,
        chartInterval,
        historyBacked: isCanonicalView,
        storedSessionsUsed,
      },
    });
  } catch (err) {
    console.error("[ElVoid AI] tpo-sessions error:", err);
    return NextResponse.json({ error: "Gagal membangun TPO sessions." }, { status: 502 });
  }
}
