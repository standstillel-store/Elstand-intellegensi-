// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Qualification Engine (Phase 8.2.2)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` — every timestamp in the output is copied
// verbatim from the caller-supplied `context` (`context.generatedAt`),
// never wall-clock-read internally, mirroring how `validatedAt`/
// `computedAt`/`evaluatedAt` are added by their respective repository
// layers, not by their pure `validate.ts`/`detect.ts`/`evaluate.ts`
// counterparts. Zero randomness. Zero imports from lib/ai/oracle/*,
// lib/ai/cognitive/*, lib/elvoid/*, or any trading-execution module — this
// file depends ONLY on the plain `AutonomousDecisionContext` it is given
// (plus the one re-exported constant from `lib/ai/failurePatterns/
// detect.ts`, itself already zero-dependency on any of those paths — see
// that file's own header).
//
// THIS IS NOT A SECOND ORACLE GRADING ENGINE. `qualifyAutonomousDecision()`
// never recomputes `grade`/`confidence`/`side`/`riskStatus`, never derives
// an entry/stopLoss/takeProfit, and never selects EXECUTE/WAIT/REJECT. It
// answers exactly one question — "is this already-graded canonical
// assessment, on closed-signal terms, sufficiently trustworthy to proceed
// toward a later autonomous decision stage" — and nothing else. Every
// canonical field it reads is read once, compared against a fixed
// threshold or a plain existence check, and never written anywhere.
// ---------------------------------------------------------------------------

import { NEGATIVE_EVALUATION_CLASSES } from "@/lib/ai/failurePatterns/detect";
import type { AutonomousDecisionContext, AutonomousQualificationResult, QualificationSignals, QualificationStatus } from "./contracts";
import { QUALIFIABLE_SOURCE } from "./contracts";

/**
 * Pure existence/threshold check over `context.memory` alone — never
 * re-filters, re-ranks, or re-thresholds anything Phase 8.1.3 (Decision
 * Memory) or Phase 8.1.2 (Failure Pattern Detection) already computed.
 * `matchedEvaluations`/`matchedPatterns` are read exactly as
 * `DecisionMemoryResult` already carries them.
 *
 * Returns `false` when `context.memory === null` — a missing memory
 * retrieval is a valid, expected state (see `autonomous/contracts.ts`'s
 * own doc comment on `memory`), not itself evidence of conflict, so it
 * must never be treated as if it were a positive negative-signal.
 */
function hasNegativeMemorySignal(context: AutonomousDecisionContext): boolean {
  if (context.memory === null) return false;
  const hasNegativeEvaluation = context.memory.matchedEvaluations.some((evaluation) => NEGATIVE_EVALUATION_CLASSES.includes(evaluation.evaluationClass));
  const hasMatchedPattern = context.memory.matchedPatterns.length > 0;
  return hasNegativeEvaluation || hasMatchedPattern;
}

/**
 * Computes the six closed, independently derived booleans this engine's
 * status decision is a pure function of. Each field reads a fixed set of
 * already-computed `context` fields and nothing else — no recomputation,
 * no re-derivation of any upstream value.
 */
function computeSignals(context: AutonomousDecisionContext): QualificationSignals {
  const sourceEligible = context.source === QUALIFIABLE_SOURCE;
  const canonicalAssessmentPresent = context.canonical !== null;
  const gradeQualifies = canonicalAssessmentPresent && context.canonical!.grade !== "NO_TRADE";
  const riskValid = canonicalAssessmentPresent && context.canonical!.riskStatus === "valid";
  const negativeMemorySignalPresent = hasNegativeMemorySignal(context);
  const cautionConstraintPresent = context.validConstraints.length > 0;

  return {
    sourceEligible,
    canonicalAssessmentPresent,
    gradeQualifies,
    riskValid,
    negativeMemorySignalPresent,
    cautionConstraintPresent,
  };
}

/**
 * Deterministic, fail-closed status selection from the six independently
 * computed signals. Priority order (first match wins) — most-fundamental
 * concern first, mirroring `learningValidation/validate.ts`'s
 * `selectStatus()` pattern:
 *
 *   1. `!sourceEligible` -> `INSUFFICIENT_CONTEXT` (this engine is source-
 *      isolated to ELVOID_PRO_ORACLE only; a context for any other/absent
 *      source is never qualified as anything else).
 *   2. `!canonicalAssessmentPresent` -> `INSUFFICIENT_CONTEXT` (nothing to
 *      qualify — there is no Oracle assessment snapshot at all).
 *   3. `!gradeQualifies` -> `INSUFFICIENT_CONTEXT` (a `NO_TRADE` grade
 *      means there is no trade idea to qualify).
 *   4. `negativeMemorySignalPresent` -> `CONFLICTED` (documented
 *      historical evidence conflicts with treating this assessment as
 *      trustworthy — outranks the two lesser concerns below).
 *   5. `!riskValid` -> `CAUTION` (structurally sound, graded assessment,
 *      but no valid risk plan).
 *   6. `cautionConstraintPresent` -> `CAUTION` (a `VALID`-validated
 *      adaptive constraint exists for this source).
 *   7. Otherwise -> `QUALIFIED` (every concern cleared).
 *
 * Exactly one status is ever returned; there is no fallthrough case that
 * silently defaults to `QUALIFIED`.
 */
function selectQualificationStatus(signals: QualificationSignals): QualificationStatus {
  if (!signals.sourceEligible) return "INSUFFICIENT_CONTEXT";
  if (!signals.canonicalAssessmentPresent) return "INSUFFICIENT_CONTEXT";
  if (!signals.gradeQualifies) return "INSUFFICIENT_CONTEXT";
  if (signals.negativeMemorySignalPresent) return "CONFLICTED";
  if (!signals.riskValid) return "CAUTION";
  if (signals.cautionConstraintPresent) return "CAUTION";
  return "QUALIFIED";
}

/**
 * Pure, deterministic, synchronous. The same `context` always produces a
 * byte-identical `AutonomousQualificationResult`. Never mutates `context`
 * or anything nested inside it (`context.canonical`/`cognitive`/`memory`/
 * `validConstraints` are only ever read, never written). Holds no state
 * across calls.
 *
 * `symbol`/`source`/`generatedAt` are carried forward verbatim from
 * `context` — never re-derived. `signals` are six independently computed
 * booleans; `status` is a deterministic function of `signals` alone (see
 * `selectQualificationStatus()`).
 *
 * Note that `context.cognitive` (Phase 8.0.5 Cognitive Decision Context)
 * is deliberately never read by this function or by `computeSignals()`.
 * This phase's scope is a downstream check of the canonical Oracle
 * assessment against Decision Memory and Learning Validation only — see
 * the task's own closed input list ("canonical Oracle assessment
 * snapshot, cognitive context if available, decision memory if
 * available, VALID constraint validations only"). `cognitive` remains
 * available on `context` for a later, separately-approved phase to
 * incorporate; reading it here without an approved signal definition
 * would risk inventing an undocumented seventh concern.
 */
export function qualifyAutonomousDecision(context: AutonomousDecisionContext): AutonomousQualificationResult {
  const signals = computeSignals(context);

  return {
    version: 1,
    symbol: context.symbol,
    source: context.source,
    generatedAt: context.generatedAt,
    status: selectQualificationStatus(signals),
    signals,
  };
}
