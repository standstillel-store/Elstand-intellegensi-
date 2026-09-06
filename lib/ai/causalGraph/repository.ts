// ---------------------------------------------------------------------------
// ELVOID Intelligence — Causal Graph repository (Phase 8.3.8)
//
// Read-only orchestration only — no lineage/proof logic lives here (that's
// entirely in derive.ts's pure functions). Reuses existing read paths
// verbatim, zero duplication:
//   - `getDecisionExperienceForEvaluation()` / `getDecisionEvaluationBySignalId()`
//     (decisionEvaluation/repository.ts) for a representative trade.
//   - `getDecisionMemoryPatterns()` (decisionMemory/repository.ts, full
//     `failure_pattern_candidates` read, filtered in-memory here rather
//     than re-queried) for the FailurePatternCandidate.
//   - `getAdaptiveConstraint()` (Phase 8.3.8 addition to
//     adaptiveConstraint/repository.ts) for the AdaptiveConstraint.
//   - `getConstraintValidations()` (learningValidation/repository.ts,
//     filtered in-memory by evidenceTag) for the ConstraintValidation.
//   - `queryDecisionMemory()` (decisionMemory/repository.ts) for the
//     Memory->Qualification->Decision chain.
//
// Every function degrades gracefully — never throws.
// ---------------------------------------------------------------------------

import { getDecisionExperienceForEvaluation, getDecisionEvaluationBySignalId } from "@/lib/ai/decisionEvaluation/repository";
import { getDecisionMemoryPatterns, queryDecisionMemory } from "@/lib/ai/decisionMemory/repository";
import { getAdaptiveConstraint } from "@/lib/ai/adaptiveConstraint/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { deriveLearningLineage, deriveMemoryInfluence } from "./derive";
import type { RepresentativeTrade } from "./derive";
import type { CausalChainResult, LearningLineageGroupKey } from "./contracts";

/**
 * Derives the proven/rejected Outcome -> Evaluation -> FailurePattern ->
 * Constraint -> Validation -> Qualification -> Decision chain for one
 * learning-loop group. `representativeSourceSignalId`, if supplied, must
 * be a `decision_experiences.source_signal_id` whose own evaluation is
 * expected to carry `key.evidenceTag` — used to prove the first two
 * (Outcome->Evaluation->FailurePattern) hops against a specific real row;
 * omit it to only check the group-level FailurePattern->Constraint->
 * Validation->Qualification->Decision hops (still fully evidence-backed,
 * just without a specific instance to point OUTCOME/EVALUATION at).
 */
export async function deriveLearningLineageForGroup(key: LearningLineageGroupKey, representativeSourceSignalId?: string): Promise<CausalChainResult> {
  const [patterns, constraint, validations, memory] = await Promise.all([getDecisionMemoryPatterns(), getAdaptiveConstraint(key.source, key.symbol, key.evidenceTag), getConstraintValidations(key.source, key.symbol), queryDecisionMemory({ source: key.source, symbol: key.symbol })]);

  const failurePattern = (patterns ?? []).find((p) => p.source === key.source && p.symbol === key.symbol && p.evidenceTag === key.evidenceTag) ?? null;
  // getConstraintValidations() returns null (not []) when the Learning DB
  // itself is unconfigured — never assumed to be an array without checking.
  const validation = (validations ?? []).find((v) => v.evidenceTag === key.evidenceTag) ?? null;

  let representative: RepresentativeTrade | undefined;
  if (representativeSourceSignalId) {
    const [experience, evaluation] = await Promise.all([getDecisionExperienceForEvaluation(representativeSourceSignalId), getDecisionEvaluationBySignalId(representativeSourceSignalId)]);
    if (experience) representative = { experience, evaluation };
  }

  return deriveLearningLineage({ key, representative, failurePattern, constraint, validation, memory });
}

/**
 * Derives the Memory -> Qualification -> Decision code-behavior chain for
 * one symbol's CURRENT `DecisionMemoryResult` — never a historical claim
 * (see derive.ts's own doc comment on `deriveMemoryInfluence()`).
 */
export async function deriveMemoryInfluenceForSymbol(source: LearningLineageGroupKey["source"], symbol: string): Promise<CausalChainResult> {
  const memory = await queryDecisionMemory({ source, symbol });
  return deriveMemoryInfluence(symbol, memory);
}
