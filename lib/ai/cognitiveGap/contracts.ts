// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Gap Detector + Familiarity (Phase 8.6.2)
//
// ARCHITECTURE / AUTHORITY:
//   - Read-only, observational. Reuses 8.6.1's `classifyNovelty()` for
//     familiarity verbatim — does NOT introduce a second memory/novelty
//     system. Reuses `decision_evaluations.evidence` (`EvaluationEvidenceTag`,
//     Phase 8.1.1) as the SOLE evidence source for gap detection — every
//     tag here already exists and is already computed deterministically
//     by `decisionEvaluation/evaluate.ts`; this module counts tag
//     FREQUENCY across a population, it never re-derives what a tag means.
//   - `detectCognitiveGaps()`/`detect.ts` COVERS 6 CATEGORIES, NOT THE 7
//     THE PHASE 8.6.2 BRIEF ORIGINALLY SUGGESTED: `MEMORY_GAP` is NOT
//     implemented there. The only available "familiarity" signal is
//     `classifyNovelty()`'s CURRENT, single-cycle retrieval read — there
//     is no persisted historical novelty trail (see
//     `HISTORICAL_NOVELTY_AT_DECISION_TIME` in
//     lib/ai/noveltyDetection/contracts.ts). Every other gap category
//     requires >=MIN_OCCURRENCE_COUNT REPEATED occurrences before it is
//     even raised; a single current novelty read can never honestly meet
//     that bar. Rather than fabricate a "repeated novelty" claim this
//     repository cannot support, familiarity is reported as its own
//     field (`FamiliarityEvidence`) — real, evidence-backed context for
//     the Evolution Need Evaluator (8.6.3) — and simply never becomes a
//     `CognitiveGap` of its own. This is the Phase 8.6.2 brief's own
//     "if the repository cannot support a category, do not create it
//     merely for completeness" instruction, applied honestly. (A
//     genuinely different 7th category, `REJECT_DOMINANCE_GAP`, WAS
//     added in Phase 8.6 P1 — its evidence source and reasoning are
//     entirely different from the rejected `MEMORY_GAP`; see
//     `GapCategory`'s own doc comment below and
//     `detectPopulationGap.ts`.)
//   - Every gap requires >=MIN_OCCURRENCE_COUNT (reused unchanged from
//     lib/ai/failurePatterns/detect.ts, never redefined) occurrences
//     before it is raised at all — "the last trade lost" can never
//     become a gap on its own. See detect.ts for the full per-category
//     evidence source and the severity model.
//   - Source isolation and symbol isolation apply identically to every
//     prior 8.1.x/8.3.x/8.6.1 module: every `CognitiveGap` and every
//     `CognitiveGapReport` is scoped to exactly one (source, symbol).
//   - Observational only — nothing here is read by qualification,
//     arbitration, execution, or risk.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { EvaluationEvidenceTag } from "@/lib/ai/decisionEvaluation/contracts";
import type { NoveltyAssessment, DecisionMemoryResult } from "@/lib/ai/noveltyDetection/contracts";

// Re-exported so familiarity.ts/detect.ts/repository.ts (and fixtures)
// have a single import source for the shapes they consume.
export type { DecisionSource, EvaluationEvidenceTag, NoveltyAssessment, DecisionMemoryResult };

/**
 * Deliberately 6, not the 7 the Phase 8.6.2 brief suggested — see this
 * file's header for why `MEMORY_GAP` is not implemented.
 *   - CONTRADICTION_GAP — repeated `CONFLICTED_STATE_PRESENT` evidence.
 *   - CONTEXT_GAP — repeated `INSUFFICIENT_CONTEXT_STATE_PRESENT` /
 *     `NO_COGNITIVE_CONTEXT` evidence.
 *   - REASONING_CONSISTENCY_GAP — repeated `REJECTED_HYPOTHESIS_PRESENT` /
 *     `CHALLENGED_HYPOTHESIS_PRESENT` evidence.
 *   - CONFIDENCE_ALIGNMENT_GAP — repeated `confidenceAlignment ===
 *     "MISALIGNED"` (a top-level `DecisionEvaluation` field, not a tag).
 *   - EVIDENCE_GAP — repeated `CAUTIOUS_STATE_PRESENT` evidence: relevant
 *     evidence/context existed, yet the cycle did not resolve to a clean
 *     (`CONSISTENT`) coherence state.
 *   - PATTERN_GAP — repeated negative evaluation classes
 *     (`NEGATIVE_EVALUATION_CLASSES`, reused from
 *     lib/ai/failurePatterns/detect.ts), and/or an already-qualified
 *     failure pattern (`matchedPatterns.length > 0`), and/or a
 *     non-`VALID` `constraint_validations` row for this source/symbol.
 *
 * A 7th category, `REJECT_DOMINANCE_GAP`, was added in Phase 8.6 P1 —
 * see `lib/ai/cognitiveGap/detectPopulationGap.ts`. It is deliberately
 * NOT detected by `detectCognitiveGaps()`/`detect.ts` above (that
 * function, and its `DecisionMemoryJoinedRow[]` input, are unchanged by
 * P1) and is deliberately NOT included in `CognitiveGapReport.gaps`
 * below — it is reported in its own, separate `populationGaps` field.
 * This keeps `gaps`' existing meaning (evidence drawn from the
 * EXECUTE/evaluated population only) exactly what every prior consumer
 * (`lib/ai/reasoningGap`, `lib/ai/evolutionNeed`) already assumes it to
 * be, so `REJECT_DOMINANCE_GAP` existing at all changes nothing about
 * their existing, unchanged behavior — see `detectPopulationGap.ts`'s
 * own header for the full reasoning.
 */
