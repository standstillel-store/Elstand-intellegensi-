import { NextResponse } from "next/server";
import { getKlines, getRecentTrades, getAggTradesRangeChunked } from "@/lib/binance";
import { buildFootprintByCandle } from "@/lib/elvoid/footprint";
import { persistFootprintCandles, loadStoredFootprintCandles } from "@/lib/marketHistory/store";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

// Candles per historical Binance aggTrades batch. Kept small per-batch (not
// an arbitrary total cap anymore — see BACKFILL_TIME_BUDGET_MS below) so a
// single getAggTradesRangeChunked call stays a handful of hourly windows,
// not thousands of sequential requests in one round trip.
const BACKFILL_BATCH_SIZE = 8;

// Wall-clock budget for how long this request is allowed to keep pulling
// backfill batches before it MUST return. Vercel Hobby serverless functions
// get ~10s by default; this leaves real margin for the klines/live-trades
// fetch that already happened plus response serialization. Previously the
// route did exactly ONE batch of 8 per request, meaning a fresh chart with
// 150 missing candles took ~19 separate 8s-apart polls (~2.5 minutes) to
// fill in. Looping batches until this budget is hit lets one request do the
// work of many polls — history fills in seconds instead of minutes — while
// still never risking a serverless timeout kill, since the loop always
// checks elapsed time BEFORE starting another batch, not after.
const BACKFILL_TIME_BUDGET_MS = 7_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(150, Math.max(20, Number(searchParams.get("limit") ?? 80)));
  const intervalMs = INTERVAL_MS[interval] ?? 300_000;
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const [candles, trades] = await Promise.all([getKlines(symbol, interval, limit), getRecentTrades(symbol, 1000)]);
    const liveFootprint = buildFootprintByCandle(candles, trades, intervalMs);

    // Step 1: extend past Binance's live 1000-trade window using real,
    // previously-collected+persisted data (no network call, cheap).
    const uncoveredAfterLive = candles.filter((c) => !liveFootprint.has(c.time)).map((c) => c.time);
    const storedFootprint = await loadStoredFootprintCandles(symbol, interval, uncoveredAfterLive);

    // Step 2: whatever is STILL missing after live + stored is genuinely
    // never-seen history. Backfill it from Binance's real historical
    // aggTrades endpoint in oldest-first batches (coverage grows outward
    // from the edge of what's already known rather than randomly), looping
    // batches until either everything is filled or the time budget runs
    // out — see BACKFILL_TIME_BUDGET_MS above for why this is a loop now
    // instead of a single fixed-size batch per request.
    const stillMissingTimes = uncoveredAfterLive.filter((t) => !storedFootprint.has(t)).sort((a, b) => a - b);
    const startedAt = Date.now();
    let backfilledCount = 0;
    let cursor = 0;
    while (cursor < stillMissingTimes.length && Date.now() - startedAt < BACKFILL_TIME_BUDGET_MS) {
      const toBackfill = stillMissingTimes.slice(cursor, cursor + BACKFILL_BATCH_SIZE);
      cursor += BACKFILL_BATCH_SIZE;
      const rangeStart = toBackfill[0];
      const rangeEnd = toBackfill[toBackfill.length - 1] + intervalMs;
      // Real historical trades for exactly this candle-time range — not
      // fabricated, not extrapolated from the live window.
      const historicalTrades = await getAggTradesRangeChunked(symbol, rangeStart, rangeEnd);
      const backfillCandles = candles.filter((c) => toBackfill.includes(c.time));
      const backfilledFootprint = buildFootprintByCandle(backfillCandles, historicalTrades, intervalMs);
      backfilledCount += backfilledFootprint.size;
      // Persist immediately (per batch, not just at the end) so partial
      // progress survives even if a later batch pushes past the time
      // budget or the request errors out mid-loop.
      await persistFootprintCandles(symbol, interval, backfilledFootprint);
      backfilledFootprint.forEach((v, k) => storedFootprint.set(k, v));
    }

    // Merge order: stored/backfilled first, live overwrites (live is always
    // freshest for the handful of very recent candles it covers).
    const footprintMap = new Map([...storedFootprint, ...liveFootprint]);

    // Best-effort persistence of this poll's live-computed candles too.
    await persistFootprintCandles(symbol, interval, liveFootprint);

    const footprintByTime: Record<number, { cells: unknown; poc: unknown; delta: number; totalVolume: number }> = {};
    footprintMap.forEach((v, k) => {
      footprintByTime[k] = { cells: v.cells, poc: v.poc, delta: v.delta, totalVolume: v.totalVolume };
    });
    const coveredTimes = candles.map((c) => c.time).filter((t) => footprintMap.has(t));
    const oldestTradeTime = coveredTimes.length > 0 ? Math.min(...coveredTimes) : null;
    const remainingMissing = stillMissingTimes.length - backfilledCount;

    return NextResponse.json({
      candles,
      footprintByTime,
      oldestTradeTime,
      // Honest progress signal — history is being reconstructed
      // incrementally from real data, not instantly complete on first load.
      backfill: { backfilledThisRequest: backfilledCount, remainingMissing: Math.max(0, remainingMissing) },
    });
  } catch (err) {
    console.error("[ElVoid AI] footprint-candles error:", err);
    return NextResponse.json({ error: "Gagal membangun footprint per-candle." }, { status: 502 });
  }
}
