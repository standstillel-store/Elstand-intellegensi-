// ---------------------------------------------------------------------------
// ELVOID Intelligence — Replay semantics constants (Phase 8.6.5b)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. Constants and one lookup function only — this
// file holds the FACTS about what the replay in this directory is and is
// not, so every consumer (evolutionValidation, the AI Performance panel,
// fixtures) reads one definition instead of re-stating it in prose.
//
// WHAT THIS FILE DOES NOT DO: it changes no decision behavior, adds no
// replay capability, and applies nothing. A counterfactual mode does not
// exist in this repository; `COUNTERFACTUAL_MISSING_INPUTS` records, with
// the place each absence was verified, why one cannot be built honestly
// today.
// ---------------------------------------------------------------------------

import type { GapCategory, MissingCounterfactualInput, ReplayApplicability, SampleExclusionReason, ValidationMode } from "./contracts";

export const VALIDATION_MODE: ValidationMode = "OBSERVATIONAL_SPLIT_HISTORY";

/** Always `false` in this phase — see `MissingCounterfactualInput`. Typed as the literal `false` so it cannot be flipped without editing the type. */
export const COUNTERFACTUAL_AVAILABLE = false as const;

/**
 * Inputs a true counterfactual re-execution would need and this
 * repository does not have. Fixed order. Each description states what is
 * absent and where that was checked; none makes a claim about what a
 * proposal would do.
 */
export const COUNTERFACTUAL_MISSING_INPUTS: readonly MissingCounterfactualInput[] = [
  {
    code: "PER_CYCLE_ORACLE_INPUT_NOT_PERSISTED",
    description: "The oracle/confluence input assembled at each cycle is not stored with the cycle: cognitive_trace.input keeps only interval, candleCount, currentPrice, sufficientHistory and insufficientReason.",
  },
  {
    code: "PER_CYCLE_DECISION_MEMORY_NOT_PERSISTED",
    description: "Decision memory as it stood at each cycle is not stored (MEMORY_NOT_PERSISTED_PER_CYCLE in lib/ai/cognitiveReplay); re-querying it now would return the current population, not the historical one.",
  },
  {
    code: "PER_CYCLE_DECISION_RULE_CONFIGURATION_NOT_PERSISTED",
    description: "The qualification, pre-entry and arbitration constants in force at each cycle are not stored with it; the runtime_events DECISION event carries only decision, rawDecision, side, dedupApplied, qualificationStatus and preEntryStatus.",
  },
  {
    code: "NON_EXECUTED_DECISION_OUTCOMES_NOT_TRACKED",
    description: "Market outcomes are recorded only for executed decisions (decision_experiences); WAIT and REJECT cycles have no recorded outcome, so a rule that would have changed one of them has no observed result to compare against.",
  },
  {
    code: "NO_ENGINE_FOR_MODIFIED_DECISION_LOGIC",
    description: "No component in this repository runs a hypothetical modified decision rule against historical inputs; lib/ai/cognitiveReplay only reconstructs cycles that were actually recorded.",
  },
];

/** Fixed order used by every `SampleAccounting.exclusionReasons`. */
export const SAMPLE_EXCLUSION_REASONS: readonly SampleExclusionReason[] = ["OPEN_NO_OUTCOME", "CLOSED_UNEVALUATED"];

const APPLICABLE: ReplayApplicability = { applicable: true, reason: null };

/**
 * Exhaustive over `GapCategory` on purpose: adding a category without
 * deciding whether the executed-only replay can measure it is a compile
 * error, not a silent default.
 *
 * The six categories detected over the executed/evaluated population are
 * measurable by the replay as documented in replay.ts (PATTERN_GAP is
 * narrowed there, and that narrowing is disclosed in every validation's
 * `limitations`). `REJECT_DOMINANCE_GAP` is defined over the full
 * observed decision population (EXECUTE, WAIT and REJECT cycles from
 * runtime_events); the replay reads decision_experiences joined with
 * decision_evaluations, which contains executed decisions only.
 */
const APPLICABILITY_BY_CATEGORY: Record<GapCategory, ReplayApplicability> = {
  CONTRADICTION_GAP: APPLICABLE,
  CONTEXT_GAP: APPLICABLE,
  REASONING_CONSISTENCY_GAP: APPLICABLE,
  CONFIDENCE_ALIGNMENT_GAP: APPLICABLE,
  EVIDENCE_GAP: APPLICABLE,
  PATTERN_GAP: APPLICABLE,
  REJECT_DOMINANCE_GAP: {
    applicable: false,
    reason:
      "REJECT_DOMINANCE_GAP is defined over the full observed decision population (EXECUTE, WAIT and REJECT cycles). Replay reads executed, evaluated decisions only, which cannot contain the WAIT and REJECT cycles this gap describes, so a split-history rate for it would be measured on the wrong population.",
  },
};

export function replayApplicabilityFor(gapCategory: GapCategory): ReplayApplicability {
  return APPLICABILITY_BY_CATEGORY[gapCategory];
}
