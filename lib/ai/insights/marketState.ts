// ---------------------------------------------------------------------------
// "MARKET STATE" narrative (spec §14) — deliberately NOT a trade call.
// Reuses ConfluenceResult factors directly; Oracle's grading is never
// consulted (would create the exact Oracle -> Insight -> Oracle coupling
// spec §13 forbids — this module only ever reads the shared upstream
// ConfluenceResult, never Oracle's output).
// ---------------------------------------------------------------------------

import type { ConfluenceResult, ConfluenceFactor, ConfluenceSource } from "../oracle/confluenceTypes";
import type { MarketState } from "./types";

const FLOW_SOURCES: ConfluenceSource[] = ["footprint", "orderbook", "liquidity", "tpo"];

function sideOf(f: ConfluenceFactor): "LONG" | "SHORT" | null {
  if (f.longWeight === f.shortWeight) return null;
  return f.longWeight > f.shortWeight ? "LONG" : "SHORT";
}

function flowLabel(confluence: ConfluenceResult, bias: "BULLISH" | "BEARISH" | "NEUTRAL"): string {
  const flowFactors = confluence.factors.filter((f) => FLOW_SOURCES.includes(f.source) && f.quality !== "unavailable" && Math.max(f.longWeight, f.shortWeight) > 0);
  if (flowFactors.length < 2) return bias === "NEUTRAL" ? "NO CLEAR FLOW" : `${bias} FLOW`;

  const sides = flowFactors.map(sideOf).filter((s): s is "LONG" | "SHORT" => s !== null);
  const longCount = sides.filter((s) => s === "LONG").length;
  const shortCount = sides.filter((s) => s === "SHORT").length;

  if (longCount > 0 && shortCount > 0) return "CONFLICTING FLOW";
  if (bias === "BULLISH" && longCount >= 2) {
    const absorption = deriveAbsorptionLabel(confluence, "LONG");
    return absorption || "BULLISH FLOW";
  }
  if (bias === "BEARISH" && shortCount >= 2) {
    const absorption = deriveAbsorptionLabel(confluence, "SHORT");
    return absorption || "BEARISH FLOW";
  }
  return bias === "NEUTRAL" ? "MIXED FLOW" : `${bias} FLOW`;
}

/** Labels the flow as absorption specifically when footprint fires strong for `side` while market_structure stays flat — same signature regime.ts uses for the ABSORPTION regime, kept consistent rather than reinvented. */
function deriveAbsorptionLabel(confluence: ConfluenceResult, side: "LONG" | "SHORT"): string {
  const fp = confluence.factors.find((f) => f.source === "footprint");
  const structure = confluence.factors.find((f) => f.source === "market_structure");
  if (!fp || !structure) return "";
  const fpWeight = side === "LONG" ? fp.longWeight : fp.shortWeight;
  const structureWeight = Math.max(structure.longWeight, structure.shortWeight);
  return fpWeight >= 8 && structureWeight < 4 ? `${side === "LONG" ? "BULLISH" : "BEARISH"} ABSORPTION` : "";
}

export function buildMarketState(confluence: ConfluenceResult): MarketState {
  const { longScore, shortScore } = confluence;
  const total = longScore + shortScore;
  const bias: MarketState["bias"] = longScore === shortScore ? "NEUTRAL" : longScore > shortScore ? "BULLISH" : "BEARISH";
  const dominantScore = Math.max(longScore, shortScore);
  const marginRatio = Math.min(longScore, shortScore) === 0 ? Infinity : dominantScore / Math.min(longScore, shortScore);

  const confirmationStrength: MarketState["confirmationStrength"] =
    total === 0 ? "WEAK" : dominantScore >= 20 && marginRatio >= 1.5 ? "STRONG" : dominantScore >= 8 ? "MODERATE" : "WEAK";

  const dominantSide: "LONG" | "SHORT" | null = bias === "NEUTRAL" ? null : bias === "BULLISH" ? "LONG" : "SHORT";
  const oppositeSide: "LONG" | "SHORT" | null = dominantSide === "LONG" ? "SHORT" : dominantSide === "SHORT" ? "LONG" : null;

  const why = dominantSide
    ? confluence.factors.filter((f) => (dominantSide === "LONG" ? f.longWeight > 0 : f.shortWeight > 0)).map((f) => `${f.label}: ${f.evidence}`)
    : [];
  const but = oppositeSide
    ? confluence.factors.filter((f) => (oppositeSide === "LONG" ? f.longWeight > 0 : f.shortWeight > 0)).map((f) => `${f.label}: ${f.evidence}`)
    : [];

  const interpretation =
    bias === "NEUTRAL"
      ? "Tidak ada bias yang cukup jelas dari confluence saat ini — kondisi market campur aduk atau data pendukung terbatas. Ini adalah gambaran kondisi pasar, bukan sinyal trading."
      : `Bias ${bias === "BULLISH" ? "bullish" : "bearish"} dengan konfirmasi ${confirmationStrength === "STRONG" ? "kuat" : confirmationStrength === "MODERATE" ? "moderat" : "lemah"} dari confluence saat ini. ${
          but.length > 0 ? "Namun ada evidence berlawanan arah yang perlu diperhatikan (lihat bagian 'But')." : ""
        } Ini adalah gambaran kondisi pasar saat ini, bukan rekomendasi entry.`;

  return {
    bias,
    confirmationStrength,
    flowLabel: flowLabel(confluence, bias),
    why,
    but,
    interpretation: interpretation.trim(),
  };
}
