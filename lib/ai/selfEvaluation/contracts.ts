// ---------------------------------------------------------------------------
// ELVOID Intelligence — Self-Evaluation Summary (Phase 8.6.4 Part A)
//
// ARCHITECTURE / AUTHORITY:
//   - A pure COMPOSITION over everything 8.6.1-8.6.3 already computed —
//     zero new evidence is gathered, zero new database read happens
//     anywhere in this module. Every field is either read verbatim from
//     an earlier phase's already-computed result, or is the earlier
//     phase's result itself.
//   - Every field is explicitly tagged OBSERVED / INFERRED / UNKNOWN:
//       OBSERVED — a directly-read fact (performance counts, coverage,
//         familiarity, the detected gap list itself — a gap's EXISTENCE
//         is observed, even though what it implies is not).
//       INFERRED — a conclusion derived FROM observed facts
//         (`evolutionNeed` — the Evolution Need Evaluator's output is a
//         deterministic derivation, not a raw fact).
//       UNKNOWN — genuinely not available, and never silently converted
//         into a conclusion. `historicalNovelty` is always UNKNOWN — see
//         lib/ai/noveltyDetection/contracts.ts's own
//         HISTORICAL_NOVELTY_AT_DECISION_TIME limitation, unchanged.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { SelfPerformanceAggregate, EvaluationCoverageReport } from "@/lib/ai/selfPerformance/contracts";
import type { FamiliarityEvidence, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { ReasoningGapObservation } from "@/lib/ai/reasoningGap/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";

export type { DecisionSource, SelfPerformanceAggregate, EvaluationCoverageReport, FamiliarityEvidence, CognitiveGap, ReasoningGapObservation, EvolutionNeedAssessment };

export type EvidenceCertainty = "OBSERVED" | "INFERRED" | "UNKNOWN";

export interface CertaintyTagged<TCertainty extends EvidenceCertainty, TData> {
  readonly certainty: TCertainty;
  readonly data: TData;
}

export interface SelfEvaluationSummary {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly performance: CertaintyTagged<"OBSERVED", SelfPerformanceAggregate>;
  readonly coverage: CertaintyTagged<"OBSERVED", EvaluationCoverageReport>;
  readonly familiarity: CertaintyTagged<"OBSERVED", FamiliarityEvidence>;
  readonly cognitiveGaps: CertaintyTagged<"OBSERVED", readonly CognitiveGap[]>;
  readonly reasoningGaps: CertaintyTagged<"OBSERVED", readonly ReasoningGapObservation[]>;
  readonly evolutionNeed: CertaintyTagged<"INFERRED", EvolutionNeedAssessment>;
  /** Always UNKNOWN, always `null` — see this file's header. Never reconstructed, never estimated. */
  readonly historicalNovelty: CertaintyTagged<"UNKNOWN", null>;
}
