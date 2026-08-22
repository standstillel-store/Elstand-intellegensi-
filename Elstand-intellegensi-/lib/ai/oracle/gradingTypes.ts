// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — grading types (Phase 3)
// ---------------------------------------------------------------------------

import type { OracleGrade } from "./types";
import type { ConfluenceSource } from "./confluenceTypes";

/**
 * Optional, externally-supplied risk plan. The grading engine NEVER
 * computes or invents entry/SL/TP itself (spec §6) — that's Phase 5's job
 * (wiring real levels from lib/elvoid/engine.ts's existing ideal-entry /
 * ATR-based SL/TP math). When omitted, riskStatus is "unavailable" and A+
 * is structurally unreachable (A+ requires "valid risk/reward" per spec §5).
 */
export interface OracleRiskPlan {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

export type OracleRiskStatus = "unavailable" | "valid" | "invalid";

export interface OracleAssessment {
  symbol: string;
  timestamp: string;
  grade: OracleGrade;
  side: "LONG" | "SHORT" | null; // null when grade === NO_TRADE
  score: { long: number; short: number };
  /** 0-100, deterministic function of score margin + independent clusters + data quality — never randomized, never LLM-derived (spec §8). */
  confidence: number;
  independentConfirmationClusters: number; // 0-3, see CLUSTERS in grading.ts
  supportingEvidence: string[];
  contradictingEvidence: string[];
  dataQuality: { source: ConfluenceSource; quality: "real" | "proxy" | "unavailable" }[];
  riskStatus: OracleRiskStatus;
  risk: OracleRiskPlan | null;
  gradeReason: string;
  invalidation: string;
  mainRisk: string;
}
