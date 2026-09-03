// ---------------------------------------------------------------------------
// ELVOID Intelligence — Adaptive Constraint Engine (Phase 8.1.4)
//
// Persistence-aware adapters ONLY — no generation logic lives here (that's
// entirely in generate.ts's pure `generateAdaptiveConstraints()`). This
// file:
//   - reads `failure_pattern_candidates` (Phase 8.1.2) from the ELVOID
//     Learning Database (lib/ai/learning/db.ts) — the SAME isolated
//     project every prior 8.1.x phase already uses. Never reads Main
//     Supabase, never falls back to it. Reads the already-validated
//     basis straight from that table — this file never re-runs, loosens,
//     or re-checks `MIN_OCCURRENCE_COUNT`/temporal-spread/confidence-cap
//     qualification; that already happened once, in
//     lib/ai/failurePatterns/detect.ts.
//   - writes `adaptive_constraints` to that SAME Learning Database
//     project — a full recompute-and-upsert on `UNIQUE(source,
//     evidence_tag)`, mirroring lib/ai/failurePatterns/repository.ts's
//     own persistence model exactly: a later recompute with more/updated
//     pattern data is expected and must safely overwrite the previous
//     advisory row, never accumulate/duplicate it. No append-only event
//     semantics anywhere in this file.
//
// AUTHORITY BOUNDARY (repeated from contracts.ts — enforced structurally
// here too): this file writes ONLY to `adaptive_constraints`. It performs
// no read or write of `ai_signals`, `OracleAssessment`, any canonical
// grade/confidence/score/riskStatus/entry/stopLoss/takeProfit field,
// execute.ts, paperTrader.ts, or any decision-lifecycle/autonomous-
// execution table — grep this file for any of those identifiers and you
// will find none.
//
// NOTE (explicit, per this task's scope): `recomputeAdaptiveConstraints()`
// exists and is independently testable/callable, but NOTHING calls it
// automatically yet — no cron, no per-trade trigger, no lifecycle hook.
// Wiring an automatic trigger, and building the future qualification
// consumer that would actually READ `adaptive_constraints` to influence a
// decision, are both left to a future, separately-approved Phase 8.1.5,
// exactly mirroring how `recomputeFailurePatterns()` (8.1.2) and
// `evaluateAndPersistDecision()` (8.1.1) were both left uncalled until
// their own separately-approved wiring phases.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { generateAdaptiveConstraints } from "./generate";
import type { AdaptiveConstraint, FailurePatternCandidate, AdaptiveConstraintType } from "./contracts";

// ---------------------------------------------------------------------------
// Read: failure_pattern_candidates (Learning DB only)
// ---------------------------------------------------------------------------

/**
 * Reads the full current `failure_pattern_candidates` population and maps
 * each row into a `FailurePatternCandidate` — the exact shape
 * `lib/ai/failurePatterns/repository.ts` persists, read back verbatim,
 * never re-derived. Read-only, whole-table scan by design — this phase's
 * generation is a full historical recomputation, not an
 * incremental/windowed one, mirroring `getFailurePatternObservations()`'s
 * own convention one layer up.
 *
 * Returns `null` if the Learning DB isn't configured (never falls back to
 * Main Supabase). Returns an empty array (never `null`) on a query error
 * or when the table is empty — a query error here is treated the same as
 * "no validated patterns available yet", never thrown, matching every
 * other Learning DB read in this repo.
 */
export async function getAdaptiveConstraintBasisCandidates(): Promise<readonly FailurePatternCandidate[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb
    .from("failure_pattern_candidates")
    .select("source, symbol, evidence_tag, version, dominant_evaluation_class, occurrence_count, dominant_class_share, confidence, first_observed_at, last_observed_at, computed_at");

  if (error || !data) return [];

  return data.map((row): FailurePatternCandidate => ({
    version: row.version,
    source: row.source,
    symbol: row.symbol,
    evidenceTag: row.evidence_tag,
    dominantEvaluationClass: row.dominant_evaluation_class,
    occurrenceCount: row.occurrence_count,
    dominantClassShare: row.dominant_class_share,
    confidence: row.confidence,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    computedAt: row.computed_at,
  }));
}

// ---------------------------------------------------------------------------
// Write: adaptive_constraints (Learning DB only, recompute-and-upsert)
// ---------------------------------------------------------------------------

export type PersistAdaptiveConstraintsResult = { persisted: true; count: number } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Full recompute-and-upsert into `adaptive_constraints` on
 * `UNIQUE(source, symbol, evidence_tag)` — an existing row for the same group is
 * safely overwritten with the freshly-generated advisory constraint (not
 * merged, not incremented); a new group creates a new row. Safe
 * specifically because `generateAdaptiveConstraints()` is pure and holds
 * no state across calls, exactly mirroring
 * `persistFailurePatternCandidates()`'s own reasoning in Phase 8.1.2.
 *
 * `constraints.length === 0` (e.g. no qualified pattern currently exists)
 * is a valid, successful result — never treated as an error.
 */
export async function persistAdaptiveConstraints(constraints: readonly AdaptiveConstraint[]): Promise<PersistAdaptiveConstraintsResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };
  if (constraints.length === 0) return { persisted: true, count: 0 };

  const rows = constraints.map((constraint) => ({
    source: constraint.source,
    symbol: constraint.symbol,
    evidence_tag: constraint.evidenceTag,
    version: constraint.version,
    constraint_type: constraint.constraintType satisfies AdaptiveConstraintType,
    occurrence_count: constraint.basis.occurrenceCount,
    dominant_class_share: constraint.basis.dominantClassShare,
    statistical_confidence: constraint.basis.statisticalConfidence,
    first_observed_at: constraint.basis.firstObservedAt,
    last_observed_at: constraint.basis.lastObservedAt,
    generated_at: constraint.generatedAt,
  }));

  const { error } = await learningDb.from("adaptive_constraints").upsert(rows, { onConflict: "source,symbol,evidence_tag" });

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, count: rows.length };
}

// ---------------------------------------------------------------------------
// Orchestration — composes the pure generator with the two adapters above.
// No generation logic lives here beyond calling
// generateAdaptiveConstraints(). NOTHING in this file calls this function
// automatically — see file header.
// ---------------------------------------------------------------------------

/**
 * Reads every currently-validated `failure_pattern_candidates` row, runs
 * the pure generator, stamps a single shared `generatedAt` on the whole
 * batch, and persists the result. Best-effort by construction: every
 * failure mode (Learning DB unconfigured, a read/write error) resolves to
 * a typed, non-throwing result — this function never throws.
 *
 * Callable directly today for manual/batch use; not called automatically
 * from anywhere in this codebase (no cron, no lifecycle hook, no API
 * route) — wiring an automatic trigger remains a future, separately-
 * approved change.
 */
export async function recomputeAdaptiveConstraints(): Promise<PersistAdaptiveConstraintsResult> {
  const candidates = await getAdaptiveConstraintBasisCandidates();
  if (candidates === null) return { persisted: false, reason: "not_configured" };

  const generatedAt = new Date().toISOString();
  const constraints: AdaptiveConstraint[] = generateAdaptiveConstraints(candidates).map((constraint) => ({ ...constraint, generatedAt }));

  return persistAdaptiveConstraints(constraints);
}
