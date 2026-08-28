// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Scenario Engine (Phase 7.5)
//
// Turns the already-computed OracleAssessment + ConfluenceResult + Phase
// 7.2/7.3B/7.4 context (mtf, regime, liquidityOrderFlow) into a PRIMARY
// scenario and, only when genuine opposing evidence exists, an ALTERNATIVE
// scenario — each with a thesis, supporting/opposing evidence, a trigger,
// and an invalidation. This reframes the pipeline from "how many factors
// say LONG" to "what is the most plausible market scenario given the
// evidence" — but it does NOT re-decide direction: PRIMARY always follows
// `assessment.side`, already decided by gradeConfluence().
//
// PURE / READ-ONLY. No new fetch, no new scoring engine, no invented price
// levels. Every trigger/invalidation level quoted here is copied from a
// level that Phase 7.2 (mtf protectiveLevel), Phase 7.4
// (LiquidityEvent.level), or grading.ts (assessment.invalidation) already
// computed — never a new number derived here.
//
// Never fed back into computeConfluence()/gradeConfluence()/confidence/
// dominantSide/risk. Attached to the Oracle response as a sibling
// `scenarios` field (route.ts), same additive pattern as regime (7.3B) and
// liquidityOrderFlow (7.4).
// ---------------------------------------------------------------------------

import type { ConfluenceResult } from "./confluenceTypes";
import type { OracleAssessment } from "./gradingTypes";
import type { RegimeContext } from "./regime";
import { mtfAlignmentForSide, type MtfAlignment } from "./regime";
import type { MtfContext, MtfRelationship } from "./mtf";
import type { LiquidityOrderFlowContext } from "./liquidityOrderFlow";

export type ScenarioRole = "PRIMARY" | "ALTERNATIVE";
export type ScenarioDirection = "LONG" | "SHORT";
export type RegimeCompatibility = "COMPATIBLE" | "REQUIRES_STRONGER_EVIDENCE" | "DEGRADED";

/** `detail` is copied verbatim from the originating module's own evidence/relationshipEvidence string — never re-derived or reworded, so every scenario claim stays traceable to its real source. */
export interface ScenarioEvidenceRef {
  source: "confluence" | "mtf" | "regime" | "liquidityOrderFlow.event" | "liquidityOrderFlow.priceResponse";
  detail: string;
}

export interface Scenario {
  id: string;
  role: ScenarioRole;
  direction: ScenarioDirection;
  thesis: string;
  supportingEvidence: ScenarioEvidenceRef[];
  opposingEvidence: ScenarioEvidenceRef[];
  trigger: string;
  invalidation: string;
  /** 0-100 — a direct readout of assessment.confidence (PRIMARY) or a conservative fraction of it (ALTERNATIVE, since it's a competing minority hypothesis by definition). Never an independently computed score. */
  strength: number;
  regimeCompatibility: RegimeCompatibility;
  mtfCompatibility: MtfAlignment;
}

export type ScenarioContextQuality = "real" | "mixed" | "degraded" | "insufficient";

export interface ScenarioContext {
  primary: Scenario | null;
  alternative: Scenario | null;
  contextQuality: ScenarioContextQuality;
  note?: string;
}

const opposite = (d: ScenarioDirection): ScenarioDirection => (d === "LONG" ? "SHORT" : "LONG");

/**
 * TRENDING_UP/TRENDING_DOWN regimes require the scenario's direction to
 * agree with the trend to be COMPATIBLE (a counter-trend scenario needs
 * stronger standalone evidence, per spec). RANGING favors mean-reversion
 * scenarios (built from a REJECTION liquidity event) over plain
 * continuation, which is REQUIRES_STRONGER_EVIDENCE there instead.
 * VOLATILE_UNCLEAR always degrades, regardless of direction — the market
 * itself doesn't offer a clean regime to be compatible or incompatible
 * with. No regime computed at all -> DEGRADED (can't confirm either way).
 */
