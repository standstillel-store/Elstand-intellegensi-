// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — cluster aggregation (architecture correction
// §11).
//
// Aggregates per-indicator interpretations within a category into one
// cluster read. Never averages arbitrary numbers into a score — counts
// directional votes among available interpretations and returns MIXED /
// INSUFFICIENT_DATA honestly when evidence disagrees or is thin, per
// Rule 5.
// ---------------------------------------------------------------------------

import type { IndicatorInterpretation, MacroPressure, PolicyImplication } from "./interpret";
import type { EmploymentComposite } from "./employmentComposite";

export type InflationClusterState = "HOT" | "COOLING" | "MIXED" | "INSUFFICIENT_DATA";
export type LaborClusterState = "STRONG" | "WEAKENING" | "MIXED" | "INSUFFICIENT_DATA";
export type GrowthClusterState = "EXPANDING" | "SLOWING" | "MIXED" | "INSUFFICIENT_DATA";
export type MonetaryPolicyClusterState = "HAWKISH" | "DOVISH" | "NEUTRAL" | "UNCERTAIN";

export interface ClusterResult<S extends string> {
  state: S;
  drivers: string[]; // indicator ids that contributed
  dataCompleteness: "HIGH" | "MEDIUM" | "LIMITED" | "UNAVAILABLE" | "INSUFFICIENT_DATA";
  explanation: string;
}

function votePressure(interpretations: IndicatorInterpretation[], positive: MacroPressure, negative: MacroPressure) {
  const usable = interpretations.filter((i) => i.macroPressure === positive || i.macroPressure === negative || i.macroPressure === "NEUTRAL");
  const positiveCount = usable.filter((i) => i.macroPressure === positive).length;
  const negativeCount = usable.filter((i) => i.macroPressure === negative).length;
  return { usable, positiveCount, negativeCount };
}

export function buildInflationCluster(interpretations: IndicatorInterpretation[]): ClusterResult<InflationClusterState> {
  const drivers = interpretations.map((i) => i.indicatorId);
  if (interpretations.length === 0) {
    return { state: "INSUFFICIENT_DATA", drivers, dataCompleteness: "UNAVAILABLE", explanation: "No inflation-cluster releases available." };
  }
  const { usable, positiveCount, negativeCount } = votePressure(interpretations, "INFLATIONARY", "DISINFLATIONARY");
  if (usable.length === 0) {
    return { state: "INSUFFICIENT_DATA", drivers, dataCompleteness: "UNAVAILABLE", explanation: "Inflation releases exist but none have usable actual/forecast data yet." };
  }
  const state: InflationClusterState = positiveCount > negativeCount ? "HOT" : negativeCount > positiveCount ? "COOLING" : "MIXED";
  return {
    state,
    drivers,
    dataCompleteness: usable.length === interpretations.length ? "HIGH" : "MEDIUM",
    explanation: `${positiveCount} inflation reading(s) came in hot, ${negativeCount} cooling, based on ${usable.length} of ${interpretations.length} available release(s).`,
  };
}

export function buildLaborCluster(interpretations: IndicatorInterpretation[], employmentComposite: EmploymentComposite): ClusterResult<LaborClusterState> {
  const drivers = interpretations.map((i) => i.indicatorId);
  if (employmentComposite.signal === "INSUFFICIENT_DATA" && interpretations.length === 0) {
    return { state: "INSUFFICIENT_DATA", drivers, dataCompleteness: "UNAVAILABLE", explanation: "No labor-cluster releases available." };
  }
  const map: Record<EmploymentComposite["signal"], LaborClusterState> = {
    STRONG_LABOR: "STRONG",
    WEAKENING_LABOR: "WEAKENING",
    MIXED: "MIXED",
    INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  };
  return {
    state: map[employmentComposite.signal],
    drivers,
    dataCompleteness: employmentComposite.signal === "INSUFFICIENT_DATA" ? "LIMITED" : "MEDIUM",
    explanation: employmentComposite.explanation,
  };
}

export function buildGrowthCluster(interpretations: IndicatorInterpretation[]): ClusterResult<GrowthClusterState> {
  const drivers = interpretations.map((i) => i.indicatorId);
  if (interpretations.length === 0) {
    return { state: "INSUFFICIENT_DATA", drivers, dataCompleteness: "UNAVAILABLE", explanation: "No growth-cluster releases available." };
  }
  const { usable, positiveCount, negativeCount } = votePressure(interpretations, "GROWTH_POSITIVE", "GROWTH_NEGATIVE");
  if (usable.length === 0) {
    return { state: "INSUFFICIENT_DATA", drivers, dataCompleteness: "UNAVAILABLE", explanation: "Growth releases exist but none have usable actual/forecast data yet." };
  }
  const state: GrowthClusterState = positiveCount > negativeCount ? "EXPANDING" : negativeCount > positiveCount ? "SLOWING" : "MIXED";
  return {
    state,
    drivers,
    dataCompleteness: usable.length === interpretations.length ? "HIGH" : "MEDIUM",
    explanation: `${positiveCount} growth reading(s) beat expectations, ${negativeCount} missed, based on ${usable.length} of ${interpretations.length} available release(s).`,
  };
}

/** Monetary policy cluster is derived from the POLICY IMPLICATIONS of every other cluster's interpretations, not from its own release set (Fed Funds Rate / Treasury Yield are FRED-sourced continuous series, not surprise-driven releases in this pipeline — see indicatorDefinitions.ts). */
export function buildMonetaryPolicyCluster(allInterpretations: IndicatorInterpretation[]): ClusterResult<MonetaryPolicyClusterState> {
  const usable = allInterpretations.filter((i) => i.policyImplication !== "INSUFFICIENT_DATA");
  const drivers = usable.map((i) => i.indicatorId);
  if (usable.length === 0) {
    return { state: "UNCERTAIN", drivers, dataCompleteness: "UNAVAILABLE", explanation: "No indicator has enough data yet to imply policy pressure." };
  }
  const countOf = (impl: PolicyImplication) => usable.filter((i) => i.policyImplication === impl).length;
  const hawkish = countOf("INCREASES_HAWKISH_PRESSURE");
  const dovish = countOf("INCREASES_DOVISH_PRESSURE");
  const state: MonetaryPolicyClusterState = hawkish > dovish ? "HAWKISH" : dovish > hawkish ? "DOVISH" : hawkish === 0 && dovish === 0 ? "NEUTRAL" : "UNCERTAIN";
  return {
    state,
    drivers,
    dataCompleteness: usable.length === allInterpretations.length ? "HIGH" : "MEDIUM",
    explanation: `${hawkish} indicator(s) point toward hawkish pressure, ${dovish} toward dovish pressure, based on ${usable.length} available reading(s).`,
  };
}
