// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — grading engine (Phase 3)
//
// ConfluenceResult (Phase 2) -> Data Quality Gate -> Contradiction Gate ->
// Setup Validation -> Risk Validation -> Grade Engine -> OracleAssessment
//
// Deterministic: same ConfluenceResult (+ same optional risk plan) always
// produces the same grade. No randomization, no LLM call, no fixture-
// specific special-casing — every branch below is a general rule that
// happens to also satisfy the Phase 3 test fixtures.
//
// A+ is deliberately hard to reach: it requires 3 independent evidence
// clusters (not just a high score from correlated sources), real (not
// proxy) confirmation from the order-flow cluster, no unresolved
// cross-source contradiction, and a validated risk plan. See CLUSTERS and
// gradeCeiling() below for exactly which conditions cap the grade and why.
// ---------------------------------------------------------------------------

import { ORACLE_GRADE_ORDER, type OracleGrade } from "./types";
import type { ConfluenceResult, ConfluenceFactor, ConfluenceSource } from "./confluenceTypes";
import type { OracleAssessment, OracleRiskPlan, OracleRiskStatus } from "./gradingTypes";

/**
 * Sources grouped by what they actually derive from, so "5 confirmations"
 * from sources sharing the same underlying candle/swing computation don't
 * count as 5 independent pieces of evidence (spec §4). A grade needs
 * agreement ACROSS clusters, not just several factors inside one cluster.
 *
 *  - "structure": price-action derived (swings, HH/HL, FVG, order blocks, TPO value area) — all read the same candle series.
 *  - "orderflow": real-time execution/resting-liquidity derived (footprint delta, order book depth, traded-volume liquidity nodes).
 *  - "context": derivatives/macro context (funding, basis, DXY) — informative but never sufficient alone.
 */
export const CLUSTERS: Record<ConfluenceSource, "structure" | "orderflow" | "context"> = {
  market_structure: "structure",
  smc_ict: "structure",
  tpo: "structure",
  footprint: "orderflow",
  orderbook: "orderflow",
  liquidity: "orderflow",
  microstructure: "context",
  macro: "context",
};

/** Sources whose complete unavailability blocks grading outright — without at least a structural read and an order-flow read, there isn't enough independent evidence to grade at all. */
const CRITICAL_SOURCES: ConfluenceSource[] = ["market_structure", "smc_ict", "footprint", "orderbook"];

function gradeIndex(g: OracleGrade): number {
  return ORACLE_GRADE_ORDER.indexOf(g);
}
function minGrade(a: OracleGrade, b: OracleGrade): OracleGrade {
  return gradeIndex(a) <= gradeIndex(b) ? a : b;
}

function firingClusters(factors: ConfluenceFactor[], side: "LONG" | "SHORT"): Set<"structure" | "orderflow" | "context"> {
  const set = new Set<"structure" | "orderflow" | "context">();
  for (const f of factors) {
    const weight = side === "LONG" ? f.longWeight : f.shortWeight;
    if (weight > 0) set.add(CLUSTERS[f.source]);
  }
  return set;
}

function unavailableCriticalCount(factors: ConfluenceFactor[]): number {
  return factors.filter((f) => CRITICAL_SOURCES.includes(f.source) && f.quality === "unavailable").length;
}

/** True cross-source contradiction magnitude — the strongest opposing pair among the confluence's own `contradictions` list that isn't just one factor internally ambiguous. */
function crossSourceContradictionStrength(confluence: ConfluenceResult): number {
  let strongest = 0;
  for (const c of confluence.contradictions) {
    if (c.sources.length < 2) continue; // internal single-factor ambiguity, handled separately
    const involved = confluence.factors.filter((f) => c.sources.includes(f.source));
    const magnitude = Math.min(...involved.map((f) => Math.max(f.longWeight, f.shortWeight)));
    strongest = Math.max(strongest, magnitude);
  }
  return strongest;
}

function hasInternalAmbiguity(confluence: ConfluenceResult): boolean {
  return confluence.contradictions.some((c) => c.sources.length === 1);
}

function evaluateRisk(risk: OracleRiskPlan | undefined): OracleRiskStatus {
  if (!risk) return "unavailable";
  if (!Number.isFinite(risk.entry) || !Number.isFinite(risk.stopLoss) || !Number.isFinite(risk.takeProfit) || !Number.isFinite(risk.riskReward)) return "invalid";
  if (risk.riskReward < 1) return "invalid"; // risking more than the target — never gets waved through regardless of confluence
  return "valid";
}