function regimeCompatibility(direction: ScenarioDirection, regime: RegimeContext | null | undefined, isMeanReversionFlavored: boolean): RegimeCompatibility {
  if (!regime || regime.quality === "unavailable") return "DEGRADED";
  if (regime.type === "VOLATILE_UNCLEAR") return "DEGRADED";
  if (regime.type === "RANGING") return isMeanReversionFlavored ? "COMPATIBLE" : "REQUIRES_STRONGER_EVIDENCE";
  const trendDirection: ScenarioDirection = regime.type === "TRENDING_UP" ? "LONG" : "SHORT";
  return trendDirection === direction ? "COMPATIBLE" : "REQUIRES_STRONGER_EVIDENCE";
}

/** MtfRelationship labels that describe a genuine LTF-vs-HTF disagreement worth surfacing as opposing evidence for the PRIMARY (and as the seed of an ALTERNATIVE). ALIGNED_BULLISH/ALIGNED_BEARISH/NEUTRAL_OR_MIXED/INSUFFICIENT_DATA are not disagreement signals on their own. */
const MTF_DISAGREEMENT_RELATIONSHIPS: MtfRelationship[] = [
  "PULLBACK_IN_UPTREND",
  "PULLBACK_IN_DOWNTREND",
  "CONTINUATION_AFTER_PULLBACK_BULLISH",
  "CONTINUATION_AFTER_PULLBACK_BEARISH",
  "HTF_THESIS_THREATENED_BULLISH",
  "HTF_THESIS_THREATENED_BEARISH",
];

interface OpposingSignal {
  ref: ScenarioEvidenceRef;
  /** Real, already-computed price level backing this signal's implied invalidation boundary, when one exists — never invented here. */
  level: number | null;
  /** Whether this signal's own character is mean-reversion-flavored (a rejection at a level) rather than a directional reversal thesis. */
  meanReversion: boolean;
}

function collectOpposingSignals(direction: ScenarioDirection, confluence: ConfluenceResult, mtf: MtfContext | null, lof: LiquidityOrderFlowContext | null): OpposingSignal[] {
  const signals: OpposingSignal[] = [];

  for (const c of confluence.contradictions) {
    signals.push({ ref: { source: "confluence", detail: c.description }, level: null, meanReversion: false });
  }

  if (mtf && MTF_DISAGREEMENT_RELATIONSHIPS.includes(mtf.relationship)) {
    const protectiveLevel = mtf.htf?.protectiveLevel?.price ?? mtf.ltf?.protectiveLevel?.price ?? null;
    signals.push({ ref: { source: "mtf", detail: mtf.relationshipEvidence }, level: protectiveLevel, meanReversion: false });
  }

  if (lof) {
    const eventOpposesDirection = lof.event.side !== null && lof.event.side !== direction && (lof.event.type === "RECLAIM" || lof.event.type === "BREAK" || lof.event.type === "REJECTION");
    if (eventOpposesDirection) {
      signals.push({
        ref: { source: "liquidityOrderFlow.event", detail: lof.event.evidence },
        level: lof.event.level,
        meanReversion: lof.event.type === "REJECTION",
      });
    }

    const pr = lof.priceResponse;
    const flowOpposesDirection =
      (pr.interpretation === "BUYING_PRESSURE" && direction === "SHORT") ||
      (pr.interpretation === "SELLING_PRESSURE" && direction === "LONG") ||
      // Primary's own supporting flow being absorbed/exhausted is itself a warning against the primary thesis.
      ((pr.interpretation === "ABSORPTION" || pr.interpretation === "EXHAUSTION") && ((pr.deltaDirection === "buy" && direction === "LONG") || (pr.deltaDirection === "sell" && direction === "SHORT")));
    if (flowOpposesDirection) {
      signals.push({ ref: { source: "liquidityOrderFlow.priceResponse", detail: pr.evidence }, level: null, meanReversion: pr.interpretation === "ABSORPTION" });
    }
  }

  return signals;
}

