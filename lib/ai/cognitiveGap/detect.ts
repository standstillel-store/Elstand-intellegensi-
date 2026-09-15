// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Gap Detector, pure detection (Phase 8.6.2
// Part B)
//
// Pure, deterministic, synchronous. Zero database/network/LLM/fetch
// calls, zero Date.now()/timestamp generation, zero randomness — mirrors
// lib/ai/failurePatterns/detect.ts's own discipline. Takes an
// already-fetched population (the SAME `DecisionMemoryJoinedRow[]`
// selfPerformance already reads, plus the SAME `ConstraintValidation[]`
// the AI Performance route already reads) and derives 0 or more
// `CognitiveGap`s for exactly one (source, symbol) pair. Never queries
// anything itself, never mutates its inputs.
//
// EVERY category is driven by counting already-persisted
// `EvaluationEvidenceTag` values (or the top-level `confidenceAlignment`
// field) across `decision_evaluations` — nothing here re-derives what a
// tag means (that already happened, once, deterministically, in
// decisionEvaluation/evaluate.ts). This module only counts frequency.
//
// SEVERITY — see contracts.ts's own header for the full reasoning this
// is the one original judgment call in this phase, not a directly-reused
// existing convention: HIGH once occurrenceCount reaches
// CONFIDENCE_SAMPLE_CAP (reused, not redefined), otherwise HIGH/MEDIUM/LOW
// by how many OTHER categories are simultaneously active for the same
// (source, symbol) — more independent corroborating evidence dimensions
// is a stronger, non-arbitrary signal than one dimension's raw count
// alone.
// ---------------------------------------------------------------------------

import { MIN_OCCURRENCE_COUNT, CONFIDENCE_SAMPLE_CAP, NEGATIVE_EVALUATION_CLASSES } from "@/lib/ai/failurePatterns/detect";
import type { DecisionMemoryJoinedRow } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { DecisionSource, EvaluationEvidenceTag, GapCategory, GapSeverity, CognitiveGap, CognitiveGapEvidence } from "./contracts";

export interface DetectCognitiveGapsInput {
  readonly source: DecisionSource;
  readonly symbol: string;
  /** Full population — this function filters to (source, symbol) itself, matching selfPerformance/aggregate.ts's own convention. */
  readonly rows: readonly DecisionMemoryJoinedRow[];
  /** = `memory.matchedPatterns.length` for the SAME (source, symbol) query already run for familiarity — not re-fetched here. */
  readonly matchedPatternCount: number;
  /** Already scoped to (source, symbol) by the caller (`getConstraintValidations(source, symbol)`), reused unchanged. */
  readonly constraintValidations: readonly ConstraintValidation[];
}

const TAG_RULES: readonly { category: Exclude<GapCategory, "CONFIDENCE_ALIGNMENT_GAP" | "PATTERN_GAP">; tags: readonly EvaluationEvidenceTag[] }[] = [
  { category: "CONTRADICTION_GAP", tags: ["CONFLICTED_STATE_PRESENT"] },
  { category: "CONTEXT_GAP", tags: ["INSUFFICIENT_CONTEXT_STATE_PRESENT", "NO_COGNITIVE_CONTEXT"] },
  { category: "REASONING_CONSISTENCY_GAP", tags: ["REJECTED_HYPOTHESIS_PRESENT", "CHALLENGED_HYPOTHESIS_PRESENT"] },
  { category: "EVIDENCE_GAP", tags: ["CAUTIOUS_STATE_PRESENT"] },
];

interface RawSignal {
  readonly category: GapCategory;
  readonly occurrenceCount: number;
  readonly triggeringTags: readonly EvaluationEvidenceTag[];
  readonly reasons: readonly string[];
}

function isInScope(row: DecisionMemoryJoinedRow, source: DecisionSource, symbol: string): boolean {
  return row.experience.source === source && row.experience.symbol === symbol;
}

function severityFor(occurrenceCount: number, otherActiveCategoryCount: number): GapSeverity {
  if (occurrenceCount >= CONFIDENCE_SAMPLE_CAP || otherActiveCategoryCount >= 2) return "HIGH";
  if (otherActiveCategoryCount >= 1) return "MEDIUM";
  return "LOW";
}

