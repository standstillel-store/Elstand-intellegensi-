// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Qualification Engine (Phase 8.2.2)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` — every timestamp compared against (including
// the freshness check added in Phase 8.2.2.1) is either copied verbatim
// from the caller-supplied `context` (`context.generatedAt`) or already
// present on a `context.memory` row (`DecisionEvaluation.evaluatedAt`);
// never wall-clock-read internally, mirroring how `validatedAt`/
// `computedAt`/`evaluatedAt` are added by their respective repository
// layers, not by their pure `validate.ts`/`detect.ts`/`evaluate.ts`
// counterparts. Zero randomness. Zero imports from lib/ai/oracle/*,
// lib/ai/cognitive/*, lib/elvoid/*, or any trading-execution module — this
// file depends ONLY on the plain `AutonomousDecisionContext` it is given,
// two re-exported constants from `lib/ai/failurePatterns/detect.ts`
// (itself already zero-dependency on any of those paths — see that
// file's own header), and one type-only import of `DecisionEvaluation`
// from `lib/ai/decisionEvaluation/contracts.ts` (Phase 8.2.2.1 — erased
// at compile time, no runtime dependency, and the exact same type
// `context.memory.matchedEvaluations` already carries).
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

import { NEGATIVE_EVALUATION_CLASSES, POSITIVE_EVALUATION_CLASSES } from "@/lib/ai/failurePatterns/detect";
import type { AutonomousDecisionContext, AutonomousQualificationResult, NegativeMemoryEvaluation, NegativeMemoryState, QualificationSignals, QualificationStatus } from "./contracts";
import { NEGATIVE_MEMORY_DOMINANCE_SHARE_THRESHOLD, NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS, NEGATIVE_MEMORY_MIN_OCCURRENCE_COUNT, QUALIFIABLE_SOURCE } from "./contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure freshness check, mirroring `learningValidation/validate.ts`'s
 * `isWithinFreshnessWindow()` exactly: is `evaluatedAt` within
 * `NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS` of `generatedAt`?
 * `generatedAt` earlier than `evaluatedAt` (a context assembled at a
 * moment before the evaluation's own timestamp — not expected in
 * practice, but not itself invalid) is treated as within-window.
 */
function isWithinNegativeMemoryFreshnessWindow(evaluatedAt: string, generatedAt: string): boolean {
  const generatedAtMs = Date.parse(generatedAt);
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(evaluatedAtMs)) return false;
  const ageMs = generatedAtMs - evaluatedAtMs;
  if (ageMs <= 0) return true;
  return ageMs <= NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS * MS_PER_DAY;
}

/**
 * Deterministic, fail-closed, priority-ordered state selection — see
 * `NegativeMemoryState`'s own doc comment (contracts.ts) for the meaning
 * of each state. Exactly one state is ever returned.
 *
 *   1. `negativeCount === 0` -> `INSUFFICIENT_EVIDENCE` (nothing negative
 *      on record at all; never contributes to CONFLICTED).
 *   2. `freshNegativeCount === 0` -> `STALE_MEMORY` (negative evidence
 *      exists historically, but none of it is fresh).
 *   3. `freshNegativeCount < NEGATIVE_MEMORY_MIN_OCCURRENCE_COUNT` ->
 *      `FAMILIAR_NEGATIVE` (fresh negative evidence exists, but not yet
 *      enough of it).
 *   4. `freshPositiveCount > 0 && negativeShare < NEGATIVE_MEMORY_DOMINANCE_SHARE_THRESHOLD`
 *      -> `MIXED_EVIDENCE` (enough fresh negative evidence on its own,
 *      but meaningful fresh positive evidence is also present).
 *   5. Otherwise -> `CURRENT_NEGATIVE_EVIDENCE`.
 */
function selectNegativeMemoryState(negativeCount: number, freshNegativeCount: number, freshPositiveCount: number, negativeShare: number): NegativeMemoryState {
  if (negativeCount === 0) return "INSUFFICIENT_EVIDENCE";
  if (freshNegativeCount === 0) return "STALE_MEMORY";
  if (freshNegativeCount < NEGATIVE_MEMORY_MIN_OCCURRENCE_COUNT) return "FAMILIAR_NEGATIVE";
  if (freshPositiveCount > 0 && negativeShare < NEGATIVE_MEMORY_DOMINANCE_SHARE_THRESHOLD) return "MIXED_EVIDENCE";
  return "CURRENT_NEGATIVE_EVIDENCE";
}

/**
 * Pure, deterministic evaluation of `matchedEvaluations` alone — never
 * `matchedPatterns` (that remains a separate, already-thresholded
 * signal; see `computeSignals()` below). Replaces the old bare
 * "`.some(negative-class)`" existence check with the bounded,
 * sample-size- and freshness-aware, positive-evidence-aware read
 * documented on `NegativeMemoryEvaluation` (contracts.ts). The same
 * `(matchedEvaluations, generatedAt)` pair always produces byte-identical
 * output; never mutates `matchedEvaluations`.
 */