function collectSupportingRefs(side: ScenarioDirection, assessment: OracleAssessment, lof: LiquidityOrderFlowContext | null): ScenarioEvidenceRef[] {
  const refs: ScenarioEvidenceRef[] = assessment.supportingEvidence.map((detail) => ({ source: "confluence" as const, detail }));

  if (lof) {
    if (lof.event.side === side && (lof.event.type === "SWEEP" || lof.event.type === "RECLAIM" || lof.event.type === "BREAK")) {
      refs.push({ source: "liquidityOrderFlow.event", detail: lof.event.evidence });
    }
    // A REJECTION's `side` is the direction whose sweep thesis FAILED to
    // hold — a rejection of the opposite direction's move is itself
    // evidence favoring reversion back toward THIS side (mean-reversion
    // support), not a duplicate of the SWEEP/RECLAIM/BREAK case above.
    if (lof.event.type === "REJECTION" && lof.event.side !== null && lof.event.side !== side) {
      refs.push({ source: "liquidityOrderFlow.event", detail: lof.event.evidence });
    }
    const pr = lof.priceResponse;
    const flowSupports = (pr.interpretation === "BUYING_PRESSURE" && side === "LONG") || (pr.interpretation === "SELLING_PRESSURE" && side === "SHORT");
    if (flowSupports) {
      refs.push({ source: "liquidityOrderFlow.priceResponse", detail: pr.evidence });
    }
  }

  return refs;
}

/** True when a REJECTION event's failed direction was the OPPOSITE of `side` — i.e. a move against `side` was rejected, which is itself a mean-reversion-flavored signal in favor of `side` (relevant for RANGING regime compatibility, see regimeCompatibility()). */
function isMeanReversionSupported(side: ScenarioDirection, lof: LiquidityOrderFlowContext | null): boolean {
  return !!lof && lof.event.type === "REJECTION" && lof.event.side !== null && lof.event.side !== side;
}

function buildPrimaryTrigger(direction: ScenarioDirection, lof: LiquidityOrderFlowContext | null): string {
  if (lof && lof.event.side === direction && lof.event.level !== null) {
    if (lof.event.type === "SWEEP") {
      return `Belum terkonfirmasi penuh — menunggu follow-through candle di atas/bawah level ${lof.event.level.toFixed(4)} (lihat liquidityOrderFlow.event) sebelum thesis ini dianggap valid.`;
    }
    if (lof.event.type === "RECLAIM" || lof.event.type === "BREAK") {
      return `Sudah terkonfirmasi via ${lof.event.type} di level ${lof.event.level.toFixed(4)} — lihat liquidityOrderFlow.event.`;
    }
  }
  return "Trigger mengikuti confluence yang sudah firing untuk sisi ini — lihat supportingEvidence; tidak ada level liquidity event spesifik yang bisa dijadikan trigger tambahan saat ini.";
}

function buildPrimaryInvalidation(assessment: OracleAssessment, direction: ScenarioDirection, lof: LiquidityOrderFlowContext | null): string {
  if (lof && lof.event.side === direction && lof.event.level !== null) {
    return `${assessment.invalidation} Level acuan spesifik dari liquidity event: ${lof.event.level.toFixed(4)} (${lof.event.type}).`;
  }
  return assessment.invalidation;
}

function buildScenario(
  role: ScenarioRole,
  direction: ScenarioDirection,
  thesis: string,
  supportingEvidence: ScenarioEvidenceRef[],
  opposingEvidence: ScenarioEvidenceRef[],
  trigger: string,
  invalidation: string,
  strength: number,
  regime: RegimeContext | null | undefined,
  mtf: MtfContext | null,
  isMeanReversionFlavored: boolean
): Scenario {
  return {
    id: `${role.toLowerCase()}-${direction.toLowerCase()}`,
    role,
    direction,
    thesis,
    supportingEvidence,
    opposingEvidence,
    trigger,
    invalidation,
    strength: Math.max(0, Math.min(100, strength)),
    regimeCompatibility: regimeCompatibility(direction, regime, isMeanReversionFlavored),
    mtfCompatibility: mtfAlignmentForSide(direction, mtf),
  };
}

