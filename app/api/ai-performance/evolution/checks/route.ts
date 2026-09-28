import { NextResponse } from "next/server";
import { pollPendingChecks } from "@/lib/ai/evolutionPipeline/checks";
import { expireStaleAuthorizations } from "@/lib/ai/evolutionPipeline/authorization";
import { getControlPolicySource } from "@/lib/ai/evolutionPipeline/loadControlPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET/POST /api/ai-performance/evolution/checks   (added 2026-09-28)
//
// Scheduled poll for the Phase 9 TEST -> REGRESSION gate: asks GitHub what CI
// reported for each pushed patch branch, moves passing runs to the human
// AUTHORIZATION step, fails closed on failure/timeout, and expires stale
// authorization requests. It NEVER merges — merging is only reachable from a
// human's Telegram press (lib/ai/evolutionPipeline/authorization.ts).
//
// Triggered every 15 minutes by .github/workflows/phase9-checks-poll.yml
// (same reason as elvoid-autonomous-tick.yml: Vercel Hobby crons are
// daily-only). Same isAuthorizedCron pattern as every other cron route here.
// Unlike most of them, THIS route is deliberately fail-CLOSED when
// CRON_SECRET is unset: it can only cause a status transition/notification
// (never a merge), but an unauthenticated public trigger for a self-coding
// pipeline is not something to leave open by default.
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  try {
    const env = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_OWNER: process.env.GITHUB_OWNER,
      GITHUB_REPO: process.env.GITHUB_REPO,
      GITHUB_BASE_BRANCH: process.env.GITHUB_BASE_BRANCH,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID,
      TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    };
    const checks = await pollPendingChecks(env);
    const expiredAuthorizations = await expireStaleAuthorizations(env);
    return NextResponse.json({ ok: true, policySource: getControlPolicySource(), checks, expiredAuthorizations });
  } catch (err) {
    console.error("[ElVoid AI] evolution checks poll error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Gagal menjalankan poll checks." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
