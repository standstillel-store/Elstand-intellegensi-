// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Memory (Phase 8.1.3)
//
// Persistence-aware adapters ONLY — zero filtering/ranking logic lives
// here (that's entirely in retrieve.ts's pure `retrieveDecisionMemory()`).
// This file:
//   - reads `decision_experiences` + `decision_evaluations` +
//     `failure_pattern_candidates` from the ELVOID Learning Database
//     (lib/ai/learning/db.ts) — the SAME isolated project every prior
//     8.1.x phase already uses. Never reads Main Supabase, never falls
//     back to it.
//   - performs NO write/upsert/insert/update/delete of any kind, anywhere
//     in this file. Decision Memory is strictly read-only historical
//     retrieval infrastructure for a future, separately-approved Phase
//     8.1.4 Adaptive Constraint Engine.
//   - joins `decision_experiences` x `decision_evaluations` in-memory by
//     `source_signal_id` — the same join convention
//     lib/ai/failurePatterns/repository.ts already established for the
//     same two tables (no SQL foreign key exists between them; see
//     supabase/learning/schema.sql).
//   - reads the FULL current population of all three tables per call,
//     applying no source/symbol/side/evidence/since/limit filtering here
//     — those are query concerns handled entirely by retrieve.ts. Matches
//     Phase 8.1.2's own "full scan, filtering happens in the pure layer"
//     convention (`getFailurePatternObservations()`).
//   - reuses `failure_pattern_candidates` rows exactly as Phase 8.1.2
//     persisted them — no re-filtering by occurrence count, temporal
//     spread, or confidence happens here; that qualification already
//     happened once, in lib/ai/failurePatterns/detect.ts, before a row
//     ever reached this table.
//
// NOT wired anywhere yet (per Phase 8.1.3's explicit scope): no cron, no
// lifecycle trigger, no scanner/execution integration, no adaptive
// constraint application. `queryDecisionMemory()` exists and is
// independently testable/callable, exactly mirroring how
// `recomputeFailurePatterns()` (Phase 8.1.2) and
// `evaluateAndPersistDecision()` (Phase 8.1.1) were both left uncalled
// until a separately-approved wiring task.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { retrieveDecisionMemory } from "./retrieve";
import type { DecisionMemoryQuery, DecisionMemoryJoinedRow, DecisionMemoryResult, DecisionEvaluation, FailurePatternCandidate } from "./contracts";

// ---------------------------------------------------------------------------
// Read: decision_experiences x decision_evaluations, joined in-memory
// (Learning DB only, read-only, full scan)
// ---------------------------------------------------------------------------

/**
 * Reads every `decision_experiences` row together with its corresponding
 * `decision_evaluations` row (if any), joined in-memory by
 * `source_signal_id`. Read-only, whole-table scan by design — query-time
 * filtering (source/symbol/side/evidence/since/limit) is entirely
 * retrieve.ts's responsibility, never this function's.
 *
 * Returns `null` if the Learning DB isn't configured (never falls back to
 * Main Supabase — there is nothing to fall back to). Returns an empty
 * array (never `null`) on a `decision_experiences` query error or when it
 * is empty — a query error is treated the same as "no experiences
 * available yet", never thrown, matching every other Learning DB read in
 * this repo.
 *
 * An experience with no matching evaluation yields `evaluation: null` — a
 * valid, expected state (outcome not yet resolved, or an automatic
 * `INSUFFICIENT_EVIDENCE` result deliberately never persisted; see
 * decisionLearning/lifecycle.ts), never fabricated. An evaluation row
 * with no matching experience is skipped defensively (should not occur in
 * practice — `decision_evaluations` always originates from an existing
 * `decision_experiences` row — but never fabricated as a workaround); a
 * `decision_evaluations` query error degrades the SAME way, to "no
 * evaluations available yet" (every experience simply joins to
 * `evaluation: null`), never failing the whole read.
 */
