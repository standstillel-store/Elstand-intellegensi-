// ---------------------------------------------------------------------------
// ELVOID Intelligence — Learning Validation (Phase 8.1.5)
//
// Persistence-aware adapters ONLY — no validation logic lives here (that's
// entirely in validate.ts's pure `validateConstraint()`). This file:
//   - reads `adaptive_constraints` (Phase 8.1.4) from the ELVOID Learning
//     Database (lib/ai/learning/db.ts) — the SAME isolated project every
//     prior 8.1.x phase already uses. Never reads Main Supabase, never
//     falls back to it. Reads the already-generated constraint rows
//     straight from that table — this file never re-runs, loosens, or
//     re-derives the constraint-type selection logic that already
//     happened once, in lib/ai/adaptiveConstraint/generate.ts.
//   - writes `constraint_validations` to that SAME Learning Database
//     project — a full recompute-and-upsert on `UNIQUE(source,
//     evidence_tag)`, mirroring lib/ai/adaptiveConstraint/repository.ts's
//     own persistence model exactly: a later recompute (with a later
//     `asOf`, or against updated upstream constraints) is expected and
//     must safely overwrite the previous validation snapshot, never
//     accumulate/duplicate it. No append-only event semantics anywhere in
//     this file. Source isolation is preserved end-to-end: AI_SIGNAL and
//     ELVOID_PRO_ORACLE rows are read, validated, and upserted
//     independently and are never merged into a single group.
//
// AUTHORITY BOUNDARY (repeated from contracts.ts — enforced structurally
// here too): this file reads ONLY `adaptive_constraints` and writes ONLY
// `constraint_validations`. It performs no read or write of `ai_signals`,
// `OracleAssessment`, any canonical grade/confidence/score/riskStatus/
// entry/stopLoss/takeProfit field, execute.ts, paperTrader.ts, or any
// decision-lifecycle/autonomous-execution table — grep this file for any
// of those identifiers and you will find none.
//
// NOTE (explicit, per this task's scope): `recomputeConstraintValidations()`
// exists and is independently testable/callable, but NOTHING calls it
// automatically yet — no cron, no per-trade trigger, no lifecycle hook, no
// Oracle/grading/execute/paperTrader/API-route wiring. Building the future
// consumer that would actually READ `constraint_validations` to influence
// a decision remains a future, separately-approved Phase 8.2 (or later),
// exactly mirroring how `recomputeAdaptiveConstraints()` (8.1.4) was left
// uncalled until its own separately-approved wiring phase.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { validateConstraint } from "./validate";
import type { AdaptiveConstraint, ConstraintValidation, ConstraintValidationStatus } from "./contracts";

// ---------------------------------------------------------------------------
// Read: adaptive_constraints (Learning DB only)
// ---------------------------------------------------------------------------

/**
 * Reads the full current `adaptive_constraints` population and maps each
 * row into an `AdaptiveConstraint` — the exact shape
 * `lib/ai/adaptiveConstraint/repository.ts` persists, read back verbatim,
 * never re-derived. Read-only, whole-table scan by design — this phase's
 * validation is a full recomputation over every currently-stored
 * constraint, not an incremental/windowed one, mirroring
 * `getAdaptiveConstraintBasisCandidates()`'s own convention one layer up.
 *
 * Returns `null` if the Learning DB isn't configured (never falls back to
 * Main Supabase). Returns an empty array (never `null`) on a query error
 * or when the table is empty — a query error here is treated the same as
 * "no constraints available yet to validate", never thrown, matching
 * every other Learning DB read in this repo.
 */
export async function getValidationBasisConstraints(): Promise<readonly AdaptiveConstraint[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb
    .from("adaptive_constraints")
    .select("source, evidence_tag, version, constraint_type, occurrence_count, dominant_class_share, statistical_confidence, first_observed_at, last_observed_at, generated_at");

  if (error || !data) return [];

  return data.map(
    (row): AdaptiveConstraint => ({
      version: row.version,
      source: row.source,
      evidenceTag: row.evidence_tag,
      constraintType: row.constraint_type,
      basis: {
        occurrenceCount: row.occurrence_count,
        dominantClassShare: row.dominant_class_share,
        statisticalConfidence: row.statistical_confidence,
        firstObservedAt: row.first_observed_at,
        lastObservedAt: row.last_observed_at,
      },
      generatedAt: row.generated_at,
    })
  );
}

// ---------------------------------------------------------------------------
// Read: constraint_validations (Learning DB only) — Phase 8.2.9 addition
//
// The consumer boundary Phase 8.2.9 §8 requires: a future
// `AutonomousDecisionContext` must only ever see already-validated
// `constraint_validations` rows, filtered to `status === "VALID"` by
// `lib/ai/autonomous/context.ts::filterValidConstraints()` (unchanged,
// Phase 8.2.0) — never a direct read of `adaptive_constraints`. This
// function is the read half of that boundary: it returns the full,
// already-computed `ConstraintValidation` population for one source,
// straight off `constraint_validations`, never re-validating or
// re-deriving `status` a second time. Filtering to VALID-only remains
// `filterValidConstraints()`'s job, not this function's — this returns
// every status so a caller/dashboard can still see CAUTION/STALE/etc rows
// if it ever needs to (only the autonomous-context consumer boundary
// itself is required to narrow to VALID).
// ---------------------------------------------------------------------------

