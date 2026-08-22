// ---------------------------------------------------------------------------
// AI Insights & Patterns — orchestrator.
//
//   Market Data -> assembleOracleContext (Phase 1, reused, cached)
//               -> computeConfluence (Phase 2, reused)
//                       |
//          ┌────────────┴────────────┐
//          v                          v
//   runInsightEngine (this file)   gradeConfluence (Oracle, untouched)
//
// This function never imports anything from lib/ai/oracle/grading.ts or
// lib/ai/oracle/execute.ts — only the shared upstream (types, confluenceTypes,
// dataAdapters, confluence). That's what keeps this a sibling of Oracle
// instead of a dependency in either direction (spec §13).
// ---------------------------------------------------------------------------

import type { OracleContext } from "../oracle/types";
import type { ConfluenceResult } from "../oracle/confluenceTypes";
import type { InsightEngineResult, InsightPattern } from "./types";
import { classifyMarketRegime } from "./regime";
import { detectAllPatterns } from "./patterns";
import { buildMarketState } from "./marketState";
import { recordPatterns } from "./history";

/** Spec §7 ranking: data quality, confirming-source count, evidence strength (via confidence, which already folds in strength+quality+evidence-count), then contradiction (patterns here never carry hasContradiction=true yet, reserved for future patterns that do). */
function rankInsights(patterns: InsightPattern[]): InsightPattern[] {
  const qualityScore = (q: InsightPattern["dataQuality"]) => (q === "real" ? 2 : q === "proxy" ? 1 : 0);
  return [...patterns].sort((a, b) => {
    const scoreA = a.confidence * 10 + a.confirmingSources.length * 5 + qualityScore(a.dataQuality) * 3;
    const scoreB = b.confidence * 10 + b.confirmingSources.length * 5 + qualityScore(b.dataQuality) * 3;
    return scoreB - scoreA;
  });
}

export function runInsightEngine(context: OracleContext, confluence: ConfluenceResult): InsightEngineResult {
  const { regime, evidence: regimeEvidence } = classifyMarketRegime(context, confluence);
  const marketState = buildMarketState(confluence);
  const allPatterns = detectAllPatterns(context, confluence);
  const ranked = rankInsights(allPatterns);
  const topInsights = ranked.slice(0, 5);
  const history = recordPatterns(confluence.symbol, ranked);

  return {
    symbol: confluence.symbol,
    timestamp: new Date().toISOString(),
    regime,
    regimeEvidence,
    marketState,
    allPatterns: ranked,
    topInsights,
    dataQuality: confluence.factors.map((f) => ({ source: f.source, quality: f.quality })),
    history,
  };
}