/**
 * Detects 0 or more cognitive gaps for one (source, symbol) pair. See
 * this file's header and contracts.ts for the full category/severity
 * model. Deterministic: the same inputs always produce the same output,
 * in the same order (`TAG_RULES` order, then CONFIDENCE_ALIGNMENT_GAP,
 * then PATTERN_GAP).
 */
export function detectCognitiveGaps(input: DetectCognitiveGapsInput): readonly CognitiveGap[] {
  const { source, symbol, rows, matchedPatternCount, constraintValidations } = input;

  const evaluations: readonly DecisionEvaluation[] = rows.filter((row) => isInScope(row, source, symbol) && row.evaluation !== null).map((row) => row.evaluation as DecisionEvaluation);
  const evaluatedCount = evaluations.length;

  const raw: RawSignal[] = [];

  for (const rule of TAG_RULES) {
    const occurrenceCount = evaluations.filter((e) => e.evidence.some((tag) => rule.tags.includes(tag))).length;
    if (occurrenceCount >= MIN_OCCURRENCE_COUNT) {
      raw.push({
        category: rule.category,
        occurrenceCount,
        triggeringTags: rule.tags,
        reasons: [`${occurrenceCount} of ${evaluatedCount} evaluated decisions carry evidence tag(s) ${rule.tags.join("/")}.`],
      });
    }
  }

  const misalignedCount = evaluations.filter((e) => e.confidenceAlignment === "MISALIGNED").length;
  if (misalignedCount >= MIN_OCCURRENCE_COUNT) {
    raw.push({
      category: "CONFIDENCE_ALIGNMENT_GAP",
      occurrenceCount: misalignedCount,
      triggeringTags: [],
      reasons: [`${misalignedCount} of ${evaluatedCount} evaluated decisions have confidenceAlignment = MISALIGNED.`],
    });
  }

  // PATTERN_GAP — three independent sub-signals, any one is sufficient.
  // occurrenceCount takes the strongest of whichever fired; `reasons`
  // lists every sub-signal that actually fired, never just the first.
  const negativeCount = evaluations.filter((e) => (NEGATIVE_EVALUATION_CLASSES as readonly string[]).includes(e.evaluationClass)).length;
  const nonValidValidationCount = constraintValidations.filter((v) => v.status !== "VALID").length;
  const patternReasons: string[] = [];
  let patternOccurrenceCount = 0;
  if (negativeCount >= MIN_OCCURRENCE_COUNT) {
    patternReasons.push(`${negativeCount} of ${evaluatedCount} evaluated decisions fall in a negative evaluation class (${NEGATIVE_EVALUATION_CLASSES.join("/")}).`);
    patternOccurrenceCount = Math.max(patternOccurrenceCount, negativeCount);
  }
  if (matchedPatternCount > 0) {
    // An already-qualified failure pattern (>= MIN_OCCURRENCE_COUNT by
    // failurePatterns/detect.ts's own construction) exists for this
    // source/symbol — no need to re-apply MIN_OCCURRENCE_COUNT here.
    patternReasons.push(`${matchedPatternCount} already-qualified failure pattern(s) matched for this source/symbol.`);
    patternOccurrenceCount = Math.max(patternOccurrenceCount, MIN_OCCURRENCE_COUNT);
  }
  if (nonValidValidationCount >= 1) {
    // constraint_validations is itself already aggregate/statistical
    // state (Phase 8.1.5) — a single non-VALID row is already a
    // meaningful signal, unlike a single raw decision.
    patternReasons.push(`${nonValidValidationCount} constraint_validations row(s) for this source/symbol are not VALID.`);
    patternOccurrenceCount = Math.max(patternOccurrenceCount, nonValidValidationCount);
  }
  if (patternReasons.length > 0) {
    raw.push({ category: "PATTERN_GAP", occurrenceCount: patternOccurrenceCount, triggeringTags: [], reasons: patternReasons });
  }

  return raw.map((signal): CognitiveGap => {
    const otherActiveCategoryCount = raw.length - 1;
    const evidence: CognitiveGapEvidence = { occurrenceCount: signal.occurrenceCount, evaluatedCount, triggeringTags: signal.triggeringTags };
    return {
      source,
      symbol,
      category: signal.category,
      severity: severityFor(signal.occurrenceCount, otherActiveCategoryCount),
      evidence,
      reasons: signal.reasons,
    };
  });
}
