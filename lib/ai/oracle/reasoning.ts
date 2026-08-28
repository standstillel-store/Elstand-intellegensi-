// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Reasoning (Phase 7.9)
//
// A narrative/interpretation layer over the fully-computed deterministic
// Oracle pipeline (Phases 7.1-7.8). NEVER a decision engine: side, grade,
// confidence, riskStatus, invalidation, and every price level (entry/SL/TP)
// always come directly from `assessment`/`risk` — the model is never asked
// for them, and even if it volunteers them anyway, they are never read
// back (see buildOracleReasoning()'s final assembly, which only pulls from
// the already-typed response's narrative fields).
//
// Separate module from lib/ai/core/modules/oracle.ts (Standard's own AI
// Oracle) — that file is used only as a behavioral/template reference and
// is neither modified nor imported here. Reuses only the generic,
// already-reusable core: callAiCore() (lib/ai/core/llm.ts) and the new
// ORACLE_PRO_REASONING_PROMPT (lib/ai/core/prompts.ts, additive).
//
// PURE INPUT / NEVER THROWS: buildOracleReasoning() always resolves to a
// complete OracleReasoning — LLM failure, malformed JSON, or a schema
// mismatch all fall back to a fully deterministic result
// (`generatedBy: "fallback"`), exactly like every lib/ai/core module.
// No new fetches beyond the single optional LLM call itself; no candles
// are ever sent.
// ---------------------------------------------------------------------------

import { callAiCore } from "@/lib/ai/core/llm";
import { ORACLE_PRO_REASONING_PROMPT } from "@/lib/ai/core/prompts";
import type { OracleAssessment } from "./gradingTypes";
import type { ConfluenceResult } from "./confluenceTypes";
import type { RegimeContext } from "./regime";
import type { MtfContext } from "./mtf";
import type { LiquidityOrderFlowContext, LiquidityZone } from "./liquidityOrderFlow";
import type { ScenarioContext } from "./scenario";
import type { ContradictionReport } from "./contradiction";
import type { DecisionArbitration } from "./arbitration";
import type { RiskIntelligence } from "./riskIntelligence";

export type ReasoningQuality = "real" | "mixed" | "degraded" | "unavailable";
export type ReasoningSource = "ai" | "fallback";

export interface OracleReasoning {
  summary: string;
  thesis: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  riskAssessment: string;
  scenarioAssessment: string;
  uncertainty: string | null;
  caveats: string[];
  sourceRefs: string[];
  quality: ReasoningQuality;
  generatedBy: ReasoningSource;
}

