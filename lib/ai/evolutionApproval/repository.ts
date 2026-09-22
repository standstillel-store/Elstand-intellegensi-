// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, persistence-aware adapter
// (Phase 8.6.7)
//
// Persistence-aware adapter ONLY — zero decision logic lives here (service.ts,
// eligibility.ts, stateMachine.ts). Reads `evolution_validation_records` (via
// the existing getEvolutionValidationRecordByHash) and reads/writes
// `evolution_approvals` in the isolated ELVOID Learning Database.
//
// INSERT-ONLY: the only write in this file is one plain insert into
// evolution_approvals. No update, no upsert, no delete — asserted by a static
// fixture, and enforced again by the table's own triggers. It never touches
// the LEGACY `evolution_validations` table: the append-only record table is
// the only source of truth for an approval.
//
// NOTHING CALLS appendApproval AUTOMATICALLY. It is reached only from the
// Telegram webhook, after the approver check, secret check and eligibility
// verification in service.ts.
//
// Every failure — client not configured, query error, unknown state — is
// reported as UNAVAILABLE / NOT_FOUND / REFUSED, never as success.
// ---------------------------------------------------------------------------

import { getLearningSupabase, isLearningSupabaseConfigured } from "@/lib/ai/learning/db";
import { appendEvolutionValidationRecord, getEvolutionValidationRecordByHash } from "@/lib/ai/evolutionValidation/recordRepository";
import { evaluateApprovalEligibility } from "./eligibility";
import type { ApprovalStore, AppendApprovalResult, GetApprovalResult, GetRecordResult, ResolveResult } from "./service";
import type { AppendRecordResult, RequestDeps } from "./request";
import type { ApprovalTelegramMeta, EvolutionApproval, EvolutionApprovalWithoutTimestamp, EvolutionApprovalView, PreviousApprovalDecision } from "./contracts";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { TelegramClient } from "./telegramClient";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const HEX_REFERENCE = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/;
const HEX_64 = /^[0-9a-f]{64}$/;

function mapApprovalRow(row: Record<string, unknown>): EvolutionApproval {
  return {
    approvalId: row.approval_id as string,
    approvalVersion: row.approval_version as 1,
    recordHash: row.record_hash as string,
    proposalId: row.proposal_id as string,
    candidateId: row.candidate_id as string,
    gapCategory: row.gap_category as EvolutionApproval["gapCategory"],
    validationResult: row.validation_result as "VALID",
    validationMode: row.validation_mode as EvolutionApproval["validationMode"],
    counterfactualAvailable: row.counterfactual_available as false,
    decision: row.decision as EvolutionApproval["decision"],
    resultingStatus: row.resulting_status as EvolutionApproval["resultingStatus"],
    approverTelegramUserId: Number(row.approver_telegram_user_id),
    channel: row.channel as "TELEGRAM",
    reason: (row.reason as string | null) ?? null,
    approvalHash: row.approval_hash as string,
    decidedAt: row.decided_at as string,
    telegramUpdateId: row.telegram_update_id === null || row.telegram_update_id === undefined ? null : Number(row.telegram_update_id),
    telegramCallbackQueryId: (row.telegram_callback_query_id as string | null) ?? null,
  };
}

export async function getEvolutionApprovalByRecordHash(recordHash: string): Promise<GetApprovalResult> {
  if (!HEX_64.test(recordHash)) return { status: "NOT_FOUND" };
  const learningDb = getLearningSupabase();
  if (!learningDb) return { status: "UNAVAILABLE" };
  const { data, error } = await learningDb.from("evolution_approvals").select("*").eq("record_hash", recordHash).maybeSingle();
  if (error) return { status: "UNAVAILABLE" };
  if (!data) return { status: "NOT_FOUND" };
  return { status: "FOUND", approval: mapApprovalRow(data as Record<string, unknown>) };
}

const PREVIOUS_DECISIONS_RECORD_SCAN_LIMIT = 50;

/**
 * Historical context for the approval message only — prior human decisions
 * about a DIFFERENT record (different `recordHash`) that shared the same
 * `symbol` + `gapCategory`. Two plain queries rather than one embedded/join
 * filter, deliberately: this codebase already has a proven `.eq().order()`
 * pattern for both tables (see getEvolutionApprovalByRecordHash and
 * getEvolutionValidationRecordByHash above); a nested-resource PostgREST
 * filter across the FK would work too, but this session has no way to run
 * it against real data first, so the already-verified two-step shape wins.
 * Degrades to `[]` on any failure — same convention as every function in
 * this file, never throws, and the caller (request.ts) treats `[]` and
 * "genuinely no prior decision" identically: both render as one honest line.
 */
