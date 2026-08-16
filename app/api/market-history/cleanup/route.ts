import { NextResponse } from "next/server";
import { cleanupExpiredMarketHistory } from "@/lib/marketHistory/store";

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
    const result = await cleanupExpiredMarketHistory();
    return NextResponse.json({ ok: true, ...result });
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
