// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, approval record integrity
// (Phase 8.6.7)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// clock or randomness. The hash is a CONTENT IDENTITY over the decision
// (sha256 of a domain-separated canonical serialization, reusing the SAME
// `canonicalJson` the validation record uses) — not a signature, not
// authentication of the approver. Authentication of the approver is the
// numeric Telegram id check in security.ts; this hash exists so a stored
// approval can be re-verified later and shown to name exactly the record it
// approved.
//
// `decidedAt` (database time) and Telegram delivery metadata are NOT part of
// the hash: they are audit detail, not the decision.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/ai/evolutionValidation/record";
import { resultingStatusFor } from "./stateMachine";
import { APPROVAL_VERSION } from "./contracts";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { ApprovalAction, ApprovalRequestSummary, EvolutionApprovalContent, EvolutionApprovalWithoutTimestamp } from "./contracts";

/** Domain separator so this hash can never equal a hash of the same bytes computed for another purpose (including the validation record's). */
const HASH_DOMAIN = "elvoid.evolution-approval.v1\n";

export const MAX_REASON_LENGTH = 500;

/**
 * EXACTLY the hashed fields of an approval, picked by name. A stored approval
 * also carries `approvalHash`, `approvalId`, `decidedAt` and Telegram delivery
 * metadata; none of those may ever leak into the hash input, so the content is
 * always selected field by field rather than by spreading "everything else".
 */
export function approvalContentOf(approval: EvolutionApprovalContent): EvolutionApprovalContent {
  return {
    approvalVersion: approval.approvalVersion,
    recordHash: approval.recordHash,
    proposalId: approval.proposalId,
    candidateId: approval.candidateId,
    gapCategory: approval.gapCategory,
    validationResult: approval.validationResult,
    validationMode: approval.validationMode,
    counterfactualAvailable: approval.counterfactualAvailable,
    decision: approval.decision,
    resultingStatus: approval.resultingStatus,
    approverTelegramUserId: approval.approverTelegramUserId,
    channel: approval.channel,
    reason: approval.reason,
  };
}

export function computeApprovalHash(content: EvolutionApprovalContent): string {
  return createHash("sha256")
    .update(HASH_DOMAIN + canonicalJson(approvalContentOf(content)))
    .digest("hex");
}

function isValidTelegramUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Builds the hashed approval from an eligibility summary. Returns `null` for
 * anything that is not a well-formed decision (non-positive or non-integer
 * approver id, an over-long reason, an unknown action). Never throws.
 */
export function buildApproval(input: { readonly summary: ApprovalRequestSummary; readonly action: ApprovalAction; readonly approverTelegramUserId: number; readonly reason?: string | null }): EvolutionApprovalWithoutTimestamp | null {
  const { summary, action } = input;
  const reason = input.reason ?? null;
  if (action !== "APPROVE" && action !== "REJECT") return null;
  if (!isValidTelegramUserId(input.approverTelegramUserId)) return null;
  if (reason !== null && (typeof reason !== "string" || reason.length === 0 || reason.length > MAX_REASON_LENGTH)) return null;
  if (summary.validationResult !== "VALID") return null;

  const content: EvolutionApprovalContent = {
    approvalVersion: APPROVAL_VERSION,
    recordHash: summary.recordHash,
    proposalId: summary.proposalId,
    candidateId: summary.candidateId,
    gapCategory: summary.gapCategory,
    validationResult: "VALID",
    validationMode: summary.validationMode,
    counterfactualAvailable: false,
    decision: action,
    resultingStatus: resultingStatusFor(action),
    approverTelegramUserId: input.approverTelegramUserId,
    channel: "TELEGRAM",
    reason,
  };
  try {
    return { ...content, approvalHash: computeApprovalHash(content) };
  } catch {
    return null;
  }
}

export interface ApprovalVerification {
  readonly valid: boolean;
  /** Empty exactly when `valid`. Deterministic, ordered. */
  readonly problems: readonly string[];
}

/**
 * Integrity of an approval (freshly built or read back): the hash matches its
 * content, the decision and status agree, and the fixed constants hold. When
 * the record it points at is supplied, it must also name exactly that record.
 * Never throws.
 */
export function verifyApproval(approval: EvolutionApprovalWithoutTimestamp, record?: EvolutionValidationRecordWithoutTimestamp): ApprovalVerification {
  const problems: string[] = [];
  try {
    if (approval.approvalVersion !== APPROVAL_VERSION) problems.push("approvalVersion is not the supported version.");
    if (computeApprovalHash(approvalContentOf(approval)) !== approval.approvalHash) problems.push("approvalHash does not match the canonical serialization of the approval.");
    if (approval.decision !== "APPROVE" && approval.decision !== "REJECT") problems.push("decision is not APPROVE or REJECT.");
    else if (resultingStatusFor(approval.decision) !== approval.resultingStatus) problems.push("resultingStatus does not follow from the decision.");
    if (approval.channel !== "TELEGRAM") problems.push("channel is not TELEGRAM.");
    if (approval.validationResult !== "VALID") problems.push("validationResult is not VALID.");
    if (approval.counterfactualAvailable !== false) problems.push("counterfactualAvailable is not false.");
    if (!isValidTelegramUserId(approval.approverTelegramUserId)) problems.push("approverTelegramUserId is not a positive integer.");
    if (record !== undefined) {
      if (approval.recordHash !== record.recordHash) problems.push("approval does not name this record's recordHash.");
      if (approval.proposalId !== record.proposalId) problems.push("approval proposalId does not match the record.");
      if (approval.candidateId !== record.candidateId) problems.push("approval candidateId does not match the record.");
      if (approval.gapCategory !== record.gapCategory) problems.push("approval gapCategory does not match the record.");
      if (approval.validationMode !== record.validationMode) problems.push("approval validationMode does not match the record.");
    }
  } catch {
    problems.push("approval could not be canonically serialized.");
  }
  return { valid: problems.length === 0, problems };
}
