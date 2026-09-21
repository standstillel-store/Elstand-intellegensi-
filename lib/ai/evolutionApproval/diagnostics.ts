// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, operator diagnostics (Phase 8.6.7)
//
// WHY THIS EXISTS: the first production run of the webhook returned 503 nine
// times and the server log said nothing about why — the handler had been made
// deliberately silent. A silent 503 is undiagnosable, so this file adds the
// ONE narrow, safe way to say what happened.
//
// WHAT MAY BE LOGGED — a CLOSED vocabulary only:
//   - a fixed event name (webhook_not_configured, webhook_secret_mismatch, ...)
//   - for a configuration problem: the variable NAME and one of two fixed words
//     (`missing` / `malformed`) — never a value, never a length
//   - an outcome code from the fixed outcome unions
// Nothing else can reach the log: no request body, no header value, no user id,
// no token, no secret, no error object. The formatter builds its text only from
// allow-listed names and words, so even a wrong event object cannot smuggle a
// value through it.
//
// This is the ONLY file in the approval layer allowed to call `console`. The
// webhook handler itself never does — it calls an injected `diagnose` hook,
// which the routes wire to `emitApprovalDiagnostic`.
// ---------------------------------------------------------------------------

import type { ApprovalOutcomeCode } from "./contracts";
import type { TelegramConfigProblem } from "./security";
import type { RequestOutcomeCode } from "./request";

export type ApprovalDiagnosticEvent =
  | { readonly kind: "WEBHOOK_NOT_CONFIGURED"; readonly problems: readonly TelegramConfigProblem[] }
  | { readonly kind: "WEBHOOK_SECRET_MISMATCH" }
  | { readonly kind: "WEBHOOK_MALFORMED" }
  | { readonly kind: "WEBHOOK_UNAUTHORIZED_USER" }
  | { readonly kind: "WEBHOOK_OUTCOME"; readonly code: ApprovalOutcomeCode }
  | { readonly kind: "REQUEST_NOT_CONFIGURED"; readonly problems: readonly TelegramConfigProblem[] }
  | { readonly kind: "REQUEST_OUTCOME"; readonly code: RequestOutcomeCode };

const ALLOWED_NAMES = new Set(["TELEGRAM_BOT_TOKEN", "TELEGRAM_APPROVER_ID", "TELEGRAM_WEBHOOK_SECRET"]);
const ALLOWED_PROBLEMS = new Set(["missing", "malformed"]);
const ALLOWED_OUTCOMES = new Set(["APPROVED", "REJECTED", "ALREADY_APPROVED", "ALREADY_REJECTED", "INVALID_TRANSITION", "UNAUTHORIZED", "INVALID_APPROVAL_REQUEST", "INELIGIBLE", "UNAVAILABLE", "REQUEST_SENT", "ALREADY_DECIDED", "RECORD_STORE_UNAVAILABLE", "TELEGRAM_UNAVAILABLE"]);

function describeProblems(problems: readonly TelegramConfigProblem[]): string {
  const safe = problems.filter((p) => ALLOWED_NAMES.has(p.name) && ALLOWED_PROBLEMS.has(p.problem)).map((p) => `${p.name}=${p.problem}`);
  return safe.length > 0 ? safe.join(", ") : "unspecified";
}

/** The exact log line for an event. Pure. Built only from allow-listed names, words and outcome codes. */
export function formatApprovalDiagnostic(event: ApprovalDiagnosticEvent): string {
  switch (event.kind) {
    case "WEBHOOK_NOT_CONFIGURED":
      return `[approvals] webhook_not_configured: ${describeProblems(event.problems)}`;
    case "WEBHOOK_SECRET_MISMATCH":
      return "[approvals] webhook_secret_mismatch";
    case "WEBHOOK_MALFORMED":
      return "[approvals] webhook_malformed";
    case "WEBHOOK_UNAUTHORIZED_USER":
      return "[approvals] webhook_unauthorized_user";
    case "WEBHOOK_OUTCOME":
      return `[approvals] webhook_outcome: ${ALLOWED_OUTCOMES.has(event.code) ? event.code : "unknown"}`;
    case "REQUEST_NOT_CONFIGURED":
      return `[approvals] request_not_configured: ${describeProblems(event.problems)}`;
    case "REQUEST_OUTCOME":
      return `[approvals] request_outcome: ${ALLOWED_OUTCOMES.has(event.code) ? event.code : "unknown"}`;
    default:
      return "[approvals] unknown_event";
  }
}

/** Writes one fixed line to the server log. Never throws. */
export function emitApprovalDiagnostic(event: ApprovalDiagnosticEvent): void {
  try {
    console.error(formatApprovalDiagnostic(event));
  } catch {
    // logging must never affect a decision or a response
  }
}