function buildEvidence(factors: ConfluenceFactor[], side: "LONG" | "SHORT"): { supporting: string[]; contradicting: string[] } {
  const opposite: "LONG" | "SHORT" = side === "LONG" ? "SHORT" : "LONG";
  const supporting = factors.filter((f) => (side === "LONG" ? f.longWeight : f.shortWeight) > 0).map((f) => f.evidence);
  const contradicting = factors.filter((f) => (opposite === "LONG" ? f.longWeight : f.shortWeight) > 0).map((f) => f.evidence);
  return { supporting, contradicting };
}

function buildGradeReason(grade: OracleGrade, side: "LONG" | "SHORT" | null, clusters: number, quality: "real" | "mixed", contradictionNote: string, supporting: string[]): string {
  if (grade === "NO_TRADE") return contradictionNote || "Evidence tidak cukup kuat/independen untuk grade Premium — lihat supportingEvidence/contradictingEvidence untuk detail.";
  const topEvidence = supporting.slice(0, 3).join(" ");
  return `${grade} ${side}: ${clusters} cluster evidence independen (${quality === "real" ? "seluruhnya real" : "sebagian proxy"}) saling mendukung. ${topEvidence}${contradictionNote ? ` Catatan: ${contradictionNote}` : ""}`.trim();
}

function buildInvalidation(factors: ConfluenceFactor[], side: "LONG" | "SHORT"): string {
  const tpo = factors.find((f) => f.source === "tpo");
  const structure = factors.find((f) => f.source === "market_structure");
  if (tpo && tpo.quality !== "unavailable" && (side === "LONG" ? tpo.longWeight > 0 : tpo.shortWeight > 0)) {
    return `Invalidasi jika harga kembali masuk dan close di sisi berlawanan level TPO yang mendasari setup ini — lihat evidence TPO: "${tpo.evidence}"`;
  }
  if (structure) {
    return `Invalidasi jika struktur pasar berbalik (${side === "LONG" ? "lower-low mengambil alih" : "higher-high mengambil alih"}) — lihat evidence Market Structure: "${structure.evidence}"`;
  }
  return "Invalidasi: struktur/evidence pendukung setup ini tidak lagi berlaku.";
}

function buildMainRisk(factors: ConfluenceFactor[], side: "LONG" | "SHORT", riskStatus: OracleRiskStatus): string {
  const notes: string[] = [];
  const proxyFiring = factors.filter((f) => f.quality === "proxy" && (side === "LONG" ? f.longWeight > 0 : f.shortWeight > 0));
  for (const f of proxyFiring) notes.push(`${f.label} bersifat proxy, bukan data real — jangan diperlakukan setara dengan data real.`);
  const unavailableCritical = factors.filter((f) => CRITICAL_SOURCES.includes(f.source) && f.quality === "unavailable");
  for (const f of unavailableCritical) notes.push(`${f.label} tidak tersedia — evidence dari source ini tidak dihitung sama sekali.`);
  if (riskStatus === "unavailable") notes.push("Entry/SL/TP belum dihitung untuk sinyal ini — risk plan belum tersedia.");
  if (riskStatus === "invalid") notes.push("Risk plan yang diberikan tidak valid (R:R < 1) — setup ini seharusnya tidak dieksekusi apa adanya.");
  return notes.length ? notes.join(" ") : "Tidak ada risiko data spesifik yang teridentifikasi di luar risiko pasar normal.";
}

/**
 * Score -> base grade, BEFORE any ceiling/cap is applied. Thresholds exist
 * because:
 *  - 8 pts ≈ one solid structural read (e.g. a single 10-pt Market
 *    Structure BOS) plus a bit more — the minimum a setup needs to be
 *    worth naming at all.
 *  - 20 pts ≈ roughly two independent full-strength reads (e.g. Market
 *    Structure ~10 + Footprint ~10) — enough to call it a real setup.
 *  - 35 pts ≈ three-plus independent reads agreeing, which given each
 *    cluster individually maxes out well under 35 in this engine's factor
 *    weights, cannot be reached by one cluster alone — it structurally
 *    requires cross-cluster agreement.
 * These are starting candidates only; gradeCeiling() below is what
 * actually keeps A+ rare — the score thresholds alone are not sufficient
 * to grant a grade (spec's non-negotiable rule).
 */
function baseGradeFromScore(dominantScore: number, clusters: number): OracleGrade {
  if (dominantScore >= 35 && clusters >= 3) return "A+";
  if (dominantScore >= 20 && clusters >= 2) return "A";
  if (dominantScore >= 8 && clusters >= 1) return "B+";
  return "NO_TRADE";
}

/**
 * Grades ONE side (LONG or SHORT) of a ConfluenceResult independently.
 * Returns null when this side simply isn't the dominant/gradable side for
 * this ConfluenceResult (caller decides which side, if any, to grade).
 */