export async function listRecentApprovalDecisions(symbol: string, gapCategory: string, limit: number): Promise<readonly PreviousApprovalDecision[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  const { data: records, error: recordsError } = await learningDb
    .from("evolution_validation_records")
    .select("record_hash")
    .eq("symbol", symbol)
    .eq("gap_category", gapCategory)
    .order("recorded_at", { ascending: false })
    .limit(PREVIOUS_DECISIONS_RECORD_SCAN_LIMIT);
  if (recordsError || !records || records.length === 0) return [];

  const hashes = (records as { record_hash: string }[]).map((r) => r.record_hash);
  const { data: approvals, error: approvalsError } = await learningDb
    .from("evolution_approvals")
    .select("decision, resulting_status, decided_at, reason")
    .in("record_hash", hashes)
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (approvalsError || !approvals) return [];

  return (approvals as Record<string, unknown>[]).map((row) => ({
    decision: row.decision as PreviousApprovalDecision["decision"],
    resultingStatus: row.resulting_status as PreviousApprovalDecision["resultingStatus"],
    decidedAt: row.decided_at as string,
    reason: (row.reason as string | null) ?? null,
  }));
}

export function createApprovalStore(): ApprovalStore {
  return {
    async resolveRecordHash(reference): Promise<ResolveResult> {
      if (!HEX_REFERENCE.test(reference)) return { status: "NOT_FOUND" };
      const learningDb = getLearningSupabase();
      if (!learningDb) return { status: "UNAVAILABLE" };
      const query = learningDb.from("evolution_validation_records").select("record_hash");
      const { data, error } = await (reference.length === 64 ? query.eq("record_hash", reference) : query.like("record_hash", `${reference}%`)).limit(2);
      if (error) return { status: "UNAVAILABLE" };
      if (!data || data.length === 0) return { status: "NOT_FOUND" };
      if (data.length > 1) return { status: "AMBIGUOUS" };
      return { status: "FOUND", recordHash: (data[0] as { record_hash: string }).record_hash };
    },

    async getRecord(recordHash): Promise<GetRecordResult> {
      if (!isLearningSupabaseConfigured()) return { status: "UNAVAILABLE" };
      const stored = await getEvolutionValidationRecordByHash(recordHash);
      if (stored === null) return { status: "NOT_FOUND" };
      // The store's own integrity flag is deliberately NOT trusted here — eligibility re-verifies the record itself.
      return { status: "FOUND", record: stored.record };
    },

    getApproval: getEvolutionApprovalByRecordHash,

    async appendApproval(approval: EvolutionApprovalWithoutTimestamp, meta: ApprovalTelegramMeta): Promise<AppendApprovalResult> {
      const learningDb = getLearningSupabase();
      if (!learningDb) return { status: "UNAVAILABLE" };
      const row = {
        approval_version: approval.approvalVersion,
        record_hash: approval.recordHash,
        proposal_id: approval.proposalId,
        candidate_id: approval.candidateId,
        gap_category: approval.gapCategory,
        validation_result: approval.validationResult,
        validation_mode: approval.validationMode,
        counterfactual_available: approval.counterfactualAvailable,
        decision: approval.decision,
        resulting_status: approval.resultingStatus,
        approver_telegram_user_id: approval.approverTelegramUserId,
        channel: approval.channel,
        reason: approval.reason,
        approval_hash: approval.approvalHash,
        telegram_update_id: meta.updateId,
        telegram_callback_query_id: meta.callbackQueryId,
      };
      const { data, error } = await learningDb.from("evolution_approvals").insert(row).select("*").single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { status: "DUPLICATE" };
        if (error.code === CHECK_VIOLATION || error.code === FOREIGN_KEY_VIOLATION) return { status: "REFUSED" };
        return { status: "UNAVAILABLE" };
      }
      if (!data) return { status: "UNAVAILABLE" };
      return { status: "APPENDED", approval: mapApprovalRow(data as Record<string, unknown>) };
    },
  };
}

