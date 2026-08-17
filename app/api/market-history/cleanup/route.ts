import { NextResponse } from "next/server";
import { cleanupExpiredMarketHistory } from "@/lib/marketHistory/store";
import {
  getMarketHistoryStorageUsage,
  cleanupOldestMarketHistory,
  shouldTriggerCleanup,
  STORAGE_TARGET_BYTES,
  CRON_CLEANUP_BATCH_ROWS,
  CRON_MAX_BATCHES,
} from "@/lib/marketHistory/storageGuard";

// ---------------------------------------------------------------------------
// Daily rolling-7-day retention cleanup for market_history (see
// supabase/schema.sql). Runs server-side only — the browser must never be
// relied on to delete historical data.
//
// Same isAuthorizedCron pattern as app/api/binance/auto-trade/tick, whose
// own comment confirms Vercel Hobby only allows once-a-day cron schedules —
// which is exactly the cadence this job needs, so unlike the tick route it
// doesn't need a client-side polling fallback. Registered in vercel.json.
//
// Unlike the tick route, BOTH methods are auth-gated here: that route's POST
// is an intentionally-open "run it now" action (place a testnet order);
// this one deletes data, so no unauthenticated path is exposed for either
// verb once CRON_SECRET is set.
//
// Two cleanup passes, run in this order:
//   1. cleanupExpiredMarketHistory() — the original time-based 7-day
//      retention (created_at cutoff), UNCHANGED. This stays the normal-day
//      behavior; storage pressure is not the only reason old rows get
//      dropped.
//   2. Storage-guard pass — real Postgres size query, then batched deletes
//      (oldest created_at first, same ordering cleanupOldestMarketHistory
//      always uses) looped until usage is back under STORAGE_TARGET_BYTES
//      or CRON_MAX_BATCHES is hit. This is what makes cleanup react FASTER
//      than 7 days when a volatile week (NFP/FOMC/CPI) inflates footprint
//      row counts faster than time-based retention alone would catch —
//      per spec: "storage limit adalah prioritas utama" over the fixed
//      7-day number.
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runCleanup(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    const expiredResult = await cleanupExpiredMarketHistory();

    let usage = await getMarketHistoryStorageUsage(true); // force a real query — the cron is exactly the place that should never trust a stale cache
    console.log(`[MarketHistory] storage usage: ${usage.mb.toFixed(1)} MB`);
    console.log(`[MarketHistory] pressure: ${usage.pressure}`);

    let totalDeleted = 0;
    let batches = 0;
    if (shouldTriggerCleanup(usage.pressure)) {
      console.log("[MarketHistory] cleanup started");
      while (batches < CRON_MAX_BATCHES && usage.bytes > STORAGE_TARGET_BYTES) {
        const result = await cleanupOldestMarketHistory(CRON_CLEANUP_BATCH_ROWS);
        batches++;
        if (result.deleted === 0) break; // nothing left to delete — stop instead of spinning
        totalDeleted += result.deleted;
        console.log(`[MarketHistory] deleted: ${result.deleted} rows`);
        usage = await getMarketHistoryStorageUsage(true);
      }
      console.log("[MarketHistory] cleanup completed");
      console.log(`[MarketHistory] storage target restored: ${usage.mb.toFixed(1)} MB (pressure: ${usage.pressure})`);
    }

    return NextResponse.json({
      ok: true,
      ...expiredResult,
      storage: { mb: usage.mb, pressure: usage.pressure, batchesRun: batches, rowsDeleted: totalDeleted },
    });
  } catch (err) {
    console.error("[ElVoid AI] market-history cleanup error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal menjalankan retention cleanup." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runCleanup(req);
}

export async function POST(req: Request) {
  return runCleanup(req);
}
