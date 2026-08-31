// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Evaluation Engine (Phase 8.1.1)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()`/timestamp generation (see contracts.ts —
// `evaluatedAt` is added by repository.ts, not here). Zero randomness.
// Zero imports from lib/ai/oracle/*, lib/ai/cognitive/*, lib/elvoid/*, or
// any trading-execution module — this file depends ONLY on the already-
// frozen `DecisionExperienceRecord` it's given (plus the plain string-
// union types re-exported from contracts.ts).
//
// This module does not infer causality ("X caused the loss") and does not
// look across multiple decisions — it evaluates exactly one
// DecisionExperienceRecord at a time, using only fields already frozen
// into it by Phase 8.1.0.
// ---------------------------------------------------------------------------

import type {
  DecisionExperienceRecord,
  DecisionQuality,
  MarketOutcome,
  EvaluationClass,
  ConfidenceAlignment,
  ContextAlignment,
  EvaluationEvidenceTag,
  DecisionEvaluationWithoutTimestamp,
} from "./contracts";

// ---------------------------------------------------------------------------
// Grade bucketing
//
// Two independent, non-interchangeable grade scales exist in this
// repository (see the Phase 8.1.1 audit): TradeGrade (C..A++, via
// GRADE_ORDER in lib/elvoid/types.ts) for AI_SIGNAL decisions, and
// OracleGrade (NO_TRADE..A+, via ORACLE_GRADE_ORDER in
// lib/ai/oracle/types.ts) for the live Oracle assessment. This module
// never imports either ordering array directly — the buckets below are
// hand-encoded as plain string checks to keep this file's dependency
// surface at zero runtime imports beyond ./contracts, matching "no
// external imports from trading execution".
// ---------------------------------------------------------------------------

type GradeBucket = "HIGH" | "MID" | "LOW" | "MISSING";

/** TradeGrade bucketing (AI_SIGNAL's persisted `ai_signals.trade_grade`). */
function bucketTradeGrade(grade: string | null): GradeBucket {
  if (grade === null) return "MISSING";
  if (grade === "A" || grade === "A+" || grade === "A++") return "HIGH";
  if (grade === "B" || grade === "B+") return "MID";
  if (grade === "C" || grade === "C+") return "LOW";
  return "MISSING";
}

/** OracleGrade bucketing (the live Oracle assessment's own grade scale, via `learningContext.grade`). */
function bucketOracleGrade(grade: string | null): GradeBucket {
  if (grade === null) return "MISSING";
  if (grade === "A" || grade === "A+") return "HIGH";
  if (grade === "B+") return "MID";
  if (grade === "NO_TRADE") return "LOW";
  return "MISSING";
}

/**
 * Resolves the single grade bucket to evaluate decision quality from.
 *
 * - ELVOID_PRO_ORACLE with a present `learningContext.grade`: bucket that
 *   value on the OracleGrade scale (the richer, live-assessment scale,
 *   which can distinguish NO_TRADE from B+).
 * - ELVOID_PRO_ORACLE with no context (`learningContext` null, or its
 *   `grade` null — a defensive-failure case): fall back to
 *   `experience.grade`, the persisted `oracle_grade` column, bucketed on
 *   the SAME OracleGrade scale (its values are a subset: only ever
 *   "B+"|"A"|"A+", since a NO_TRADE assessment is never executed/
 *   persisted — see lib/ai/oracle/execute.ts).
 * - AI_SIGNAL: always `experience.grade` (the persisted `trade_grade`),
 *   bucketed on the TradeGrade scale. `learningContext` is never
 *   consulted for this source (it is always null by architecture).
 */
function resolveGradeBucket(experience: DecisionExperienceRecord): GradeBucket {
  if (experience.source === "ELVOID_PRO_ORACLE") {
    const liveGrade = experience.learningContext?.grade ?? null;
    if (liveGrade !== null) return bucketOracleGrade(liveGrade);
    return bucketOracleGrade(experience.grade);
  }
  return bucketTradeGrade(experience.grade);
}

// ---------------------------------------------------------------------------
// Cognitive context consistency (ELVOID_PRO_ORACLE only, when present)
// ---------------------------------------------------------------------------

/**
 * "Consistent" per this phase's exact, literal specification: conflict
 * state is not CONFLICTED, and no hypothesis carries CHALLENGED or
 * REJECTED status. A `learningContext === null` (structurally expected
 * for AI_SIGNAL, and possible for a defensively-failed Oracle capture)
 * has no contradicting evidence to report, so it counts as vacuously
 * consistent — it must never be treated as "conflicting" merely because
 * it is absent.
 */
