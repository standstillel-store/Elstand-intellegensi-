// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Qualification Engine (Phase 8.2.2)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a DOWNSTREAM, PURE QUALIFICATION LAYER over an already-built
//     `AutonomousDecisionContext` (Phase 8.2.0). It is NOT a second Oracle
//     grading engine. It never recalculates, re-derives, or overrides any
//     canonical Oracle value — `grade`, `confidence`, `side`, `riskStatus`,
//     entry/stopLoss/takeProfit are read-only inputs here, copied verbatim
//     from `context.canonical` (itself already a narrow, verbatim copy of
//     `OracleAssessment` fields — see `lib/ai/autonomous/contracts.ts`).
//     There is no code path anywhere in this module that writes back to,
//     mutates, or produces a competing value for any of those fields.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `ai_signals`, or
//     any decision-lifecycle/autonomous-execution path. It imports only
//     type-only contracts from `lib/ai/autonomous/contracts.ts` (Phase
//     8.2.0) — the sole upstream input this phase reads.
//   - ELVOID Pro Oracle only (hard boundary this phase). `qualify.ts`
//     structurally refuses to qualify a context whose `source !==
//     "ELVOID_PRO_ORACLE"` — see `SOURCE` below and `qualify.ts`'s
//     `sourceEligible` signal — the same "one source, never merged" rule
//     every 8.1.x/8.2.x phase already enforces.
//   - Output is a CLOSED status enum — `QUALIFIED | CAUTION | CONFLICTED |
//     INSUFFICIENT_CONTEXT` — plus a closed, boolean-only signal record.
//     There is deliberately no free-text/reason/explanation/narrative
//     field anywhere in this file's types, matching
//     `learningValidation/contracts.ts`'s and `failurePatterns/
//     contracts.ts`'s own "closed enums, booleans, timestamps only"
//     convention. No causal claim has a field to be attached to, even by
//     accident.
//   - `QUALIFIED`/`CAUTION`/`CONFLICTED`/`INSUFFICIENT_CONTEXT` are
//     ADVISORY ONLY, for a later, separately-approved autonomous-decision
//     phase to read. There is no EXECUTE/WAIT/REJECT field anywhere in
//     this file, by design — deciding what to DO with a qualification
//     status is explicitly out of scope for this phase, the same
//     "assemble/validate, do not decide" boundary Phase 8.2.0 and 8.1.5
//     already draw around their own outputs.
//   - `AutonomousQualificationInput` is anchored on the caller-supplied
//     `AutonomousDecisionContext` — every field of the result is either a
//     narrow copy of a `context` field, a reference carried through
//     unchanged, or one of six independently computed booleans in
//     `QualificationSignals`. Nothing is fabricated, nothing is
//     recomputed from a source outside `context` itself.
//   - Pure data shape only — no logic lives in this file. See `qualify.ts`
//     for the pure, deterministic evaluator function.
//   - UNWIRED: nothing in the app imports from
//     `lib/ai/decisionQualification/*` yet. No route, no cron, no UI, no
//     execution call-site. Wiring a consumer (and any EXECUTE/WAIT/REJECT
//     logic that would read this status) is a separately-approved future
//     phase.
// ---------------------------------------------------------------------------

import type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource } from "@/lib/ai/autonomous/contracts";

// Re-exported so qualify.ts/fixtures have a single import source for the
// shape they consume — this module does not define its own competing
// context/canonical/source types, matching `autonomous/context.ts`'s own
// re-export convention.
export type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource };

/**
 * The single `DecisionSource` this engine is willing to qualify. Not the
 * two-member `DecisionSource` union re-exported above — deliberately a
 * single-value literal, mirroring `decisionTrace/contracts.ts`'s own
 * `TraceSource` precedent for the same "ELVOID Pro only, this phase" hard
 * boundary. A context whose own `source` does not equal this value is
 * never qualified as anything other than `INSUFFICIENT_CONTEXT` — see
 * `qualify.ts`'s `sourceEligible` signal.
 */
export const QUALIFIABLE_SOURCE: DecisionSource = "ELVOID_PRO_ORACLE";

