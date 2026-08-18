// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — insight & pattern recognition (Phase 4)
//
// Turns a ConfluenceResult + OracleAssessment (Phase 2/3) into the
// human-readable MARKET INSIGHT sections from the spec, and a list of named
// patterns. Every sentence here is built by reusing the factor.evidence
// strings already computed in Phase 2 (which themselves came from real
// scanner/footprint/TPO/orderbook output) — nothing here invents a new
// number or a generic "the market looks bullish" template (spec §15).
//
// Pattern names are only emitted when 2+ of their real component markers
// are BOTH present in the dominant side's own firing evidence text. Markers
// this module can honestly detect: Liquidity Sweep, Order Block, Fair Value
// Gap, Structure Shift (BOS/HH-HL), TPO Reclaim, Delta Dominance. Combos the
// original spec mentions but that this engine has no real detector for yet
// (Failed Auction, explicit Delta Divergence, Orderbook Rejection as a
// distinct wick-rejection event) are deliberately NOT emitted — spec §16:
// "Do not generate pattern labels merely because the chart looks visually
// similar."
// ---------------------------------------------------------------------------

import type { ConfluenceResult, ConfluenceFactor } from "./confluenceTypes";
import type { OracleAssessment } from "./gradingTypes";

export interface OracleInsight {
  marketRegime: string;
  primaryScenario: string;
  alternativeScenario: string;
  liquidity: string;
  tpo: string;
  footprint: string;
  orderFlow: string;
  risk: string;
  patterns: string[];
}

type Marker = "LIQUIDITY_SWEEP" | "ORDER_BLOCK" | "FVG" | "STRUCTURE_SHIFT" | "TPO_RECLAIM" | "DELTA_DOMINANCE";

const MARKER_KEYWORDS: Record<Marker, RegExp> = {
  LIQUIDITY_SWEEP: /sweep/i,
  ORDER_BLOCK: /order block/i,
  FVG: /fair value gap|fvg/i,
  STRUCTURE_SHIFT: /bos|break of structure|higher-high|higher-low|lower-high|lower-low|hh\/hl|lh\/ll/i,
  TPO_RECLAIM: /value area|tvah|tval|acceptance di luar value/i,
  DELTA_DOMINANCE: /delta dominan|buy delta|sell delta|imbalance/i,
};

const MARKER_LABEL: Record<Marker, string> = {
  LIQUIDITY_SWEEP: "Liquidity Sweep",
  ORDER_BLOCK: "Order Block",
  FVG: "Fair Value Gap",
  STRUCTURE_SHIFT: "Structure Shift",
  TPO_RECLAIM: "TPO Reclaim",
  DELTA_DOMINANCE: "Delta Dominance",
};

function firingText(factors: ConfluenceFactor[], side: "LONG" | "SHORT"): string {
  return factors
    .filter((f) => (side === "LONG" ? f.longWeight : f.shortWeight) > 0)
    .map((f) => f.evidence)
    .join(" ");
}

function detectMarkers(text: string): Marker[] {
  return (Object.keys(MARKER_KEYWORDS) as Marker[]).filter((m) => MARKER_KEYWORDS[m].test(text));
}

/**
 * Named combo patterns — only emitted when at least 2 real markers are both
 * present in the dominant side's firing evidence. A single marker alone
 * (e.g. just a sweep, with nothing confirming it) is not named as a
 * "pattern"; it's already visible in supportingEvidence on its own.
 */
export function detectPatterns(confluence: ConfluenceResult, side: "LONG" | "SHORT" | null): string[] {
  if (!side) return [];
  const text = firingText(confluence.factors, side);
  const markers = detectMarkers(text);
  if (markers.length < 2) return [];

  const patterns: string[] = [];
  const has = (m: Marker) => markers.includes(m);

  if (has("LIQUIDITY_SWEEP") && has("STRUCTURE_SHIFT")) patterns.push(`${MARKER_LABEL.LIQUIDITY_SWEEP} + ${MARKER_LABEL.STRUCTURE_SHIFT}`);
  if (has("LIQUIDITY_SWEEP") && has("DELTA_DOMINANCE")) patterns.push(`${MARKER_LABEL.LIQUIDITY_SWEEP} + Absorption (${MARKER_LABEL.DELTA_DOMINANCE})`);
  if (has("TPO_RECLAIM") && has("FVG")) patterns.push(`${MARKER_LABEL.TPO_RECLAIM} + ${MARKER_LABEL.FVG} Confirmation`);
  if (has("ORDER_BLOCK") && has("DELTA_DOMINANCE")) patterns.push(`${MARKER_LABEL.ORDER_BLOCK} + ${MARKER_LABEL.DELTA_DOMINANCE}`);
  if (has("LIQUIDITY_SWEEP") && has("TPO_RECLAIM") && has("STRUCTURE_SHIFT")) patterns.push(`${MARKER_LABEL.LIQUIDITY_SWEEP} + ${MARKER_LABEL.TPO_RECLAIM} + ${MARKER_LABEL.STRUCTURE_SHIFT}`);

  // De-dupe (a 3-marker combo above can overlap with a 2-marker one already pushed).
  return Array.from(new Set(patterns));
}

function factorEvidence(factors: ConfluenceFactor[], source: ConfluenceFactor["source"]): string {
  const f = factors.find((x) => x.source === source);
  if (!f) return "Data tidak tersedia.";
  if (f.quality === "unavailable") return f.evidence;
  return `${f.evidence}${f.quality === "proxy" ? " (proxy)" : ""}`;
}

export function buildMarketInsight(confluence: ConfluenceResult, assessment: OracleAssessment): OracleInsight {
  const side = assessment.side;
  const opposite: "LONG" | "SHORT" | null = side === "LONG" ? "SHORT" : side === "SHORT" ? "LONG" : null;

  const structureText = factorEvidence(confluence.factors, "market_structure");
  const microText = factorEvidence(confluence.factors, "microstructure");
  const marketRegime = `${structureText} ${microText !== "Data tidak tersedia." ? microText : ""}`.trim();

  const primaryScenario =
    side && assessment.grade !== "NO_TRADE"
      ? `${side}: ${assessment.supportingEvidence.slice(0, 3).join(" ")}`
      : "Tidak ada skenario utama yang cukup kuat untuk di-grade saat ini — lihat gradeReason.";

  const altEvidence = opposite ? firingText(confluence.factors, opposite) : "";
  const alternativeScenario =
    confluence.contradictions.length > 0
      ? confluence.contradictions.map((c) => c.description).join(" ")
      : altEvidence
      ? `Evidence berlawanan arah yang terdeteksi (belum cukup kuat untuk membalik dominant side): ${altEvidence}`
      : "Belum ada skenario alternatif signifikan yang terdeteksi dari confluence saat ini.";

  return {
    marketRegime: marketRegime || "Data struktur pasar tidak tersedia.",
    primaryScenario,
    alternativeScenario,
    liquidity: factorEvidence(confluence.factors, "liquidity"),
    tpo: factorEvidence(confluence.factors, "tpo"),
    footprint: factorEvidence(confluence.factors, "footprint"),
    orderFlow: `${factorEvidence(confluence.factors, "orderbook")} ${factorEvidence(confluence.factors, "footprint")}`.trim(),
    risk: assessment.mainRisk,
    patterns: detectPatterns(confluence, side),
  };
}