/** Only the narrative fields — side/grade/confidence/riskStatus/invalidation/entry/stopLoss/takeProfit are deliberately never part of this shape, so there is nothing for the model to volunteer that could accidentally get read back. */
interface RawReasoningResponse {
  summary: string;
  thesis: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  riskAssessment: string;
  scenarioAssessment: string;
  uncertainty: string | null;
  caveats: string[];
  sourceRefs: string[];
  quality: ReasoningQuality;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const QUALITY_VALUES: ReasoningQuality[] = ["real", "mixed", "degraded", "unavailable"];

/**
 * Strict type guard — malformed JSON, a missing required field, or a wrong
 * field type all fail this and fall back completely (rejection is total,
 * never partial trust of a shape that's "close enough").
 */
function isValidReasoningShape(parsed: unknown): parsed is RawReasoningResponse {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  return (
    typeof p.summary === "string" &&
    typeof p.thesis === "string" &&
    isStringArray(p.supportingEvidence) &&
    isStringArray(p.opposingEvidence) &&
    typeof p.riskAssessment === "string" &&
    typeof p.scenarioAssessment === "string" &&
    (p.uncertainty === null || typeof p.uncertainty === "string") &&
    isStringArray(p.caveats) &&
    isStringArray(p.sourceRefs) &&
    typeof p.quality === "string" &&
    QUALITY_VALUES.includes(p.quality as ReasoningQuality)
  );
}

// ---------------------------------------------------------------------------
// Payload assembly — grounding data only. No raw candles. Zones trimmed to
// the 5 nearest using the EXISTING distanceFromPrice ordering
// buildLiquidityZones() already applies (see liquidityOrderFlow.ts) — not
// recomputed or resorted here.
// ---------------------------------------------------------------------------

const MAX_ZONES_IN_PAYLOAD = 5;

function trimZones(zones: LiquidityZone[]): LiquidityZone[] {
  // buildLiquidityZones() already returns zones sorted by distanceFromPrice
  // ascending; slice preserves that existing order, no new sort applied.
  return zones.slice(0, MAX_ZONES_IN_PAYLOAD);
}

interface ReasoningPayload {
  symbol: string;
  assessment: {
    grade: OracleAssessment["grade"];
    side: OracleAssessment["side"];
    confidence: number;
    supportingEvidence: string[];
    contradictingEvidence: string[];
    invalidation: string;
    mainRisk: string;
    gradeReason: string;
    risk: OracleAssessment["risk"];
  };
  regime: RegimeContext | null;
  mtf: MtfContext | null;
  liquidityOrderFlow: (Omit<LiquidityOrderFlowContext, "zones"> & { zones: LiquidityZone[] }) | null;
  scenarios: ScenarioContext | null;
  contradictions: ContradictionReport | null;
  arbitration: DecisionArbitration | null;
  riskIntelligence: RiskIntelligence | null;
}

function buildPayload(
  assessment: OracleAssessment,
  regime: RegimeContext | null | undefined,
  mtf: MtfContext | null | undefined,
  liquidityOrderFlow: LiquidityOrderFlowContext | null | undefined,
  scenarios: ScenarioContext | null | undefined,
  contradictions: ContradictionReport | null | undefined,
  arbitration: DecisionArbitration | null | undefined,
  riskIntelligence: RiskIntelligence | null | undefined
): ReasoningPayload {
  return {
    symbol: assessment.symbol,
    assessment: {
      grade: assessment.grade,
      side: assessment.side,
      confidence: assessment.confidence,
      supportingEvidence: assessment.supportingEvidence,
      contradictingEvidence: assessment.contradictingEvidence,
      invalidation: assessment.invalidation,
      mainRisk: assessment.mainRisk,
      gradeReason: assessment.gradeReason,
      risk: assessment.risk, // included as reference text only — never asked to be recomputed, never read back
    },
    regime: regime ?? null,
    mtf: mtf ?? null,
    liquidityOrderFlow: liquidityOrderFlow ? { ...liquidityOrderFlow, zones: trimZones(liquidityOrderFlow.zones) } : null,
    scenarios: scenarios ?? null,
    contradictions: contradictions ?? null,
    arbitration: arbitration ?? null,
    riskIntelligence: riskIntelligence ?? null,
  };
}

// ---------------------------------------------------------------------------
// Provenance / sourceRefs validation — only identifiers that genuinely
// appear in the payload's own origin/source fields are kept. Anything else
// the model invents is silently dropped (this IS the "reject that claim"
// behavior for unsupported sourceRefs specifically — the rest of the
// response can still stand on its type-guard validation).
// ---------------------------------------------------------------------------

function collectKnownSourceIdentifiers(payload: ReasoningPayload): Set<string> {
  const known = new Set<string>(["confluence", "mtf", "regime", "arbitration", "riskIntelligence", "liquidityOrderFlow.event", "liquidityOrderFlow.priceResponse"]);
  for (const ref of [
    ...(payload.scenarios?.primary?.supportingEvidence ?? []),
    ...(payload.scenarios?.primary?.opposingEvidence ?? []),
    ...(payload.scenarios?.alternative?.supportingEvidence ?? []),
    ...(payload.scenarios?.alternative?.opposingEvidence ?? []),
  ]) {
    known.add(ref.source);
  }
  for (const c of payload.contradictions?.contradictions ?? []) known.add(c.origin);
  for (const f of payload.riskIntelligence?.factors ?? []) known.add(f.source);
  return known;
}

function filterKnownSourceRefs(payload: ReasoningPayload, refs: string[]): string[] {
  const known = collectKnownSourceIdentifiers(payload);
  return refs.filter((r) => known.has(r));
}

// ---------------------------------------------------------------------------
// Quality ceiling — the model's own `quality` claim can never exceed what
// the deterministic payload itself actually supports. Implements "never
// let the model upgrade proxy/unavailable to real".
// ---------------------------------------------------------------------------

const QUALITY_RANK: Record<ReasoningQuality, number> = { real: 3, mixed: 2, degraded: 1, unavailable: 0 };

function computePayloadQualityCeiling(payload: ReasoningPayload): ReasoningQuality {
  const missingContext = !payload.regime || !payload.mtf || !payload.scenarios || !payload.contradictions || !payload.arbitration || !payload.riskIntelligence || !payload.liquidityOrderFlow;
  if (missingContext) return "degraded";

  const nonRealSignals = [
    payload.regime?.quality !== "real",
    (payload.liquidityOrderFlow?.zones ?? []).some((z) => z.quality !== "real"),
    payload.liquidityOrderFlow?.event.quality !== "real",
    payload.liquidityOrderFlow?.priceResponse.quality !== "real",
    payload.riskIntelligence?.contextQuality !== "real",
  ];
  return nonRealSignals.some(Boolean) ? "mixed" : "real";
}

function clampQuality(claimed: ReasoningQuality, ceiling: ReasoningQuality): ReasoningQuality {
  return QUALITY_RANK[claimed] > QUALITY_RANK[ceiling] ? ceiling : claimed;
}

// ---------------------------------------------------------------------------
// Deterministic fallback — zero LLM involvement, built entirely from
// already-computed fields. Complete and correct on its own, same
// "fallback is never a degraded experience, just not LLM-authored" rule
// every lib/ai/core module follows.
// ---------------------------------------------------------------------------

function deterministicFallback(assessment: OracleAssessment, payload: ReasoningPayload): OracleReasoning {
  const ceiling = computePayloadQualityCeiling(payload);
  const opposing = [...assessment.contradictingEvidence, ...(payload.contradictions?.contradictions.map((c) => c.description) ?? [])];
  const caveats: string[] = [];
  if (payload.arbitration?.caveat) caveats.push(payload.arbitration.caveat);
  if (payload.riskIntelligence && payload.riskIntelligence.overall !== "LOW") {
    caveats.push(`Risk intelligence overall: ${payload.riskIntelligence.overall}.`);
  }

  const uncertainty =
    ceiling !== "real"
      ? "Sebagian konteks pendukung bersifat proxy/unavailable atau tidak lengkap — interpretasi ini didasarkan pada data yang tersedia saja."
      : payload.arbitration?.alignment === "UNSUPPORTED_CONTEXT"
        ? "Konteks regime/MTF/scenario belum cukup untuk menilai keselarasan penuh."
        : null;

  return {
    summary: assessment.gradeReason,
    thesis: payload.scenarios?.primary?.thesis ?? `${assessment.side ?? "NEUTRAL"}: ${assessment.supportingEvidence.slice(0, 2).join(" ")}`.trim(),
    supportingEvidence: assessment.supportingEvidence,
    opposingEvidence: opposing,
    riskAssessment: payload.riskIntelligence
      ? `Overall risk: ${payload.riskIntelligence.overall}. ${payload.riskIntelligence.factors.map((f) => f.evidence).join(" ")}`.trim()
      : "Risk intelligence tidak tersedia.",
    scenarioAssessment: payload.scenarios?.alternative
      ? `Primary: ${payload.scenarios.primary?.thesis ?? "-"} Alternative: ${payload.scenarios.alternative.thesis}`
      : (payload.scenarios?.primary?.thesis ?? "Tidak ada skenario valid untuk simbol ini saat ini."),
    uncertainty,
    caveats,
    sourceRefs: filterKnownSourceRefs(payload, Array.from(collectKnownSourceIdentifiers(payload))),
    quality: ceiling,
    generatedBy: "fallback",
  };
}

function assembleFromAiResult(payload: ReasoningPayload, data: RawReasoningResponse): OracleReasoning {
  const ceiling = computePayloadQualityCeiling(payload);
  return {
    summary: data.summary,
    thesis: data.thesis,
    supportingEvidence: data.supportingEvidence,
    opposingEvidence: data.opposingEvidence,
    riskAssessment: data.riskAssessment,
    scenarioAssessment: data.scenarioAssessment,
    uncertainty: data.uncertainty,
    caveats: data.caveats,
    sourceRefs: filterKnownSourceRefs(payload, data.sourceRefs),
    quality: clampQuality(data.quality, ceiling),
    generatedBy: "ai",
    // Deliberately no side/grade/confidence/riskStatus/invalidation/entry/
    // stopLoss/takeProfit here — RawReasoningResponse never had them, so
    // there's nothing to accidentally read back even if the model tried.
  };
}

export async function buildOracleReasoning(
  assessment: OracleAssessment,
  confluence: ConfluenceResult,
  regime: RegimeContext | null | undefined,
  mtf: MtfContext | null | undefined,
  liquidityOrderFlow: LiquidityOrderFlowContext | null | undefined,
  scenarios: ScenarioContext | null | undefined,
  contradictions: ContradictionReport | null | undefined,
  arbitration: DecisionArbitration | null | undefined,
  riskIntelligence: RiskIntelligence | null | undefined
): Promise<OracleReasoning> {
  const payload = buildPayload(assessment, regime, mtf, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence);
  const fallback = deterministicFallback(assessment, payload);

  const result = await callAiCore({
    systemPrompt: ORACLE_PRO_REASONING_PROMPT,
    data: payload,
    validate: isValidReasoningShape,
  }).catch(() => null);

  if (!result) return fallback;
  return assembleFromAiResult(payload, result.data);
}

// Exposed for fixtures/tests only — not part of the public route-facing API.
export const __test__ = { isValidReasoningShape, filterKnownSourceRefs, collectKnownSourceIdentifiers, computePayloadQualityCeiling, clampQuality, buildPayload, deterministicFallback, assembleFromAiResult };