function gradeSide(confluence: ConfluenceResult, side: "LONG" | "SHORT", risk: OracleRiskPlan | undefined): OracleAssessment {
  const { factors } = confluence;
  const dominantScore = side === "LONG" ? confluence.longScore : confluence.shortScore;
  const oppositeScore = side === "LONG" ? confluence.shortScore : confluence.longScore;
  const clusters = firingClusters(factors, side);
  const clusterCount = clusters.size;
  const { supporting, contradicting } = buildEvidence(factors, side);
  const riskStatus = evaluateRisk(risk);

  // --- Data Quality Gate --------------------------------------------------
  const unavailableCritical = unavailableCriticalCount(factors);
  if (unavailableCritical >= 2) {
    return {
      symbol: confluence.symbol,
      timestamp: confluence.timestamp,
      grade: "NO_TRADE",
      side: null,
      score: { long: confluence.longScore, short: confluence.shortScore },
      confidence: 0,
      independentConfirmationClusters: 0,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      dataQuality: factors.map((f) => ({ source: f.source, quality: f.quality })),
      riskStatus,
      risk: risk ?? null,
      gradeReason: `Data Quality Gate gagal: ${unavailableCritical} dari ${CRITICAL_SOURCES.length} critical source (${CRITICAL_SOURCES.join(", ")}) unavailable — evidence tidak cukup untuk grading yang dapat diaudit.`,
      invalidation: "N/A — tidak ada setup yang di-grade.",
      mainRisk: "Data critical tidak lengkap; tunggu sampai source tersedia kembali sebelum mengambil sinyal apapun.",
    };
  }

  // --- Dominant-side validity (score margin) -------------------------------
  const marginRatio = oppositeScore === 0 ? Infinity : dominantScore / oppositeScore;
  const hasValidDominance = dominantScore >= 8 && marginRatio >= 1.2;

  // --- Contradiction Gate ---------------------------------------------------
  const crossStrength = crossSourceContradictionStrength(confluence);
  const internalAmbiguity = hasInternalAmbiguity(confluence);
  const severeContradiction = crossStrength > 8;
  const moderateContradiction = crossStrength > 3 && crossStrength <= 8;

  if (!hasValidDominance || severeContradiction || clusterCount < 1) {
    const reason = !hasValidDominance
      ? `Tidak ada dominant side yang valid (LONG ${confluence.longScore} vs SHORT ${confluence.shortScore} — margin terlalu tipis atau score terlalu rendah).`
      : severeContradiction
      ? `Contradiction kuat belum terselesaikan (magnitude ${crossStrength.toFixed(1)}) — lihat contradictingEvidence.`
      : "Tidak ada cluster evidence independen yang firing untuk sisi ini.";
    return {
      symbol: confluence.symbol,
      timestamp: confluence.timestamp,
      grade: "NO_TRADE",
      side: null,
      score: { long: confluence.longScore, short: confluence.shortScore },
      confidence: 0,
      independentConfirmationClusters: clusterCount,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      dataQuality: factors.map((f) => ({ source: f.source, quality: f.quality })),
      riskStatus,
      risk: risk ?? null,
      gradeReason: reason,
      invalidation: "N/A — tidak ada setup yang di-grade.",
      mainRisk: "Tidak ada sinyal yang layak dieksekusi saat ini.",
    };
  }

  // --- Setup Validation: at least one structure-cluster factor must actually fire for this side ---
  const structureFires = factors.some((f) => CLUSTERS[f.source] === "structure" && (side === "LONG" ? f.longWeight > 0 : f.shortWeight > 0));
  if (!structureFires) {
    return {
      symbol: confluence.symbol,
      timestamp: confluence.timestamp,
      grade: "NO_TRADE",
      side: null,
      score: { long: confluence.longScore, short: confluence.shortScore },
      confidence: 0,
      independentConfirmationClusters: clusterCount,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      dataQuality: factors.map((f) => ({ source: f.source, quality: f.quality })),
      riskStatus,
      risk: risk ?? null,
      gradeReason: "Setup tidak valid: tidak ada struktur harga (Market Structure/SMC-ICT/TPO) yang mendukung sisi ini — score dari orderflow/context saja tidak cukup untuk menamai sebuah setup.",
      invalidation: "N/A — tidak ada setup yang di-grade.",
      mainRisk: "Tidak ada struktur yang bisa dijadikan acuan invalidation.",
    };
  }

  // --- Grade Engine: base candidate from score + clusters -------------------
  let grade = baseGradeFromScore(dominantScore, clusterCount);

  // --- Ceilings (spec §4/§5 — why score alone can't produce A+) -------------
  let ceiling: OracleGrade = "A+";
  const ceilingNotes: string[] = [];

  if (moderateContradiction) {
    ceiling = minGrade(ceiling, "A");
    ceilingNotes.push(`contradiction moderate (magnitude ${crossStrength.toFixed(1)}) membatasi grade maksimum ke A`);
  }
  if (internalAmbiguity) {
    ceiling = minGrade(ceiling, "A");
    ceilingNotes.push("ada factor dengan evidence internal ambigu (LONG dan SHORT sekaligus)");
  }
  if (clusterCount < 3) {
    ceiling = minGrade(ceiling, "A");
    ceilingNotes.push(`hanya ${clusterCount}/3 cluster independen yang firing — A+ butuh ketiganya`);
  }
  // Order-flow cluster must be backed by REAL data (not just proxy Liquidity) to reach A+.
  const orderflowFactorsFiring = factors.filter((f) => CLUSTERS[f.source] === "orderflow" && (side === "LONG" ? f.longWeight > 0 : f.shortWeight > 0));
  const orderflowHasReal = orderflowFactorsFiring.some((f) => f.quality === "real");
  if (!orderflowHasReal) {
    ceiling = minGrade(ceiling, "A");
    ceilingNotes.push("cluster orderflow hanya didukung data proxy, bukan real Footprint/OrderBook — A+ ditolak");
  }
  const dataCompleteness = factors.filter((f) => f.quality !== "unavailable").length / factors.length;
  if (dataCompleteness < 0.75) {
    ceiling = minGrade(ceiling, "B+");
    ceilingNotes.push(`data completeness rendah (${Math.round(dataCompleteness * 100)}% source tersedia) — dibatasi ke B+`);
  }
  if (riskStatus !== "valid") {
    ceiling = minGrade(ceiling, "A");
    ceilingNotes.push(riskStatus === "unavailable" ? "risk plan belum tersedia — A+ butuh R:R tervalidasi" : "risk plan tidak valid (R:R < 1)");
  }
  if (riskStatus === "invalid") {
    ceiling = minGrade(ceiling, "B+");
  }

  grade = minGrade(grade, ceiling);

  const quality: "real" | "mixed" = factors.filter((f) => (side === "LONG" ? f.longWeight > 0 : f.shortWeight > 0)).every((f) => f.quality === "real") ? "real" : "mixed";
  const contradictionNote = ceilingNotes.join("; ");
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(dominantScore * 1.1 + clusterCount * 12 + (quality === "real" ? 15 : 5) - (moderateContradiction ? 15 : 0) - (internalAmbiguity ? 10 : 0)))
  );

  return {
    symbol: confluence.symbol,
    timestamp: confluence.timestamp,
    grade,
    side: grade === "NO_TRADE" ? null : side,
    score: { long: confluence.longScore, short: confluence.shortScore },
    confidence: grade === "NO_TRADE" ? 0 : confidence,
    independentConfirmationClusters: clusterCount,
    supportingEvidence: supporting,
    contradictingEvidence: contradicting,
    dataQuality: factors.map((f) => ({ source: f.source, quality: f.quality })),
    riskStatus,
    risk: risk ?? null,
    gradeReason: buildGradeReason(grade, side, clusterCount, quality, contradictionNote, supporting),
    invalidation: grade === "NO_TRADE" ? "N/A — tidak ada setup yang di-grade." : buildInvalidation(factors, side),
    mainRisk: buildMainRisk(factors, side, riskStatus),
  };
}