/**
 * Builds PRIMARY (always follows assessment.side — this function never
 * re-decides direction) and, only when genuine causal opposing evidence
 * exists, an ALTERNATIVE. If assessment has no side (NO_TRADE / NEUTRAL),
 * returns {primary: null, alternative: null, contextQuality: "insufficient"}
 * rather than forcing two directional slots to be filled.
 */
export function buildScenarios(assessment: OracleAssessment, confluence: ConfluenceResult, regime?: RegimeContext | null, mtf?: MtfContext | null, liquidityOrderFlow?: LiquidityOrderFlowContext | null): ScenarioContext {
  const lof = liquidityOrderFlow ?? null;
  const mtfCtx = mtf ?? null;

  if (!assessment.side || assessment.grade === "NO_TRADE") {
    return { primary: null, alternative: null, contextQuality: "insufficient", note: assessment.gradeReason };
  }

  const direction = assessment.side;
  const opposingSignals = collectOpposingSignals(direction, confluence, mtfCtx, lof);
  const primaryOpposingRefs = opposingSignals.map((s) => s.ref);
  const primarySupportingRefs = collectSupportingRefs(direction, assessment, lof);

  const primaryThesis = `${direction}: ${assessment.supportingEvidence.slice(0, 3).join(" ")}`.trim();
  const primary = buildScenario(
    "PRIMARY",
    direction,
    primaryThesis,
    primarySupportingRefs,
    primaryOpposingRefs,
    buildPrimaryTrigger(direction, lof),
    buildPrimaryInvalidation(assessment, direction, lof),
    assessment.confidence,
    regime,
    mtfCtx,
    isMeanReversionSupported(direction, lof)
  );

  let alternative: Scenario | null = null;
  if (opposingSignals.length > 0) {
    const altDirection = opposite(direction);
    const altMeanReversion = opposingSignals.some((s) => s.meanReversion);
    const altLevel = opposingSignals.find((s) => s.level !== null)?.level ?? null;

    const isPullback = mtfCtx && (mtfCtx.relationship === "PULLBACK_IN_UPTREND" || mtfCtx.relationship === "PULLBACK_IN_DOWNTREND");
    const thesisLabel = altMeanReversion ? "Rejection/mean-reversion" : isPullback ? "Pullback within HTF structure" : "Reversal";
    const altThesis = `${altDirection}: ${thesisLabel} — ${opposingSignals.map((s) => s.ref.detail).slice(0, 2).join(" ")}`.trim();

    const trigger = altLevel !== null ? `Konfirmasi jika harga close melewati/menerima di sisi ${altDirection} dari level ${altLevel.toFixed(4)} — lihat evidence terkait.` : opposingSignals[0].ref.detail;
    const invalidation = altLevel !== null ? `Skenario ini batal jika harga kembali menerima di sisi ${direction} dari level ${altLevel.toFixed(4)} — sama dengan supporting evidence PRIMARY.` : `Skenario ini batal jika evidence pendukung PRIMARY (${primarySupportingRefs.map((r) => r.detail).slice(0, 1).join("")}) kembali dominan.`;

    alternative = buildScenario(
      "ALTERNATIVE",
      altDirection,
      altThesis,
      opposingSignals.map((s) => s.ref), // what supports the alternative is exactly what opposed the primary
      primarySupportingRefs, // what opposes the alternative is exactly what supports the primary
      trigger,
      invalidation,
      Math.round(assessment.confidence * (0.3 + Math.min(opposingSignals.length, 3) * 0.1)), // conservative minority-hypothesis fraction, scaled a bit by how many independent opposing signals exist — never an independent score
      regime,
      mtfCtx,
      altMeanReversion
    );
  }

  let contextQuality: ScenarioContextQuality;
  if (!regime || regime.quality === "unavailable" || !mtfCtx) {
    contextQuality = "degraded";
  } else if (confluence.dataQuality.every((q) => q === "real")) {
    contextQuality = alternative ? "mixed" : "real";
  } else {
    contextQuality = "mixed";
  }

  return { primary, alternative, contextQuality };
}
