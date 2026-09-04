// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — employment composite (architecture correction
// §11).
//
// NFP alone is never the whole story. This module combines NFP,
// Unemployment Rate, and Average Hourly Earnings (YoY) interpretations —
// whichever of the three are actually available — into one composite
// signal. Conflicting signals return MIXED rather than being averaged
// into a fake consensus (§5/Rule 5).
// ---------------------------------------------------------------------------

import type { IndicatorInterpretation, MacroPressure } from "./interpret";

export type EmploymentCompositeSignal = "STRONG_LABOR" | "WEAKENING_LABOR" | "MIXED" | "INSUFFICIENT_DATA";

export interface EmploymentComposite {
  signal: EmploymentCompositeSignal;
  inputs: {
    nfp?: IndicatorInterpretation;
    unemploymentRate?: IndicatorInterpretation;
    averageHourlyEarnings?: IndicatorInterpretation;
  };
  explanation: string;
}

function directionOf(pressure: MacroPressure | undefined): "strong" | "weak" | "neutral" | undefined {
  if (!pressure) return undefined;
  if (pressure === "LABOR_TIGHT") return "strong";
  if (pressure === "LABOR_WEAKENING") return "weak";
  if (pressure === "NEUTRAL") return "neutral";
  return undefined; // INSUFFICIENT_DATA / MIXED contributes nothing countable
}

export function buildEmploymentComposite(
  nfp: IndicatorInterpretation | undefined,
  unemploymentRate: IndicatorInterpretation | undefined,
  averageHourlyEarnings: IndicatorInterpretation | undefined
): EmploymentComposite {
  const inputs = { nfp, unemploymentRate, averageHourlyEarnings };
  const directions = [directionOf(nfp?.macroPressure), directionOf(unemploymentRate?.macroPressure), directionOf(averageHourlyEarnings?.macroPressure)].filter(
    (d): d is "strong" | "weak" | "neutral" => d !== undefined
  );

  if (directions.length < 2) {
    return { signal: "INSUFFICIENT_DATA", inputs, explanation: "Fewer than two of NFP, Unemployment Rate, and Average Hourly Earnings have usable data this period." };
  }

  const strongCount = directions.filter((d) => d === "strong").length;
  const weakCount = directions.filter((d) => d === "weak").length;

  if (strongCount > 0 && weakCount > 0) {
    return {
      signal: "MIXED",
      inputs,
      explanation: "Employment report components point in different directions — some signal a tighter labor market, others a weaker one.",
    };
  }
  if (strongCount > weakCount && strongCount > 0) {
    return { signal: "STRONG_LABOR", inputs, explanation: "NFP, Unemployment Rate, and Average Hourly Earnings, taken together, point toward a resilient labor market." };
  }
  if (weakCount > strongCount && weakCount > 0) {
    return { signal: "WEAKENING_LABOR", inputs, explanation: "NFP, Unemployment Rate, and Average Hourly Earnings, taken together, point toward a softening labor market." };
  }
  return { signal: "MIXED", inputs, explanation: "Employment report components are neutral or non-committal this period." };
}
