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
// WIRED (lib/ai/core/context.ts and lib/ai/economicIntelligence/oracleMacro.ts).
//
// Reads ONLY (never writes). 2026-09-29: the reading is now built from the
// PRIMARY source (Alpha Vantage observations, see
// lib/economicData/primaryRelease.ts). Before this change it read
// economic_releases (ForexFactory calendar rows keyed by currency code, e.g.
// "USD") with country "US", which never matched a stored row — so every
// Oracle snapshot reported macro_state UNKNOWN. When the primary reading is
// missing/stale for an indicator, that indicator honestly contributes
// nothing — clusters degrade to INSUFFICIENT_DATA rather than fabricating a
// reading or borrowing one from a supporting provider.
// ---------------------------------------------------------------------------

import type { EconomicReleaseWithInterpretation, MacroIntelligenceContext, MacroIntelligenceInput } from "./contracts";
import { composeFromPairs } from "./composeMacroContextPure";
import { getRecentObservations } from "@/lib/economicData/repository";
import { buildPrimaryRelease } from "@/lib/economicData/primaryRelease";
import { interpretRelease } from "@/lib/economicData/interpret";
import { ALPHA_VANTAGE_FUNCTION_MAP, type CanonicalIndicatorId } from "@/lib/economicData/canonicalIndicators";
import type { EconomicRelease } from "@/lib/economicData/types";

const INFLATION_INDICATORS: CanonicalIndicatorId[] = ["CPI_HEADLINE_YOY", "CORE_CPI_YOY", "PPI_HEADLINE_YOY", "CORE_PPI_YOY"];
const LABOR_INDICATORS: CanonicalIndicatorId[] = ["NFP", "UNEMPLOYMENT_RATE", "AVERAGE_HOURLY_EARNINGS_YOY"];
const GROWTH_INDICATORS: CanonicalIndicatorId[] = ["REAL_GDP_QOQ", "RETAIL_SALES_HEADLINE", "DURABLE_GOODS_ORDERS", "PMI_MANUFACTURING", "PMI_SERVICES"];
const COUNTRY = "US"; // this pass's indicator set is entirely US-focused, matching the Alpha Vantage function set in providers/alphaVantageProvider.ts

/** Indicators Alpha Vantage (the PRIMARY source) actually maps. An indicator outside this set has no primary source by design, so its absence is expected and not logged. */
const PRIMARY_MAPPED_INDICATORS: ReadonlySet<string> = new Set(Object.values(ALPHA_VANTAGE_FUNCTION_MAP).flatMap((m) => m.targets.map((t) => t.indicatorId)));
const loggedUnavailable = new Set<string>(); // once per process per indicator+reason — Oracle runs per symbol, so an unguarded log would flood

/**
 * PRIMARY-SOURCE read (owner data hierarchy): every release here is built from
 * Alpha Vantage observations in economic_observations. ForexFactory / FRED /
 * other supporting rows are NOT substituted when the primary reading is
 * missing, stale or has a gap — that indicator simply contributes nothing
 * (fail-closed -> INSUFFICIENT_DATA / lower completeness downstream).
 *
 * Keeps the release paired with its interpretation (Phase H): the UI's Recent
 * Economic Events table needs the raw actual/previous, not just the derived enums.
 */
async function interpretManyPaired(indicatorIds: CanonicalIndicatorId[], country: string): Promise<EconomicReleaseWithInterpretation[]> {
  const now = new Date();
  const releases = await Promise.all(
    indicatorIds.map(async (id): Promise<EconomicRelease | undefined> => {
      const observations = await getRecentObservations(id, country, 2, "alphavantage");
      if (observations === null) return undefined; // Learning DB not configured — repository already distinguishes this from "empty"
      const outcome = buildPrimaryRelease(id, country, observations, now);
      if (outcome.status === "OK") return outcome.release;
      const expectedAbsence = outcome.reason === "NO_PRIMARY_OBSERVATION" && !PRIMARY_MAPPED_INDICATORS.has(id);
      const key = `${id}:${outcome.reason}`;
      if (!expectedAbsence && !loggedUnavailable.has(key)) {
        loggedUnavailable.add(key);
        console.warn(`[economicData:primary] ${outcome.reason} — ${outcome.detail} (fail-closed: indicator excluded, no supporting-source substitution)`);
      }
      return undefined;
    })
  );
  return releases.filter((r): r is EconomicRelease => r !== undefined).map((release) => ({ release, interpretation: interpretRelease(release) }));
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

  return composeFromPairs(input, { inflationPairs, laborPairs, growthPairs });
}
