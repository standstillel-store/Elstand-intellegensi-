// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Outcome Capture (Phase 8.1.0)
//
// Pure, deterministic functions only. Zero database/network/LLM calls.
// Zero mutation of any input. Zero timestamps generated here — every
// timestamp in the output is copied verbatim from an existing source.
//
// Two independent responsibilities kept in one file because both are pure
// transformations with no side effects (database access lives in
// repository.ts instead, per the "don't mix db + reasoning + normalization"
// instruction):
//   1. normalizeLearningContext(): CognitiveDecisionContext -> LearningContextSnapshot
//   2. buildDecisionExperienceInput() / buildDecisionExperienceOutcome():
//      AiSignal / AiJournalEntry -> DecisionExperience* contracts
// ---------------------------------------------------------------------------

import type { AiSignal, AiJournalEntry } from "@/lib/elvoid/types";
import type { CognitiveDecisionContext } from "@/lib/ai/cognitive/context";
import type { DecisionExperienceInput, DecisionExperienceOutcomePatch, DecisionSource, LearningContextSnapshot } from "./contracts";

// ---------------------------------------------------------------------------
// 1. Cognitive context normalization
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic, synchronous. Never recomputes hypotheses or
 * conflict — only copies/narrows already-computed values off the fields
 * `CognitiveDecisionContext` itself already carries (which are themselves
 * already-immutable Phase 8.0.1/8.0.3/8.0.4 outputs). Never mutates
 * `context` or anything nested inside it.
 *
 * `context === null` -> returns `null`. This is the valid, expected state
 * for every current AI_SIGNAL-sourced decision (and for any
 * ELVOID_PRO_ORACLE decision where a defensive upstream catch already
 * nulled out the context) — never fabricated into a fake context.
 */
export function normalizeLearningContext(context: CognitiveDecisionContext | null): LearningContextSnapshot | null {
  if (context === null) return null;

  return {
    version: 1,
    grade: context.observation.sourceAssessment.grade,
    confidence: context.observation.sourceAssessment.confidence,
    hypotheses: context.hypotheses ? context.hypotheses.hypotheses.map((h) => ({ status: h.status, uncertainty: h.uncertainty })) : null,
    conflictState: context.conflict ? context.conflict.state : null,
    riskOverall: context.risk ? context.risk.overall : null,
    riskContextQuality: context.risk ? context.risk.contextQuality : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Decision Experience assembly (Main DB row -> Learning DB row shape)
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic. Builds the frozen decision-time fields for a new
 * `decision_experiences` row from an already-persisted `AiSignal` (Main DB)
 * plus its already-normalized `LearningContextSnapshot` (or `null`).
 * Never mutates `signal`. Never invents a new identifier — `sourceSignalId`
 * is the existing `ai_signals.id`.
 */
export function buildDecisionExperienceInput(signal: AiSignal, learningContext: LearningContextSnapshot | null): DecisionExperienceInput {
  const source: DecisionSource = signal.source ?? "AI_SIGNAL";
  return {
    source,
    sourceSignalId: signal.id,
    symbol: signal.coin,
    side: signal.side,
    grade: source === "ELVOID_PRO_ORACLE" ? signal.oracle_grade ?? null : signal.trade_grade,
    confidence: signal.confidence,
    decisionTimestamp: signal.created_at,
    learningContext,
  };
}

/**
 * Pure, deterministic. Copies outcome fields verbatim from an already-
 * persisted `AiJournalEntry` (Main DB) — never recomputes rr/profit/
 * duration. Never mutates `journal`.
 */
export function buildDecisionExperienceOutcome(journal: AiJournalEntry): DecisionExperienceOutcomePatch {
  return {
    outcomeResult: journal.result,
    outcomeRr: journal.rr,
    outcomeProfitPercent: journal.profit_percent,
    outcomeDurationMinutes: journal.duration_minutes,
    outcomeClosedAt: journal.closed_at,
  };
}
