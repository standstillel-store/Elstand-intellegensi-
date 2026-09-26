import { NextResponse } from "next/server";
import { verifyVercelSignature, readVercelConfig, getDeploymentById } from "@/lib/ai/evolutionDeploy/vercelClient";
import { getPatchRunByMergeCommitSha, upsertPatchRun, appendPatchEvent } from "@/lib/ai/evolutionPipeline/repository";
import { formatDeploySuccessMessage, formatPipelineFailureMessage } from "@/lib/ai/evolutionPipeline/resultMessages";
import { readTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import type { PatchRun } from "@/lib/ai/evolutionPipeline/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/ai-performance/approvals/deployment-webhook
//
// Phase 9, Step 3 — the SAME role for Vercel deployments that the existing
// Telegram webhook plays for approvals: the one place an EXTERNAL, terminal
// fact (a Vercel deployment reaching READY/ERROR/CANCELED) is turned into a
// final Phase 9 result. This is what completes a run left as
// PUSH_SUCCESS_DEPLOY_PENDING by lib/ai/evolutionPipeline/run.ts when the
// build was still in progress at the end of that request.
//
// Registered ONCE, manually, same one-time-setup convention as the Telegram
// webhook (see CHANGES.md for the exact command) — a Vercel project webhook
// subscribed to `deployment.succeeded` / `deployment.error` /
// `deployment.canceled`, with a shared secret (VERCEL_WEBHOOK_SECRET) Vercel
// signs every payload with (`x-vercel-signature`, HMAC-SHA1 of the raw
// body) so this route can verify the sender before doing anything.
//
// Deploys nothing itself, triggers nothing. Read-only against Vercel, one
// update to this run's own row, one Telegram message. Never logs.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  const bodyText = await request.text();

  if (typeof secret !== "string" || secret.length === 0) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!verifyVercelSignature(bodyText, request.headers.get("x-vercel-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });

  const event = (payload as Record<string, unknown>).type;
  const data = (payload as Record<string, unknown>).payload as Record<string, unknown> | undefined;
  const deploymentId = typeof data?.deployment === "object" && data?.deployment !== null ? (data.deployment as Record<string, unknown>).id : undefined;
  const commitSha = typeof data?.deployment === "object" && data?.deployment !== null ? ((data.deployment as Record<string, unknown>).meta as Record<string, unknown> | undefined)?.githubCommitSha : undefined;

  if (typeof event !== "string" || typeof commitSha !== "string") {
    return NextResponse.json({ ok: true, outcome: "IGNORED" }, { status: 200 }); // not a shape we act on — acknowledged, never retried.
  }

  const run = await getPatchRunByMergeCommitSha(commitSha);
  if (!run || run.status !== "PUSH_SUCCESS_DEPLOY_PENDING") {
    return NextResponse.json({ ok: true, outcome: "IGNORED" }, { status: 200 }); // no matching pending run, or already resolved (idempotent — a redelivered event is a safe no-op).
  }

  const vercelConfig = readVercelConfig({ VERCEL_TOKEN: process.env.VERCEL_TOKEN, VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID, VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID });
  const snapshot = typeof deploymentId === "string" && vercelConfig ? await getDeploymentById(vercelConfig, deploymentId) : { state: "UNKNOWN" as const, deploymentId: typeof deploymentId === "string" ? deploymentId : null, url: null };

  const succeeded = event === "deployment.succeeded" || snapshot.state === "READY";
  const updated: PatchRun = {
    ...run,
    status: succeeded ? "DEPLOY_SUCCESS" : "DEPLOY_FAILED",
    deploymentId: snapshot.deploymentId,
    deploymentUrl: snapshot.url,
    failedStage: succeeded ? null : "DEPLOY_VERIFY",
    errorSummary: succeeded ? null : `Vercel event "${event}"`,
    updatedAt: new Date().toISOString(),
  };
  await upsertPatchRun(updated);
  await appendPatchEvent(run.recordHash, run.patchRunId, "DEPLOY_VERIFY", updated.status, `webhook event "${event}" for deployment ${snapshot.deploymentId ?? "unknown"}`);

  const telegramConfig = readTelegramConfig({ TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID, TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET });
  if (telegramConfig) {
    const client = createTelegramClient(telegramConfig);
    const text = succeeded
      ? formatDeploySuccessMessage(updated)
      : formatPipelineFailureMessage(updated.proposalId, "DEPLOY_VERIFY", updated.status, updated.errorSummary ?? "deployment did not succeed", updated.branch, updated.mergeCommitSha);
    await client.sendMessage(telegramConfig.approverId, text, null);
  }

  return NextResponse.json({ ok: true, outcome: updated.status }, { status: 200 });
}
