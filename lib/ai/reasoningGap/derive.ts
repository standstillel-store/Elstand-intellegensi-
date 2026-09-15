// ---------------------------------------------------------------------------
// ELVOID Intelligence — Reasoning Gap Observation, pure derivation (Phase
// 8.6.3 Part A)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls.
// Filters an already-detected `CognitiveGap[]` (8.6.2) to the reasoning
// subset and attaches a fixed, per-category, deterministic statement.
// Never invents a category not already in `REASONING_GAP_CATEGORIES`,
// never changes severity, never re-counts evidence.
// ---------------------------------------------------------------------------

import type { GapCategory, CognitiveGap, ReasoningGapObservation } from "./contracts";
import { REASONING_GAP_CATEGORIES } from "./contracts";

const STATEMENT_BY_CATEGORY: Record<(typeof REASONING_GAP_CATEGORIES)[number], (gap: CognitiveGap) => string> = {
  CONTRADICTION_GAP: (gap) => `Observed reasoning gap: repeated inconsistency — ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions carry an unresolved (CONFLICTED) cognitive state. Candidate reasoning weakness: evidence may repeatedly point in conflicting directions without resolution for this source/symbol.`,
  CONTEXT_GAP: (gap) => `Observed reasoning gap: repeated insufficient context — ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions lacked adequate cognitive context. Candidate reasoning weakness: a critical context category may be missing or unavailable more often than expected for this source/symbol.`,
  REASONING_CONSISTENCY_GAP: (gap) => `Observed reasoning gap: repeated inconsistency — ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions produced a rejected or challenged hypothesis. Candidate reasoning weakness: similar situations may repeatedly produce unstable reasoning for this source/symbol.`,
  EVIDENCE_GAP: (gap) => `Observed reasoning gap: insufficient evidence resolution — ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions remained cautious despite available evidence. Candidate reasoning weakness: relevant evidence may exist without leading to a stable (CONSISTENT) decision for this source/symbol.`,
};

/**
 * Filters `gaps` (8.6.2's full detected list, any categories) to the
 * reasoning subset and attaches a fixed statement per gap. Order is
 * preserved from the input. No causal claim is ever produced — see this
 * file's header.
 */
export function deriveReasoningGapObservations(gaps: readonly CognitiveGap[]): readonly ReasoningGapObservation[] {
  return gaps
    .filter((gap): gap is CognitiveGap & { category: (typeof REASONING_GAP_CATEGORIES)[number] } => (REASONING_GAP_CATEGORIES as readonly GapCategory[]).includes(gap.category))
    .map((gap) => ({
      source: gap.source,
      symbol: gap.symbol,
      category: gap.category,
      severity: gap.severity,
      statement: STATEMENT_BY_CATEGORY[gap.category](gap),
      sourceGap: gap,
    }));
}
