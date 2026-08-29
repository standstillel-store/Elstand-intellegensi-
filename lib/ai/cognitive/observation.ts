// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Observation (Phase 8.0.1)
//
// AUTHORITY: strictly downstream/read-only. buildCognitiveObservation()
// never mutates any input, never recomputes any Phase 2-7.x result, never
// overrides canonical side/grade/confidence/riskStatus, and performs zero
// network/database/LLM calls. Same inputs -> same logical output (only
// `generatedAt` is naturally time-dependent). See contracts.ts for the full
// authority statement.
// ---------------------------------------------------------------------------

import { normalizeEvidence } from "@/lib/ai/oracle/evidence";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { MtfContext } from "@/lib/ai/oracle/mtf";
import type { RegimeContext } from "@/lib/ai/oracle/regime";
import type { LiquidityOrderFlowContext } from "@/lib/ai/oracle/liquidityOrderFlow";
import type { ScenarioContext } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { CognitiveObservation, CognitiveObservationQuality } from "./contracts";
import type { CognitiveEvidenceRef } from "./types";

export interface BuildCognitiveObservationInput {
  symbol: string;
  assessment: OracleAssessment;
  confluence: ConfluenceResult;
  mtf?: MtfContext | null;
  regime?: RegimeContext | null;
  liquidityOrderFlow?: LiquidityOrderFlowContext | null;
  scenarios?: ScenarioContext | null;
  contradictions?: ContradictionReport | null;
  arbitration?: DecisionArbitration | null;
  riskIntelligence?: RiskIntelligence | null;
}

type CognitiveContextAvailability = CognitiveObservation["context"];

// ---------------------------------------------------------------------------
// Evidence — reuses the EXISTING normalizeEvidence() (lib/ai/oracle/
// evidence.ts) as the single source of normalized evidence. No second
// evidence-detection algorithm. confluence.factors is the only already-
// computed collection that is honestly NormalizedEvidence-shaped without
// fabricating direction/strength/quality/cluster; scenario evidence refs,
// contradiction sources, and risk factors use their own distinct shapes
// (ScenarioEvidenceRef/ClassifiedContradiction/RiskFactor) and are left
// represented in their own module's context rather than forced into this
// schema.
// ---------------------------------------------------------------------------

/**
 * Deterministic, order-preserving de-dup by (source, evidence text) — a
 * defensive pass only (normalizeEvidence() already returns one entry per
 * confluence factor, so this rarely removes anything). Never sorts, never
 * mutates the array it's given.
 */
function dedupeEvidence(items: CognitiveEvidenceRef[]): CognitiveEvidenceRef[] {
  const seen = new Set<string>();
  const out: CognitiveEvidenceRef[] = [];
  for (const item of items) {
    const key = `${item.source}::${item.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectEvidence(confluence: ConfluenceResult, mtf: MtfContext | null | undefined): CognitiveEvidenceRef[] {
  // normalizeEvidence() already returns a fresh array (Array.map) — never a
  // live reference into confluence.factors — but we still never write into
  // `confluence` here, and dedupeEvidence() below produces yet another
  // fresh, independently-owned array for the observation to keep.
  const normalized = normalizeEvidence(confluence, mtf?.anchorInterval);
  return dedupeEvidence(normalized);
}

// ---------------------------------------------------------------------------
// Context availability — honest presence check only. null/undefined ->
// false. A module being unavailable is never interpreted as agreement or
// as a healthy read.
// ---------------------------------------------------------------------------

function buildContextAvailability(input: BuildCognitiveObservationInput): CognitiveContextAvailability {
  return {
    confluenceAvailable: !!input.confluence,
    mtfAvailable: !!input.mtf,
    regimeAvailable: !!input.regime,
    liquidityAvailable: !!input.liquidityOrderFlow,
    scenariosAvailable: !!input.scenarios,
    contradictionsAvailable: !!input.contradictions,
    arbitrationAvailable: !!input.arbitration,
    riskIntelligenceAvailable: !!input.riskIntelligence,
  };
}

// ---------------------------------------------------------------------------
// Quality aggregation — deterministic, documented, fixture-tested (see
// scripts/phase8/cognitive-observation-fixtures.ts). Quality is NEVER
// upgraded: proxy/unavailable evidence or missing context can only pull the
// result down, never up.
//
// Rule:
//   unavailable  - no meaningful evidence (every entry, if any, is
//                  quality="unavailable") AND zero context modules available.
//                  Nothing meaningful to observe.
//   degraded     - critical context (any of the 8 modules) is unavailable,
//                  OR the available evidence contains no "real"-quality
//                  entry at all (only proxy/unavailable).
//   mixed        - a combination of real and proxy/unavailable evidence,
//                  OR context is fully available with entirely real
//                  evidence... (see below — that last combination is "real",
//                  not "mixed").
//   real         - ALL 8 context modules available AND every evidence entry
//                  is quality="real" (and at least one entry exists).
// ---------------------------------------------------------------------------

function computeObservationQuality(context: CognitiveContextAvailability, evidence: readonly CognitiveEvidenceRef[]): CognitiveObservationQuality {
  const flags = Object.values(context);
  const availableCount = flags.filter(Boolean).length;
  const contextComplete = availableCount === flags.length;

  const meaningfulEvidenceCount = evidence.filter((e) => e.quality !== "unavailable").length;
  const hasReal = evidence.some((e) => e.quality === "real");
  const hasNonReal = evidence.some((e) => e.quality !== "real");

  if (meaningfulEvidenceCount === 0 && availableCount === 0) return "unavailable";

  if (!contextComplete) {
    if (meaningfulEvidenceCount === 0) return "degraded"; // context missing, nothing real to lean on either
    if (!hasReal) return "degraded"; // context missing, evidence itself is proxy/unavailable only
    return "mixed"; // context missing but at least some real evidence exists
  }

  // context fully available from here on
  if (evidence.length === 0 || !hasReal) return "degraded";
  if (hasNonReal) return "mixed";
  return "real";
}

// ---------------------------------------------------------------------------
// sourceAssessment — a fresh, independently-owned object containing only
// the copied canonical fields. Never a live reference into `assessment`,
// never renamed into cognitiveSide/cognitiveGrade/cognitiveConfidence/
// cognitiveRiskStatus.
// ---------------------------------------------------------------------------

function copySourceAssessment(assessment: OracleAssessment): CognitiveObservation["sourceAssessment"] {
  return {
    side: assessment.side,
    grade: assessment.grade,
    confidence: assessment.confidence,
    riskStatus: assessment.riskStatus,
    invalidation: assessment.invalidation,
  };
}

/**
 * Pure, deterministic. Zero network/database/LLM calls, zero mutation of
 * any input, zero recomputation of any already-computed Oracle result. Same
 * inputs -> same logical output (generatedAt is the only naturally
 * time-dependent field).
 */
export function buildCognitiveObservation(input: BuildCognitiveObservationInput): CognitiveObservation {
  const context = buildContextAvailability(input);
  const evidence = collectEvidence(input.confluence, input.mtf);
  const quality = computeObservationQuality(context, evidence);

  return {
    generatedAt: new Date().toISOString(),
    symbol: input.symbol,
    sourceAssessment: copySourceAssessment(input.assessment),
    evidence,
    context,
    quality,
  };
}

// Exposed for fixtures/tests only — not part of the public route-facing API.
export const __test__ = { collectEvidence, dedupeEvidence, buildContextAvailability, computeObservationQuality, copySourceAssessment };
