import { NextResponse } from "next/server";
import { runEvolutionSweep } from "@/lib/ai/evolutionVerification/sweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET/POST /api/ai-performance/evolution/verify   (added 2026-10-04)
//
// Scheduled sweep for the two gaps this task adds: DEPLOY_SUCCESS ->
// PRODUCTION_VERIFICATION -> OUTCOME -> LEARNING. Same isAuthorizedCron
// pattern, same fail-closed-when-unset posture, as
// app/api/ai-performance/evolution/checks/route.ts (this route also cannot
// merge, approve, or deploy anything — it only reads what already happened).
//
// Not yet wired into a GitHub Actions schedule — see the handoff report for
// the one workflow file this still needs (phase9-checks-poll.yml's own
// cadence, 15 minutes, is the intended model). Safe to invoke manually any
// number of times in the meantime: every write downstream is idempotent
// (lib/ai/evolutionVerification/repository.ts, lib/ai/evolutionOutcome/repository.ts).
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function resolveProductionBaseUrl(): string {
  const explicit = process.env.EVOLUTION_PRODUCTION_BASE_URL;
  if (explicit) return explicit;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "https://www.elstand-intellegence.my.id";
}

async function run(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  try {
    const env = { VERCEL_TOKEN: process.env.VERCEL_TOKEN, VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID, VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID, VERCEL_WEBHOOK_SECRET: process.env.VERCEL_WEBHOOK_SECRET };
    const result = await runEvolutionSweep(env, resolveProductionBaseUrl());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[ElVoid AI] evolution verify sweep error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Gagal menjalankan evolution verify sweep." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
