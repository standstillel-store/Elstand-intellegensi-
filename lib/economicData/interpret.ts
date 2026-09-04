// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — per-indicator interpretation (architecture
// correction §2/§9).
//
// Pipeline, strictly in this order, per release:
//   actual vs forecast → Surprise
//   actual vs previous → Momentum
//   revisionEngine.analyzeRevision() → RevisionImpact (imported, not
//     reimplemented — §8 says revision is first-class and independent)
//   → macroPressure + policyImplication, derived EXPLICITLY per indicator
//     category (never a generic higher_is flag — see
//     indicatorDefinitions.ts's header for why that field doesn't exist).
//
// DATA COMPLETENESS vs MARKET-PREDICTION CONFIDENCE (§9, restated here
// because it's computed here): `dataCompleteness` reflects how much of
// the actual/forecast/previous triad is present. It is never relabeled or
// consumed anywhere downstream as "how confident ELVOID AI is that the
// market will move a certain way" — see regime.ts and
// composeMacroContext.ts for how the two stay visibly distinct all the
// way to the context ELVOID AI receives.
//
// KNOWN UNIT-RECONCILIATION LIMITATION (documented, not silently
// papered over): ForexFactory forecast/previous strings for
// count-based indicators (NFP) use compact suffixes ("232K" → parsed as
// 232,000 by interpretMath.ts). Alpha Vantage's NFP-derived observations
// are in the source series' native unit (thousands of persons, e.g.
// "232" meaning 232K). This file does NOT reconcile the two unit bases
// automatically. A same-release NFP surprise (actual from ForexFactory
// vs forecast also from ForexFactory) is internally consistent and
// correct. A cross-provider NFP comparison (e.g. actual sourced from an
// Alpha Vantage observation vs forecast from ForexFactory) would be
// unit-mismatched and is NOT attempted by getIndicatorInterpretation() —
// it only compares actual/forecast/previous that all came from the same
// EconomicRelease. This is flagged again in the Phase A-F final report.
// ---------------------------------------------------------------------------

import { INDICATOR_CATEGORY, type CanonicalIndicatorId } from "./canonicalIndicators";
import { analyzeRevision, type RevisionImpact } from "./revisionEngine";
import { parseNumericValue } from "./interpretMath";
import type { DataCompleteness, EconomicRelease } from "./types";

export type Surprise = "HOTTER_THAN_EXPECTED" | "COOLER_THAN_EXPECTED" | "IN_LINE" | "UNAVAILABLE";
export type Momentum = "ACCELERATING" | "DECELERATING" | "STABLE" | "UNAVAILABLE";

export type MacroPressure =
  | "INFLATIONARY"
  | "DISINFLATIONARY"
  | "LABOR_TIGHT"
  | "LABOR_WEAKENING"
  | "GROWTH_POSITIVE"
  | "GROWTH_NEGATIVE"
  | "NEUTRAL"
  | "MIXED"
  | "INSUFFICIENT_DATA";

export type PolicyImplication = "INCREASES_HAWKISH_PRESSURE" | "INCREASES_DOVISH_PRESSURE" | "NEUTRAL" | "MIXED" | "INSUFFICIENT_DATA";

export interface IndicatorInterpretation {
  indicatorId: CanonicalIndicatorId;
  surprise: Surprise;
  momentum: Momentum;
  revisionImpact: RevisionImpact;
  macroPressure: MacroPressure;
  policyImplication: PolicyImplication;
  dataCompleteness: DataCompleteness;
  explanation: string;
}

// IN_LINE tolerance — a surprise smaller than this (relative to the
// forecast's magnitude) reads as "in line with expectations" rather than
// hot/cool. Same "documented simple first cut" status as
// revisionEngine.ts's MATERIALITY_THRESHOLD_PCT.
const SURPRISE_TOLERANCE_PCT = 2;

function computeSurprise(actual: number | null, forecast: number | null): Surprise {
  if (actual === null || forecast === null) return "UNAVAILABLE";
  if (forecast === 0) return actual === 0 ? "IN_LINE" : actual > 0 ? "HOTTER_THAN_EXPECTED" : "COOLER_THAN_EXPECTED";
  const relativeMove = ((actual - forecast) / Math.abs(forecast)) * 100;
  if (Math.abs(relativeMove) < SURPRISE_TOLERANCE_PCT) return "IN_LINE";
  return relativeMove > 0 ? "HOTTER_THAN_EXPECTED" : "COOLER_THAN_EXPECTED";
}

function computeMomentum(actual: number | null, previous: number | null): Momentum {
  if (actual === null || previous === null) return "UNAVAILABLE";
  if (actual === previous) return "STABLE";
  return actual > previous ? "ACCELERATING" : "DECELERATING";
}

function computeDataCompleteness(actual: number | null, forecast: number | null, previous: number | null): DataCompleteness {
  if (actual === null) return "UNAVAILABLE";
  if (forecast !== null && previous !== null) return "HIGH";
  if (forecast !== null || previous !== null) return "MEDIUM";
  return "LIMITED";
}

/**
 * Category-level default mapping, per §9's macroPressure/policyImplication
 * concepts. Indicator-level overrides (below) take precedence — this is
 * the fallback for indicators without a special case.
 */
