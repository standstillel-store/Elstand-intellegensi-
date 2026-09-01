import { NextResponse } from "next/server";
import { runAutonomousBatch } from "@/lib/ai/autonomousRuntime/batch";

// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Autonomous Runtime Tick (Phase 8.2.9 §5)
//
// Same two-trigger convention app/api/binance/auto-trade/tick and
// app/api/whale/indexer/run already use in this exact repo:
//
//   1. Client-side, automatically: useAutonomousRuntimeTick.ts (hooked
//      into ELVOID Pro's page shell) POSTs here on an interval while
//      ELVOID Pro is open anywhere — this is what makes autonomous
//      analysis run out of the box, on any hosting plan, no extra setup.
//   2. Server-side cron (optional, for genuinely unattended operation —
//      "the user does not need to open the Oracle panel", per this
//      phase's §5 requirement): Vercel Cron can hit this as a GET with an
//      `Authorization: Bearer $CRON_SECRET` header. A sub-daily schedule
//      needs a Vercel Pro plan — Hobby only allows once-a-day cron and
//      will refuse to deploy a `*/15 * * * *` schedule (see this repo's
//      own existing `app/api/binance/auto-trade/tick` and
//      `app/api/whale/indexer/run` comments documenting the exact same
//      limitation). See vercel.json + CHANGES.md for this phase's actual
//      configured schedule and which tier it assumes.
//
// No CRON_SECRET set -> route stays open (fine for local/dev, or for an
// external scheduler like cron-job.org/GitHub Actions on Hobby).
//
// Concurrency: `runAutonomousBatch()` itself claims the shared runtime
// lock (lib/ai/autonomousRuntime/lock.ts) — an overlapping call here
// (client tick + cron landing at the same moment) safely returns
// `ran: false, reason: "already_running"` rather than running two
// batches at once. This route never needs its own separate locking.
//
// PAPER TRADE ONLY — see lib/ai/autonomousExecution/execute.ts /
// lib/ai/oracle/execute.ts. Nothing in this route (or anything it calls)
// places a live exchange order, signs a wallet transaction, or touches
// Binance/DEX trading credentials.
// ---------------------------------------------------------------------------

// Bounded, sequential batch over the watchlist — give it real headroom on
// plans that allow a longer function duration (Vercel Pro+). Hobby
// hard-caps at 10s regardless of this value; a slow batch on Hobby simply
// completes what it can before the platform kills the invocation — each
// symbol's cycle is independently isolated (see batch.ts), so a
// truncated run never leaves a half-written decision.
export const maxDuration = 60;

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run() {
  try {
    const outcome = await runAutonomousBatch();
    if (!outcome.ran) {
      // "already_running" is a normal, expected no-op (see file header) —
      // 200, not an error status. "lock_error" is a genuine (but
      // non-fatal-to-the-app) Learning DB problem, surfaced as 200 too
      // since no trading logic failed — only the lock check itself did.
      return NextResponse.json({ ok: true, ran: false, reason: outcome.reason, error: outcome.error });
    }
    return NextResponse.json({ ok: true, ran: true, ...outcome.batch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ElVoid AI] Autonomous runtime tick failed:", message);
    return NextResponse.json({ ok: false, error: "Autonomous runtime tick gagal.", detail: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  return run();
}

export async function POST() {
  return run();
}
