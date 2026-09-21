// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, decision service (Phase 8.6.7)
//
// Orchestration over an INJECTED store — no database client is imported here,
// so the whole decision path runs offline against an in-memory store in the
// fixtures, and the production store (repository.ts) is a thin adapter.
//
// THE FLOW, in this order; every step fails closed and nothing is recorded
// unless ALL of them pass:
//
//   1. approver      numeric Telegram id === TELEGRAM_APPROVER_ID   -> UNAUTHORIZED
//                    (checked FIRST, before any store access)
//   2. reference     a 32/64-hex recordHash reference               -> INVALID_APPROVAL_REQUEST
//   3. resolve       the reference names exactly ONE stored record  -> INVALID_APPROVAL_REQUEST
//   4. fetch         the record, by recordHash, from the append-only
//                    evolution_validation_records table (never the legacy
//                    evolution_validations table)                   -> INVALID_APPROVAL_REQUEST
//   5. eligibility   integrity, result === VALID, identity, mode,
//                    gates (eligibility.ts)                         -> INVALID_APPROVAL_REQUEST | INELIGIBLE
//   6. state         the record's existing decision, if any (and its own
//                    integrity)
//   7. transition    stateMachine.ts: record / idempotent / invalid
//   8. append        one immutable approval row, insert-only
//
// This service records a HUMAN DECISION. It never deploys, activates or
// promotes anything, changes no threshold, and calls nothing in the decision
// path. APPROVE is a prerequisite for a future step that does not exist.
// ---------------------------------------------------------------------------

import { evaluateApprovalEligibility } from "./eligibility";
import { buildApproval, verifyApproval } from "./approvalRecord";
import { decideTransition } from "./stateMachine";
import { isAuthorizedApprover } from "./security";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { ApprovalAction, ApprovalOutcome, ApprovalStatus, ApprovalTelegramMeta, EligibilityFailureCode, EvolutionApproval, EvolutionApprovalWithoutTimestamp } from "./contracts";

export type ResolveResult = { readonly status: "FOUND"; readonly recordHash: string } | { readonly status: "NOT_FOUND" } | { readonly status: "AMBIGUOUS" } | { readonly status: "UNAVAILABLE" };
export type GetRecordResult = { readonly status: "FOUND"; readonly record: EvolutionValidationRecordWithoutTimestamp } | { readonly status: "NOT_FOUND" } | { readonly status: "UNAVAILABLE" };
export type GetApprovalResult = { readonly status: "FOUND"; readonly approval: EvolutionApproval } | { readonly status: "NOT_FOUND" } | { readonly status: "UNAVAILABLE" };
/** `REFUSED`: the database itself refused the row (its own eligibility guard) — permanent, not worth a retry. `UNAVAILABLE`: transient. */
export type AppendApprovalResult = { readonly status: "APPENDED"; readonly approval: EvolutionApproval } | { readonly status: "DUPLICATE" } | { readonly status: "REFUSED" } | { readonly status: "UNAVAILABLE" };

/** Everything the decision path may touch. Implemented over the Learning DB in repository.ts; over memory in fixtures. */
export interface ApprovalStore {
  resolveRecordHash(reference: string): Promise<ResolveResult>;
  getRecord(recordHash: string): Promise<GetRecordResult>;
  getApproval(recordHash: string): Promise<GetApprovalResult>;
  appendApproval(approval: EvolutionApprovalWithoutTimestamp, meta: ApprovalTelegramMeta): Promise<AppendApprovalResult>;
}

export interface DecideInput {
  readonly action: ApprovalAction;
  /** 32 or 64 lowercase hex characters. */
  readonly reference: string;
  /** Untrusted until step 1. */
  readonly fromId: unknown;
  readonly approverId: number;
  readonly reason?: string | null;
  readonly meta: ApprovalTelegramMeta;
}

