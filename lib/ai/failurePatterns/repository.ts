// ---------------------------------------------------------------------------
// ELVOID Intelligence — Failure Pattern Detection (Phase 8.1.2)
//
// Persistence-aware adapters ONLY — no detection/aggregation logic lives
// here (that's entirely in detect.ts's pure functions). This file:
//   - reads `decision_experiences` + `decision_evaluations` from the
//     ELVOID Learning Database (lib/ai/learning/db.ts) — the SAME
//     isolated project Phase 8.1.0/8.1.1 already use. Never reads Main
//     Supabase, never falls back to it. The two tables are joined
//     in-memory by `source_signal_id` (no SQL foreign key exists between
//     them — see supabase/learning/schema.sql's Phase 8.1.1 section for
//     why), matching the read-only, non-authoritative nature of this
//     phase.
//   - writes `failure_pattern_candidates` to that SAME Learning Database
//     project — a full recompute-and-upsert on `UNIQUE(source, symbol,
//     evidence_tag)`, deliberately NOT the `ignoreDuplicates: true`
//     idempotent-insert pattern `decision_evaluations` uses. Unlike a
//     per-decision evaluation, a failure-pattern candidate is AGGREGATE
//     STATE over the whole historical population for its group — a
//     later recompute with more data is expected and must safely
//     overwrite the previous aggregate, never accumulate/duplicate it.
//
// NOTE (explicit, per this task's scope): `recomputeFailurePatterns()`
// exists and is independently testable/callable, but nothing in the
// trading lifecycle calls it automatically yet — no cron, no per-trade
// trigger, no retry queue. Wiring an automatic trigger is left to a
// future, separately-approved change, exactly mirroring how Phase
// 8.1.1's `evaluateAndPersistDecision()` was deliberately left uncalled
// until Phase 8.1.1.1 explicitly wired it.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { detectFailurePatternCandidates } from "./detect";
import type { FailurePatternCandidate, FailurePatternObservationInput, FailurePatternSource } from "./contracts";

// ---------------------------------------------------------------------------
// Read: decision_experiences x decision_evaluations, joined in-memory
// (Learning DB only)
// ---------------------------------------------------------------------------

/**
 * Reads every `decision_evaluations` row together with its corresponding
 * `decision_experiences` row (for `source`/`decisionTimestamp`) and maps
 * the pair into a `FailurePatternObservationInput`. Read-only, whole-table
 * scan by design — this phase's detection is a full historical
 * recomputation, not an incremental/windowed one.
 *
 * Returns `null` if the Learning DB isn't configured (never falls back to
 * Main Supabase — there is nothing to fall back to; both source tables
 * exist only in the Learning DB). Returns an empty array (never `null`)
 * on a query error or when either table is empty — a query error here is
 * treated the same as "no observations available yet", never thrown,
 * matching every other Learning DB read in this repo.
 *
 * An evaluation row with no matching experience row is skipped
 * defensively (should not occur in practice — `decision_evaluations`
 * always originates from an existing `decision_experiences` row — but
 * never fabricated as a workaround).
 */
export async function getFailurePatternObservations(): Promise<readonly FailurePatternObservationInput[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const [experiencesResult, evaluationsResult] = await Promise.all([
    learningDb.from("decision_experiences").select("source_signal_id, source, symbol, decision_timestamp"),
    learningDb.from("decision_evaluations").select("source_signal_id, evaluation_class, evidence"),
  ]);

  if (experiencesResult.error || !experiencesResult.data || evaluationsResult.error || !evaluationsResult.data) return [];

  const experienceBySignalId = new Map<string, { source: FailurePatternSource; symbol: string; decisionTimestamp: string }>();
  for (const row of experiencesResult.data) {
    experienceBySignalId.set(row.source_signal_id, { source: row.source, symbol: row.symbol, decisionTimestamp: row.decision_timestamp });
  }

  const observations: FailurePatternObservationInput[] = [];
  for (const row of evaluationsResult.data) {
    const experience = experienceBySignalId.get(row.source_signal_id);
    if (!experience) continue; // orphaned evaluation row — skipped defensively, see doc comment above.

    observations.push({
      source: experience.source,
      symbol: experience.symbol,
      sourceSignalId: row.source_signal_id,
      evaluationClass: row.evaluation_class,
      evidenceTags: row.evidence ?? [],
      decisionTimestamp: experience.decisionTimestamp,
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Write: failure_pattern_candidates (Learning DB only, recompute-and-upsert)
// ---------------------------------------------------------------------------

export type PersistFailurePatternCandidatesResult = { persisted: true; count: number } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Full recompute-and-upsert into `failure_pattern_candidates` on
 * `UNIQUE(source, symbol, evidence_tag)` — an existing row for the same group is
 * safely overwritten with the freshly-computed aggregate (not merged,
 * not incremented); a new group creates a new row. This is safe
 * specifically because `detectFailurePatternCandidates()` is pure and
 * holds no state across calls — every candidate it returns is already the
 * complete, correct aggregate for the input it was given, so overwriting
 * is always correct, never a partial/stale merge.
 *
 * `candidates.length === 0` (e.g. no group currently qualifies) is a
 * valid, successful result — never treated as an error, matching how an
 * honest "nothing to report yet" is a legitimate outcome in Phase 8.1.0's
 * `learningContext: null` convention.
 */
export async function persistFailurePatternCandidates(candidates: readonly FailurePatternCandidate[]): Promise<PersistFailurePatternCandidatesResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };
  if (candidates.length === 0) return { persisted: true, count: 0 };

  const rows = candidates.map((candidate) => ({
    source: candidate.source,
    symbol: candidate.symbol,
    evidence_tag: candidate.evidenceTag,
    version: candidate.version,
    dominant_evaluation_class: candidate.dominantEvaluationClass,
    occurrence_count: candidate.occurrenceCount,
    dominant_class_share: candidate.dominantClassShare,
    confidence: candidate.confidence,
    first_observed_at: candidate.firstObservedAt,
    last_observed_at: candidate.lastObservedAt,
    computed_at: candidate.computedAt,
  }));

  const { error } = await learningDb.from("failure_pattern_candidates").upsert(rows, { onConflict: "source,symbol,evidence_tag" });

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, count: rows.length };
}

// ---------------------------------------------------------------------------
// Orchestration — composes the pure detector with the two adapters above.
// No detection/aggregation logic lives here beyond calling
// detectFailurePatternCandidates().
// ---------------------------------------------------------------------------

/**
 * Reads every qualifying observation, runs the pure detector, stamps a
 * single shared `computedAt` on the whole batch, and persists the result.
 * Best-effort by construction: every failure mode (Learning DB
 * unconfigured, a read/write error) resolves to a typed, non-throwing
 * result — this function never throws.
 *
 * Not called automatically from anywhere yet (see the file header) —
 * callable directly today for manual/batch use, and ready for a future,
 * separately-approved automatic trigger (e.g. a scheduled recompute).
 */
export async function recomputeFailurePatterns(): Promise<PersistFailurePatternCandidatesResult> {
  const observations = await getFailurePatternObservations();
  if (observations === null) return { persisted: false, reason: "not_configured" };

  const computedAt = new Date().toISOString();
  const candidates: FailurePatternCandidate[] = detectFailurePatternCandidates(observations).map((candidate) => ({ ...candidate, computedAt }));

  return persistFailurePatternCandidates(candidates);
}
