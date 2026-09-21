// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, Telegram payloads (Phase 8.6.7)
//
// Pure, deterministic, synchronous. No network, no clock, no secrets. Parses
// what Telegram sends and formats what we send back.
//
// CALLBACK DATA: Telegram limits `callback_data` to 64 bytes, and a full
// `recordHash` is already 64. Buttons therefore carry `a:<32 hex>` /
// `r:<32 hex>` — the first 128 bits of the hash. The prefix is only a
// LOOKUP KEY: the service resolves it to exactly one stored record (zero or
// several matches are rejected) and then works with — and persists — the FULL
// recordHash. A decision never rests on the prefix.
//
// Messages are sent as PLAIN TEXT (no parse mode) so nothing in a proposal's
// text can be interpreted as markup.
// ---------------------------------------------------------------------------

import { APPROVAL_MEANING, OBSERVATIONAL_EVIDENCE_ONLY, OBSERVATIONAL_VALIDATION_PASSED, VALID_MEANING } from "./wording";
import type { ApprovalAction, ApprovalRequestSummary } from "./contracts";

export interface ParsedCallbackUpdate {
  readonly updateId: number;
  readonly callbackQueryId: string;
  readonly fromId: number;
  readonly chatId: number | null;
  readonly chatType: string | null;
  readonly messageId: number | null;
  readonly data: string;
}

export type ParsedTelegramUpdate =
  | { readonly kind: "CALLBACK"; readonly update: ParsedCallbackUpdate }
  /** A well-formed update that is not a button press (e.g. a text message). Acknowledged, never acted on. */
  | { readonly kind: "IGNORED" }
  | { readonly kind: "MALFORMED"; readonly reason: string };

const MAX_CALLBACK_DATA_BYTES = 64;
const MAX_CALLBACK_QUERY_ID_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function parseTelegramUpdate(raw: unknown): ParsedTelegramUpdate {
  if (!isRecord(raw)) return { kind: "MALFORMED", reason: "body is not an object" };
  if (!isInt(raw.update_id)) return { kind: "MALFORMED", reason: "update_id is not an integer" };
  if (raw.callback_query === undefined) return { kind: "IGNORED" };

  const query = raw.callback_query;
  if (!isRecord(query)) return { kind: "MALFORMED", reason: "callback_query is not an object" };
  if (typeof query.id !== "string" || query.id.length === 0 || query.id.length > MAX_CALLBACK_QUERY_ID_LENGTH) return { kind: "MALFORMED", reason: "callback_query.id is invalid" };
  if (!isRecord(query.from) || !isInt(query.from.id)) return { kind: "MALFORMED", reason: "callback_query.from.id is not an integer" };
  if (typeof query.data !== "string" || query.data.length === 0 || Buffer.byteLength(query.data, "utf8") > MAX_CALLBACK_DATA_BYTES) return { kind: "MALFORMED", reason: "callback_query.data is invalid" };

  let chatId: number | null = null;
  let chatType: string | null = null;
  let messageId: number | null = null;
  if (query.message !== undefined) {
    if (!isRecord(query.message)) return { kind: "MALFORMED", reason: "callback_query.message is not an object" };
    if (query.message.chat !== undefined) {
      if (!isRecord(query.message.chat) || !isInt(query.message.chat.id) || typeof query.message.chat.type !== "string") return { kind: "MALFORMED", reason: "callback_query.message.chat is invalid" };
      chatId = query.message.chat.id;
      chatType = query.message.chat.type;
    }
    if (query.message.message_id !== undefined) {
      if (!isInt(query.message.message_id)) return { kind: "MALFORMED", reason: "callback_query.message.message_id is invalid" };
      messageId = query.message.message_id;
    }
  }

  return { kind: "CALLBACK", update: { updateId: raw.update_id, callbackQueryId: query.id, fromId: query.from.id, chatId, chatType, messageId, data: query.data } };
}

/** The approver must be pressing the button in their own private chat with the bot — never a group, never a forwarded copy. */
export function isPrivateChatWithUser(update: ParsedCallbackUpdate): boolean {
  return update.chatType === "private" && update.chatId !== null && update.chatId === update.fromId;
}

const CALLBACK_PREFIX_LENGTH = 32;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

export function encodeCallbackData(action: ApprovalAction, recordHash: string): string {
  return `${action === "APPROVE" ? "a" : "r"}:${recordHash.slice(0, CALLBACK_PREFIX_LENGTH)}`;
}

/** `null` for anything that is not exactly `a:` or `r:` followed by 32 (or 64) lowercase hex characters. */
export function decodeCallbackData(data: string): { readonly action: ApprovalAction; readonly reference: string } | null {
  const match = /^([ar]):([0-9a-f]+)$/.exec(data);
  if (match === null) return null;
  const reference = match[2];
  if (!HEX_32.test(reference) && !HEX_64.test(reference)) return null;
  return { action: match[1] === "a" ? "APPROVE" : "REJECT", reference };
}

export interface InlineKeyboard {
  readonly inline_keyboard: readonly (readonly { readonly text: string; readonly callback_data: string }[])[];
}

export function buildApprovalKeyboard(recordHash: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Approve (record decision only)", callback_data: encodeCallbackData("APPROVE", recordHash) },
        { text: "Reject", callback_data: encodeCallbackData("REJECT", recordHash) },
      ],
    ],
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function samples(label: string, window: { readonly eligible: number | null; readonly excluded: number | null }): string {
  return window.eligible === null || window.excluded === null ? `${label}: not recorded` : `${label}: ${window.eligible} eligible / ${window.excluded} excluded`;
}

/** Plain-text approval request. Uses the SAME wording constants as the UI. */
export function formatApprovalRequestMessage(summary: ApprovalRequestSummary): string {
  const regression = summary.regressionEvaluated ? (summary.regressionDetected ? "evaluated, regression detected" : "evaluated, none detected") : "not evaluated";
  return [
    "ELVOID — Human approval request",
    "",
    `${OBSERVATIONAL_VALIDATION_PASSED} (${summary.gatesPassed} of ${summary.gatesTotal} gates).`,
    OBSERVATIONAL_EVIDENCE_ONLY,
    "",
    `Record hash: ${summary.recordHash}`,
    `Proposal: ${summary.proposalId}`,
    `Candidate: ${summary.candidateId}`,
    `Source / symbol: ${summary.source} / ${summary.symbol}`,
    `Gap: ${summary.gapCategory}`,
    `Validation: ${summary.validationResult} · mode ${summary.validationMode} · counterfactualAvailable=${summary.counterfactualAvailable}`,
    `Regression: ${regression}`,
    `Samples — ${samples("older window", summary.olderWindow)} · ${samples("newer window", summary.newerWindow)}`,
    "",
    `Hypothesis: ${clip(summary.hypothesis, 350)}`,
    `Proposed change: ${clip(summary.proposedChange, 350)}`,
    "",
    VALID_MEANING,
    APPROVAL_MEANING,
  ].join("\n");
}
