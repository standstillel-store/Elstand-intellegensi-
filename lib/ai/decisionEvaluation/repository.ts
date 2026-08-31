// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Evaluation Engine (Phase 8.1.1)
//
// Persistence-aware adapters ONLY — no domain/evaluation logic lives here
// (that's entirely in evaluate.ts's pure functions). This file:
//   - reads `decision_experiences` from the ELVOID Learning Database
//     (lib/ai/learning/db.ts) — the SAME isolated project Phase 8.1.0
//     already uses. Never reads Main Supabase, never falls back to it.
//   - writes `decision_evaluations` to that SAME Learning Database
//     project — idempotent insert on UNIQUE(source_signal_id), same
//     upsert(..., {ignoreDuplicates: true}) pattern
//     lib/ai/decisionOutcome/repository.ts already established.
//   - stamps `evaluatedAt` (the one field evaluate.ts intentionally never
//     generates) immediately before persistence.
//
// NOTE (explicit, per this task's scope): no automatic trigger is wired
// here. `evaluateAndPersistDecision()` exists and is independently
// testable/callable, but nothing in the trading lifecycle calls it yet —
// wiring a trigger is left to a future, separately-approved change,
// exactly mirroring how Phase 8.1.0's own outcome-capture trigger was
// deliberately staged as a separate task from its underlying pipeline.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { evaluateDecision } from "./evaluate";
import type { DecisionEvaluation, DecisionExperienceRecord } from "./contracts";

// ---------------------------------------------------------------------------
// Read: decision_experiences (Learning DB only)
// ---------------------------------------------------------------------------

/**
 * Reads a single `decision_experiences` row from the Learning DB and maps
 * it into a `DecisionExperienceRecord`. Read-only. Returns `null` if the
 * Learning DB isn't configured or the row doesn't exist — never throws,
 * never falls back to Main Supabase (there is nothing to fall back to:
 * `decision_experiences` exists only in the Learning DB).
 */
export async function getDecisionExperienceForEvaluation(sourceSignalId: string): Promise<DecisionExperienceRecord | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data } = await learningDb.from("decision_experiences").select("*").eq("source_signal_id", sourceSignalId).maybeSingle();
  if (!data) return null;

  return {
    source: data.source,
    sourceSignalId: data.source_signal_id,
    symbol: data.symbol,
    side: data.side,
    grade: data.grade,
    confidence: data.confidence,
    decisionTimestamp: data.decision_timestamp,
    learningContext: data.learning_context ?? null,
    id: data.id,
    createdAt: data.created_at,
    outcome:
      data.outcome_result === null || data.outcome_result === undefined
        ? null
        : {
            outcomeResult: data.outcome_result,
            outcomeRr: data.outcome_rr,
            outcomeProfitPercent: data.outcome_profit_percent,
            outcomeDurationMinutes: data.outcome_duration_minutes,
            outcomeClosedAt: data.outcome_closed_at,
          },
  };
}

// ---------------------------------------------------------------------------
// Write: decision_evaluations (Learning DB only, idempotent)
// ---------------------------------------------------------------------------

export type PersistDecisionEvaluationResult = { persisted: true; alreadyExisted: boolean } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Idempotent insert into `decision_evaluations` — `upsert(..., {onConflict:
 * "source_signal_id", ignoreDuplicates: true})`, the same atomic pattern
 * `lib/ai/decisionOutcome/repository.ts::persistDecisionExperience()`
 * already uses. A duplicate/repeated call for the same `sourceSignalId`
 * never creates a second row and never overwrites the first — evaluations
 * are append-only and, for this phase, exactly one per experience.
 */
export async function persistDecisionEvaluation(evaluation: DecisionEvaluation): Promise<PersistDecisionEvaluationResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("decision_evaluations")
    .upsert(
      {
        source_signal_id: evaluation.sourceSignalId,
        version: evaluation.version,
        decision_quality: evaluation.decisionQuality,
        market_outcome: evaluation.marketOutcome,
        evaluation_class: evaluation.evaluationClass,
        confidence_alignment: evaluation.confidenceAlignment,
        risk_alignment: evaluation.riskAlignment,
        conflict_alignment: evaluation.conflictAlignment,
        hypothesis_alignment: evaluation.hypothesisAlignment,
        evidence: evaluation.evidence,
        evaluated_at: evaluation.evaluatedAt,
      },
      { onConflict: "source_signal_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, alreadyExisted: data === null };
}

// ---------------------------------------------------------------------------
// Orchestration — composes the pure evaluator with the two adapters above.
// No evaluation logic lives here beyond calling evaluateDecision().
// ---------------------------------------------------------------------------

export type EvaluateAndPersistResult = PersistDecisionEvaluationResult | { persisted: false; reason: "experience_not_found" };

/**
 * Reads the experience, evaluates it (pure), stamps `evaluatedAt`, and
 * persists the result. Best-effort by construction: every failure mode
 * (Learning DB unconfigured, experience not found, a write error) resolves
 * to a typed, non-throwing result — this function never throws.
 *
 * Not called from anywhere yet in this phase (see the file header) —
 * callable directly today for manual/batch use, and ready for a future,
 * separately-approved automatic trigger.
 */
export async function evaluateAndPersistDecision(sourceSignalId: string): Promise<EvaluateAndPersistResult> {
  const experience = await getDecisionExperienceForEvaluation(sourceSignalId);
  if (!experience) return { persisted: false, reason: "experience_not_found" };

  const evaluation: DecisionEvaluation = {
    ...evaluateDecision(experience),
    evaluatedAt: new Date().toISOString(),
  };

  return persistDecisionEvaluation(evaluation);
}