function evaluateRawMemoryEvidence(matchedEvaluations: readonly DecisionEvaluation[], generatedAt: string): Omit<NegativeMemoryEvaluation, "matchedPatternPresent"> {
  const negative = matchedEvaluations.filter((evaluation) => NEGATIVE_EVALUATION_CLASSES.includes(evaluation.evaluationClass));
  const positive = matchedEvaluations.filter((evaluation) => POSITIVE_EVALUATION_CLASSES.includes(evaluation.evaluationClass));
  const freshNegative = negative.filter((evaluation) => isWithinNegativeMemoryFreshnessWindow(evaluation.evaluatedAt, generatedAt));
  const freshPositive = positive.filter((evaluation) => isWithinNegativeMemoryFreshnessWindow(evaluation.evaluatedAt, generatedAt));

  const freshTotal = freshNegative.length + freshPositive.length;
  const negativeShare = freshTotal > 0 ? Math.round((freshNegative.length / freshTotal) * 10000) / 10000 : 0;

  return {
    state: selectNegativeMemoryState(negative.length, freshNegative.length, freshPositive.length, negativeShare),
    negativeCount: negative.length,
    freshNegativeCount: freshNegative.length,
    freshPositiveCount: freshPositive.length,
    negativeShare,
  };
}

/**
 * Phase 8.2.2.1 — the corrected replacement for the original bare
 * existence check. `context.memory === null` (a missing memory
 * retrieval — a valid, expected state, not itself evidence of conflict)
 * resolves to `INSUFFICIENT_EVIDENCE` with `matchedPatternPresent: false`
 * and all counts at `0`, the same "absence is not itself a signal"
 * treatment the original function always gave it.
 *
 * `matchedPatterns` is read exactly as before — a plain
 * `.length > 0` existence check, never re-filtered, re-ranked, or
 * re-thresholded here; Phase 8.1.2's own `MIN_OCCURRENCE_COUNT` and
 * temporal-spread rule already gated whether a pattern exists at all.
 */
function evaluateNegativeMemorySignal(context: AutonomousDecisionContext): NegativeMemoryEvaluation {
  if (context.memory === null) {
    return { state: "INSUFFICIENT_EVIDENCE", negativeCount: 0, freshNegativeCount: 0, freshPositiveCount: 0, negativeShare: 0, matchedPatternPresent: false };
  }

  const rawEvidence = evaluateRawMemoryEvidence(context.memory.matchedEvaluations, context.generatedAt);
  const matchedPatternPresent = context.memory.matchedPatterns.length > 0;

  return { ...rawEvidence, matchedPatternPresent };
}

/**
 * Computes the six closed, independently derived booleans this engine's
 * status decision is a pure function of. Each field reads a fixed set of
 * already-computed `context` fields and nothing else — no recomputation,
 * no re-derivation of any upstream value.
 *
 * `negativeMemorySignalPresent` keeps its original type (a plain
 * boolean) and its original meaning ("does documented historical
 * evidence, on its own, conflict with treating this assessment as
 * trustworthy"). Phase 8.2.2.1 changes only HOW it is computed: a
 * bounded, priority-ordered state (`evaluateNegativeMemorySignal()`,
 * above) instead of a bare `.some()` existence check. It is `true` iff
 * the already-thresholded `matchedPatterns` signal is present, or the
 * bounded raw-evaluation state reaches `CURRENT_NEGATIVE_EVIDENCE` — the
 * only state that state model was designed to independently justify
 * `CONFLICTED` (see `NegativeMemoryState`'s doc comment).
 */
function computeSignals(context: AutonomousDecisionContext, negativeMemory: NegativeMemoryEvaluation): QualificationSignals {
  const sourceEligible = context.source === QUALIFIABLE_SOURCE;
  const canonicalAssessmentPresent = context.canonical !== null;
  const gradeQualifies = canonicalAssessmentPresent && context.canonical!.grade !== "NO_TRADE";
  const riskValid = canonicalAssessmentPresent && context.canonical!.riskStatus === "valid";
  const negativeMemorySignalPresent = negativeMemory.matchedPatternPresent || negativeMemory.state === "CURRENT_NEGATIVE_EVIDENCE";
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
  const negativeMemory = evaluateNegativeMemorySignal(context);
  const signals = computeSignals(context, negativeMemory);

  return {
    version: 2,
    symbol: context.symbol,
    source: context.source,
    generatedAt: context.generatedAt,
    status: selectQualificationStatus(signals),
    signals,
    negativeMemory,
  };
}
