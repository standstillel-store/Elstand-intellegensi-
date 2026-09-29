// ---------------------------------------------------------------------------
// ELVOID Oracle macro context — ECONOMIC INTELLIGENCE (Phase 9 rewire).
//
// Replaces the retired decision path
//     ForexFactory calendar -> analyzeMacroIntelligence -> Pre-entry -> Decision
// with
//     FRED / Alpha Vantage (lib/economicData, normalized + stored)
//       -> composeMacroContext (existing cluster/regime pipeline)
//       -> this adapter -> Pre-entry -> Decision
//
// Rules enforced here (each covered by scripts/phase9/intelligence-evolution-fixtures.ts):
//  - The ForexFactory calendar is NEVER an input. composeMacroContext() is
//    called with an empty calendar purely to reuse its cluster pipeline; every
//    calendar-derived field is then overwritten, so an empty calendar can
//    never masquerade as "healthy, quiet" data.
//  - No global "event risk" is invented from a currency calendar. eventRisk is
//    derived only from the economic regime's riskEnvironment, and is never
//    ELEVATED (ELEVATED means BLOCKED downstream; this adapter never
//    tightens OR loosens that gate — it only reports evidence).
//  - Missing / low-completeness data is reported as PARTIAL / UNAVAILABLE,
//    which pre-entry already treats as CAUTION (never VALID -> never EXECUTE).
//  - Any throw becomes an explicit UNAVAILABLE context, never a silent null.
// ---------------------------------------------------------------------------

import type { DataCompleteness } from "@/lib/economicData/types";
import type { RiskEnvironment } from "@/lib/economicData/regime";
import type { MacroDataAvailability, MacroEventRiskLevel, MacroIntelligenceContext, MacroIntelligenceInput } from "@/lib/ai/macroIntelligence/contracts";

/** Only HIGH completeness counts as AVAILABLE; anything less is honestly PARTIAL. Strictly no looser than the calendar-era gate. */
export function mapCompletenessToAvailability(c: DataCompleteness | undefined): MacroDataAvailability {
  if (c === "HIGH") return "AVAILABLE";
  if (c === "MEDIUM" || c === "LIMITED") return "PARTIAL";
  return "UNAVAILABLE";
}

/** Macro-environment pressure -> the existing closed event-risk scale. Deliberately never ELEVATED. */
export function mapRiskEnvironmentToEventRisk(r: RiskEnvironment | undefined): MacroEventRiskLevel {
  switch (r) {
    case "RISK_OFF_PRESSURE":
      return "MODERATE";
    case "CAUTIOUS":
    case "TRANSITIONING":
    case "MIXED":
      return "LOW";
    case "RISK_ON_SUPPORTIVE":
      return "NONE";
    default:
      return "UNKNOWN";
  }
}

export function buildUnavailableMacroContext(asOf: string, reason: string): MacroIntelligenceContext {
  return {
    version: 1,
    generatedAt: asOf,
    dataAvailability: "UNAVAILABLE",
    usableEventCount: 0,
    totalEventCount: 0,
    macroRegime: "UNKNOWN",
    eventRisk: "UNKNOWN",
    eventProximity: "UNKNOWN",
    upcomingHighImpactEvent: null,
    directionalBias: null,
    oracleSource: "ECONOMIC_INTELLIGENCE",
    failureReason: reason,
  };
}

/** Pure: takes a cluster-pipeline result and strips every calendar-derived field, replacing them with economic-intelligence-derived ones. */
export function toOracleMacroContext(economic: MacroIntelligenceContext): MacroIntelligenceContext {
  return {
    ...economic,
    dataAvailability: mapCompletenessToAvailability(economic.dataCompleteness),
    usableEventCount: 0,
    totalEventCount: 0,
    macroRegime: "UNKNOWN",
    eventRisk: mapRiskEnvironmentToEventRisk(economic.riskEnvironment),
    eventProximity: "UNKNOWN",
    upcomingHighImpactEvent: null,
    directionalBias: null,
    oracleSource: "ECONOMIC_INTELLIGENCE",
  };
}

type ComposeFn = (input: MacroIntelligenceInput) => Promise<MacroIntelligenceContext>;

/** Never throws. Split from oracleMacro.ts so it (and its fixtures) carry no DB/network imports. */
export async function assembleWithCompose(asOf: string, compose: ComposeFn): Promise<MacroIntelligenceContext> {
  try {
    const economic = await compose({ asOf, calendar: [] });
    return toOracleMacroContext(economic);
  } catch (err) {
    return buildUnavailableMacroContext(asOf, `economic intelligence composition threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