function outcome(code: ApprovalOutcome["code"], recordHash: string | null, status: ApprovalStatus | null, failure: EligibilityFailureCode | null = null): ApprovalOutcome {
  return { code, recordHash, status, failure };
}

const HEX_REFERENCE = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/;

function statusOf(approval: EvolutionApproval): ApprovalStatus {
  return approval.resultingStatus;
}

export async function decideApproval(store: ApprovalStore, input: DecideInput): Promise<ApprovalOutcome> {
  // 1. Approver identity — before ANY store access.
  if (!isAuthorizedApprover(input.fromId, input.approverId)) return outcome("UNAUTHORIZED", null, null);
  const approverTelegramUserId = input.fromId as number;

  // 2. Reference shape.
  if (typeof input.reference !== "string" || !HEX_REFERENCE.test(input.reference)) return outcome("INVALID_APPROVAL_REQUEST", null, null);

  // 3. Resolve to exactly one record.
  const resolved = await store.resolveRecordHash(input.reference);
  if (resolved.status === "UNAVAILABLE") return outcome("UNAVAILABLE", null, null);
  if (resolved.status !== "FOUND") return outcome("INVALID_APPROVAL_REQUEST", null, null, "RECORD_NOT_FOUND");
  const recordHash = resolved.recordHash;

  // 4. Fetch the immutable record by its full hash.
  const fetched = await store.getRecord(recordHash);
  if (fetched.status === "UNAVAILABLE") return outcome("UNAVAILABLE", recordHash, null);
  if (fetched.status !== "FOUND") return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, "RECORD_NOT_FOUND");
  const record = fetched.record;
  // The record handed back must be the EXACT one asked for.
  if (record.recordHash !== recordHash) return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, "IDENTITY_MISMATCH");

  // 5. Eligibility (re-verifies integrity itself; never trusts the store's own flag).
  const eligibility = evaluateApprovalEligibility(record);
  if (!eligibility.eligible) {
    if (eligibility.code === "RESULT_NOT_VALID" || eligibility.code === "UNSUPPORTED_VALIDATION_MODE" || eligibility.code === "GATES_NOT_ALL_PASSED") {
      return outcome("INELIGIBLE", recordHash, "INELIGIBLE", eligibility.code);
    }
    return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, eligibility.code);
  }

  // 6-8. Existing state, transition, append. A duplicate on append (a race, or a resent callback) re-reads and re-decides once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await store.getApproval(recordHash);
    if (existing.status === "UNAVAILABLE") return outcome("UNAVAILABLE", recordHash, null);
    if (existing.status === "FOUND" && !verifyApproval(existing.approval, record).valid) return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, "INTEGRITY_CHECK_FAILED");

    const transition = decideTransition(existing.status === "FOUND" ? existing.approval.resultingStatus : null, input.action);
    if (transition.kind === "IDEMPOTENT") {
      return outcome(transition.outcome, recordHash, existing.status === "FOUND" ? statusOf(existing.approval) : null);
    }
    if (transition.kind === "INVALID_TRANSITION") {
      return outcome("INVALID_TRANSITION", recordHash, existing.status === "FOUND" ? statusOf(existing.approval) : null);
    }

    const approval = buildApproval({ summary: eligibility.summary, action: transition.action, approverTelegramUserId, reason: input.reason ?? null });
    if (approval === null) return outcome("INVALID_APPROVAL_REQUEST", recordHash, null);

    const appended = await store.appendApproval(approval, input.meta);
    if (appended.status === "UNAVAILABLE") return outcome("UNAVAILABLE", recordHash, null);
    if (appended.status === "REFUSED") return outcome("INVALID_APPROVAL_REQUEST", recordHash, null);
    if (appended.status === "APPENDED") return outcome(transition.action === "APPROVE" ? "APPROVED" : "REJECTED", recordHash, transition.resultingStatus);
    // DUPLICATE: someone recorded a decision between our read and our insert — loop once to re-decide against it.
  }
  return outcome("UNAVAILABLE", recordHash, null);
}
