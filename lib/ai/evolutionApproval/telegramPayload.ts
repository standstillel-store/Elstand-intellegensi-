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

import { APPROVAL_MEANING_ID, OBSERVATIONAL_EVIDENCE_ONLY_ID, OBSERVATIONAL_VALIDATION_PASSED_ID, VALID_MEANING_ID } from "./wording";
import type { ApprovalAction, ApprovalRequestSummary, PreviousApprovalDecision } from "./contracts";

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
        { text: "Setujui (hanya mencatat keputusan)", callback_data: encodeCallbackData("APPROVE", recordHash) },
        { text: "Tolak", callback_data: encodeCallbackData("REJECT", recordHash) },
      ],
    ],
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function samples(label: string, window: { readonly eligible: number | null; readonly excluded: number | null }): string {
  return window.eligible === null || window.excluded === null ? `${label}: tidak tercatat` : `${label}: ${window.eligible} memenuhi syarat / ${window.excluded} dikecualikan`;
}

const PREVIOUS_DECISION_LABEL_ID: Record<PreviousApprovalDecision["resultingStatus"], string> = {
  HUMAN_APPROVED: "DISETUJUI",
  HUMAN_REJECTED: "DITOLAK",
};

function describePreviousDecisions(previousDecisions: readonly PreviousApprovalDecision[]): string {
  if (previousDecisions.length === 0) return "Belum ada keputusan sebelumnya untuk symbol + gap category ini.";
  const lines = previousDecisions.map((d) => `  • ${PREVIOUS_DECISION_LABEL_ID[d.resultingStatus]} pada ${d.decidedAt}${d.reason ? ` — alasan: ${clip(d.reason, 150)}` : ""}`);
  return [`${previousDecisions.length} keputusan sebelumnya untuk symbol + gap category ini (record berbeda, riwayat saja — tidak memengaruhi kelayakan record ini):`, ...lines].join("\n");
}

/**
 * Plain-text approval request, IN BAHASA INDONESIA (ELVOID 8.6.7 continuation
 * audit requirement — see wording.ts's "_ID" section for why the English
 * originals in wording.ts are untouched and still serve the UI panel).
 * `previousDecisions`: historical context only, see contracts.ts's own doc
 * comment — never derived from `summary` itself, always passed in separately
 * since fetching it needs a DB read that eligibility.ts is deliberately
 * kept pure and unable to do.
 */
export function formatApprovalRequestMessage(summary: ApprovalRequestSummary, previousDecisions: readonly PreviousApprovalDecision[]): string {
  const regression = summary.regressionEvaluated ? (summary.regressionDetected ? "dievaluasi, regresi terdeteksi" : "dievaluasi, tidak ada regresi") : "belum dievaluasi";
  return [
    "ELVOID — Permintaan Persetujuan Manusia",
    "",
    `${OBSERVATIONAL_VALIDATION_PASSED_ID} (${summary.gatesPassed} dari ${summary.gatesTotal} gate).`,
    OBSERVATIONAL_EVIDENCE_ONLY_ID,
    "",
    `Record hash: ${summary.recordHash}`,
    `Proposal: ${summary.proposalId}`,
    `Candidate: ${summary.candidateId}`,
    `Sumber / simbol: ${summary.source} / ${summary.symbol}`,
    `Gap: ${summary.gapCategory}`,
    `Validasi: ${summary.validationResult} · mode ${summary.validationMode} · counterfactualAvailable=${summary.counterfactualAvailable}`,
    `Regresi: ${regression}`,
    `Sampel — ${samples("jendela lama", summary.olderWindow)} · ${samples("jendela baru", summary.newerWindow)}`,
    "",
    `Hipotesis: ${clip(summary.hypothesis, 350)}`,
    `Perubahan yang diusulkan: ${clip(summary.proposedChange, 350)}`,
    "",
    `Risiko: ${summary.riskNote}`,
    "",
    describePreviousDecisions(previousDecisions),
    "",
    VALID_MEANING_ID,
    APPROVAL_MEANING_ID,
  ].join("\n");
}
