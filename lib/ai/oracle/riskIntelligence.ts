// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Risk Intelligence (Phase 7.8)
//
// A descriptive, read-only interpretation layer over the risk plan
// grading.ts/risk.ts already produced, plus the context Phases 7.2-7.7
// already built. It does NOT compute a second risk plan, does NOT gate
// execution, and does NOT feed back into confidence/grade/side/riskStatus.
// `overall` is a plain descriptive RiskSeverity readout — same discipline
// as arbitration.ts's `alignment`: annotation, never a decision.
//
// Two genuinely new calculations (everything else is a reclassification of
// already-computed fields):
//   - invalidationDistanceAtr: |entry - stopLoss| / ATR(14)
//   - liquidityProximity: is risk.stopLoss/.takeProfit within 0.5x ATR of a
//     real opposing LiquidityZone (Phase 7.4)?
// Both reuse the SAME 0.5x ATR convention already established twice in
// liquidityOrderFlow.ts (its zone-dedup radius and its "meaningful price
// move" cutoff) — no new threshold invented, per audit constraint.
//
// PURE / READ-ONLY. No new fetch. Never mutates its inputs (see fixture 8,
// the mutation-safety check).
// ---------------------------------------------------------------------------

import { atr as atrSeries } from "@/lib/elvoid/indicators";
import type { OracleContext } from "./types";
import type { OracleRiskPlan } from "./gradingTypes";
import type { RegimeContext } from "./regime";
import type { ScenarioContext } from "./scenario";
import type { ContradictionReport } from "./contradiction";
import type { DecisionArbitration } from "./arbitration";
import type { LiquidityOrderFlowContext, LiquidityZone } from "./liquidityOrderFlow";

export type RiskSeverity = "LOW" | "MODERATE" | "HIGH";
export type RiskFactorKind = "STRUCTURAL" | "VOLATILITY" | "LIQUIDITY_PROXIMITY" | "CONTRADICTION" | "SCENARIO" | "CONTEXT";
export type RiskDataQuality = "real" | "proxy" | "unavailable";

export interface RiskFactor {
  kind: RiskFactorKind;
  severity: RiskSeverity;
  evidence: string;
  quality: RiskDataQuality;
  /** Which already-computed field this factor was read from — traceability, not a new source of truth. */
  source: string;
}

export type RiskContextQuality = "real" | "mixed" | "degraded" | "insufficient";

export interface RiskIntelligence {
  /** Descriptive readout only — max severity across REAL-quality factors (see aggregation rule below). Never an execution gate, never fed back into confidence/grade/side/riskStatus. */
  overall: RiskSeverity;
  factors: RiskFactor[];
  invalidationDistanceAtr: number | null;
  liquidityProximity: { nearestOpposingZone: LiquidityZone | null; withinRiskZone: boolean } | null;
  contextQuality: RiskContextQuality;
}

/** Same `period*2+1` minimum-candle convention already established in regime.ts's `MIN_CANDLES_FOR_ADX` (both atr() and calcAdx() are EMA(14)-based) — reused here so ATR isn't trusted as reliable before its own EMA has had enough samples, even though atr()'s ema() will technically return a non-zero number well before that. Not a new invented threshold. */
const MIN_CANDLES_FOR_RELIABLE_ATR = 29;

/** Same 0.5x ATR convention already used twice in liquidityOrderFlow.ts (zone-dedup radius, "meaningful price move" cutoff) — reused verbatim, not a new threshold. */
const ATR_PROXIMITY_MULTIPLE = 0.5;

/**
 * risk.stopLoss/.takeProfit sitting within 0.5x ATR of a real, opposing
 * (i.e. on the "wrong" side for this trade) LiquidityZone means that price
 * level is a plausible sweep/reaction target — the plan's protective/target
 * level isn't sitting in clean, uncontested space. Only REAL-quality zones
 * count; proxy/unavailable zones never manufacture this factor.
 */
