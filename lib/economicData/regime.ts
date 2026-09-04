// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — economic regime + risk environment
// (architecture correction §9/§10).
//
// NAMING: this file's `EconomicRegime` is a DIFFERENT concept from the
// existing `MacroRegime` in lib/ai/macroIntelligence/contracts.ts, which
// is calendar-density (EVENT_HEAVY/EVENT_LIGHT/QUIET/UNKNOWN). Never
// import one where the other is expected — see composeMacroContext.ts for
// how both are kept on visibly distinct fields (`macroRegime` vs
// `economicRegime`) on the same merged context (Conflict #2 from the
// architecture-correction response).
//
// RiskEnvironment describes the MACRO ENVIRONMENT'S general risk posture
// — it is explicitly NOT an asset-price prediction. Asset-specific
// interpretation (e.g. what this might mean for BTC) happens later,
// inside ELVOID AI's own reasoning, combining this with technical/order-
// flow/liquidity context this subsystem never touches (§10).
// ---------------------------------------------------------------------------

import type { GrowthClusterState, InflationClusterState, LaborClusterState, MonetaryPolicyClusterState } from "./clusters";

export type EconomicRegime =
  | "INFLATIONARY_EXPANSION"
  | "DISINFLATIONARY_EXPANSION"
  | "STAGFLATION_RISK"
  | "DISINFLATIONARY_SLOWDOWN"
  | "GROWTH_SLOWDOWN"
  | "MIXED_TRANSITION"
  | "INSUFFICIENT_DATA";

export type RiskEnvironment = "RISK_ON_SUPPORTIVE" | "RISK_OFF_PRESSURE" | "CAUTIOUS" | "MIXED" | "TRANSITIONING" | "INSUFFICIENT_DATA";

export interface RegimeAssessment {
  economicRegime: EconomicRegime;
  riskEnvironment: RiskEnvironment;
  explanation: string;
}

/**
 * economicRegime is a deliberately small, explainable decision table over
 * (inflation cluster, growth cluster) — the two axes that conventionally
 * define macro "regime" language. Labor and monetary-policy clusters
 * inform the SUBSEQUENT risk-environment step, not this table directly,
 * keeping each step legible rather than one big multi-input scoring
 * function.
 */
function deriveEconomicRegime(inflation: InflationClusterState, growth: GrowthClusterState): EconomicRegime {
  if (inflation === "INSUFFICIENT_DATA" || growth === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (inflation === "HOT" && growth === "EXPANDING") return "INFLATIONARY_EXPANSION";
  if (inflation === "COOLING" && growth === "EXPANDING") return "DISINFLATIONARY_EXPANSION";
  if (inflation === "HOT" && growth === "SLOWING") return "STAGFLATION_RISK";
  if (inflation === "COOLING" && growth === "SLOWING") return "DISINFLATIONARY_SLOWDOWN";
  if (growth === "SLOWING") return "GROWTH_SLOWDOWN";
  return "MIXED_TRANSITION";
}

/**
 * riskEnvironment layers monetary-policy pressure and labor conditions on
 * top of the economic regime — the "economic condition → policy pressure
 * → liquidity/risk environment" chain §10 asks for, expressed as an
 * explicit table rather than a single formula.
 */
function deriveRiskEnvironment(economicRegime: EconomicRegime, policy: MonetaryPolicyClusterState, labor: LaborClusterState): RiskEnvironment {
  if (economicRegime === "INSUFFICIENT_DATA" || policy === "UNCERTAIN") return "INSUFFICIENT_DATA";

  if (economicRegime === "STAGFLATION_RISK") return "RISK_OFF_PRESSURE";
  if (economicRegime === "DISINFLATIONARY_EXPANSION" && policy === "DOVISH") return "RISK_ON_SUPPORTIVE";
  if (economicRegime === "INFLATIONARY_EXPANSION" && policy === "HAWKISH") return "CAUTIOUS";
  if (economicRegime === "GROWTH_SLOWDOWN" || economicRegime === "DISINFLATIONARY_SLOWDOWN") {
    return labor === "WEAKENING" ? "RISK_OFF_PRESSURE" : "CAUTIOUS";
  }
  if (economicRegime === "MIXED_TRANSITION") return "TRANSITIONING";
  return "MIXED";
}

export function assessRegime(
  inflation: InflationClusterState,
  labor: LaborClusterState,
  growth: GrowthClusterState,
  monetaryPolicy: MonetaryPolicyClusterState
): RegimeAssessment {
  const economicRegime = deriveEconomicRegime(inflation, growth);
  const riskEnvironment = deriveRiskEnvironment(economicRegime, monetaryPolicy, labor);

  const explanation =
    economicRegime === "INSUFFICIENT_DATA"
      ? "Not enough inflation or growth data available yet to characterize the current economic regime."
      : `Inflation is ${inflation.toLowerCase()} while growth is ${growth.toLowerCase()}, placing the economy in a ${economicRegime.replace(/_/g, " ").toLowerCase()} configuration. Monetary policy pressure reads ${monetaryPolicy.toLowerCase()}, and labor conditions are ${labor.toLowerCase()}. This describes the macro environment only — it is not a market-direction prediction.`;

  return { economicRegime, riskEnvironment, explanation };
}
