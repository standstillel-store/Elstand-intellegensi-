import { NextResponse } from "next/server";
import { getAggTradesFromId } from "@/lib/binance";
import { getLastStoredAggId, insertTicks, cleanupExpiredTicks } from "@/lib/marketHistory/tickStore";

// ---------------------------------------------------------------------------
// Continuous raw-tick capture for BTC (see the storage/scheduling discussion
// with the user — this table can genuinely fill Supabase Free's 500MB cap).
//
// Same isAuthorizedCron pattern as app/api/binance/auto-trade/tick and
// app/api/market-history/cleanup: Vercel Hobby cron can only run once a day,
// which is nowhere near frequent enough for tick capture (BTC futures can
// produce 1000+ aggTrades in well under a minute during volatile periods).
// This route is designed to be hit by an EXTERNAL scheduler (cron-job.org,
// GitHub Actions, etc.) every 30-60 seconds — see the setup instructions
// delivered alongside this file. If CRON_SECRET isn't set, the GET path
// stays open (fine for local/dev, not for a public production URL).
//
// Self-healing catch-up: the cursor (highest agg_id already stored) is read
// from the database itself, not from any in-memory state — so if the
// external scheduler misses a run, has downtime, or the serverless
// function's own cold starts wipe any local state, the NEXT successful call
// just picks up exactly where the database left off. Nothing is lost as
// long as Binance's aggTrades history for that ID range hasn't rolled off
// their own retention (which is much longer than our polling gap would
// ever realistically be).
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// TIME budget for one invocation's catch-up loop — same pattern as the
// footprint historical backfill: keeps pulling pages until either caught
// up to the live edge or this budget runs out, rather than a fixed page
// count. This is what lets a multi-hour backlog (e.g. after the table was
// unreachable for a while) catch up in a handful of calls instead of
// crawling forward at a fixed 8000 trades/minute regardless of how far
// behind it is.
const CATCHUP_TIME_BUDGET_MS = 8_000; // serverless function has ~10s on Hobby
const SYMBOL = "BTC";

async function runCapture(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    let cursor = await getLastStoredAggId(SYMBOL);
    let totalInserted = 0;
    let pages = 0;
    // TICK_CAPTURE_PAGE_ERROR: same fix as FOOTPRINT_BACKFILL_ERROR — a
    // single page failing (most commonly Binance 429 rate-limit mid
    // catch-up, since this loop can fire up to 8x1000-trade requests every
    // ~60s) must NOT wipe out the progress already inserted by earlier
    // pages in this same call, nor return 502 for what is otherwise a
    // successful partial catch-up. The DB-derived cursor (getLastStoredAggId)
    // means whatever WAS inserted this call is never lost even if we stop
    // early — the next call just resumes from there.
    let pageError: string | null = null;

    if (cursor === null) {
      // First-ever run for this symbol: no historical agg_id is known yet,
      // so bootstrap the cursor from Binance's single most-recent real
      // trade (plain aggTrades call, no fromId/time params — returns the
      // latest `limit` trades with their real aggId attached). Every
      // subsequent call then continues forward via fromId from here —
      // this intentionally does NOT try to backfill older ticks retroactively,
      // since raw-tick capture is a "going forward" feature (same posture as
      // the liquidity snapshot capture), not a historical reconstruction.
      const res = await fetch(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${SYMBOL}USDT&limit=1`, { cache: "no-store" });
      if (!res.ok) return NextResponse.json({ error: "Bootstrap fetch failed." }, { status: 502 });
      const raw = (await res.json()) as Array<{ a: number; p: string; q: string; m: boolean; T: number }>;
      if (raw.length === 0) return NextResponse.json({ ok: true, bootstrapped: false, inserted: 0, note: "Bootstrap fetch returned nothing." });
      const latest = raw[0];
      const inserted = await insertTicks(SYMBOL, [{ aggId: latest.a, price: parseFloat(latest.p), qty: parseFloat(latest.q), isSell: latest.m, time: latest.T }]);
      return NextResponse.json({ ok: true, bootstrapped: true, inserted, cursor: latest.a, lastTradeTime: new Date(latest.T).toISOString() });
    }

    let lastTradeTimeMs: number | null = null;
    const startedAt = Date.now();
    // Time-budget loop (not a fixed page cap): keeps pulling pages until
    // either caught up to the live edge, the wall-clock budget runs out, or
    // a page fails. This is what lets a multi-hour backlog catch up in a
    // handful of calls instead of crawling forward 8000 trades/minute.
    while (Date.now() - startedAt < CATCHUP_TIME_BUDGET_MS) {
      try {
        const trades = await getAggTradesFromId(SYMBOL, cursor + 1, 1000);
        if (trades.length === 0) break;
        const inserted = await insertTicks(SYMBOL, trades);
        totalInserted += inserted;
        cursor = trades[trades.length - 1].aggId;
        lastTradeTimeMs = trades[trades.length - 1].time;
        pages += 1;
        if (trades.length < 1000) break; // caught up to the live edge
      } catch (pageErr) {
        pageError = pageErr instanceof Error ? pageErr.message : String(pageErr);
        console.error("[ElVoid AI] TICK_CAPTURE_PAGE_ERROR", { symbol: SYMBOL, cursor, pages, error: pageError });
        break;
      }
    }

    // Cheap, deterministic throttle for the retention sweep — no extra
    // state needed, runs roughly every ~15 minutes of wall-clock time
    // rather than on every single capture call.
    let cleanup: { configured: boolean; deleted: number } | null = null;
    if (new Date().getMinutes() % 15 === 0) {
      cleanup = await cleanupExpiredTicks(SYMBOL);
    }

    // Honest lag signal — how far behind "now" the freshest inserted tick
    // is, in seconds. Lets the caller (or a human staring at the JSON
    // response) tell "still catching up, working normally" apart from
    // "stuck" at a glance, without digging through Vercel logs.
    const lagSeconds = lastTradeTimeMs != null ? Math.round((Date.now() - lastTradeTimeMs) / 1000) : null;

    return NextResponse.json({
      ok: true,
      inserted: totalInserted,
      pages,
      cursor,
      lastTradeTime: lastTradeTimeMs != null ? new Date(lastTradeTimeMs).toISOString() : null,
      lagSeconds,
      pageError,
      cleanup,
    });
  } catch (err) {
    console.error("[ElVoid AI] tick-capture error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal capture tick." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  return runCapture(req);
}

export async function POST(req: Request) {
  return runCapture(req);
}