/** Dependencies for requestApproval(): append the immutable record, read any existing decision, send the Telegram message. */
export function createRequestDeps(telegram: TelegramClient, approverChatId: number): RequestDeps {
  const store = createApprovalStore();
  return {
    telegram,
    approverChatId,
    getApproval: (recordHash) => store.getApproval(recordHash),
    listPreviousDecisions: listRecentApprovalDecisions,
    async appendRecord(record: EvolutionValidationRecordWithoutTimestamp): Promise<AppendRecordResult> {
      const result = await appendEvolutionValidationRecord(record);
      if (result.appended) return { status: "APPENDED" };
      if (result.reason === "already_recorded") return { status: "ALREADY_RECORDED" };
      return { status: "UNAVAILABLE" };
    },
  };
}

/**
 * Read-only status for the AI Performance route. Performs reads only. Never
 * exposes an approver id. A validation that is not `VALID` is INELIGIBLE
 * without touching the database.
 */
export async function getApprovalView(input: { readonly validationResult: string; readonly recordHash: string | null }): Promise<EvolutionApprovalView> {
  const { recordHash } = input;
  if (recordHash === null) return { recordHash: null, status: "INELIGIBLE", recordPersisted: null, failure: "RECORD_NOT_FOUND", decidedAt: null, approvalId: null };
  if (input.validationResult !== "VALID") return { recordHash, status: "INELIGIBLE", recordPersisted: null, failure: "RESULT_NOT_VALID", decidedAt: null, approvalId: null };
  if (!isLearningSupabaseConfigured()) return { recordHash, status: "AWAITING_HUMAN_APPROVAL", recordPersisted: null, failure: null, decidedAt: null, approvalId: null };

  const approval = await getEvolutionApprovalByRecordHash(recordHash);
  if (approval.status === "FOUND") {
    return { recordHash, status: approval.approval.resultingStatus, recordPersisted: true, failure: null, decidedAt: approval.approval.decidedAt, approvalId: approval.approval.approvalId };
  }
  if (approval.status === "UNAVAILABLE") return { recordHash, status: "AWAITING_HUMAN_APPROVAL", recordPersisted: null, failure: null, decidedAt: null, approvalId: null };

  const stored = await getEvolutionValidationRecordByHash(recordHash);
  if (stored !== null && !stored.integrity.valid) return { recordHash, status: "INELIGIBLE", recordPersisted: true, failure: "INTEGRITY_CHECK_FAILED", decidedAt: null, approvalId: null };
  return { recordHash, status: "AWAITING_HUMAN_APPROVAL", recordPersisted: stored !== null, failure: null, decidedAt: null, approvalId: null };
}

/**
 * Read-only audit lookup by `recordHash` alone (the GET endpoint). The record is
 * fetched from the append-only table and its integrity and eligibility are
 * re-verified here; the status then follows from the stored decision, if any.
 * Never exposes an approver id.
 */
export async function getApprovalViewByRecordHash(recordHash: string): Promise<EvolutionApprovalView> {
  if (!HEX_64.test(recordHash)) return { recordHash: null, status: "INELIGIBLE", recordPersisted: null, failure: "RECORD_NOT_FOUND", decidedAt: null, approvalId: null };
  if (!isLearningSupabaseConfigured()) return { recordHash, status: "INELIGIBLE", recordPersisted: null, failure: "RECORD_NOT_FOUND", decidedAt: null, approvalId: null };

  const stored = await getEvolutionValidationRecordByHash(recordHash);
  if (stored === null) return { recordHash, status: "INELIGIBLE", recordPersisted: false, failure: "RECORD_NOT_FOUND", decidedAt: null, approvalId: null };

  const eligibility = evaluateApprovalEligibility(stored.record);
  if (!eligibility.eligible) return { recordHash, status: "INELIGIBLE", recordPersisted: true, failure: eligibility.code, decidedAt: null, approvalId: null };

  const approval = await getEvolutionApprovalByRecordHash(recordHash);
  if (approval.status === "FOUND") return { recordHash, status: approval.approval.resultingStatus, recordPersisted: true, failure: null, decidedAt: approval.approval.decidedAt, approvalId: approval.approval.approvalId };
  return { recordHash, status: "AWAITING_HUMAN_APPROVAL", recordPersisted: true, failure: null, decidedAt: null, approvalId: null };
}
