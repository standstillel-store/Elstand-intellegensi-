// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Need Evaluator (Phase 8.6.3 Part B)
//
// ARCHITECTURE / AUTHORITY:
//   - A deterministic GATE, not a score. Answers exactly one question:
//     "is this observed gap strong enough to justify proposing an
//     improvement?" — never "what should the improvement be" (that is
//     8.6.4's Evolution Proposal Engine, and only when this gate returns
//     EVOLUTION_WARRANTED).
//   - Coverage-first: if `EvaluationCoverageReport.status ===
//     "INSUFFICIENT_DATA"` (8.6.1), the evaluator is conservative by
//     construction and returns INSUFFICIENT_EVIDENCE before even
//     inspecting gaps — per the Phase 8.6.3 brief's own "if evaluation
//     coverage is insufficient, the evaluator must be conservative".
//   - A single low/medium-severity gap category, on its own, is NEVER
//     enough for EVOLUTION_WARRANTED — every `CognitiveGap` already
//     requires >=MIN_OCCURRENCE_COUNT repeated occurrences (8.6.2), and
//     this gate additionally requires either HIGH severity or 2+
//     independently-active gap categories before warranting a proposal.
//     "A single bad outcome must never trigger evolution" is therefore
//     enforced twice over, not once.
//   - Checks whether an existing, VALIDATED (`ConstraintValidation.status
//     === "VALID"`) adaptive constraint already exists for this
//     (source, symbol) — if so, and no gap has reached HIGH severity,
//     the gate holds at MONITOR rather than proposing something the
//     learning pipeline (Phase 8.1.4/8.1.5) may already be addressing.
// ---------------------------------------------------------------------------

import type { DecisionSource, GapCategory, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";

export type { DecisionSource, GapCategory, CognitiveGap };

/**
 * NO_EVOLUTION_NEEDED — evaluated coverage is sufficient and zero gaps
 *   were detected.
 * INSUFFICIENT_EVIDENCE — evaluation coverage itself is insufficient
 *   (`EvaluationCoverageStatus === "INSUFFICIENT_DATA"`); gaps are not
 *   even inspected.
 * MONITOR — one or more gaps exist, but none has reached HIGH severity
 *   and either fewer than 2 categories are active, or an existing VALID
 *   constraint already addresses at least part of the evidence.
 * EVOLUTION_WARRANTED — at least one HIGH-severity gap, or 2+
 *   independently-active gap categories, with no existing VALID
 *   constraint already covering the (source, symbol) pair.
 */
export type EvolutionNeed = "NO_EVOLUTION_NEEDED" | "INSUFFICIENT_EVIDENCE" | "MONITOR" | "EVOLUTION_WARRANTED";

export interface EvolutionNeedAssessment {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly need: EvolutionNeed;
  /** The gaps this assessment actually considered — empty for NO_EVOLUTION_NEEDED and INSUFFICIENT_EVIDENCE. */
  readonly consideredGaps: readonly CognitiveGap[];
  readonly hasValidConstraint: boolean;
  /** Plain, deterministic statements only — never a causal claim, never LLM-generated. */
  readonly reasons: readonly string[];
}
