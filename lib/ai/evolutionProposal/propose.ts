// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Proposal Engine, pure drafting (Phase
// 8.6.4 Part B)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls,
// zero Date.now()/randomness. Drafts 0 or more proposals from an
// already-computed `EvolutionNeedAssessment` (8.6.3) — never re-evaluates
// whether evolution is warranted, never invents a gap that was not
// already detected.
//
// Every `hypothesis`/`proposedChange`/`expectedEffect` below is a FIXED,
// per-category template string, filled in only with numbers already
// present on the gap's own evidence — never generated, never LLM text.
// Every `proposedChange` describes something to INVESTIGATE, matching
// the Phase 8.6.4 brief's own example:
//   BAD:  "Modify Oracle threshold from 70 to 65."
//   GOOD: "Investigate whether the current confidence threshold
//          systematically excludes setups under condition X; validate
//          through historical replay before considering any production
//          change."
// No template here names a specific number to change, a specific
// threshold value, or any other directly-executable instruction.
// ---------------------------------------------------------------------------

import type { GapCategory, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { EvolutionProposalWithoutTimestamp } from "./contracts";

interface CategoryCopy {
  readonly hypothesis: (gap: CognitiveGap) => string;
  readonly proposedChange: string;
  readonly expectedEffect: string;
  readonly validationRequirements: readonly string[];
}

const COPY_BY_CATEGORY: Record<GapCategory, CategoryCopy> = {
  CONTRADICTION_GAP: {
    hypothesis: (gap) => `Repeated unresolved contradiction (CONFLICTED cognitive state) observed in ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions for this source/symbol.`,
    proposedChange: "Investigate whether the current contradiction-resolution logic (lib/ai/cognitive/conflict.ts) systematically under-resolves disagreement for this source/symbol; validate any adjustment through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could reduce the rate of CONFLICTED-state decisions for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Confirm the pattern is not explained by a single unusual period", "Human review before any qualification/arbitration change"],
  },
  CONTEXT_GAP: {
    hypothesis: (gap) => `Repeated insufficient cognitive context observed in ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions for this source/symbol.`,
    proposedChange: "Investigate which specific context category is most often missing when INSUFFICIENT_CONTEXT_STATE_PRESENT / NO_COGNITIVE_CONTEXT is recorded for this source/symbol; validate whether an additional evidence source would plausibly resolve it before considering any production change.",
    expectedEffect: "If confirmed, a future revision could reduce the rate of insufficient-context decisions for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Identify the specific missing context category from cognitive_trace records", "Human review before any qualification/arbitration change"],
  },
  REASONING_CONSISTENCY_GAP: {
    hypothesis: (gap) => `Repeated rejected or challenged hypotheses observed in ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions for this source/symbol.`,
    proposedChange: "Investigate whether similar situations for this source/symbol repeatedly produce unstable hypotheses (lib/ai/cognitive/hypothesis.ts); validate through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could improve hypothesis stability for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Confirm the pattern recurs across distinct time windows, not one cluster", "Human review before any qualification/arbitration change"],
  },
  CONFIDENCE_ALIGNMENT_GAP: {
    hypothesis: (gap) => `Repeated confidence/decision-quality misalignment observed in ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions for this source/symbol.`,
    proposedChange: "Investigate whether the current confidence computation systematically over- or under-states decision quality for this source/symbol; validate any adjustment through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could improve confidenceAlignment for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Determine the direction of the misalignment (over- vs under-confident)", "Human review before any qualification/arbitration change"],
  },
  EVIDENCE_GAP: {
    hypothesis: (gap) => `Repeated cautious (unresolved) outcomes despite available evidence, observed in ${gap.evidence.occurrenceCount} of ${gap.evidence.evaluatedCount} evaluated decisions for this source/symbol.`,
    proposedChange: "Investigate why relevant evidence for this source/symbol repeatedly fails to resolve into a CONSISTENT cognitive state; validate through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could reduce the rate of CAUTIOUS-state decisions for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Cross-check against Familiarity — a FAMILIAR classification alongside repeated CAUTIOUS states would strengthen this", "Human review before any qualification/arbitration change"],
  },
  PATTERN_GAP: {
    hypothesis: (gap) => `Recurring negative outcomes and/or an already-qualified failure pattern and/or non-VALID learning constraints observed for this source/symbol (${gap.evidence.occurrenceCount} supporting occurrence(s) of ${gap.evidence.evaluatedCount} evaluated).`,
    proposedChange: "Investigate whether the existing adaptive constraint for this source/symbol's evidence tag(s) is adequately scoped; validate through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could reduce the recurrence of this failure pattern for this source/symbol. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Review the corresponding failure_pattern_candidates / constraint_validations rows directly", "Human review before any qualification/arbitration change"],
  },
};

const CURRENT_SYSTEM_VERSION = "phase-8.6.4";

function proposalIdFor(gap: CognitiveGap): string {
  return `${gap.source}:${gap.symbol}:${gap.category}`;
}

/**
 * Drafts one proposal per gap in `evolutionNeed.consideredGaps`, ONLY
 * when `evolutionNeed.need === "EVOLUTION_WARRANTED"`. Returns `[]` for
 * every other need (NO_EVOLUTION_NEEDED, INSUFFICIENT_EVIDENCE, MONITOR)
 * — a proposal is never drafted from anything less than the full gate.
 */
export function draftEvolutionProposals(evolutionNeed: EvolutionNeedAssessment): readonly EvolutionProposalWithoutTimestamp[] {
  if (evolutionNeed.need !== "EVOLUTION_WARRANTED") return [];

  return evolutionNeed.consideredGaps.map((gap): EvolutionProposalWithoutTimestamp => {
    const copy = COPY_BY_CATEGORY[gap.category];
    return {
      proposalId: proposalIdFor(gap),
      proposalVersion: 1,
      source: gap.source,
      symbol: gap.symbol,
      currentSystemVersion: CURRENT_SYSTEM_VERSION,
      gapCategory: gap.category,
      gapSeverity: gap.severity,
      evidence: gap.evidence,
      hypothesis: copy.hypothesis(gap),
      proposedChange: copy.proposedChange,
      expectedEffect: copy.expectedEffect,
      validationRequirements: copy.validationRequirements,
      status: "DRAFT",
    };
  });
}