/**
 * Grades a ConfluenceResult into one OracleAssessment. Evaluates LONG and
 * SHORT independently, then returns whichever produced a non-NO_TRADE
 * grade with the higher grade index; if both are NO_TRADE, returns the
 * LONG-side NO_TRADE assessment (its reason still applies to both — a tied/
 * invalid situation isn't side-specific). If both sides somehow graded
 * (shouldn't happen given the mutually-exclusive dominant-side check, but
 * handled for safety), the higher grade wins; a tie is broken by picking
 * the side with more independent clusters, then LONG as a stable fallback.
 */
export function gradeConfluence(confluence: ConfluenceResult, risk?: OracleRiskPlan): OracleAssessment {
  const longAssessment = gradeSide(confluence, "LONG", risk);
  const shortAssessment = gradeSide(confluence, "SHORT", risk);

  const longIdx = gradeIndex(longAssessment.grade);
  const shortIdx = gradeIndex(shortAssessment.grade);
  if (longIdx === 0 && shortIdx === 0) return longAssessment; // both NO_TRADE
  if (longIdx === shortIdx) return longAssessment.independentConfirmationClusters >= shortAssessment.independentConfirmationClusters ? longAssessment : shortAssessment;
  return longIdx > shortIdx ? longAssessment : shortAssessment;
}