export async function getConstraintValidations(source: ConstraintValidation["source"]): Promise<readonly ConstraintValidation[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb
    .from("constraint_validations")
    .select(
      "source, evidence_tag, version, constraint_type, status, sample_size_adequate, within_freshness_window, structurally_consistent, overfit_risk_flag, occurrence_count, dominant_class_share, statistical_confidence, first_observed_at, last_observed_at, validated_at"
    )
    .eq("source", source);

  if (error || !data) return [];

  return data.map(
    (row): ConstraintValidation => ({
      version: row.version,
      source: row.source,
      evidenceTag: row.evidence_tag,
      constraintType: row.constraint_type,
      status: row.status,
      signals: {
        sampleSizeAdequate: row.sample_size_adequate,
        withinFreshnessWindow: row.within_freshness_window,
        structurallyConsistent: row.structurally_consistent,
        overfitRiskFlag: row.overfit_risk_flag,
      },
      basis: {
        occurrenceCount: row.occurrence_count,
        dominantClassShare: row.dominant_class_share,
        statisticalConfidence: row.statistical_confidence,
        firstObservedAt: row.first_observed_at,
        lastObservedAt: row.last_observed_at,
      },
      validatedAt: row.validated_at,
    })
  );
}

// ---------------------------------------------------------------------------
// Write: constraint_validations (Learning DB only, recompute-and-upsert)
// ---------------------------------------------------------------------------

export type PersistConstraintValidationsResult = { persisted: true; count: number } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Full recompute-and-upsert into `constraint_validations` on
 * `UNIQUE(source, evidence_tag)` — an existing snapshot for the same
 * group is safely overwritten with the freshly-computed validation (not
 * merged, not incremented); a new group creates a new row. Safe
 * specifically because `validateConstraint()` is pure and holds no state
 * across calls, exactly mirroring `persistAdaptiveConstraints()`'s own
 * reasoning in Phase 8.1.4. Source isolation is preserved by construction:
 * `constraint.source` is written verbatim per row, and the upsert key
 * includes it, so AI_SIGNAL and ELVOID_PRO_ORACLE rows for the same
 * `evidenceTag` are never collapsed into one.
 *
 * `validations.length === 0` (e.g. no constraint currently exists to
 * validate) is a valid, successful result — never treated as an error.
 */
export async function persistConstraintValidations(validations: readonly ConstraintValidation[]): Promise<PersistConstraintValidationsResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };
  if (validations.length === 0) return { persisted: true, count: 0 };

  const rows = validations.map((validation) => ({
    source: validation.source,
    evidence_tag: validation.evidenceTag,
    version: validation.version,
    constraint_type: validation.constraintType,
    status: validation.status satisfies ConstraintValidationStatus,
    sample_size_adequate: validation.signals.sampleSizeAdequate,
    within_freshness_window: validation.signals.withinFreshnessWindow,
    structurally_consistent: validation.signals.structurallyConsistent,
    overfit_risk_flag: validation.signals.overfitRiskFlag,
    occurrence_count: validation.basis.occurrenceCount,
    dominant_class_share: validation.basis.dominantClassShare,
    statistical_confidence: validation.basis.statisticalConfidence,
    first_observed_at: validation.basis.firstObservedAt,
    last_observed_at: validation.basis.lastObservedAt,
    validated_at: validation.validatedAt,
  }));

  const { error } = await learningDb.from("constraint_validations").upsert(rows, { onConflict: "source,evidence_tag" });

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, count: rows.length };
}

// ---------------------------------------------------------------------------
// Orchestration — composes the pure validator with the two adapters above.
// No validation logic lives here beyond calling validateConstraint() once
// per constraint. NOTHING in this file calls this function automatically —
// see file header.
// ---------------------------------------------------------------------------

/**
 * Reads every currently-stored `adaptive_constraints` row, runs the pure
 * validator against each with a single shared `asOf` for the whole batch,
 * stamps that same instant as `validatedAt`, and persists the result.
 * Best-effort by construction: every failure mode (Learning DB
 * unconfigured, a read/write error) resolves to a typed, non-throwing
 * result — this function never throws.
 *
 * Callable directly today for manual/batch use; not called automatically
 * from anywhere in this codebase (no cron, no lifecycle hook, no API
 * route, no Oracle/grading/execute/paperTrader wiring) — wiring an
 * automatic trigger, and building the future consumer that reads
 * `constraint_validations`, both remain future, separately-approved
 * changes.
 */
export async function recomputeConstraintValidations(): Promise<PersistConstraintValidationsResult> {
  const constraints = await getValidationBasisConstraints();
  if (constraints === null) return { persisted: false, reason: "not_configured" };

  const asOf = new Date().toISOString();
  const validations: ConstraintValidation[] = constraints.map((constraint) => ({ ...validateConstraint(constraint, asOf), validatedAt: asOf }));

  return persistConstraintValidations(validations);
}
