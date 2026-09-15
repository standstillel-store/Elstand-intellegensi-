// ---------------------------------------------------------------------------
// ELVOID Intelligence — Self-Evaluation Summary, pure composition (Phase
// 8.6.4 Part A)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls —
// every argument here was already computed by an earlier phase; this
// function only assembles and tags them. See contracts.ts for the
// OBSERVED/INFERRED/UNKNOWN rule.
// ---------------------------------------------------------------------------

import type { SelfPerformanceAggregate, EvaluationCoverageReport } from "@/lib/ai/selfPerformance/contracts";
import type { FamiliarityEvidence, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { ReasoningGapObservation } from "@/lib/ai/reasoningGap/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { DecisionSource, SelfEvaluationSummary } from "./contracts";

export function buildSelfEvaluationSummary(
  source: DecisionSource,
  symbol: string,
  performance: SelfPerformanceAggregate,
  coverage: EvaluationCoverageReport,
  familiarity: FamiliarityEvidence,
  cognitiveGaps: readonly CognitiveGap[],
  reasoningGaps: readonly ReasoningGapObservation[],
  evolutionNeed: EvolutionNeedAssessment
): SelfEvaluationSummary {
  return {
    source,
    symbol,
    performance: { certainty: "OBSERVED", data: performance },
    coverage: { certainty: "OBSERVED", data: coverage },
    familiarity: { certainty: "OBSERVED", data: familiarity },
    cognitiveGaps: { certainty: "OBSERVED", data: cognitiveGaps },
    reasoningGaps: { certainty: "OBSERVED", data: reasoningGaps },
    evolutionNeed: { certainty: "INFERRED", data: evolutionNeed },
    historicalNovelty: { certainty: "UNKNOWN", data: null },
  };
}
