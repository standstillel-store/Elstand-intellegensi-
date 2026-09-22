// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, Telegram webhook handler
// (Phase 8.6.7)
//
// The whole webhook decision path as ONE function over injected
// dependencies, so it is exercised offline in fixtures; the route file is a
// thin wrapper that reads the three env values and the request body.
//
// ORDER (each step fails closed; nothing reaches the store until step 6):
//   1. Config       all three env values present and well-formed, else 503.
//   2. Secret       X-Telegram-Bot-Api-Secret-Token matches (constant time),
//                   else 401 — before the body is even parsed.
//   3. Body         size-capped, valid JSON, valid Telegram update shape,
//                   else 400. A well-formed non-button update is acknowledged
//                   and ignored (200).
//   4. Approver     numeric from.id === TELEGRAM_APPROVER_ID AND the button
//                   was pressed in that user's own private chat, else 403.
//   5. Callback     `a:`/`r:` + hex, else 400.
//   6. Decision     decideApproval() (service.ts) — record fetched by hash,
//                   integrity + VALID verified, one immutable row.
//   7. Reply        a fixed, secret-free answer to the button press.
//
// HTTP STATUS: 200 for every outcome of an authenticated, authorized press
// (including "already approved" and "not allowed"), so Telegram does not
// retry a business outcome; 503 ONLY when the store is unavailable, so
// Telegram redelivers and the (idempotent) decision is made later.
//
// NOTHING HERE MUTATES PRODUCTION. It records a human decision and answers
// Telegram. It never calls `console` — not for the body, not for the headers,
// not for an error. Operators get ONE narrow signal instead: an injected
// `diagnose` hook that receives only a closed vocabulary of event names, env
// variable NAMES and outcome codes (diagnostics.ts) — so a 503 is explainable
// from the server log without a single value ever being written.
// ---------------------------------------------------------------------------

import { decodeCallbackData, isPrivateChatWithUser, parseTelegramUpdate } from "./telegramPayload";
import { diagnoseTelegramConfig, isAuthorizedApprover, readTelegramConfig, verifyWebhookSecret } from "./security";
import { decideApproval } from "./service";
import { OUTCOME_ANSWER_TEXT_ID } from "./wording";
import type { ApprovalStore } from "./service";
import type { TelegramClient } from "./telegramClient";
import type { TelegramConfig, TelegramEnvInput } from "./security";
import type { ApprovalOutcomeCode, ApprovalStatus } from "./contracts";
import type { ApprovalDiagnosticEvent } from "./diagnostics";

export const MAX_WEBHOOK_BODY_BYTES = 16_384;

export interface WebhookInput {
  readonly secretHeader: string | null;
  readonly bodyText: string;
  readonly env: TelegramEnvInput;
}

export interface WebhookDeps {
  readonly store: ApprovalStore;
  readonly createTelegram: (config: TelegramConfig) => TelegramClient;
  /**
   * Optional operator-diagnostics sink (see diagnostics.ts). Receives ONLY the
   * closed event vocabulary — never a body, header, id, token or secret. The
   * handler never calls `console` itself; a throwing sink is ignored.
   */
  readonly diagnose?: (event: ApprovalDiagnosticEvent) => void;
}

function note(deps: WebhookDeps, event: ApprovalDiagnosticEvent): void {
  try {
    deps.diagnose?.(event);
  } catch {
    // diagnostics must never change a response
  }
}

export interface WebhookResponse {
  readonly status: number;
  readonly body: {
    readonly ok: boolean;
    readonly outcome?: ApprovalOutcomeCode | "IGNORED";
    readonly status?: ApprovalStatus | null;
    readonly recordHash?: string | null;
    readonly error?: "not_configured" | "unauthorized" | "malformed" | "unauthorized_user";
  };
}

export async function handleTelegramWebhook(input: WebhookInput, deps: WebhookDeps): Promise<WebhookResponse> {
  // 1. Config — fail closed, no detail about which value is wrong.
  const config = readTelegramConfig(input.env);
  if (config === null) {
    note(deps, { kind: "WEBHOOK_NOT_CONFIGURED", problems: diagnoseTelegramConfig(input.env) });
    return { status: 503, body: { ok: false, error: "not_configured" } };
  }

  // 2. Webhook secret — before the body is looked at.
  if (!verifyWebhookSecret(input.secretHeader, config.webhookSecret)) {
    note(deps, { kind: "WEBHOOK_SECRET_MISMATCH" });
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }

  // 3. Body.
  if (typeof input.bodyText !== "string" || input.bodyText.length === 0 || Buffer.byteLength(input.bodyText, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    note(deps, { kind: "WEBHOOK_MALFORMED" });
    return { status: 400, body: { ok: false, error: "malformed" } };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.bodyText);
  } catch {
    note(deps, { kind: "WEBHOOK_MALFORMED" });
    return { status: 400, body: { ok: false, error: "malformed" } };
  }
  const parsed = parseTelegramUpdate(parsedJson);
  if (parsed.kind === "MALFORMED") {
    note(deps, { kind: "WEBHOOK_MALFORMED" });
    return { status: 400, body: { ok: false, error: "malformed" } };
  }
  if (parsed.kind === "IGNORED") return { status: 200, body: { ok: true, outcome: "IGNORED" } };
  const update = parsed.update;
  const telegram = deps.createTelegram(config);

  // 4. Approver — numeric id, and the press must be in their own private chat.
  if (!isAuthorizedApprover(update.fromId, config.approverId) || !isPrivateChatWithUser(update)) {
    note(deps, { kind: "WEBHOOK_UNAUTHORIZED_USER" });
    await telegram.answerCallbackQuery(update.callbackQueryId, OUTCOME_ANSWER_TEXT_ID.UNAUTHORIZED);
    return { status: 403, body: { ok: false, outcome: "UNAUTHORIZED", error: "unauthorized_user" } };
  }

  // 5. Callback data.
  const decoded = decodeCallbackData(update.data);
  if (decoded === null) {
    note(deps, { kind: "WEBHOOK_MALFORMED" });
    await telegram.answerCallbackQuery(update.callbackQueryId, OUTCOME_ANSWER_TEXT_ID.INVALID_APPROVAL_REQUEST);
    return { status: 400, body: { ok: false, error: "malformed" } };
  }

  // 6. Decision.
  const result = await decideApproval(deps.store, {
    action: decoded.action,
    reference: decoded.reference,
    fromId: update.fromId,
    approverId: config.approverId,
    reason: null,
    meta: { updateId: update.updateId, callbackQueryId: update.callbackQueryId },
  });

  note(deps, { kind: "WEBHOOK_OUTCOME", code: result.code });

  // 7. Reply — fixed text only; remove the buttons once a decision is settled.
  await telegram.answerCallbackQuery(update.callbackQueryId, OUTCOME_ANSWER_TEXT_ID[result.code]);
  const settled = result.code === "APPROVED" || result.code === "REJECTED" || result.code === "ALREADY_APPROVED" || result.code === "ALREADY_REJECTED" || result.code === "INVALID_TRANSITION";
  if (settled && update.chatId !== null && update.messageId !== null) await telegram.clearInlineKeyboard(update.chatId, update.messageId);

  const status = result.code === "UNAVAILABLE" ? 503 : 200;
  const ok = result.code === "APPROVED" || result.code === "REJECTED" || result.code === "ALREADY_APPROVED" || result.code === "ALREADY_REJECTED";
  return { status, body: { ok, outcome: result.code, status: result.status, recordHash: result.recordHash } };
}