/**
 * Closed set of terminal qualification outcomes. Exactly one is ever
 * produced per input — see `qualify.ts::selectQualificationStatus()` for
 * the deterministic, fail-closed, priority-ordered selection. No fifth
 * value, no free-text status, no numeric score standing in for one of
 * these four.
 *
 *   - `QUALIFIED` — every concern below cleared; the canonical assessment
 *     is, on its own closed-signal terms, sufficiently trustworthy to
 *     proceed toward later autonomous decision stages. This is advisory
 *     only — it is never itself an EXECUTE instruction.
 *   - `CAUTION` — the canonical assessment is present and eligible, but
 *     at least one lesser concern applies (invalid/unavailable risk plan,
 *     or a `VALID` adaptive constraint exists for this source). Proceed,
 *     if at all, with reduced trust.
 *   - `CONFLICTED` — historical Decision Memory evidence for this source
 *     (a negative-outcome evaluation, or a recurring failure-pattern
 *     candidate) directly conflicts with treating this assessment as
 *     trustworthy. Outranks `CAUTION` — a documented historical conflict
 *     is a stronger concern than a missing/invalid risk plan or a single
 *     advisory constraint.
 *   - `INSUFFICIENT_CONTEXT` — there is not enough of the right kind of
 *     context to qualify anything at all: wrong/missing source, no
 *     canonical Oracle assessment, or a canonical assessment whose grade
 *     is `NO_TRADE` (nothing to qualify — there is no trade idea here).
 *     This is the fail-safe default whenever required context is
 *     missing; it is never skipped in favor of guessing `CAUTION` or
 *     `QUALIFIED`.
 */
export type QualificationStatus = "QUALIFIED" | "CAUTION" | "CONFLICTED" | "INSUFFICIENT_CONTEXT";

/**
 * Closed, boolean-only signal record. Each field is one independently
 * computed concern; `status` is a deterministic function of this record
 * alone (see `qualify.ts::selectQualificationStatus()`), never an
 * independent judgment call. No signal here is a score/confidence/
 * probability — every member is a plain boolean, matching
 * `ConstraintValidationSignals`'s own convention
 * (`learningValidation/contracts.ts`).
 */
export interface QualificationSignals {
  /** `context.source === QUALIFIABLE_SOURCE`. `false` for every other (or absent) source — this engine is source-isolated to ELVOID_PRO_ORACLE only. */
  readonly sourceEligible: boolean;
  /** `context.canonical !== null` — a canonical Oracle assessment snapshot exists to qualify at all. */
  readonly canonicalAssessmentPresent: boolean;
  /** Only meaningful when `canonicalAssessmentPresent`. `context.canonical.grade !== "NO_TRADE"` — a `NO_TRADE` grade means there is no trade idea to qualify. */
  readonly gradeQualifies: boolean;
  /** Only meaningful when `canonicalAssessmentPresent`. `context.canonical.riskStatus === "valid"` — copied verbatim, never recomputed. */
  readonly riskValid: boolean;
  /**
   * `context.memory !== null` AND at least one of: a `matchedEvaluations`
   * row whose `evaluationClass` is a negative-outcome class (see
   * `NEGATIVE_EVALUATION_CLASSES`, `lib/ai/failurePatterns/detect.ts` —
   * reused verbatim, never re-declared), or `matchedPatterns.length > 0`
   * (an already-qualified, already-thresholded recurring failure
   * pattern for this source). Both are read straight off `context.memory`
   * — never re-filtered, re-ranked, or re-thresholded here.
   */
  readonly negativeMemorySignalPresent: boolean;
  /** `context.validConstraints.length > 0` — at least one already-`VALID`-validated adaptive constraint exists for this source. Presence alone is the signal; this module never reads or branches on `constraintType`. */
  readonly cautionConstraintPresent: boolean;
}

/**
 * The pure engine's single output type. `symbol`, `source`, and
 * `generatedAt` are copied verbatim from the input `context` — never
 * re-derived, never wall-clock-generated here (there is no
 * qualification-time timestamp anywhere in this file; see `qualify.ts`'s
 * file header for why). `status` is a deterministic function of `signals`
 * alone.
 */
export interface AutonomousQualificationResult {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly symbol: string;
  readonly source: DecisionSource;
  /** = `context.generatedAt`, copied verbatim — the instant the *context* was assembled, not a new qualification-time read. */
  readonly generatedAt: string;
  readonly status: QualificationStatus;
  readonly signals: QualificationSignals;
}