export type GapCategory = "CONTRADICTION_GAP" | "CONTEXT_GAP" | "REASONING_CONSISTENCY_GAP" | "CONFIDENCE_ALIGNMENT_GAP" | "EVIDENCE_GAP" | "PATTERN_GAP" | "REJECT_DOMINANCE_GAP";

/**
 * LOW/MEDIUM/HIGH, deterministic from two existing conventions only —
 * see detect.ts's own header for the exact reasoning (this is the one
 * place in 8.6.2-8.6.4 that required an original, documented judgment
 * call rather than pure reuse, since no prior module computes a gap
 * "severity"; flagged honestly rather than presented as an established
 * convention it is not):
 *   - occurrenceCount >= CONFIDENCE_SAMPLE_CAP (30, reused from
 *     failurePatterns/detect.ts) -> always HIGH.
 *   - otherwise, HIGH if 2+ OTHER gap categories are also active for the
 *     same (source, symbol) this call; MEDIUM if exactly 1 other
 *     category is also active; LOW if this is the only active category.
 */
export type GapSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface CognitiveGapEvidence {
  /** How many evaluated decisions (or constraint_validations / matchedPatterns, depending on category — see `reasons`) actually support this gap. Always >= MIN_OCCURRENCE_COUNT — that is the gate for a gap to exist at all. */
  readonly occurrenceCount: number;
  /** Denominator this gap was assessed against — `SelfPerformanceAggregate.totalEvaluated` for the same (source, symbol), i.e. how many evaluated decisions the occurrenceCount above is a fraction of. */
  readonly evaluatedCount: number;
  /** The specific `EvaluationEvidenceTag` member(s) this gap's count is based on. Empty for CONFIDENCE_ALIGNMENT_GAP (a top-level field, not a tag) and may be empty for PATTERN_GAP when it is raised only via matchedPatterns/constraint_validations rather than a tag. */
  readonly triggeringTags: readonly EvaluationEvidenceTag[];
}

export interface CognitiveGap {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly category: GapCategory;
  readonly severity: GapSeverity;
  readonly evidence: CognitiveGapEvidence;
  /** Plain, deterministic, count-based statements only — never a fabricated narrative, never a causal claim. Matches every prior 8.1.x/8.6.1 module's "observed reasoning gap" / "repeated inconsistency" discipline (see reasoningGap for the exact required phrasing). */
  readonly reasons: readonly string[];
}

/**
 * "What relevant previous experience/patterns exist for this situation" —
 * a thin, additive wrapper around 8.6.1's `NoveltyAssessment`, never a
 * competing classification. `relevantEvidenceTags` is the ONE new
 * derived field: the distinct `EvaluationEvidenceTag` values appearing
 * across `memory.matchedEvaluations[].evidence` — the "relevant evidence
 * overlap" the Phase 8.6.2 brief asks to expose, computed by deduping
 * already-persisted tags, never a similarity/embedding score.
 */
export interface FamiliarityEvidence {
  readonly familiarity: NoveltyAssessment;
  readonly relevantEvidenceTags: readonly EvaluationEvidenceTag[];
}

export interface CognitiveGapReport {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly familiarityEvidence: FamiliarityEvidence;
  /** 0 or more — most (source, symbol) pairs are expected to have zero. Evidence drawn from the EXECUTE/evaluated population only (`detectCognitiveGaps()`) — unchanged meaning, Phase 8.6 P1 does not touch this field's contents. */
  readonly gaps: readonly CognitiveGap[];
  /**
   * Phase 8.6 P1 addition — 0 or 1 `REJECT_DOMINANCE_GAP`, detected over
   * the full observed decision population (EXECUTE+WAIT+REJECT,
   * `lib/ai/decisionPopulation`) rather than `gaps`' EXECUTE-only
   * population. Kept in its own field rather than appended to `gaps` so
   * every existing consumer of `gaps` (`reasoningGap`, `evolutionNeed`)
   * is completely unaffected by this addition — see
   * `detectPopulationGap.ts`'s own header. `[]` when no
   * `DecisionPopulationReport` was supplied to
   * `buildCognitiveGapReport()`, or the gap's own evidence bar was not
   * met.
   */
  readonly populationGaps: readonly CognitiveGap[];
}