function findNearestOpposingZone(risk: OracleRiskPlan, side: "LONG" | "SHORT", zones: LiquidityZone[], atrValue: number): { zone: LiquidityZone | null; withinRiskZone: boolean } {
  const opposingSide = side === "LONG" ? "SHORT" : "LONG";
  const realZones = zones.filter((z) => z.quality === "real" && z.side === opposingSide);
  if (realZones.length === 0 || atrValue <= 0) return { zone: null, withinRiskZone: false };

  const radius = atrValue * ATR_PROXIMITY_MULTIPLE;
  const relevantPrices = [risk.stopLoss, risk.takeProfit];
  let nearest: LiquidityZone | null = null;
  let nearestDist = Infinity;
  for (const zone of realZones) {
    const dist = Math.min(...relevantPrices.map((p) => Math.abs(p - zone.price)));
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = zone;
    }
  }
  return { zone: nearest, withinRiskZone: nearest !== null && nearestDist <= radius };
}

function structuralAndVolatilityFactors(risk: OracleRiskPlan, atrValue: number): RiskFactor[] {
  if (atrValue <= 0) {
    return [{ kind: "VOLATILITY", severity: "LOW", evidence: "ATR(14) tidak tersedia/nol — tidak bisa menormalisasi jarak risiko.", quality: "unavailable", source: "indicators.ts::atr()" }];
  }
  const invalidationDistanceAtr = Math.abs(risk.entry - risk.stopLoss) / atrValue;
  const factors: RiskFactor[] = [];
  if (invalidationDistanceAtr < ATR_PROXIMITY_MULTIPLE) {
    factors.push({
      kind: "STRUCTURAL",
      severity: "HIGH",
      evidence: `Jarak invalidasi (SL) hanya ${invalidationDistanceAtr.toFixed(2)}x ATR — lebih ketat dari ambang 0.5x ATR, rawan tersapu noise normal.`,
      quality: "real",
      source: "risk.stopLoss vs ATR(14)",
    });
  } else if (invalidationDistanceAtr < 1) {
    factors.push({
      kind: "STRUCTURAL",
      severity: "MODERATE",
      evidence: `Jarak invalidasi (SL) ${invalidationDistanceAtr.toFixed(2)}x ATR — di bawah 1x ATR, relatif ketat.`,
      quality: "real",
      source: "risk.stopLoss vs ATR(14)",
    });
  }
  return factors;
}

function contradictionFactor(contradictions: ContradictionReport | null | undefined): RiskFactor[] {
  if (!contradictions) return [];
  const genuine = contradictions.contradictions.filter((c) => c.genuineness === "GENUINE" && c.severity !== "LOW");
  if (genuine.length === 0) return [];
  const worst = genuine.some((c) => c.severity === "HIGH") ? "HIGH" : "MODERATE";
  return [
    {
      kind: "CONTRADICTION",
      severity: worst,
      evidence: genuine.map((c) => c.description).join(" "),
      quality: "real",
      source: "contradictions.hasUnresolvedGenuineContradiction",
    },
  ];
}

function scenarioFactor(arbitration: DecisionArbitration | null | undefined, scenarios: ScenarioContext | null | undefined): RiskFactor[] {
  if (!arbitration || !scenarios?.alternative) return [];
  if (!arbitration.alternativeIsActiveOpposition) return [];
  return [
    {
      kind: "SCENARIO",
      severity: "MODERATE",
      evidence: `Skenario alternatif (${scenarios.alternative.direction}) didukung oleh opposing evidence aktif, bukan sekadar contingency dalam struktur: ${scenarios.alternative.thesis}`,
      quality: "real",
      source: "arbitration.alternativeIsActiveOpposition",
    },
  ];
}

