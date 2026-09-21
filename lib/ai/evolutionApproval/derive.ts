// ---------------------------------------------------------------------------
// ELVOID Intelligence — per-symbol evolution derivation (Phase 8.6.7)
//
// ONE definition of "gaps -> need -> self-evaluation -> proposals ->
// candidates -> validations" for a symbol, shared by the AI Performance route
// (which used to inline it) and by the approval-request action, so the two can
// never disagree about what a proposal or its validation is. Extracted from
// app/api/ai-performance/cognitive/route.ts VERBATIM: same calls, same order,
// same output shape — a pure move, not a change.
//
// READS ONLY. `buildEvolutionCandidate` performs the same historical read every
// Phase 8.6 module already performs; nothing here writes, persists, sends a
// message, triggers a cycle, or touches the decision path.
// ---------------------------------------------------------------------------

import { queryDecisionMemory } from "@/lib/ai/decisionMemory/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { getSelfPerformanceReport } from "@/lib/ai/selfPerformance/repository";
import { fetchDecisionPopulationReport } from "@/lib/ai/decisionPopulation/repository";
import { buildCognitiveGapReport } from "@/lib/ai/cognitiveGap/repository";
import { deriveReasoningGapObservations } from "@/lib/ai/reasoningGap/derive";
import { evaluateEvolutionNeed } from "@/lib/ai/evolutionNeed/evaluate";
import { buildSelfEvaluationSummary } from "@/lib/ai/selfEvaluation/build";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import { buildEvolutionCandidate } from "@/lib/ai/evolutionCandidate/repository";
import { validateEvolutionCandidate } from "@/lib/ai/evolutionValidation/validate";
import type { CognitiveGapReport } from "@/lib/ai/cognitiveGap/contracts";
import type { SelfPerformanceReport } from "@/lib/ai/selfPerformance/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";

export const EVOLUTION_SOURCE = "ELVOID_PRO_ORACLE" as const;

export interface SymbolEvolutionCandidate {
  readonly proposal: EvolutionProposalWithoutTimestamp;
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  readonly validation: EvolutionValidationWithoutTimestamp;
}

export async function deriveSymbolEvolution(input: { readonly symbol: string; readonly gapReport: CognitiveGapReport | null; readonly performanceReport: SelfPerformanceReport | null; readonly hasValidConstraint: boolean }) {
  const { symbol, gapReport, performanceReport, hasValidConstraint } = input;
  if (gapReport === null || performanceReport === null) {
    return { symbol, reasoningGaps: [], evolutionNeed: null, selfEvaluation: null, proposals: [] as EvolutionProposalWithoutTimestamp[], candidates: [] as SymbolEvolutionCandidate[] };
  }
  const reasoningGaps = deriveReasoningGapObservations(gapReport.gaps);
  const evolutionNeed = evaluateEvolutionNeed(EVOLUTION_SOURCE, symbol, performanceReport.coverage, gapReport.gaps, hasValidConstraint);
  const selfEvaluation = buildSelfEvaluationSummary(EVOLUTION_SOURCE, symbol, performanceReport.performance, performanceReport.coverage, gapReport.familiarityEvidence, gapReport.gaps, reasoningGaps, evolutionNeed);
  const proposals = draftEvolutionProposals(evolutionNeed);

  const candidateEntries = await Promise.all(
    proposals.map(async (proposal): Promise<SymbolEvolutionCandidate | null> => {
      const candidate = await buildEvolutionCandidate(proposal);
      if (candidate === null) return null;
      const validation = validateEvolutionCandidate(candidate);
      return { proposal, candidate, validation };
    })
  );
  const candidates = candidateEntries.filter((entry): entry is SymbolEvolutionCandidate => entry !== null);

  return { symbol, reasoningGaps, evolutionNeed, selfEvaluation, proposals, candidates };
}

/**
 * The same reads the AI Performance route makes for ONE symbol, then the shared
 * derivation above. Used by the approval-request action so it always works from
 * a fresh, server-side computation — never from anything the client sent.
 */
export async function gatherSymbolEvolution(symbol: string) {
  const [memory, validationList, performanceReport] = await Promise.all([queryDecisionMemory({ source: EVOLUTION_SOURCE, symbol }), getConstraintValidations(EVOLUTION_SOURCE, symbol), getSelfPerformanceReport(EVOLUTION_SOURCE, symbol)]);
  const validations = validationList ?? [];
  const decisionPopulation = await fetchDecisionPopulationReport(EVOLUTION_SOURCE, symbol, { evaluatedExperienceCount: performanceReport?.coverage.evaluatedExperienceCount ?? null });
  const gapReport = await buildCognitiveGapReport(EVOLUTION_SOURCE, symbol, memory, validations, decisionPopulation);
  return deriveSymbolEvolution({ symbol, gapReport, performanceReport, hasValidConstraint: validations.some((v) => v.status === "VALID") });
}
