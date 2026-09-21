// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate wording (Phase 8.6.7)
//
// ONE source of wording for the AI Performance UI and the Telegram message,
// so the two can never drift into saying different things. No imports, no
// logic — safe to import from a client component.
//
// What the words are careful about: `VALID` means every OBSERVATIONAL
// validation gate was met. It is not proven improvement, not proven
// profitability, not causal or counterfactual proof, and not a statement
// that anything is safe for production. And APPROVE is a recorded human
// decision only — never a deployment, an activation, or a promotion.
// ---------------------------------------------------------------------------

export type ApprovalStatus = "AWAITING_HUMAN_APPROVAL" | "HUMAN_APPROVED" | "HUMAN_REJECTED" | "INELIGIBLE";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  AWAITING_HUMAN_APPROVAL: "Awaiting human approval",
  HUMAN_APPROVED: "Human approved (recorded decision only)",
  HUMAN_REJECTED: "Human rejected",
  INELIGIBLE: "Ineligible for approval",
};

export const OBSERVATIONAL_VALIDATION_PASSED = "Observational validation passed";

/** The one-line reading of the triple that every approval surface shows. */
export const OBSERVATIONAL_EVIDENCE_ONLY = "VALID + OBSERVATIONAL_SPLIT_HISTORY + counterfactualAvailable=false means observational evidence only.";

export const VALID_MEANING = "Every observational validation gate was met. This is not proven improvement, not proven profitability, not causal or counterfactual proof, and not a statement that anything is safe for production.";

export const APPROVAL_MEANING = "Approving records a human decision only. It does not deploy, activate or promote anything, and it changes no trading behavior.";

/** Fixed, secret-free reply texts for each outcome, used as the Telegram callback answer. */
export const OUTCOME_ANSWER_TEXT = {
  APPROVED: "Recorded: human approved. Nothing was deployed or activated.",
  REJECTED: "Recorded: human rejected.",
  ALREADY_APPROVED: "Already approved. No new decision recorded.",
  ALREADY_REJECTED: "Already rejected. No new decision recorded.",
  INVALID_TRANSITION: "Not allowed: a decision on this record already exists and cannot be reversed.",
  UNAUTHORIZED: "Unauthorized.",
  INVALID_APPROVAL_REQUEST: "Invalid approval request.",
  INELIGIBLE: "Ineligible: only observational validation that passed can be decided.",
  UNAVAILABLE: "Temporarily unavailable. Nothing was recorded.",
} as const;
