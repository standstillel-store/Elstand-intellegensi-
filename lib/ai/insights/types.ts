// ---------------------------------------------------------------------------
// ELSTAND AI INSIGHTS & PATTERNS — types
//
// Architecture (spec §13):
//   Market Data -> computeConfluence (Phase 2, already built for Oracle)
//                       |
//          ┌────────────┴────────────┐
//          v                          v
//   AI Insights & Patterns        Oracle Grading
//   (this module)                 (lib/ai/oracle/grading.ts)
//
// Both are siblings reading the SAME ConfluenceResult — neither depends on
// the other's output, so there's no Oracle -> Insight -> Oracle cycle.
// Insights answers "what's happening in the market"; Oracle answers "is
// there a tradeable setup". They deliberately never share a grade/score
// scale (spec §2).
// ---------------------------------------------------------------------------

import type { OracleDataQuality } from "../oracle/types";
import type { ConfluenceSource } from "../oracle/confluenceTypes";

export type MarketRegime = "TRENDING" | "RANGING" | "ACCUMULATION" | "DISTRIBUTION" | "BREAKOUT" | "ABSORPTION" | "HIGH_VOLATILITY" | "LOW_LIQUIDITY" | "UNAVAILABLE";

export type PatternKind =
  | "LIQUIDITY_SWEEP"
  | "ORDER_BLOCK_REACTION"
  | "FVG_REACTION"
  | "ORDER_BOOK_IMBALANCE"
  | "FOOTPRINT_IMBALANCE"
  | "STACKED_IMBALANCE"
  | "ABSORPTION"
  | "DELTA_DIVERGENCE"
  | "POC_MIGRATION"
  | "VALUE_AREA_SHIFT"
  | "FAILED_AUCTION";

export type InsightCategory = "flow" | "liquidity" | "footprint" | "tpo" | "orderbook" | "structure" | "divergence";

export interface InsightPattern {
  kind: PatternKind;
  label: string;
  category: InsightCategory;
  /** 0-95, deterministic — see confidence.ts. Never 100 (nothing is certain), never Math.random(). */
  confidence: number;
  evidence: string[];
  interpretation: string;
  risk: string;
  confirmingSources: ConfluenceSource[];
  dataQuality: OracleDataQuality; // worst quality among confirmingSources — "real" only if every confirming source is real
  detectedAt: string; // ISO
}

export interface MarketState {
  /** "BULLISH" | "BEARISH" | "NEUTRAL" — a state descriptor, explicitly NOT a trade call (spec §14: "Insight ≠ signal"). */
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confirmationStrength: "STRONG" | "MODERATE" | "WEAK";
  /** e.g. "BULLISH ABSORPTION", "CONFLICTING FLOW" — spec §5 multi-source confluence labeling. */
  flowLabel: string;
  why: string[];
  but: string[];
  interpretation: string;
}

export interface InsightHistoryEntry {
  time: string; // ISO
  label: string;
}

export interface InsightEngineResult {
  symbol: string;
  timestamp: string;
  regime: MarketRegime;
  regimeEvidence: string;
  marketState: MarketState;
  /** Every pattern that cleared its evidence bar, unranked. */
  allPatterns: InsightPattern[];
  /** Top 3-5 by the spec §7 ranking (data quality, confirming sources, evidence strength, recency, relevance, contradiction penalty) — this is what the UI renders by default. */
  topInsights: InsightPattern[];
  dataQuality: { source: ConfluenceSource; quality: OracleDataQuality }[];
  history: InsightHistoryEntry[];
}
