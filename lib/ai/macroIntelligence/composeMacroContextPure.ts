// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — composeMacroContext PURE assembly.
//
// Everything composeMacroContext() does AFTER reading releases: interpret ->
// clusters -> regime -> MacroIntelligenceContext. No DB, no network, so the
// assembly (and its fixtures) carry no Supabase imports. Same split precedent as
// lib/ai/economicIntelligence/oracleMacro.ts / oracleMacroPure.ts.
// ---------------------------------------------------------------------------

import { analyzeMacroIntelligence } from "./analyze";
import type { EconomicReleaseWithInterpretation, MacroClusterEvidence, MacroClustersSummary, MacroIntelligenceContext, MacroIntelligenceInput } from "./contracts";
import type { IndicatorInterpretation } from "@/lib/economicData/interpret";
import { buildEmploymentComposite } from "@/lib/economicData/employmentComposite";
import { buildGrowthCluster, buildInflationCluster, buildLaborCluster, buildMonetaryPolicyCluster } from "@/lib/economicData/clusters";
import { assessRegime } from "@/lib/economicData/regime";
import type { DataCompleteness } from "@/lib/economicData/types";

function overallCompleteness(interpretations: IndicatorInterpretation[]): DataCompleteness {
  if (interpretations.length === 0) return "UNAVAILABLE";
  const scores: Record<DataCompleteness, number> = { HIGH: 3, MEDIUM: 2, LIMITED: 1, UNAVAILABLE: 0 };
  const avg = interpretations.reduce((sum, i) => sum + scores[i.dataCompleteness], 0) / interpretations.length;
  if (avg >= 2.5) return "HIGH";
  if (avg >= 1.5) return "MEDIUM";
  if (avg > 0) return "LIMITED";
  return "UNAVAILABLE";
}

/**
 * Fail-closed breadth guard (added 2026-09-29 with the switch to the PRIMARY
 * source). The average above is over whatever indicators happen to be present,
 * so ONE fresh indicator would read as HIGH and make the whole macro context
 * AVAILABLE. Macro context may only be HIGH (-> AVAILABLE downstream, the only
 * value pre-entry accepts) when inflation, labor AND growth are each
 * represented; otherwise it is capped at MEDIUM (-> PARTIAL -> CAUTION).
 */
export function applyCoverageGuard(completeness: DataCompleteness, allClustersRepresented: boolean): DataCompleteness {
  if (completeness === "HIGH" && !allClustersRepresented) return "MEDIUM";
  return completeness;
}

/** Deduplicated, non-empty explanation strings from a cluster's own interpretations — the evidence list the UI shows, sourced verbatim from interpret.ts's already-deterministic templates (no new text generation). */
function evidenceFor(interpretations: IndicatorInterpretation[]): string[] {
  const seen = new Set<string>();
  for (const i of interpretations) {
    if (i.explanation) seen.add(i.explanation);
  }
  return [...seen];
}

export interface ComposePairs {
  inflationPairs: EconomicReleaseWithInterpretation[];
  laborPairs: EconomicReleaseWithInterpretation[];
  growthPairs: EconomicReleaseWithInterpretation[];
}

/** Pure. Merges the calendar-density context with already-read, already-interpreted releases. */
export function composeFromPairs(input: MacroIntelligenceInput, pairs: ComposePairs): MacroIntelligenceContext {
  const base = analyzeMacroIntelligence(input);
  const { inflationPairs, laborPairs, growthPairs } = pairs;

  const inflationInterpretations = inflationPairs.map((p) => p.interpretation);
  const laborInterpretations = laborPairs.map((p) => p.interpretation);
  const growthInterpretations = growthPairs.map((p) => p.interpretation);

  const nfp = laborInterpretations.find((i) => i.indicatorId === "NFP");
  const unemploymentRate = laborInterpretations.find((i) => i.indicatorId === "UNEMPLOYMENT_RATE");
  const averageHourlyEarnings = laborInterpretations.find((i) => i.indicatorId === "AVERAGE_HOURLY_EARNINGS_YOY");
  const employmentComposite = buildEmploymentComposite(nfp, unemploymentRate, averageHourlyEarnings);

  const inflationCluster = buildInflationCluster(inflationInterpretations);
  const laborCluster = buildLaborCluster(laborInterpretations, employmentComposite);
  const growthCluster = buildGrowthCluster(growthInterpretations);
  const monetaryPolicyCluster = buildMonetaryPolicyCluster([...inflationInterpretations, ...laborInterpretations, ...growthInterpretations]);

  const regime = assessRegime(inflationCluster.state, laborCluster.state, growthCluster.state, monetaryPolicyCluster.state);

  const clusters: MacroClustersSummary = {
    inflation: inflationCluster.state,
    labor: laborCluster.state,
    growth: growthCluster.state,
    monetaryPolicy: monetaryPolicyCluster.state,
  };

  const clusterEvidence: MacroClusterEvidence = {
    inflation: evidenceFor(inflationInterpretations),
    labor: evidenceFor(laborInterpretations),
    growth: evidenceFor(growthInterpretations),
    monetaryPolicy: evidenceFor([...inflationInterpretations, ...laborInterpretations, ...growthInterpretations]),
  };

  return {
    ...base,
    clusters,
    economicRegime: regime.economicRegime,
    riskEnvironment: regime.riskEnvironment,
    dataCompleteness: applyCoverageGuard(overallCompleteness([...inflationInterpretations, ...laborInterpretations, ...growthInterpretations]), inflationPairs.length > 0 && laborPairs.length > 0 && growthPairs.length > 0),
    recentReleases: [...inflationPairs, ...laborPairs, ...growthPairs],
    clusterEvidence,
    employmentSummary: { signal: employmentComposite.signal, explanation: employmentComposite.explanation },
  };
}
