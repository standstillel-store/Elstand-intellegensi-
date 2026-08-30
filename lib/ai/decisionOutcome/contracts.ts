// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Outcome Capture (Phase 8.1.0)
//
// ARCHITECTURE / AUTHORITY:
//   - Main Supabase (lib/supabase.ts) remains the sole canonical authority
//     for `ai_signals` (decision/action) and `ai_journal` (outcome). Nothing
//     here duplicates, recomputes, or reinterprets those tables' fields.
//   - The ELVOID Learning Database (lib/ai/learning/db.ts, a SEPARATE
//     Supabase project) stores `decision_experiences` — a learning
//     PROJECTION, never a trading authority. See supabase/learning/schema.sql.
//   - `LearningContextSnapshot` is a small, flat, frozen, versioned copy of
//     already-computed Phase 8.0 Cognitive Layer output (grade/confidence/
//     hypothesis statuses/conflict state/risk severity) — never a live
//     reference, never the raw nested CognitiveDecisionContext, never
//     evidence arrays or internal conflict factors. It is `null` whenever
//     the originating decision has no Cognitive Layer context (true for
//     every current AI_SIGNAL-sourced decision) — this is valid, not an
//     error, and must never be fabricated.
//   - This module does not evaluate, score, or judge a decision. No
//     win/loss scoring, no correctness scoring, no failure-cause
//     detection, no pattern detection. Those are explicitly out of scope
//     until Phase 8.1.1+.
// ---------------------------------------------------------------------------

import type { AiSignal, AiJournalEntry, SignalSide, TradeGrade } from "@/lib/elvoid/types";
import type { HypothesisStatus, HypothesisUncertainty } from "@/lib/ai/cognitive/hypothesis";
import type { CognitiveCoherenceState } from "@/lib/ai/cognitive/conflict";
import type { RiskSeverity, RiskContextQuality } from "@/lib/ai/oracle/riskIntelligence";
import type { OracleGrade } from "@/lib/ai/oracle/types";

/**
 * Reused directly from the Main DB's own `AiSignal.source` discriminator —
 * no duplicate/incompatible enum. Absent/undefined on a row means normal
 * AI Signal, exactly as `AiSignal.source`'s own doc comment already states.
 */
export type DecisionSource = NonNullable<AiSignal["source"]>;

/**
 * A small, flat, frozen, versioned copy of already-computed Phase 8.0.5
 * `CognitiveDecisionContext` output — produced by
 * `normalizeLearningContext()` (capture.ts), never hand-built elsewhere.
 *
 * Deliberately excludes (see the Phase 8.0.5 integration audit for the
 * full reasoning): `CognitiveObservation` in full, `CognitiveWorkingMemory`,
 * `CognitiveHypothesis.statement`/`supportingEvidence`/`opposingEvidence`,
 * `CognitiveConflictState.reasons`/`contributingFactors`, any raw market
 * payload, any LLM output. Only status/severity-level fields cross this
 * boundary — never free text, never evidence arrays, never internal
 * factors.
 */
export interface LearningContextSnapshot {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  /**
   * `OracleAssessment.grade` (via `CognitiveObservation.sourceAssessment.grade`)
   * — the Oracle/Cognitive-side grade scale, which includes `"NO_TRADE"`.
   * This is a DIFFERENT scale from `DecisionExperienceInput.grade` below
   * (the persisted `ai_signals.trade_grade`/`oracle_grade` column) — the two
   * scales are never merged into one type, matching execute.ts's own
   * explicit "the two scales must stay separate" rule.
   */
  readonly grade: OracleGrade | null;
  readonly confidence: number;
  readonly hypotheses: readonly {
    readonly status: HypothesisStatus;
    readonly uncertainty: HypothesisUncertainty;
  }[] | null;
  readonly conflictState: CognitiveCoherenceState | null;
  readonly riskOverall: RiskSeverity | null;
  readonly riskContextQuality: RiskContextQuality | null;
}

/**
 * The frozen decision-time fields written to `decision_experiences` exactly
 * once, at insert time. Never updated afterward — see
 * `DecisionExperienceOutcomePatch` for the one allowed later write.
 */
export interface DecisionExperienceInput {
  readonly source: DecisionSource;
  /** = the Main DB's `ai_signals.id` — the existing stable identifier, not a new one (see schema comment). */
  readonly sourceSignalId: string;
  readonly symbol: string;
  readonly side: SignalSide;
  /** = `ai_signals.trade_grade` (AI_SIGNAL source) or `ai_signals.oracle_grade` (ELVOID_PRO_ORACLE source) — whichever the row actually populates. Both are string-compatible with `TradeGrade`; this is the persisted-row grade, a separate concept from `LearningContextSnapshot.grade` above (the live Oracle assessment's own `OracleGrade` scale). */
  readonly grade: TradeGrade | null;
  readonly confidence: number;
  readonly decisionTimestamp: string;
  readonly learningContext: LearningContextSnapshot | null;
}

/**
 * The outcome fields written AT MOST ONCE, later, via a conditional
 * UPDATE ... WHERE outcome_result IS NULL (see repository.ts) — never a
 * second write, never a recomputation. Copied verbatim from `AiJournalEntry`.
 */
export interface DecisionExperienceOutcomePatch {
  readonly outcomeResult: AiJournalEntry["result"];
  readonly outcomeRr: number;
  readonly outcomeProfitPercent: number;
  readonly outcomeDurationMinutes: number | null;
  readonly outcomeClosedAt: string;
}

/** The full row shape as stored in / read from `decision_experiences`. */
export interface DecisionExperienceRecord extends DecisionExperienceInput {
  readonly id: string;
  readonly outcome: DecisionExperienceOutcomePatch | null;
  readonly createdAt: string;
}
