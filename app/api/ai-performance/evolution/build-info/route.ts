import { NextResponse } from "next/server";
import type { BuildInfoResponse } from "@/lib/ai/evolutionVerification/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/evolution/build-info   (added 2026-10-04)
//
// What PRODUCTION_VERIFICATION's runtime probe actually asks the running
// deployment: "which commit and deployment are you?" A READY label from
// Vercel's API is a claim about what was BUILT; this route is what the
// deployed process itself reports, right now, answering live traffic.
//
// Both env vars are populated by Vercel automatically on every deployment
// (System Environment Variables) — nothing new to configure. Public and
// read-only by design (no membership check): verification runs server-side
// against the production URL and must not depend on a session.
// ---------------------------------------------------------------------------

export async function GET() {
  const body: BuildInfoResponse = {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    capabilities: ["evolution-production-verification"],
  };
  return NextResponse.json(body);
}