function hasConsistentContext(experience: DecisionExperienceRecord): boolean {
  const ctx = experience.learningContext;
  if (!ctx) return true;
  if (ctx.conflictState === "CONFLICTED") return false;
  if (ctx.hypotheses?.some((h) => h.status === "CHALLENGED" || h.status === "REJECTED")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Axis 1 — Decision Quality
// ---------------------------------------------------------------------------

/**
 * Deterministic, source-branching. Confidence is NEVER independently
 * weighted here for AI_SIGNAL (it is already one of the two inputs
 * `lib/elvoid/engine.ts` uses to derive `trade_grade` itself — weighting
 * it again would double-count the same evidence). For ELVOID_PRO_ORACLE,
 * confidence is likewise not used for this axis either — it contributes
 * only to `confidenceAlignment` (a separate, secondary structural field),
 * keeping this axis's rule identical and auditable across both sources:
 * grade bucket (+ cognitive consistency for HIGH, when context exists) is
 * the entire decision-quality rule.
 */
export function evaluateDecisionQuality(experience: DecisionExperienceRecord): DecisionQuality {
  const bucket = resolveGradeBucket(experience);

  if (bucket === "MISSING") return "UNKNOWN";
  if (bucket === "LOW") return "BAD";
  if (bucket === "MID") return "UNKNOWN"; // mid grade is inherently ambiguous — never forced to GOOD or BAD, regardless of context, per spec.

  // bucket === "HIGH"
  return hasConsistentContext(experience) ? "GOOD" : "UNKNOWN"; // high grade + conflicting context is ambiguous evidence, never automatically BAD.
}

// ---------------------------------------------------------------------------
// Axis 2 — Market Outcome
// ---------------------------------------------------------------------------

/**
 * Direct, verbatim mapping from `decision_experiences.outcome_result`
 * (itself a verbatim Phase 8.1.0 copy of the canonical `ai_journal.result`).
 * Never inspects `outcome.outcomeProfitPercent`/`outcomeRr` to override
 * this — `outcome_result` alone is authoritative for this axis.
 */
export function evaluateMarketOutcome(experience: DecisionExperienceRecord): MarketOutcome {
  const result = experience.outcome?.outcomeResult;
  if (result === "win") return "POSITIVE";
  if (result === "loss") return "NEGATIVE";
  if (result === "breakeven") return "NEUTRAL";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Evaluation class — combines the two axes
// ---------------------------------------------------------------------------

export function evaluateEvaluationClass(decisionQuality: DecisionQuality, marketOutcome: MarketOutcome): EvaluationClass {
  if (decisionQuality === "UNKNOWN" || marketOutcome === "UNKNOWN") return "INSUFFICIENT_EVIDENCE";
  if (marketOutcome === "NEUTRAL") return "NEUTRAL_OUTCOME"; // real, known evidence — never folded into INSUFFICIENT_EVIDENCE or forced into GOOD/BAD outcome.
  if (decisionQuality === "GOOD" && marketOutcome === "POSITIVE") return "GOOD_DECISION_GOOD_OUTCOME";
  if (decisionQuality === "GOOD" && marketOutcome === "NEGATIVE") return "GOOD_DECISION_BAD_OUTCOME";
  if (decisionQuality === "BAD" && marketOutcome === "POSITIVE") return "BAD_DECISION_GOOD_OUTCOME";
  return "BAD_DECISION_BAD_OUTCOME"; // decisionQuality === "BAD" && marketOutcome === "NEGATIVE"
}

// ---------------------------------------------------------------------------
// Alignment fields — structural comparison only, never causal
// ---------------------------------------------------------------------------

/**
 * Reuses the only canonical confidence thresholds that already exist
 * anywhere in this repository (`lib/elvoid/review.ts`: confidence < 55 on
 * a loss is flagged; confidence >= 70 on a win is praised) rather than
 * inventing new numbers. "Aligned" here means confidence's own bucket
 * agrees with the decision-quality verdict already reached above — a
 * purely internal-consistency check, not a claim about the outcome.
 */
export function evaluateConfidenceAlignment(experience: DecisionExperienceRecord, decisionQuality: DecisionQuality): ConfidenceAlignment {
  if (decisionQuality === "UNKNOWN") return "UNKNOWN";
  const confidence = experience.confidence;
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "UNKNOWN";
  if (confidence >= 70) return decisionQuality === "GOOD" ? "ALIGNED" : "MISALIGNED";
  if (confidence < 55) return decisionQuality === "BAD" ? "ALIGNED" : "MISALIGNED";
  return "UNKNOWN"; // mid-range confidence (55-69) is not decisive either way.
}

export function evaluateRiskAlignment(experience: DecisionExperienceRecord, decisionQuality: DecisionQuality): ContextAlignment {
  const riskOverall = experience.learningContext?.riskOverall ?? null;
  if (riskOverall === null) return "NOT_APPLICABLE";
  if (decisionQuality === "UNKNOWN") return "UNKNOWN";
  const highRisk = riskOverall === "HIGH";
  if (decisionQuality === "GOOD") return highRisk ? "MISALIGNED" : "ALIGNED";
  return highRisk ? "ALIGNED" : "MISALIGNED"; // decisionQuality === "BAD"
}

export function evaluateConflictAlignment(experience: DecisionExperienceRecord, decisionQuality: DecisionQuality): ContextAlignment {
  const conflictState = experience.learningContext?.conflictState ?? null;
  if (conflictState === null) return "NOT_APPLICABLE";
  if (decisionQuality === "UNKNOWN") return "UNKNOWN";
  if (conflictState === "CAUTIOUS" || conflictState === "INSUFFICIENT_CONTEXT") return "UNKNOWN"; // genuinely ambiguous states — never forced.
  const conflicted = conflictState === "CONFLICTED";
  if (decisionQuality === "GOOD") return conflicted ? "MISALIGNED" : "ALIGNED"; // conflictState === "CONSISTENT" here
  return conflicted ? "ALIGNED" : "MISALIGNED"; // decisionQuality === "BAD"
}

export function evaluateHypothesisAlignment(experience: DecisionExperienceRecord, decisionQuality: DecisionQuality): ContextAlignment {
  const hypotheses = experience.learningContext?.hypotheses ?? null;
  if (hypotheses === null) return "NOT_APPLICABLE";
  if (hypotheses.length === 0) return "UNKNOWN"; // no hypotheses recorded — nothing to compare.
  if (decisionQuality === "UNKNOWN") return "UNKNOWN";
  const hasChallengedOrRejected = hypotheses.some((h) => h.status === "CHALLENGED" || h.status === "REJECTED");
  if (decisionQuality === "GOOD") return hasChallengedOrRejected ? "MISALIGNED" : "ALIGNED";
  return hasChallengedOrRejected ? "ALIGNED" : "MISALIGNED"; // decisionQuality === "BAD"
}

// ---------------------------------------------------------------------------
// Evidence tags — closed, structural, non-causal
// ---------------------------------------------------------------------------

export function evaluateEvidence(experience: DecisionExperienceRecord): EvaluationEvidenceTag[] {
  const tags: EvaluationEvidenceTag[] = [];
  const bucket = resolveGradeBucket(experience);

  if (bucket === "HIGH") tags.push("HIGH_GRADE");
  else if (bucket === "MID") tags.push("MID_GRADE");
  else if (bucket === "LOW") tags.push("LOW_GRADE");
  else tags.push("MISSING_GRADE");

  if (typeof experience.confidence !== "number" || Number.isNaN(experience.confidence)) tags.push("MISSING_CONFIDENCE");

  const ctx = experience.learningContext;
  if (!ctx) {
    tags.push("NO_COGNITIVE_CONTEXT");
  } else {
    if (ctx.conflictState === "CONFLICTED") tags.push("CONFLICTED_STATE_PRESENT");
    else if (ctx.conflictState === "CAUTIOUS") tags.push("CAUTIOUS_STATE_PRESENT");
    else if (ctx.conflictState === "CONSISTENT") tags.push("CONSISTENT_STATE_PRESENT");
    else if (ctx.conflictState === "INSUFFICIENT_CONTEXT") tags.push("INSUFFICIENT_CONTEXT_STATE_PRESENT");

    if (ctx.hypotheses?.some((h) => h.status === "CHALLENGED")) tags.push("CHALLENGED_HYPOTHESIS_PRESENT");
    if (ctx.hypotheses?.some((h) => h.status === "REJECTED")) tags.push("REJECTED_HYPOTHESIS_PRESENT");
    if (ctx.hypotheses?.some((h) => h.status === "SUPPORTED")) tags.push("SUPPORTED_HYPOTHESIS_PRESENT");

    if (ctx.riskOverall === "HIGH") tags.push("HIGH_RISK_PRESENT");
    else if (ctx.riskOverall === "MODERATE") tags.push("MODERATE_RISK_PRESENT");
    else if (ctx.riskOverall === "LOW") tags.push("LOW_RISK_PRESENT");
  }

  if (!experience.outcome) tags.push("MISSING_OUTCOME");

  return tags;
}

// ---------------------------------------------------------------------------
// Top-level pure evaluator
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic, synchronous. Same input always produces
 * byte-identical output. No database, no network, no fetch, no
 * `Date.now()`/timestamp generation, no randomness, no LLM. Never
 * mutates `experience` or anything nested inside it.
 */
export function evaluateDecision(experience: DecisionExperienceRecord): DecisionEvaluationWithoutTimestamp {
  const decisionQuality = evaluateDecisionQuality(experience);
  const marketOutcome = evaluateMarketOutcome(experience);

  return {
    version: 1,
    sourceSignalId: experience.sourceSignalId,
    decisionQuality,
    marketOutcome,
    evaluationClass: evaluateEvaluationClass(decisionQuality, marketOutcome),
    confidenceAlignment: evaluateConfidenceAlignment(experience, decisionQuality),
    riskAlignment: evaluateRiskAlignment(experience, decisionQuality),
    conflictAlignment: evaluateConflictAlignment(experience, decisionQuality),
    hypothesisAlignment: evaluateHypothesisAlignment(experience, decisionQuality),
    evidence: evaluateEvidence(experience),
  };
}
