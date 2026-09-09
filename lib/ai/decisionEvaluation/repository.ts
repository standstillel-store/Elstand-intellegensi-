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
// NOTE: Phase 8.5 wires `evaluateAndPersistDecision()` to an automatic
// (but bounded, locked, scheduled) backlog-retry trigger — see
// lib/ai/autonomousRuntime/evaluationBacklog.ts. This was the
// "separately-approved change" this note used to defer; approved
// 2026-09 (see CHANGES.md) after measuring the actual gap: 106/146
// (72.6%) closed decision_experiences had never received an evaluation,
// not because of the automatic post-close INSUFFICIENT_EVIDENCE guard
// below (decisionLearning/lifecycle.ts) working as intended, but because
// nothing ever retried them afterward. `evaluateAndPersistDecision()`
// itself is completely unchanged — this file still introduces zero new
// evaluation semantics; the new module only decides WHICH already-closed,
// already-unevaluated experiences to call it for, on a schedule.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { evaluateDecision } from "./evaluate";
import type { DecisionEvaluation, DecisionExperienceRecord } from "./contracts";

// ---------------------------------------------------------------------------
// Read: decision_experiences (Learning DB only)
// ---------------------------------------------------------------------------

/**
 * Closed (outcome_result IS NOT NULL) decision_experiences with no
 * matching decision_evaluations row yet, oldest-first, capped at `limit`.
 * Read-only, two bounded queries (no unbounded full-table scan): fetch up
 * to `limit * 4` closed candidate ids, then filter out the ones that
 * already have an evaluation. Returns `[]` if the Learning DB isn't
 * configured — never throws.
 */
export async function getUnevaluatedClosedExperienceIds(limit: number): Promise<string[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  const { data: experiences } = await learningDb
    .from("decision_experiences")
    .select("source_signal_id")
    .not("outcome_result", "is", null)
    .order("decision_timestamp", { ascending: true })
    .limit(limit * 4);
  if (!experiences || experiences.length === 0) return [];

  const ids = experiences.map((e: { source_signal_id: string }) => e.source_signal_id);
  const { data: evaluated } = await learningDb.from("decision_evaluations").select("source_signal_id").in("source_signal_id", ids);
  const evaluatedSet = new Set((evaluated ?? []).map((e: { source_signal_id: string }) => e.source_signal_id));

  return ids.filter((id: string) => !evaluatedSet.has(id)).slice(0, limit);
}

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

/**
 * Phase 8.3.7 addition — read-only, single-row lookup of an already-persisted
 * `decision_evaluations` row by `source_signal_id` (== `paperTradeId` — see
 * `lib/ai/autonomousLearning/contracts.ts`'s own doc comment on that
 * identity). Added for Cognitive Replay's read-time OUTCOME/LEARNING
 * reconstruction (`lib/ai/cognitiveReplay/repository.ts`), which needs a
 * single evaluation row keyed by one signal id rather than
 * `getDecisionMemoryJoinedExperiences()`'s full-table scan. Same
 * conventions as `getDecisionExperienceForEvaluation()` above: read-only,
 * returns `null` (never throws) when the Learning DB is unconfigured or no
 * row matches.
 */
export async function getDecisionEvaluationBySignalId(sourceSignalId: string): Promise<DecisionEvaluation | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data } = await learningDb.from("decision_evaluations").select("*").eq("source_signal_id", sourceSignalId).maybeSingle();
  if (!data) return null;

  return {
    version: data.version,
    sourceSignalId: data.source_signal_id,
    decisionQuality: data.decision_quality,
    marketOutcome: data.market_outcome,
    evaluationClass: data.evaluation_class,
    confidenceAlignment: data.confidence_alignment,
    riskAlignment: data.risk_alignment,
    conflictAlignment: data.conflict_alignment,
    hypothesisAlignment: data.hypothesis_alignment,
    evidence: data.evidence ?? [],
    evaluatedAt: data.evaluated_at,
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
 * Always persists unconditionally, including an honest INSUFFICIENT_EVIDENCE
 * result — unlike decisionLearning/lifecycle.ts's automatic post-close path,
 * which skips persistence on INSUFFICIENT_EVIDENCE specifically to guard
 * against a race with in-flight outcome capture. That race cannot occur
 * here: every caller of this function (manual/historical use, and Phase
 * 8.5's lib/ai/autonomousRuntime/evaluationBacklog.ts) only ever selects
 * already-closed (outcome_result IS NOT NULL) experiences.
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