function contextFactor(arbitration: DecisionArbitration | null | undefined): RiskFactor[] {
  if (!arbitration) return [];
  if (arbitration.alignment === "CONFLICTED") {
    return [{ kind: "CONTEXT", severity: "HIGH", evidence: arbitration.reasons.join(" "), quality: "real", source: "arbitration.alignment" }];
  }
  if (arbitration.alignment === "UNSUPPORTED_CONTEXT") {
    return [{ kind: "CONTEXT", severity: "MODERATE", evidence: arbitration.reasons.join(" "), quality: "unavailable", source: "arbitration.alignment" }];
  }
  return [];
}

function aggregateOverall(factors: RiskFactor[]): RiskSeverity {
  // Per constraint: never manufacture risk from missing data. Only
  // REAL-quality factors can drive `overall` to HIGH; a factor built from
  // proxy/unavailable data is capped at contributing MODERATE at most.
  let hasHigh = false;
  let hasModerate = false;
  for (const f of factors) {
    const effectiveSeverity = f.quality === "real" ? f.severity : f.severity === "HIGH" ? "MODERATE" : f.severity;
    if (effectiveSeverity === "HIGH") hasHigh = true;
    else if (effectiveSeverity === "MODERATE") hasModerate = true;
  }
  if (hasHigh) return "HIGH";
  if (hasModerate) return "MODERATE";
  return "LOW";
}

export function buildRiskIntelligence(
  context: OracleContext,
  risk: OracleRiskPlan | null,
  side: "LONG" | "SHORT" | null,
  regime?: RegimeContext | null,
  scenarios?: ScenarioContext | null,
  contradictions?: ContradictionReport | null,
  arbitration?: DecisionArbitration | null,
  liquidityOrderFlow?: LiquidityOrderFlowContext | null
): RiskIntelligence {
  if (!risk || !side) {
    return { overall: "LOW", factors: [], invalidationDistanceAtr: null, liquidityProximity: null, contextQuality: "insufficient" };
  }

  const atrValues = atrSeries(context.candles, 14);
  const atrValue = context.candles.length >= MIN_CANDLES_FOR_RELIABLE_ATR ? atrValues[atrValues.length - 1] || 0 : 0;
  const invalidationDistanceAtr = atrValue > 0 ? Math.abs(risk.entry - risk.stopLoss) / atrValue : null;

  const zones = liquidityOrderFlow?.zones ?? [];
  const proximity = atrValue > 0 ? findNearestOpposingZone(risk, side, zones, atrValue) : { zone: null, withinRiskZone: false };
  const liquidityProximity = zones.length > 0 ? { nearestOpposingZone: proximity.zone, withinRiskZone: proximity.withinRiskZone } : null;

  const factors: RiskFactor[] = [...structuralAndVolatilityFactors(risk, atrValue), ...contradictionFactor(contradictions), ...scenarioFactor(arbitration, scenarios), ...contextFactor(arbitration)];

  if (liquidityProximity?.withinRiskZone && liquidityProximity.nearestOpposingZone) {
    factors.push({
      kind: "LIQUIDITY_PROXIMITY",
      severity: "MODERATE",
      evidence: `SL/TP berada dalam ${ATR_PROXIMITY_MULTIPLE}x ATR dari zona likuiditas lawan (${liquidityProximity.nearestOpposingZone.type} @ ${liquidityProximity.nearestOpposingZone.price.toFixed(4)}) — level ini bukan ruang bersih.`,
      quality: "real",
      source: "liquidityOrderFlow.zones",
    });
  }

  let contextQuality: RiskContextQuality;
  if (!regime || !scenarios || !contradictions || !arbitration || !liquidityOrderFlow) {
    contextQuality = "degraded";
  } else if (regime.quality === "real" && zones.every((z) => z.quality === "real")) {
    contextQuality = "real";
  } else {
    contextQuality = "mixed";
  }

  return {
    overall: aggregateOverall(factors),
    factors,
    invalidationDistanceAtr,
    liquidityProximity,
    contextQuality,
  };
}
