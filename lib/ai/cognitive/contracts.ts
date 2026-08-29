// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Layer contracts (Phase 8.0.1)
//
// ARCHITECTURE / AUTHORITY (read this before touching this file):
//   - The Cognitive Layer is strictly DOWNSTREAM of the canonical Oracle
//     decision (assembleOracleContext -> confluence -> risk -> grading ->
//     ... -> reasoning). It only ever reads already-computed results.
//   - CognitiveObservation is READ-ONLY: it never mutates OracleAssessment
//     or any other Oracle Phase 7.x output, and it is never fed back into
//     confluence/grading/risk.
//   - It never overrides or duplicates canonical side/grade/confidence/
//     riskStatus — see `sourceAssessment` below, which only ever COPIES
//     those fields verbatim. There is no cognitiveSide/cognitiveGrade/
//     cognitiveConfidence/cognitiveRiskStatus anywhere in this layer.
//   - It does not execute trades, fetch data, call an LLM, or persist
//     anything. A CognitiveObservation is not a trading signal.
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ReasoningQuality } from "@/lib/ai/oracle/reasoning";
import type { CognitiveEvidenceRef } from "./types";

/**
 * Reuses the existing real/mixed/degraded/unavailable quality union from
 * the Reasoning layer (lib/ai/oracle/reasoning.ts) instead of defining a
 * second, parallel quality scale for the Cognitive Layer.
 */
export type CognitiveObservationQuality = ReasoningQuality;

/**
 * Read-only snapshot of "what does the Oracle already know right now?".
 *
 * It is NOT "what should the system trade?", NOT "what does an LLM
 * think?", and NOT "what should happen next?" — those are separate,
 * later concerns (Working Memory / Hypothesis / Planning / Meta
 * Evaluation), not part of Phase 8.0.1.
 */
export interface CognitiveObservation {
  generatedAt: string; // ISO — the only naturally time-dependent field; no market/decision behavior varies with it
  symbol: string;

  /**
   * Copied canonical fields only — Readonly<Pick<...>> in spirit (enforced
   * here as a fresh, independently-owned object literal, not a live
   * reference into `assessment`). Never renamed to cognitiveSide/
   * cognitiveGrade/cognitiveConfidence/cognitiveRiskStatus: those names are
   * forbidden because they would imply a second, competing decision
   * authority.
   */
  sourceAssessment: Readonly<Pick<OracleAssessment, "side" | "grade" | "confidence" | "riskStatus" | "invalidation">>;

  /** Aggregated NormalizedEvidence — a fresh, owned array; never a live reference into confluence.factors or any other input array. */
  evidence: readonly CognitiveEvidenceRef[];

  /** Honest per-module availability. Missing context is reported as `false`, never silently treated as agreement or as healthy. */
  context: {
    confluenceAvailable: boolean;
    mtfAvailable: boolean;
    regimeAvailable: boolean;
    liquidityAvailable: boolean;
    scenariosAvailable: boolean;
    contradictionsAvailable: boolean;
    arbitrationAvailable: boolean;
    riskIntelligenceAvailable: boolean;
  };

  /** Deterministic aggregate — see buildCognitiveObservation()'s quality rule in observation.ts. Never upgraded past what the available evidence/context actually supports. */
  quality: CognitiveObservationQuality;
}