export async function getDecisionMemoryJoinedExperiences(): Promise<readonly DecisionMemoryJoinedRow[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const [experiencesResult, evaluationsResult] = await Promise.all([learningDb.from("decision_experiences").select("*"), learningDb.from("decision_evaluations").select("*")]);

  if (experiencesResult.error || !experiencesResult.data) return [];

  const evaluationBySignalId = new Map<string, DecisionEvaluation>();
  if (!evaluationsResult.error && evaluationsResult.data) {
    for (const row of evaluationsResult.data) {
      evaluationBySignalId.set(row.source_signal_id, {
        version: row.version,
        sourceSignalId: row.source_signal_id,
        decisionQuality: row.decision_quality,
        marketOutcome: row.market_outcome,
        evaluationClass: row.evaluation_class,
        confidenceAlignment: row.confidence_alignment,
        riskAlignment: row.risk_alignment,
        conflictAlignment: row.conflict_alignment,
        hypothesisAlignment: row.hypothesis_alignment,
        evidence: row.evidence ?? [],
        evaluatedAt: row.evaluated_at,
      });
    }
  }

  // Iterating experiencesResult.data (never evaluationsResult.data) to
  // build the joined rows is what guarantees an orphaned decision_evaluations
  // row (one with no matching decision_experiences row) is never surfaced —
  // it simply never gets visited.
  return experiencesResult.data.map(
    (row): DecisionMemoryJoinedRow => ({
      experience: {
        id: row.id,
        source: row.source,
        sourceSignalId: row.source_signal_id,
        symbol: row.symbol,
        side: row.side,
        grade: row.grade,
        confidence: row.confidence,
        decisionTimestamp: row.decision_timestamp,
        learningContext: row.learning_context ?? null,
        createdAt: row.created_at,
        outcome:
          row.outcome_result === null || row.outcome_result === undefined
            ? null
            : {
                outcomeResult: row.outcome_result,
                outcomeRr: row.outcome_rr,
                outcomeProfitPercent: row.outcome_profit_percent,
                outcomeDurationMinutes: row.outcome_duration_minutes,
                outcomeClosedAt: row.outcome_closed_at,
              },
      },
      evaluation: evaluationBySignalId.get(row.source_signal_id) ?? null,
    })
  );
}

// ---------------------------------------------------------------------------
// Read: failure_pattern_candidates (Learning DB only, read-only, full scan)
// ---------------------------------------------------------------------------

/**
 * Reads every `failure_pattern_candidates` row exactly as Phase 8.1.2
 * persisted it — no field is recomputed, re-thresholded, or dropped here.
 *
 * Returns `null` if the Learning DB isn't configured. Returns an empty
 * array (never `null`) on a query error or when the table is empty.
 */
export async function getDecisionMemoryPatterns(): Promise<readonly FailurePatternCandidate[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("failure_pattern_candidates").select("*");
  if (error || !data) return [];

  return data.map(
    (row): FailurePatternCandidate => ({
      version: row.version,
      source: row.source,
      evidenceTag: row.evidence_tag,
      dominantEvaluationClass: row.dominant_evaluation_class,
      occurrenceCount: row.occurrence_count,
      dominantClassShare: row.dominant_class_share,
      confidence: row.confidence,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
      computedAt: row.computed_at,
    })
  );
}

// ---------------------------------------------------------------------------
// Orchestration — composes the two read adapters above with the pure
// retriever. No filtering/ranking logic lives here beyond calling
// retrieveDecisionMemory(). Zero write path.
// ---------------------------------------------------------------------------

/**
 * Reads the current Learning DB population (both reads above, in
 * parallel) and runs the pure retriever against it. Best-effort by
 * construction: an unconfigured Learning DB resolves to an empty, typed
 * `DecisionMemoryResult` (`{matchedExperiences: [], matchedEvaluations:
 * [], matchedPatterns: []}`) — this function never throws.
 *
 * Not called from anywhere yet (see this file's header) — callable
 * directly today, and ready for a future, separately-approved Phase 8.1.4
 * to consume. No cron, no lifecycle trigger, no scanner/execution
 * integration exists anywhere in this module.
 */
export async function queryDecisionMemory(query: DecisionMemoryQuery): Promise<DecisionMemoryResult> {
  const [joinedRows, patterns] = await Promise.all([getDecisionMemoryJoinedExperiences(), getDecisionMemoryPatterns()]);

  if (joinedRows === null || patterns === null) {
    return { matchedExperiences: [], matchedEvaluations: [], matchedPatterns: [] };
  }

  return retrieveDecisionMemory(query, joinedRows, patterns);
}
