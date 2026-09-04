// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — composeMacroContext (architecture correction
// §13, Phase F deliverable).
//
// This is the "extend analyze.ts without touching analyze.ts" resolution
// from the corrections response (Conflict #1): analyzeMacroIntelligence()
// stays pure/sync/zero-DB exactly as it is; this file is the async layer
// that additionally reads lib/economicData (repository + interpretation +
// clusters + regime) and merges both into one MacroIntelligenceContext.
//
// UNWIRED, matching Phase 8.2.3's own precedent: nothing imports this
// function yet. lib/ai/core/context.ts / lib/intelligence/premium.ts
// wiring is explicitly Phase G in the authorizing document and is NOT
// done in this pass — see the Phase A-F final report for confirmation.
//
// Reads ONLY (never writes) via lib/economicData/repository.ts's
// getLatestRelease(). This function does not ingest/upsert data — that is
// a separate, not-yet-authorized concern (no cron/route exists yet). When
// the repository has nothing stored for an indicator (either because
// Supabase isn't configured, or because no ingestion job has run yet),
// that indicator honestly contributes nothing — clusters degrade to
// INSUFFICIENT_DATA rather than fabricating a reading. This is the
// expected, correct state until a Phase G+ ingestion job is separately
// authorized and run.
// ---------------------------------------------------------------------------

import { analyzeMacroIntelligence } from "./analyze";
import type { EconomicReleaseWithInterpretation, MacroClusterEvidence, MacroClustersSummary, MacroIntelligenceContext, MacroIntelligenceInput } from "./contracts";
import { getLatestRelease } from "@/lib/economicData/repository";
import { interpretRelease, type IndicatorInterpretation } from "@/lib/economicData/interpret";
import { buildEmploymentComposite } from "@/lib/economicData/employmentComposite";
import { buildGrowthCluster, buildInflationCluster, buildLaborCluster, buildMonetaryPolicyCluster } from "@/lib/economicData/clusters";
import { assessRegime } from "@/lib/economicData/regime";
import type { CanonicalIndicatorId } from "@/lib/economicData/canonicalIndicators";
import type { DataCompleteness, EconomicRelease } from "@/lib/economicData/types";

const INFLATION_INDICATORS: CanonicalIndicatorId[] = ["CPI_HEADLINE_YOY", "CORE_CPI_YOY", "PPI_HEADLINE_YOY", "CORE_PPI_YOY"];
const LABOR_INDICATORS: CanonicalIndicatorId[] = ["NFP", "UNEMPLOYMENT_RATE", "AVERAGE_HOURLY_EARNINGS_YOY"];
const GROWTH_INDICATORS: CanonicalIndicatorId[] = ["REAL_GDP_QOQ", "RETAIL_SALES_HEADLINE", "DURABLE_GOODS_ORDERS", "PMI_MANUFACTURING", "PMI_SERVICES"];
const COUNTRY = "US"; // this pass's indicator set is entirely US-focused, matching the Alpha Vantage function set in providers/alphaVantageProvider.ts

/** Fetches + interprets, but (Phase H addition) keeps the release paired with its interpretation rather than discarding it — the UI's Recent Economic Events table (EventSelector.tsx) needs the raw actual/forecast/previous, not just the derived surprise/momentum enums. */
async function interpretManyPaired(indicatorIds: CanonicalIndicatorId[], country: string): Promise<EconomicReleaseWithInterpretation[]> {
  const releases = await Promise.all(indicatorIds.map((id) => getLatestRelease(id, country)));
  return releases.filter((r): r is EconomicRelease => r !== undefined).map((release) => ({ release, interpretation: interpretRelease(release) }));
}

function overallCompleteness(interpretations: IndicatorInterpretation[]): DataCompleteness {
  if (interpretations.length === 0) return "UNAVAILABLE";
  const scores: Record<DataCompleteness, number> = { HIGH: 3, MEDIUM: 2, LIMITED: 1, UNAVAILABLE: 0 };
  const avg = interpretations.reduce((sum, i) => sum + scores[i.dataCompleteness], 0) / interpretations.length;
  if (avg >= 2.5) return "HIGH";
  if (avg >= 1.5) return "MEDIUM";
  if (avg > 0) return "LIMITED";
  return "UNAVAILABLE";
}

/** Deduplicated, non-empty explanation strings from a cluster's own interpretations — the evidence list the UI shows, sourced verbatim from interpret.ts's already-deterministic templates (no new text generation). */
function evidenceFor(interpretations: IndicatorInterpretation[]): string[] {
  const seen = new Set<string>();
  for (const i of interpretations) {
    if (i.explanation) seen.add(i.explanation);
  }
  return [...seen];
}

export interface ComposeMacroContextOptions {
  /** Test/override hook — when supplied, skips the repository read entirely for that indicator category and interprets these releases instead. Never used by production call sites in this phase (there are none yet — see file header). */
  releaseOverrides?: {
    inflation?: EconomicRelease[];
    labor?: EconomicRelease[];
    growth?: EconomicRelease[];
  };
  country?: string;
}

/**
 * Async. The only function in this subsystem that merges the pure
 * calendar-density context with the DB/provider-backed cluster/regime
 * pipeline. Never throws — every internal read degrades to an empty/
 * INSUFFICIENT_DATA result on failure, matching every other source in
 * this app.
 */
export async function composeMacroContext(input: MacroIntelligenceInput, options: ComposeMacroContextOptions = {}): Promise<MacroIntelligenceContext> {
  const base = analyzeMacroIntelligence(input);
  const country = options.country ?? COUNTRY;

  const inflationPairs = options.releaseOverrides?.inflation
    ? options.releaseOverrides.inflation.map((release) => ({ release, interpretation: interpretRelease(release) }))
    : await interpretManyPaired(INFLATION_INDICATORS, country);

  const laborReleases = options.releaseOverrides?.labor;
  const laborPairs = laborReleases
    ? laborReleases.map((release) => ({ release, interpretation: interpretRelease(release) }))
    : await interpretManyPaired(LABOR_INDICATORS, country);

  const growthPairs = options.releaseOverrides?.growth
    ? options.releaseOverrides.growth.map((release) => ({ release, interpretation: interpretRelease(release) }))
    : await interpretManyPaired(GROWTH_INDICATORS, country);

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
    dataCompleteness: overallCompleteness([...inflationInterpretations, ...laborInterpretations, ...growthInterpretations]),
    recentReleases: [...inflationPairs, ...laborPairs, ...growthPairs],
    clusterEvidence,
    employmentSummary: { signal: employmentComposite.signal, explanation: employmentComposite.explanation },
  };
}
