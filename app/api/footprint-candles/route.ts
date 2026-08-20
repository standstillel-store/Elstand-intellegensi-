import { NextResponse } from "next/server";
import { getKlines, getRecentTrades, getAggTradesRangeChunked } from "@/lib/binance";
import { buildFootprintByCandle } from "@/lib/elvoid/footprint";
import { persistFootprintCandles, loadStoredFootprintCandles } from "@/lib/marketHistory/store";
import { ensureStorageBudget } from "@/lib/marketHistory/storageGuard";

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
    let stoppedForStoragePressure = false;
    let backfillError: string | null = null;
    while (cursor < stillMissingTimes.length && Date.now() - startedAt < BACKFILL_TIME_BUDGET_MS) {
      // Storage guard: backfill is the one thing here that only ever grows
      // older history. Under CRITICAL pressure the spec wants newest data
      // prioritized, so this loop stops opening new historical batches
      // (the live/current-candle footprint above and its persist call are
      // untouched — those keep collecting normally, per "jangan
      // menghentikan Footprint, TPO, atau Liquidity Heatmap").
      const pressure = await ensureStorageBudget();
      if (pressure === "CRITICAL") {
        stoppedForStoragePressure = true;
        break;
      }
      const toBackfill = stillMissingTimes.slice(cursor, cursor + BACKFILL_BATCH_SIZE);
      cursor += BACKFILL_BATCH_SIZE;
      const rangeStart = toBackfill[0];
      const rangeEnd = toBackfill[toBackfill.length - 1] + intervalMs;
      try {
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
      } catch (batchErr) {
        // FOOTPRINT_BACKFILL_ERROR: historical backfill is best-effort
        // enrichment on top of an already-valid live response — it must
        // NEVER be able to turn a good live payload into a 502. Most likely
        // trigger: market_history persistence broken (missing table/RPC),
        // forcing this loop to redo full history every request until it
        // eventually gets throttled by Binance. Stop backfilling for this
        // request, keep whatever succeeded so far, still return 200.
        backfillError = batchErr instanceof Error ? batchErr.message : String(batchErr);
        console.error("[ElVoid AI] FOOTPRINT_BACKFILL_ERROR", { symbol, interval, rangeStart, rangeEnd, error: backfillError });
        break;
      }
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
    // Honest quality signal (spec item 16 / 13): REAL when full requested
    // history is covered, PARTIAL when only some candles have footprint
    // (still 100% real data, just incomplete), never fabricated as REAL.
    const quality: "REAL" | "PARTIAL" | "UNAVAILABLE" =
      footprintMap.size === 0 ? "UNAVAILABLE" : coveredTimes.length >= candles.length ? "REAL" : "PARTIAL";

    return NextResponse.json({
      symbol,
      interval,
      candles,
      footprintByTime,
      oldestTradeTime,
      quality,
      generatedAt: Date.now(),
      // Honest progress signal — history is being reconstructed
      // incrementally from real data, not instantly complete on first load.
      backfill: {
        backfilledThisRequest: backfilledCount,
        remainingMissing: Math.max(0, remainingMissing),
        stoppedForStoragePressure,
        // Non-fatal: backfill (older history) failed this request but the
        // live footprint above is still real and still returned as 200.
        lastError: backfillError,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ElVoid AI] FOOTPRINT_QUERY_ERROR", { symbol, interval, limit, error: message });
    return NextResponse.json({ error: "Gagal membangun footprint per-candle.", code: "FOOTPRINT_QUERY_ERROR", message }, { status: 502 });
  }
}
