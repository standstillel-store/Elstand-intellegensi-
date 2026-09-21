import { NextResponse } from "next/server";
import { handleTelegramWebhook, MAX_WEBHOOK_BODY_BYTES } from "@/lib/ai/evolutionApproval/webhook";
import { createApprovalStore } from "@/lib/ai/evolutionApproval/repository";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";

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
// It records a HUMAN DECISION and answers Telegram. It deploys nothing,
// activates nothing, promotes nothing, and never logs the request, headers or
// any secret. Only POST is exported (any other method is answered 405 by the
// framework); there is no GET that could cause persistence.
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
    { store: createApprovalStore(), createTelegram: (config) => createTelegramClient(config) }
  );
  return NextResponse.json(result.body, { status: result.status });
}
