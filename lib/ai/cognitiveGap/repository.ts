// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Gap Detector, persistence-aware read
// (Phase 8.6.2)
//
// Persistence-aware adapter ONLY — zero detection/classification logic
// lives here (that's entirely in familiarity.ts / detect.ts, both pure).
// Reuses lib/ai/decisionMemory/repository.ts's existing
// getDecisionMemoryJoinedExperiences() as its data source, exactly like
// lib/ai/selfPerformance/repository.ts already does. `memory` and
// `constraintValidations` are accepted as parameters rather than
// re-fetched here — the caller (the AI Performance route) already reads
// both once per symbol; this avoids a second, redundant
// queryDecisionMemory()/getConstraintValidations() call for data the
// caller already has in hand this request.
//
// Not wired into decisionQualification, arbitration, execution, or risk.
// ---------------------------------------------------------------------------

import { getDecisionMemoryJoinedExperiences } from "@/lib/ai/decisionMemory/repository";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { DecisionPopulationReport } from "@/lib/ai/decisionPopulation/contracts";
import { buildFamiliarityEvidence } from "./familiarity";
import { detectCognitiveGaps } from "./detect";
import { detectDecisionPopulationGap } from "./detectPopulationGap";
import type { DecisionSource, CognitiveGapReport } from "./contracts";

/**
 * Returns `null` only when the Learning DB is not configured (same rule
 * as `getSelfPerformanceReport()`). A configured-but-empty population
 * resolves to a valid report with zero gaps, never `null`.
 *
 * `populationReport` (Phase 8.6 P1) is accepted as an optional parameter,
 * exactly like `memory`/`constraintValidations` already are — the caller
 * (the AI Performance route) already fetches it once per symbol; this
 * avoids a second, redundant `fetchDecisionPopulationReport()` call.
 * Omit it (or pass `null`) to get `populationGaps: []`, never an error.
 */
export async function buildCognitiveGapReport(source: DecisionSource, symbol: string, memory: DecisionMemoryResult | null, constraintValidations: readonly ConstraintValidation[], populationReport: DecisionPopulationReport | null = null): Promise<CognitiveGapReport | null> {
  const rows = await getDecisionMemoryJoinedExperiences();
  if (rows === null) return null;

  const familiarityEvidence = buildFamiliarityEvidence(source, symbol, memory);
  const gaps = detectCognitiveGaps({
    source,
    symbol,
    rows,
    matchedPatternCount: memory?.matchedPatterns.length ?? 0,
    constraintValidations,
  });
  const populationGaps = detectDecisionPopulationGap(populationReport);

  return { source, symbol, familiarityEvidence, gaps, populationGaps };
}
