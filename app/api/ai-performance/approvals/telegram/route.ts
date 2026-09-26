import { NextResponse } from "next/server";
import { handleTelegramWebhook, MAX_WEBHOOK_BODY_BYTES } from "@/lib/ai/evolutionApproval/webhook";
import { createApprovalStore } from "@/lib/ai/evolutionApproval/repository";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import { emitApprovalDiagnostic } from "@/lib/ai/evolutionApproval/diagnostics";
import { buildChangeArtifact } from "@/lib/ai/evolutionArtifact/create";
import { persistChangeArtifact, getChangeArtifactByRecordHash } from "@/lib/ai/evolutionArtifact/repository";
import { runPhase9Pipeline } from "@/lib/ai/evolutionPipeline/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/ai-performance/approvals/telegram
//
// Phase 8.6.7 — the Telegram webhook: the ONE place a human approval decision
// is recorded. Everything is in lib/ai/evolutionApproval/webhook.ts (secret
// header, numeric approver id, private-chat check, recordHash integrity +
// VALID verification, idempotent immutable insert); this file only reads the
// request and the three env values and hands them over.
//
// It records a HUMAN DECISION and answers Telegram FIRST — nothing below
// this can change that response. It never logs the request, headers or any
// secret. Its only log output is one fixed line per event from
// diagnostics.ts (event name, env variable NAMES, outcome codes) — enough to
// explain a 503 without writing a value. Only POST is exported (any other method is answered 405 by the
// framework); there is no GET that could cause persistence.
//
// PHASE 9 (additive, Sept 2026): a freshly-recorded APPROVED decision now
// also runs lib/ai/evolutionPipeline/run.ts — the ONLY place in this
// repository that generates code, commits, pushes and merges. This route
// itself still deploys nothing directly; Vercel's own existing Git
// integration is what turns a merge into a deployment (see
// lib/ai/evolutionDeploy's header for why there is no separate "trigger
// deploy" call). See app/api/ai-performance/approvals/deployment-webhook/
// route.ts for how a deployment's terminal result reaches Telegram.
//
// Register the webhook once, from your own shell, so no secret is ever pasted
// anywhere (secret_token must be 1-256 characters of A-Z a-z 0-9 _ -):
//   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
//     --data-urlencode "url=https://<your-domain>/api/ai-performance/approvals/telegram" \
//     --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
//     --data-urlencode 'allowed_updates=["callback_query"]'
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }
  const bodyText = await request.text();
  const store = createApprovalStore();

  const result = await handleTelegramWebhook(
    {
      secretHeader: request.headers.get("x-telegram-bot-api-secret-token"),
      bodyText,
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID,
        TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
      },
    },
    { store, createTelegram: (config) => createTelegramClient(config), diagnose: emitApprovalDiagnostic }
  );

  // P4 Step 2 — controlled change artifact. Strictly AFTER the response
  // above was already computed from handleTelegramWebhook()'s own decision
  // (this block cannot influence it), and ONLY when that decision was a
  // freshly-recorded, durable "APPROVED" — never for ALREADY_APPROVED (the
  // artifact for that record was already attempted the first time it was
  // approved), never for REJECTED, never for any other outcome. Re-fetches
  // the record AND the approval row from the store independently (never
  // trusts result.body alone) before building anything. Wrapped so nothing
  // here can ever change the HTTP status/body already returned to Telegram,
  // and no error here is thrown out of this handler.
  if (result.body.outcome === "APPROVED" && result.body.recordHash) {
    try {
      const recordHash = result.body.recordHash;
      const [fetchedRecord, fetchedApproval] = await Promise.all([store.getRecord(recordHash), store.getApproval(recordHash)]);
      if (fetchedRecord.status === "FOUND" && fetchedApproval.status === "FOUND" && fetchedApproval.approval.resultingStatus === "HUMAN_APPROVED") {
        const artifact = buildChangeArtifact(fetchedRecord.record, recordHash);
        if (artifact !== null) {
          await persistChangeArtifact(artifact);
          // Phase 9 — only when the artifact is actually awaiting a patch
          // (never for VALIDATION_FAILED). Same isolation as the artifact
          // block itself: never affects the response already computed
          // above, never retried by this route.
          //
          // `artifact` here is ChangeArtifactWithoutTimestamp — create.ts
          // never stamps generatedAt (no Date.now() in a pure builder,
          // same convention as every other WithoutTimestamp type in this
          // codebase); the Learning DB column is `generated_at timestamptz
          // not null default now()`, so the real, non-fabricated
          // generatedAt only exists once the row above has actually been
          // written. runPhase9Pipeline requires the full ChangeArtifact
          // (see evolutionCoding/generate.ts and prompts.ts, which are
          // typed against it too), so re-read the just-persisted row —
          // same accessor evolutionArtifact/repository.ts already exposes
          // for exactly this shape — instead of widening the type or
          // fabricating a timestamp. If the Learning DB is not configured,
          // or the read-back otherwise comes back empty, there is no
          // legitimate generatedAt to use: skip Phase 9 for this event
          // (fail closed, same as the NOT_CONFIGURED path inside
          // runPhase9Pipeline itself) rather than invent one.
          if (artifact.artifactStatus === "AWAITING_HUMAN_PATCH") {
            const persistedArtifact = await getChangeArtifactByRecordHash(recordHash);
            if (persistedArtifact !== null) {
              await runPhase9Pipeline(persistedArtifact, {
                GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                GITHUB_OWNER: process.env.GITHUB_OWNER,
                GITHUB_REPO: process.env.GITHUB_REPO,
                GITHUB_BASE_BRANCH: process.env.GITHUB_BASE_BRANCH,
                VERCEL_TOKEN: process.env.VERCEL_TOKEN,
                VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
                VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
                TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
                TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID,
                TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
              });
            }
          }
        }
      }
    } catch {
      // change-artifact generation is best-effort observability on top of an
      // already-recorded human decision — it must never affect the response
      // already sent above, and never retries/blocks the webhook.
    }
  }

  return NextResponse.json(result.body, { status: result.status });
}