function inflationPressure(surprise: Surprise): { macroPressure: MacroPressure; policyImplication: PolicyImplication } {
  switch (surprise) {
    case "HOTTER_THAN_EXPECTED":
      return { macroPressure: "INFLATIONARY", policyImplication: "INCREASES_HAWKISH_PRESSURE" };
    case "COOLER_THAN_EXPECTED":
      return { macroPressure: "DISINFLATIONARY", policyImplication: "INCREASES_DOVISH_PRESSURE" };
    case "IN_LINE":
      return { macroPressure: "NEUTRAL", policyImplication: "NEUTRAL" };
    default:
      return { macroPressure: "INSUFFICIENT_DATA", policyImplication: "INSUFFICIENT_DATA" };
  }
}

function growthPressure(surprise: Surprise): { macroPressure: MacroPressure; policyImplication: PolicyImplication } {
  switch (surprise) {
    case "HOTTER_THAN_EXPECTED":
      // Stronger-than-expected growth data reads as economy running hot —
      // a mild hawkish input, not a market-direction call.
      return { macroPressure: "GROWTH_POSITIVE", policyImplication: "INCREASES_HAWKISH_PRESSURE" };
    case "COOLER_THAN_EXPECTED":
      return { macroPressure: "GROWTH_NEGATIVE", policyImplication: "INCREASES_DOVISH_PRESSURE" };
    case "IN_LINE":
      return { macroPressure: "NEUTRAL", policyImplication: "NEUTRAL" };
    default:
      return { macroPressure: "INSUFFICIENT_DATA", policyImplication: "INSUFFICIENT_DATA" };
  }
}

/** LABOR category: NFP / Average Hourly Earnings read "higher = tighter labor" (surprise same direction as inflation-style mapping); Unemployment Rate is the structural INVERSE — a higher-than-forecast unemployment rate means a WEAKER labor market, not a tighter one. This inversion is explicit, indicator-specific logic — not a generic flag (Rule 4). */
function laborPressure(indicatorId: CanonicalIndicatorId, surprise: Surprise): { macroPressure: MacroPressure; policyImplication: PolicyImplication } {
  const effectiveSurprise: Surprise =
    indicatorId === "UNEMPLOYMENT_RATE" && surprise === "HOTTER_THAN_EXPECTED"
      ? "COOLER_THAN_EXPECTED"
      : indicatorId === "UNEMPLOYMENT_RATE" && surprise === "COOLER_THAN_EXPECTED"
        ? "HOTTER_THAN_EXPECTED"
        : surprise;

  switch (effectiveSurprise) {
    case "HOTTER_THAN_EXPECTED":
      return { macroPressure: "LABOR_TIGHT", policyImplication: "INCREASES_HAWKISH_PRESSURE" };
    case "COOLER_THAN_EXPECTED":
      return { macroPressure: "LABOR_WEAKENING", policyImplication: "INCREASES_DOVISH_PRESSURE" };
    case "IN_LINE":
      return { macroPressure: "NEUTRAL", policyImplication: "NEUTRAL" };
    default:
      return { macroPressure: "INSUFFICIENT_DATA", policyImplication: "INSUFFICIENT_DATA" };
  }
}

function buildExplanation(indicatorId: CanonicalIndicatorId, surprise: Surprise, momentum: Momentum, revisionImpact: RevisionImpact): string {
  const parts: string[] = [];
  if (surprise === "UNAVAILABLE") {
    parts.push(`${indicatorId}: forecast unavailable from current provider, surprise cannot be computed.`);
  } else if (surprise === "IN_LINE") {
    parts.push(`${indicatorId} printed in line with consensus.`);
  } else {
    const direction = surprise === "HOTTER_THAN_EXPECTED" ? "above" : "below";
    parts.push(`${indicatorId} printed ${direction} forecast.`);
  }
  if (momentum !== "UNAVAILABLE" && momentum !== "STABLE") {
    parts.push(`Momentum vs. the prior period is ${momentum.toLowerCase()}.`);
  }
  if (revisionImpact !== "UNAVAILABLE" && revisionImpact !== "NONE") {
    parts.push(`The prior period's figure carries a ${revisionImpact.toLowerCase()} revision.`);
  }
  return parts.join(" ");
}

export function interpretRelease(release: EconomicRelease): IndicatorInterpretation {
  const actual = parseNumericValue(release.actual);
  const forecast = parseNumericValue(release.forecast);
  const previous = parseNumericValue(release.previous);

  const surprise = computeSurprise(actual, forecast);
  const momentum = computeMomentum(actual, previous);
  const revisionImpact = analyzeRevision(release.previous, release.revisedPrevious);
  const dataCompleteness = computeDataCompleteness(actual, forecast, previous);

  const category = INDICATOR_CATEGORY[release.indicatorId];
  let pressure: { macroPressure: MacroPressure; policyImplication: PolicyImplication };

  if (release.indicatorId === "FOMC_RATE_DECISION") {
    // Discrete decision, not a continuous surprise/momentum series — see
    // indicatorDefinitions.ts's note. Handled minimally here; a fuller
    // statement/dot-plot reading is out of this phase's scope.
    pressure = { macroPressure: "INSUFFICIENT_DATA", policyImplication: "INSUFFICIENT_DATA" };
  } else if (category === "INFLATION") {
    pressure = inflationPressure(surprise);
  } else if (category === "GROWTH") {
    pressure = growthPressure(surprise);
  } else if (category === "LABOR") {
    pressure = laborPressure(release.indicatorId, surprise);
  } else {
    pressure = { macroPressure: "NEUTRAL", policyImplication: "NEUTRAL" };
  }

  return {
    indicatorId: release.indicatorId,
    surprise,
    momentum,
    revisionImpact,
    macroPressure: pressure.macroPressure,
    policyImplication: pressure.policyImplication,
    dataCompleteness,
    explanation: buildExplanation(release.indicatorId, surprise, momentum, revisionImpact),
  };
}
