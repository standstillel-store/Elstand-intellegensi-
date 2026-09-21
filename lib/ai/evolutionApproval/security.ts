// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, security primitives (Phase 8.6.7)
//
// Pure, synchronous, deterministic. No network, no clock, no logging.
//
// THREE SECRETS-ADJACENT VALUES, handled here and nowhere else:
//   TELEGRAM_BOT_TOKEN       — used only by telegram.ts to call Telegram.
//   TELEGRAM_APPROVER_ID     — the numeric Telegram user id of the ONE human
//                              approver. Not a secret, but the entire
//                              authorization rule.
//   TELEGRAM_WEBHOOK_SECRET  — checked against the header Telegram attaches.
//
// RULES THIS FILE ENFORCES:
//   - Fail closed: if ANY of the three is missing or malformed, config is
//     `null` and the whole approval feature is off. There is no partial mode.
//   - The approver is identified by NUMERIC id only — never a username.
//   - The webhook secret is compared in constant time (both sides hashed to a
//     fixed length first, so length is not a timing signal either).
//   - Secret values are never returned, logged or placed in an error: the
//     only view of config exposed for diagnostics is `describeConfigStatus`,
//     which is booleans. `redactSecrets` scrubs any string before it can
//     leave the process.
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from "node:crypto";

export interface TelegramEnvInput {
  readonly TELEGRAM_BOT_TOKEN?: string | undefined;
  readonly TELEGRAM_APPROVER_ID?: string | undefined;
  readonly TELEGRAM_WEBHOOK_SECRET?: string | undefined;
}

export type TelegramEnvName = "TELEGRAM_BOT_TOKEN" | "TELEGRAM_APPROVER_ID" | "TELEGRAM_WEBHOOK_SECRET";

/** Which variable is wrong and in what way — NAMES and two fixed words only, never a value or a length. */
export interface TelegramConfigProblem {
  readonly name: TelegramEnvName;
  readonly problem: "missing" | "malformed";
}

export interface TelegramConfig {
  readonly botToken: string;
  readonly approverId: number;
  readonly webhookSecret: string;
}

/** Telegram accepts a webhook secret of 1-256 characters from this alphabet only. */
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
/** A numeric Telegram user id: positive, no leading zero, well inside 52 bits. */
const APPROVER_ID_PATTERN = /^[1-9][0-9]{0,15}$/;

/** `null` unless all three values are present and well-formed. Never throws, never echoes a value. */
export function readTelegramConfig(env: TelegramEnvInput): TelegramConfig | null {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const approverRaw = env.TELEGRAM_APPROVER_ID;
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (typeof botToken !== "string" || botToken.length === 0 || /\s/.test(botToken)) return null;
  if (typeof webhookSecret !== "string" || !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) return null;
  if (typeof approverRaw !== "string" || !APPROVER_ID_PATTERN.test(approverRaw)) return null;
  const approverId = Number(approverRaw);
  if (!Number.isSafeInteger(approverId) || approverId <= 0) return null;
  return { botToken, approverId, webhookSecret };
}

/**
 * WHY the config is not usable, for the operator's server log: each wrong
 * variable by NAME with `missing` (unset or empty) or `malformed` (present but
 * not accepted). Fixed order. `readTelegramConfig(env) === null` exactly when
 * this list is non-empty. Never returns, echoes or measures a value.
 */
export function diagnoseTelegramConfig(env: TelegramEnvInput): readonly TelegramConfigProblem[] {
  const problems: TelegramConfigProblem[] = [];
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (typeof botToken !== "string" || botToken.length === 0) problems.push({ name: "TELEGRAM_BOT_TOKEN", problem: "missing" });
  else if (/\s/.test(botToken)) problems.push({ name: "TELEGRAM_BOT_TOKEN", problem: "malformed" });

  const approver = env.TELEGRAM_APPROVER_ID;
  if (typeof approver !== "string" || approver.length === 0) problems.push({ name: "TELEGRAM_APPROVER_ID", problem: "missing" });
  else if (!APPROVER_ID_PATTERN.test(approver) || !Number.isSafeInteger(Number(approver))) problems.push({ name: "TELEGRAM_APPROVER_ID", problem: "malformed" });

  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (typeof secret !== "string" || secret.length === 0) problems.push({ name: "TELEGRAM_WEBHOOK_SECRET", problem: "missing" });
  else if (!WEBHOOK_SECRET_PATTERN.test(secret)) problems.push({ name: "TELEGRAM_WEBHOOK_SECRET", problem: "malformed" });
  return problems;
}

/** Booleans only — safe to log or return. Never the values, never their lengths. */
export function describeConfigStatus(env: TelegramEnvInput): { readonly configured: boolean } {
  return { configured: readTelegramConfig(env) !== null };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison of the webhook header against the configured secret. A missing header never matches. */
export function verifyWebhookSecret(headerValue: string | null | undefined, secret: string): boolean {
  if (typeof headerValue !== "string" || headerValue.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;
  return timingSafeEqual(digest(headerValue), digest(secret));
}

/** Strict numeric identity: only a safe integer strictly equal to the configured approver id. A string, a username, or a look-alike never passes. */
export function isAuthorizedApprover(fromId: unknown, approverId: number): boolean {
  return typeof fromId === "number" && Number.isSafeInteger(fromId) && Number.isSafeInteger(approverId) && approverId > 0 && fromId === approverId;
}

/** Replaces every occurrence of the bot token or webhook secret in `text`. Used on anything that could carry an upstream error message. */
export function redactSecrets(text: string, config: TelegramConfig): string {
  let out = text;
  for (const secret of [config.botToken, config.webhookSecret]) {
    if (secret.length > 0) out = out.split(secret).join("[redacted]");
  }
  return out;
}
