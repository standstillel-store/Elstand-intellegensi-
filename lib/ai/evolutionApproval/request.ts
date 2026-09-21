// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, approval request (Phase 8.6.7)
//
// Turns ONE freshly computed, VALID validation into a request the human can
// act on: it pins the content by appending the immutable validation record
// (idempotent — identical content is one row), then sends the approver a
// Telegram message carrying the FULL recordHash and Approve / Reject buttons.
//
// NOTHING HERE DECIDES ANYTHING. Sending a request is not an approval, does
// not change any state a decision depends on, and can be repeated safely: if
// a decision already exists no message is sent and the current status is
// returned instead.
//
// This is only ever reached from an explicit, admin-authenticated POST (see
// app/api/ai-performance/approvals/request/route.ts) — never from a GET, a
// cron, the tick, or any automatic path.
// ---------------------------------------------------------------------------

import { evaluateApprovalEligibility } from "./eligibility";
import { buildApprovalKeyboard, formatApprovalRequestMessage } from "./telegramPayload";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { ApprovalStatus, EligibilityFailureCode } from "./contracts";
import type { GetApprovalResult } from "./service";
import type { TelegramClient } from "./telegramClient";

export type RequestOutcomeCode = "REQUEST_SENT" | "ALREADY_DECIDED" | "INELIGIBLE" | "RECORD_STORE_UNAVAILABLE" | "TELEGRAM_UNAVAILABLE";

export interface RequestOutcome {
  readonly code: RequestOutcomeCode;
  readonly recordHash: string | null;
  readonly status: ApprovalStatus | null;
  readonly failure: EligibilityFailureCode | null;
}

export type AppendRecordResult = { readonly status: "APPENDED" | "ALREADY_RECORDED" } | { readonly status: "UNAVAILABLE" };

export interface RequestDeps {
  appendRecord(record: EvolutionValidationRecordWithoutTimestamp): Promise<AppendRecordResult>;
  getApproval(recordHash: string): Promise<GetApprovalResult>;
  telegram: TelegramClient;
  approverChatId: number;
}

export async function requestApproval(deps: RequestDeps, record: EvolutionValidationRecordWithoutTimestamp): Promise<RequestOutcome> {
  const eligibility = evaluateApprovalEligibility(record);
  if (!eligibility.eligible) return { code: "INELIGIBLE", recordHash: record?.recordHash ?? null, status: "INELIGIBLE", failure: eligibility.code };
  const recordHash = record.recordHash;

  const appended = await deps.appendRecord(record);
  if (appended.status === "UNAVAILABLE") return { code: "RECORD_STORE_UNAVAILABLE", recordHash, status: null, failure: null };

  const existing = await deps.getApproval(recordHash);
  if (existing.status === "UNAVAILABLE") return { code: "RECORD_STORE_UNAVAILABLE", recordHash, status: null, failure: null };
  if (existing.status === "FOUND") return { code: "ALREADY_DECIDED", recordHash, status: existing.approval.resultingStatus, failure: null };

  const sent = await deps.telegram.sendMessage(deps.approverChatId, formatApprovalRequestMessage(eligibility.summary), buildApprovalKeyboard(recordHash));
  if (!sent.ok) return { code: "TELEGRAM_UNAVAILABLE", recordHash, status: "AWAITING_HUMAN_APPROVAL", failure: null };
  return { code: "REQUEST_SENT", recordHash, status: "AWAITING_HUMAN_APPROVAL", failure: null };
}
