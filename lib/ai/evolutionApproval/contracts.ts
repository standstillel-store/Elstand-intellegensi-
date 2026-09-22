// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, contracts (Phase 8.6.7)
//
// TYPES ONLY (plus closed literal unions). Zero logic.
//
// WHAT AN APPROVAL IS: an immutable, append-only record that ONE human — the
// Telegram user whose numeric id is TELEGRAM_APPROVER_ID — made ONE decision
// about ONE immutable validation record, named by its `recordHash`. It is the
// final authority on whether a validated proposal moves forward, and it is a
// PREREQUISITE ONLY: nothing in this phase reads an approval to change how
// anything behaves. APPROVE is not deploy, not activate, not production.
//
// STATE MACHINE (explicit and fail-closed; one decision per record, ever):
//
//     (no decision, record eligible)  ──APPROVE──▶  HUMAN_APPROVED   (terminal)
//               │
//               └────────────────────────REJECT──▶  HUMAN_REJECTED   (terminal)
//
//   - Repeating the SAME decision is idempotent: ALREADY_APPROVED /
//     ALREADY_REJECTED, no second row.
//   - The OPPOSITE decision on a terminal state is INVALID_TRANSITION —
//     never a silent overwrite (there is no UPDATE; the table rejects it).
//   - A rejected record is never flipped. Reconsidering means new evidence,
//     which is a new record with a new `recordHash`, decided on its own.
//   - `INELIGIBLE` is not a stored state: it is what a record that is not
//     `VALID` (or fails integrity) is reported as; it can never be decided.
//
// IDENTITY / IDEMPOTENCY KEY: `recordHash`. One row per record (UNIQUE), so a
// resent Telegram callback cannot create a second approval.
// ---------------------------------------------------------------------------

import type { ApprovalStatus } from "./wording";
import type { GapCategory, ValidationMode } from "@/lib/ai/evolutionCandidate/contracts";
import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";

export type { ApprovalStatus, GapCategory, ValidationMode, DecisionSource };

export type ApprovalAction = "APPROVE" | "REJECT";

/** The status a decision produces. There is deliberately no "DEPLOYED", "ACTIVE" or "PROMOTED". */
export type ResultingApprovalStatus = "HUMAN_APPROVED" | "HUMAN_REJECTED";

export const APPROVAL_VERSION = 1 as const;

/** Why a record cannot be decided. Checked in this order; the first failure wins. */
export type EligibilityFailureCode =
  | "RECORD_NOT_FOUND"
  | "INTEGRITY_CHECK_FAILED"
  | "RESULT_NOT_VALID"
  | "IDENTITY_MISMATCH"
  | "UNSUPPORTED_VALIDATION_MODE"
  | "GATES_NOT_ALL_PASSED";

/** What a human is shown, derived only from an integrity-verified record. */
export interface ApprovalRequestSummary {
  readonly recordHash: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly validationResult: "VALID";
  readonly validationMode: ValidationMode;
  readonly counterfactualAvailable: false;
  readonly hypothesis: string;
  readonly proposedChange: string;
  readonly gatesPassed: number;
  readonly gatesTotal: number;
  readonly regressionEvaluated: boolean;
  readonly regressionDetected: boolean;
  readonly olderWindow: { readonly eligible: number | null; readonly excluded: number | null };
  readonly newerWindow: { readonly eligible: number | null; readonly excluded: number | null };
  /**
   * Plain-language caution derived ONLY from fields already on this record
   * (sample sizes, regression status) — never a fabricated score. Added for
   * the ELVOID 8.6.7 continuation audit's "risk" requirement on the
   * approval message. Pure/deterministic, same as every other field here.
   */
  readonly riskNote: string;
}

export type ApprovalEligibility = { readonly eligible: true; readonly summary: ApprovalRequestSummary } | { readonly eligible: false; readonly code: EligibilityFailureCode };

/**
 * ONE prior human decision about a DIFFERENT record that shared the same
 * `symbol` + `gapCategory` — historical context only, never authority: it
 * never changes eligibility or the current decision. `null` symbol/category
 * inputs never happen (both come from an already-eligible record), so this
 * type carries no failure state of its own — an empty array means "no prior
 * decision found or the Learning DB could not be consulted", which the
 * Telegram message renders as one honest line either way.
 */
export interface PreviousApprovalDecision {
  readonly decision: ApprovalAction;
  readonly resultingStatus: ResultingApprovalStatus;
  readonly decidedAt: string;
  readonly reason: string | null;
}

/** The content a decision is hashed over. `decidedAt` (database time) and Telegram metadata are deliberately NOT part of it. */
export interface EvolutionApprovalContent {
  readonly approvalVersion: typeof APPROVAL_VERSION;
  readonly recordHash: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly gapCategory: GapCategory;
  readonly validationResult: "VALID";
  readonly validationMode: ValidationMode;
  readonly counterfactualAvailable: false;
  readonly decision: ApprovalAction;
  readonly resultingStatus: ResultingApprovalStatus;
  /** Numeric Telegram user id (never a username). Telegram ids fit in 52 bits, so a JS number is exact. */
  readonly approverTelegramUserId: number;
  readonly channel: "TELEGRAM";
  readonly reason: string | null;
}

export interface EvolutionApprovalWithoutTimestamp extends EvolutionApprovalContent {
  /** Lowercase hex sha256 of the canonical serialization of the content — see approvalRecord.ts. UNIQUE. */
  readonly approvalHash: string;
}

/** Audit metadata stored beside a decision. Not hashed: it is delivery detail, not the decision. */
export interface ApprovalTelegramMeta {
  readonly updateId: number | null;
  readonly callbackQueryId: string | null;
}

export interface EvolutionApproval extends EvolutionApprovalWithoutTimestamp {
  readonly approvalId: string;
  /** Database `now()` at insert. */
  readonly decidedAt: string;
  readonly telegramUpdateId: number | null;
  readonly telegramCallbackQueryId: string | null;
}

export type ApprovalOutcomeCode =
  | "APPROVED"
  | "REJECTED"
  | "ALREADY_APPROVED"
  | "ALREADY_REJECTED"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED"
  | "INVALID_APPROVAL_REQUEST"
  | "INELIGIBLE"
  | "UNAVAILABLE";

export interface ApprovalOutcome {
  readonly code: ApprovalOutcomeCode;
  readonly recordHash: string | null;
  /** The record's status AFTER this call; `null` when no record was identified. */
  readonly status: ApprovalStatus | null;
  /** Populated for INELIGIBLE / INVALID_APPROVAL_REQUEST when a specific reason is known. */
  readonly failure: EligibilityFailureCode | null;
}

/** What a read-only view (the AI Performance route) reports about one validation. Never contains an approver id. */
export interface EvolutionApprovalView {
  readonly recordHash: string | null;
  readonly status: ApprovalStatus;
  /** `true`/`false` when known; `null` when the Learning DB could not be consulted. */
  readonly recordPersisted: boolean | null;
  readonly failure: EligibilityFailureCode | null;
  readonly decidedAt: string | null;
  readonly approvalId: string | null;
}
