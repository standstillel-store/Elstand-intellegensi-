// ---------------------------------------------------------------------------
// ELVOID Intelligence — Versioned Learning Validation, persistence-aware
// adapters (Phase 8.6.6)
//
// Persistence-aware adapters ONLY — zero validation/regression logic
// lives here (validate.ts). Writes `evolution_validations` to the SAME
// isolated ELVOID Learning Database every other 8.1.x/8.6.x table lives
// in — a SEPARATE table from `evolution_candidates` (8.6.5's own table),
// linked by `candidate_id`, keeping the two phases' write-responsibility
// architecturally distinct even though both live in the same database.
//
// NOTE (Phase 8.6.5b): validationMode / counterfactualAvailable /
// missingCounterfactualInputs are NOT stored columns. They are constants
// of the split-history method and are re-attached on read. A
// NOT_APPLICABLE result is not persisted at all (see below).
//
// NOTE (matching every prior Phase 8 repository's own disclosure):
// nothing calls persistEvolutionValidation() automatically. Callable
// directly and from the read-only AI Performance route (compute-only
// there — this route never persists from a GET request).
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { normalizePersistedReplay } from "@/lib/ai/evolutionCandidate/replay";
import { COUNTERFACTUAL_AVAILABLE, COUNTERFACTUAL_MISSING_INPUTS, VALIDATION_MODE } from "@/lib/ai/evolutionCandidate/semantics";
import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { EvolutionValidation, EvolutionValidationWithoutTimestamp } from "./contracts";

export type PersistEvolutionValidationResult = { persisted: true } | { persisted: false; reason: "not_configured" | "error" | "not_persistable"; error?: string };

/** Recompute-and-upsert on `candidate_id` (unique) — one validation per candidate, refreshed on re-validation, never duplicated. */
export async function persistEvolutionValidation(validation: EvolutionValidationWithoutTimestamp): Promise<PersistEvolutionValidationResult> {
  // Phase 8.6.5b: NOT_APPLICABLE is computed and surfaced but NOT
  // persisted — the stored `result` CHECK constraint lists only the
  // original four values, and the candidate row this one references is
  // itself not persisted for a not-applicable gap category. This phase
  // adds no schema change; refusing here is explicit and auditable
  // rather than an opaque constraint error.
  if (validation.result === "NOT_APPLICABLE") {
    return { persisted: false, reason: "not_persistable", error: "NOT_APPLICABLE results are not persisted; the stored schema does not include this result value." };
  }

  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const row = {
    candidate_id: validation.candidateId,
    proposal_id: validation.proposalId,
    source: validation.source,
    symbol: validation.symbol,
    candidate_status: validation.candidateStatus,
    baseline_reference: validation.baselineReference,
    candidate_reference: validation.candidateReference,
    replay_dataset_reference: validation.replayDatasetReference,
    metrics_observed: validation.metricsObserved,
    regression_check: validation.regressionCheck,
    invariant_checks: validation.invariantChecks,
    result: validation.result,
    evidence: validation.evidence,
    limitations: validation.limitations,
  };

  const { error } = await learningDb.from("evolution_validations").upsert(row, { onConflict: "candidate_id" });
  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true };
}

/** Read-only listing for one (source, symbol) pair, most recent first. `null` only when the Learning DB is not configured. */
export async function listEvolutionValidations(source: DecisionSource, symbol: string): Promise<readonly EvolutionValidation[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("evolution_validations").select("*").eq("source", source).eq("symbol", symbol).order("validated_at", { ascending: false });
  if (error || !data) return [];

  return data.map(
    (row): EvolutionValidation => ({
      candidateId: row.candidate_id,
      proposalId: row.proposal_id,
      source: row.source,
      symbol: row.symbol,
      candidateStatus: row.candidate_status,
      baselineReference: row.baseline_reference,
      candidateReference: row.candidate_reference,
      replayDatasetReference: row.replay_dataset_reference,
      metricsObserved: normalizePersistedReplay(row.metrics_observed),
      regressionCheck: row.regression_check,
      invariantChecks: row.invariant_checks,
      result: row.result,
      // Not stored columns: constants of this phase's method (see
      // lib/ai/evolutionCandidate/semantics.ts), true of every row ever
      // written by the split-history validation.
      validationMode: VALIDATION_MODE,
      counterfactualAvailable: COUNTERFACTUAL_AVAILABLE,
      missingCounterfactualInputs: COUNTERFACTUAL_MISSING_INPUTS,
      evidence: row.evidence,
      limitations: row.limitations,
      validatedAt: row.validated_at,
    })
  );
}
