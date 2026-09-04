import { NextResponse } from "next/server";
import { runMacroDataIngestion } from "@/lib/economicData/ingest";

// ---------------------------------------------------------------------------
// Daily macro-data snapshot ingestion (Phase G.5). Same isAuthorizedCron
// pattern as app/api/market-history/cleanup/route.ts (both GET and POST
// gated — no unauthenticated write path once CRON_SECRET is set).
//
// DAILY SNAPSHOT, NOT REAL-TIME (Correction 1): registered in vercel.json
// at "0 23 * * *" — 23:00 UTC, i.e. ~06:00 WIB (Asia/Jakarta, UTC+7 fixed,
// no DST), matching this app's own documented timezone convention (see
// lib/marketHistory/weekCycle.ts's WIB_OFFSET_MS and
// lib/preferences.ts's Asia/Jakarta default). This is a once-a-day
// refresh of whatever the providers currently have — it does NOT
// guarantee same-minute post-release capture for a release that happens
// mid-day. Higher-frequency refresh is explicitly out of scope for this
// phase (see the Phase G architecture doc, Correction 1).
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runIngest(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    const summary = await runMacroDataIngestion();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  } catch (err) {
    console.error("[ElVoid AI] economic-data ingest error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Gagal menjalankan macro data ingestion." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runIngest(req);
}

export async function POST(req: Request) {
  return runIngest(req);
}
