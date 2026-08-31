// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Evaluation Engine (Phase 8.1.1)
//
// ARCHITECTURE / AUTHORITY:
//   - `decision_experiences` (Phase 8.1.0, ELVOID Learning Database)
//     remains the sole source of historical decision + outcome snapshot
//     data. Nothing here duplicates, recomputes, or reinterprets its
//     fields — `DecisionEvaluation` stores only DERIVED interpretation,
//     referencing its source experience by `sourceSignalId` (the same
//     logical key `decision_experiences.source_signal_id` already uses,
//     itself a logical reference to `ai_signals.id`).
//   - `ai_journal.result` (Main DB) remains the canonical upstream outcome
//     authority; `decision_experiences.outcome_result` is its Learning DB
//     snapshot; this module reads only the snapshot, never Main DB.
//   - This module does NOT evaluate causality ("X caused the loss"), does
//     NOT detect patterns across multiple decisions, does NOT generate
//     adaptive constraints, and does NOT call an LLM. It classifies the
//     structural relationship between a decision's own canonical numbers
//     (grade/confidence/cognitive context, all copied verbatim into
//     `decision_experiences` by Phase 8.1.0) and its canonical outcome.
//   - Grade/confidence/outcome_result/symbol/side/source are intentionally
//     NOT duplicated here — a `DecisionEvaluation` is meaningless without
//     its `decision_experiences` row and is never meant to be read alone.
// ---------------------------------------------------------------------------

import type { DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";

// Re-exported so `evaluate.ts`/`repository.ts` (and fixtures) have a single
// import source for the experience shape they consume — this module does
// not define its own competing input type.
export type { DecisionExperienceRecord };

/**
 * Axis 1: was the DECISION itself structurally sound at decision time,
 * independent of what the market later did? Never inferred from outcome.
 * "UNKNOWN" is a first-class, honest result — not a fallback to avoid,
 * forcing GOOD/BAD when the evidence is genuinely ambiguous is exactly
 * the "hallucinated certainty" this phase must not produce.
 */
export type DecisionQuality = "GOOD" | "BAD" | "UNKNOWN";

/**
 * Axis 2: what the market actually did, read verbatim from the Learning
 * DB's outcome snapshot (`decision_experiences.outcome_result`, itself a
 * verbatim copy of `ai_journal.result`). Never inferred from profit
 * percentage or any other field — `outcome_result` alone is authoritative
 * for this axis.
 */
export type MarketOutcome = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "UNKNOWN";

/**
 * The combination of the two axes above. `NEUTRAL_OUTCOME` is
 * deliberately distinct from `INSUFFICIENT_EVIDENCE` — a breakeven trade
 * is real, known evidence (the decision quality IS known), not missing
 * evidence; collapsing it into `INSUFFICIENT_EVIDENCE` would misrepresent
 * a known-neutral result as an unknown one.
 */
export type EvaluationClass = "GOOD_DECISION_GOOD_OUTCOME" | "GOOD_DECISION_BAD_OUTCOME" | "BAD_DECISION_GOOD_OUTCOME" | "BAD_DECISION_BAD_OUTCOME" | "NEUTRAL_OUTCOME" | "INSUFFICIENT_EVIDENCE";

/** Structural comparison only — never a causal claim. See `ContextAlignment` for the `NOT_APPLICABLE` distinction used by every alignment field except this one (confidence always exists for both sources, so it is never "not applicable"). */
export type ConfidenceAlignment = "ALIGNED" | "MISALIGNED" | "UNKNOWN";

/**
 * `NOT_APPLICABLE` (not `null`, not `UNKNOWN`) is used specifically when
 * the underlying cognitive field structurally does not exist for this
 * decision's source (every `AI_SIGNAL` row, and any defensively-null
 * `ELVOID_PRO_ORACLE` row) — this is a different, more honest state than
 * `UNKNOWN`, which means "the field could exist but the evidence here is
 * ambiguous." Conflating the two would make `AI_SIGNAL` rows look like
 * ambiguous Oracle rows instead of a structurally different source.
 */
export type ContextAlignment = "ALIGNED" | "MISALIGNED" | "NOT_APPLICABLE" | "UNKNOWN";

/**
 * Closed, deterministic, structural evidence tags. Every member maps 1:1
 * to an existing repository enum member or an existing canonical grade
 * ordering — none are invented causal claims. A tag records "this
 * structural condition existed at decision time or in its outcome," never
 * "this condition caused the outcome."
 */
export type EvaluationEvidenceTag =
  // Grade (from TradeGrade via GRADE_ORDER, or OracleGrade via ORACLE_GRADE_ORDER — see evaluate.ts's bucketing)
  | "HIGH_GRADE"
  | "MID_GRADE"
  | "LOW_GRADE"
  | "MISSING_GRADE"
  // Cognitive coherence (from CognitiveCoherenceState, lib/ai/cognitive/conflict.ts)
  | "CONFLICTED_STATE_PRESENT"
  | "CAUTIOUS_STATE_PRESENT"
  | "CONSISTENT_STATE_PRESENT"
  | "INSUFFICIENT_CONTEXT_STATE_PRESENT"
  // Hypotheses (from HypothesisStatus, lib/ai/cognitive/hypothesis.ts)
  | "CHALLENGED_HYPOTHESIS_PRESENT"
  | "REJECTED_HYPOTHESIS_PRESENT"
  | "SUPPORTED_HYPOTHESIS_PRESENT"
  // Risk (from RiskSeverity, lib/ai/oracle/riskIntelligence.ts)
  | "HIGH_RISK_PRESENT"
  | "MODERATE_RISK_PRESENT"
  | "LOW_RISK_PRESENT"
  // Data availability
  | "NO_COGNITIVE_CONTEXT"
  | "MISSING_OUTCOME"
  | "MISSING_CONFIDENCE";

/**
 * The pure evaluator's output shape — deliberately WITHOUT `evaluatedAt`.
 * `evaluate.ts` must remain a pure function of its input; a timestamp is
 * added only by the repository/persistence layer (see contracts.ts's
 * sibling `DecisionEvaluation` below), exactly mirroring how `capture.ts`
 * never generates a timestamp itself in Phase 8.1.0.
 */
export interface DecisionEvaluationWithoutTimestamp {
  readonly version: 1;
  readonly sourceSignalId: string;
  readonly decisionQuality: DecisionQuality;
  readonly marketOutcome: MarketOutcome;
  readonly evaluationClass: EvaluationClass;
  readonly confidenceAlignment: ConfidenceAlignment;
  readonly riskAlignment: ContextAlignment;
  readonly conflictAlignment: ContextAlignment;
  readonly hypothesisAlignment: ContextAlignment;
  readonly evidence: readonly EvaluationEvidenceTag[];
}

/** The full, persisted shape — `evaluate.ts`'s pure output plus a repository-stamped `evaluatedAt`. This is what `persistDecisionEvaluation()` writes and what `decision_evaluations` rows represent. */
export interface DecisionEvaluation extends DecisionEvaluationWithoutTimestamp {
  readonly evaluatedAt: string;
}
