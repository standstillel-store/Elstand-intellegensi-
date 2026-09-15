// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Need Evaluator, pure gate (Phase 8.6.3
// Part B)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls.
// Takes 8.6.1's `EvaluationCoverageReport`, 8.6.2's `CognitiveGap[]`, and
// a `hasValidConstraint` flag (from 8.6.1's already-fetched
// `ConstraintValidation[]`) and returns exactly one `EvolutionNeed`. See
// contracts.ts's header for the full decision table.
// ---------------------------------------------------------------------------

import type { EvaluationCoverageReport } from "@/lib/ai/selfPerformance/contracts";
import type { DecisionSource, CognitiveGap, EvolutionNeed, EvolutionNeedAssessment } from "./contracts";

export function evaluateEvolutionNeed(source: DecisionSource, symbol: string, coverage: EvaluationCoverageReport, gaps: readonly CognitiveGap[], hasValidConstraint: boolean): EvolutionNeedAssessment {
  if (coverage.status === "INSUFFICIENT_DATA") {
    return {
      source,
      symbol,
      need: "INSUFFICIENT_EVIDENCE",
      consideredGaps: [],
      hasValidConstraint,
      reasons: [`Evaluation coverage is INSUFFICIENT_DATA (${coverage.closedExperienceCount} closed experience(s)) — gaps were not inspected.`],
    };
  }

  if (gaps.length === 0) {
    return {
      source,
      symbol,
      need: "NO_EVOLUTION_NEEDED",
      consideredGaps: [],
      hasValidConstraint,
      reasons: ["No cognitive gap met the evidence bar for this source/symbol."],
    };
  }

  const hasHighSeverity = gaps.some((gap) => gap.severity === "HIGH");
  const activeCategoryCount = gaps.length;

  if (!hasHighSeverity && activeCategoryCount < 2) {
    const reasons = ["Exactly one low/medium-severity gap category — not yet enough independent corroboration to warrant a proposal."];
    if (hasValidConstraint) reasons.push("An existing VALID adaptive constraint already exists for this source/symbol.");
    return { source, symbol, need: "MONITOR", consideredGaps: gaps, hasValidConstraint, reasons };
  }

  if (hasValidConstraint && !hasHighSeverity) {
    return {
      source,
      symbol,
      need: "MONITOR",
      consideredGaps: gaps,
      hasValidConstraint,
      reasons: [`${activeCategoryCount} gap categories are active, but an existing VALID adaptive constraint already addresses this source/symbol and no gap has reached HIGH severity.`],
    };
  }

  const reasons: string[] = [];
  if (hasHighSeverity) reasons.push(`At least one gap category reached HIGH severity (${gaps.filter((g) => g.severity === "HIGH").map((g) => g.category).join(", ")}).`);
  if (activeCategoryCount >= 2) reasons.push(`${activeCategoryCount} gap categories are independently active for this source/symbol (${gaps.map((g) => g.category).join(", ")}).`);
  const need: EvolutionNeed = "EVOLUTION_WARRANTED";
  return { source, symbol, need, consideredGaps: gaps, hasValidConstraint, reasons };
}
