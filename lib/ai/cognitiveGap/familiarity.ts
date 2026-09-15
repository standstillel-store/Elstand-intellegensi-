// ---------------------------------------------------------------------------
// ELVOID Intelligence — Familiarity & Pattern Retrieval (Phase 8.6.2 Part A)
//
// Pure, deterministic. Reuses lib/ai/noveltyDetection/classify.ts's
// `classifyNovelty()` verbatim for the classification itself — this file
// adds exactly one derived field (`relevantEvidenceTags`) and nothing
// else. See contracts.ts's header for why familiarity never becomes a
// `CognitiveGap` on its own.
// ---------------------------------------------------------------------------

import { classifyNovelty } from "@/lib/ai/noveltyDetection/classify";
import type { DecisionSource, DecisionMemoryResult, EvaluationEvidenceTag, FamiliarityEvidence } from "./contracts";

/**
 * `memory.matchedEvaluations` is bounded (the same population
 * `queryDecisionMemory()` already returns), so deduping its `.evidence`
 * tags here adds no new query and no unbounded loop.
 */
export function buildFamiliarityEvidence(source: DecisionSource, symbol: string, memory: DecisionMemoryResult | null): FamiliarityEvidence {
  const familiarity = classifyNovelty(source, symbol, memory);

  const seen = new Set<EvaluationEvidenceTag>();
  const relevantEvidenceTags: EvaluationEvidenceTag[] = [];
  if (memory) {
    for (const evaluation of memory.matchedEvaluations) {
      for (const tag of evaluation.evidence) {
        if (!seen.has(tag)) {
          seen.add(tag);
          relevantEvidenceTags.push(tag);
        }
      }
    }
  }

  return { familiarity, relevantEvidenceTags };
}
