import { NextResponse } from "next/server";
import { cleanupExpiredMarketHistory } from "@/lib/marketHistory/store";
import { getMarketHistoryStorageUsage, resetMarketHistory, shouldTriggerCleanup, STORAGE_CRITICAL_BYTES } from "@/lib/marketHistory/storageGuard";

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
// Two passes, run in this order:
//   1. cleanupExpiredMarketHistory() — the original time-based 7-day
//      retention (created_at cutoff), UNCHANGED. This stays the normal-day
//      behavior; storage pressure is not the only reason old rows get
//      dropped.
//   2. Storage-guard pass — real Postgres size query (pg_total_relation_size,
//      never a row-count estimate). If usage is CRITICAL (>=250MB), the
//      table is FULLY RESET (TRUNCATE, ~0MB) rather than drained — see
//      resetMarketHistory() in storageGuard.ts. Ingestion (Footprint/TPO/
//      Liquidity persistence) is untouched and keeps writing immediately
//      afterward.
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
    console.log(`[MarketHistory] current size: ${usage.mb.toFixed(1)} MB`);
    console.log(`[MarketHistory] pressure: ${usage.pressure}`);

    let rowsDeleted = 0;
    let resetTriggered = false;
    if (shouldTriggerCleanup(usage.pressure)) {
      resetTriggered = true;
      const resetAt = new Date().toISOString();
      console.log(`[MarketHistory] threshold reached: CRITICAL (>= ${(STORAGE_CRITICAL_BYTES / 1024 / 1024).toFixed(0)} MB)`);
      console.log(`[MarketHistory] reset triggered at ${resetAt}`);

      const result = await resetMarketHistory();
      rowsDeleted = result.deleted;
      console.log(`[MarketHistory] rows deleted: ${rowsDeleted}`);
      if (result.error) console.error(`[MarketHistory] reset error: ${result.error}`);

      usage = await getMarketHistoryStorageUsage(true);
      console.log(`[MarketHistory] size after reset: ${usage.mb.toFixed(2)} MB`);
      console.log(`[MarketHistory] reset completed at ${new Date().toISOString()}`);
    }

    return NextResponse.json({
      ok: true,
      ...expiredResult,
      storage: { mb: usage.mb, pressure: usage.pressure, resetTriggered, rowsDeleted },
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
