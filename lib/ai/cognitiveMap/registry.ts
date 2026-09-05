// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Map Module Registry (Phase 8.3.1-A)
//
// Result of the repository architecture audit required before any UI work
// (spec §"ARCHITECTURE DISCOVERY — FIRST STEP"). Every entry below maps to
// a module that ACTUALLY EXISTS in this repository as of this phase — this
// list was produced by inspecting `lib/ai/*` and `lib/elvoid/*`, not by
// imagining a target architecture. If a module is deleted or renamed, its
// registry entry must be removed/updated in the same change — this file is
// never allowed to drift into describing modules that no longer exist.
//
// Deliberately NOT included (real, but not yet wired to real-time
// telemetry this phase — see the route's `limitations` array instead of
// silently registering them as active):
//   - lib/ai/decisionQualification (no persistence layer to read from yet)
//   - lib/ai/insights (live pattern detection, not yet snapshot-backed)
//   - lib/ai/eventImpact, lib/ai/decisionMemory (read paths not exposed
//     to this route yet)
// ---------------------------------------------------------------------------

import type { CognitiveLayer } from "./contracts";

export interface RegisteredModule {
  readonly id: string;
  readonly label: string;
  readonly layer: CognitiveLayer;
  readonly modulePath: string;
  /** One-line, factual description of what the module actually does — no capability claims beyond what the code does. */
  readonly description: string;
}

export const COGNITIVE_MODULE_REGISTRY: readonly RegisteredModule[] = [
  {
    id: "market",
    label: "Market Data",
    layer: "DATA",
    modulePath: "lib/binance, lib/ai/oracle (candles)",
    description: "Real Binance candles fetched per Oracle cycle and stored verbatim on each intelligence snapshot's sparkline.",
  },
  {
    id: "macro",
    label: "Macro Intelligence",
    layer: "MACRO",
    modulePath: "lib/ai/macroIntelligence/composeMacroContext.ts",
    description: "Composes macro/economic context (rates, regime, event risk) consumed by the Oracle pipeline.",
  },
  {
    id: "pattern",
    label: "Structure & Liquidity",
    layer: "REASONING",
    modulePath: "lib/ai/oracle (liquidityEvidence, structureEvidence, volumeEvidence)",
    description: "Structure/liquidity/volume evidence strings produced by the Oracle pipeline for each assessed symbol.",
  },
  {
    id: "oracle",
    label: "Oracle",
    layer: "REASONING",
    modulePath: "lib/ai/oracle",
    description: "Confluence grading engine — the sole authority for side/grade/confidence/riskStatus/invalidation.",
  },
  {
    id: "risk",
    label: "Risk Engine",
    layer: "DECISION",
    modulePath: "lib/ai/oracle (riskStatus, entry/stopLoss/takeProfit/riskReward)",
    description: "Risk validity and trade-plan fields attached to each Oracle assessment.",
  },
  {
    id: "decision",
    label: "Autonomous Decision",
    layer: "DECISION",
    modulePath: "lib/ai/autonomousDecision/decide.ts",
    description: "Fail-closed EXECUTE | WAIT | REJECT selection over a qualified Oracle assessment.",
  },
  {
    id: "execution",
    label: "Paper Trade Execution",
    layer: "EXECUTION",
    modulePath: "lib/elvoid/paperTrader.ts",
    description: "Executes, tracks, and settles paper trades against real price data.",
  },
  {
    id: "learning",
    label: "Learning Feedback",
    layer: "LEARNING",
    modulePath: "lib/ai/failurePatterns, lib/ai/adaptiveConstraint, lib/ai/learningValidation",
    description: "Detects recurring failure evidence, generates adaptive constraints, and validates them against fresh outcomes.",
  },
] as const;
