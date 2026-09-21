// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, state machine (Phase 8.6.7)
//
// Pure, deterministic, synchronous. See contracts.ts for the diagram. One
// decision per record, ever:
//
//   no decision + APPROVE        -> RECORD  (HUMAN_APPROVED)
//   no decision + REJECT         -> RECORD  (HUMAN_REJECTED)
//   HUMAN_APPROVED + APPROVE     -> IDEMPOTENT (ALREADY_APPROVED), no new row
//   HUMAN_REJECTED + REJECT      -> IDEMPOTENT (ALREADY_REJECTED), no new row
//   HUMAN_APPROVED + REJECT      -> INVALID_TRANSITION
//   HUMAN_REJECTED + APPROVE     -> INVALID_TRANSITION
//
// Anything not in this table — including an unknown action or an unknown
// stored decision — is INVALID_TRANSITION. It fails closed; it never
// defaults to recording.
// ---------------------------------------------------------------------------

import type { ApprovalAction, ResultingApprovalStatus } from "./contracts";

export type Transition =
  | { readonly kind: "RECORD"; readonly action: ApprovalAction; readonly resultingStatus: ResultingApprovalStatus }
  | { readonly kind: "IDEMPOTENT"; readonly outcome: "ALREADY_APPROVED" | "ALREADY_REJECTED" }
  | { readonly kind: "INVALID_TRANSITION" };

const STATUS_FOR_ACTION: Record<ApprovalAction, ResultingApprovalStatus> = { APPROVE: "HUMAN_APPROVED", REJECT: "HUMAN_REJECTED" };

export function resultingStatusFor(action: ApprovalAction): ResultingApprovalStatus {
  return STATUS_FOR_ACTION[action];
}

/** `existing` is the stored decision's `resultingStatus`, or `null` when no decision exists for the record. */
export function decideTransition(existing: ResultingApprovalStatus | null, action: ApprovalAction): Transition {
  if (action !== "APPROVE" && action !== "REJECT") return { kind: "INVALID_TRANSITION" };
  if (existing === null) return { kind: "RECORD", action, resultingStatus: STATUS_FOR_ACTION[action] };
  if (existing === "HUMAN_APPROVED") return action === "APPROVE" ? { kind: "IDEMPOTENT", outcome: "ALREADY_APPROVED" } : { kind: "INVALID_TRANSITION" };
  if (existing === "HUMAN_REJECTED") return action === "REJECT" ? { kind: "IDEMPOTENT", outcome: "ALREADY_REJECTED" } : { kind: "INVALID_TRANSITION" };
  return { kind: "INVALID_TRANSITION" };
}
