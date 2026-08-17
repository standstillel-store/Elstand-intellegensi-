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

// Hard cap on how many missing candles get backfilled from real Binance
// historical aggTrades in a single request. This is NOT an arbitrary
// shortcut — it exists because Vercel's serverless function has a wall-clock
// timeout, and a wide gap (e.g. a fresh 1h chart with 150 days of missing
// history) would need thousands of sequential Binance calls if done in one
// shot, which cannot finish before the platform kills the request. Instead,
// each poll backfills a bounded batch of the OLDEST missing candles and
// persists them to Supabase — so history genuinely fills in over a handful
// of polls/page-visits rather than pretending to be instant. The response
// tells the caller exactly how much is still missing so the UI can be
// honest about "history still loading" instead of implying completeness.
const MAX_BACKFILL_CANDLES_PER_REQUEST = 8;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase().trim();
  const interval = searchParams.get("interval") ?? "5m";
  const limit = Math.min(150, Math.max(20, Number(searchParams.get("limit") ?? 80)));
  const intervalMs = INTERVAL_MS[interval] ?? 300_000;
  if (!symbol) return NextResponse.json({ error: "symbol wajib diisi." }, { status: 400 });

  try {
    const [candles, trades] = await Promise.all([getKlines(symbol, interval, limit), getRecentTrades(symbol, 1000)]);
    const liveFootprint = buildFootprintByCandle(candles, trades, intervalMs, 5);

    // Step 1: extend past Binance's live 1000-trade window using real,
    // previously-collected+persisted data (no network call, cheap).
    const uncoveredAfterLive = candles.filter((c) => !liveFootprint.has(c.time)).map((c) => c.time);
    const storedFootprint = await loadStoredFootprintCandles(symbol, interval, uncoveredAfterLive);

    // Step 2: whatever is STILL missing after live + stored is genuinely
    // never-seen history. Backfill a bounded batch of it from Binance's real
    // historical aggTrades endpoint (oldest-first, so coverage grows
    // outward from the edge of what's already known rather than randomly).
    const stillMissingTimes = uncoveredAfterLive.filter((t) => !storedFootprint.has(t)).sort((a, b) => a - b);
    const toBackfill = stillMissingTimes.slice(0, MAX_BACKFILL_CANDLES_PER_REQUEST);

    let backfilledCount = 0;
    if (toBackfill.length > 0) {
      const rangeStart = toBackfill[0];
      const rangeEnd = toBackfill[toBackfill.length - 1] + intervalMs;
      // Real historical trades for exactly this candle-time range — not
      // fabricated, not extrapolated from the live window.
      const historicalTrades = await getAggTradesRangeChunked(symbol, rangeStart, rangeEnd);
      const backfillCandles = candles.filter((c) => toBackfill.includes(c.time));
      const backfilledFootprint = buildFootprintByCandle(backfillCandles, historicalTrades, intervalMs, 5);
      backfilledCount = backfilledFootprint.size;
      // Persist immediately so the next request/user doesn't have to redo
      // this same historical fetch — this is what makes history durable
      // across reloads instead of resetting every time the chart reopens.
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
