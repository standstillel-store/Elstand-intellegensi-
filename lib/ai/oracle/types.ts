// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — types
//
// Phase 1 of 5 (per spec "ELVOID PRO — FINAL ORACLE EXECUTE"):
//   1. Architecture audit + types/data adapters        <- this file + dataAdapters.ts
//   2. Confluence (real multi-source scan combination)
//   3. Grading (NO TRADE / B+ / A / A+)
//   4. Insight + pattern recognition (narrative)
//   5. Execute Signal -> PaperTrade -> AI Performance wiring
//
// This is a SEPARATE intelligence layer from the normal AI Signal system
// (lib/elvoid/engine.ts + lib/ai/core/modules/oracle.ts's narrative-only
// wrapper around it). Grading logic here must never be merged with
// TradeGrade ("A++".."C") used by the normal signal engine — see spec §11.
// ---------------------------------------------------------------------------

import type { ScanResult, SignalSide } from "@/lib/elvoid/types";

/** Premium grades are ONLY these four — never the normal engine's A++/B/C+ scale (spec §12). */
export type OracleGrade = "NO_TRADE" | "B+" | "A" | "A+";

export const ORACLE_GRADE_ORDER: OracleGrade[] = ["NO_TRADE", "B+", "A", "A+"];

/**
 * Whether a data source backing this assessment is real exchange/market
 * data, a best-effort proxy (e.g. resting liquidity approximated from
 * recent traded volume when no order-book history exists), or entirely
 * unavailable. The Oracle must never present proxy data as if it were real
 * historical resting liquidity (spec §14) — every section of the insight
 * output carries its own quality tag so the UI/consumer can distinguish
 * "measured" from "estimated" from "not available".
 */
export type OracleDataQuality = "real" | "proxy" | "unavailable";

export interface OracleDataSourceStatus {
  source: "tpo" | "footprint" | "liquidity" | "orderbook" | "structure" | "smc_ict" | "macro" | "microstructure";
  quality: OracleDataQuality;
  detail: string;
}

/** One named confluence factor firing for/against a side, same shape contract as ScanResult so existing scanners (lib/elvoid/scanners.ts) can be reused directly inside the Oracle's confluence layer (Phase 2). */
export type OracleFactor = ScanResult;

/**
 * Immutable snapshot of everything the Oracle looked at and concluded, at
 * generation time. Once persisted into a PaperTrade record (Phase 5) this
 * object must never be recomputed against live prices — spec §2: "The
 * original signal must not change retroactively when the market moves."
 */
export interface OracleSignalSnapshot {
  signalId: string;
  symbol: string;
  timestamp: string; // ISO
  grade: OracleGrade;
  side: SignalSide | null; // null when grade === "NO_TRADE"
  setup: string | null; // e.g. "Liquidity Sweep + Absorption"
  entry: number | null;
  stopLoss: number | null;
  takeProfit: { tp1: number; tp2: number; tp3: number | null } | null;
  riskReward: number | null;
  confidence: number | null;
  marketRegime: string;
  confluence: {
    factors: OracleFactor[];
    firingForSide: number;
    totalConsidered: number;
  };
  reasoning: string; // spec §15 — must reference actually-detected features, no generic language
  invalidation: string | null;
  mainRisk: string | null;
  dataQuality: OracleDataSourceStatus[];
}

/** Everything the confluence/grading stages (Phase 2-3) need as input — assembled once per request by dataAdapters.ts from real sources only. */
export interface OracleContext {
  symbol: string;
  currentPrice: number;
  candles: import("@/lib/elvoid/types").Candle[];
  tpo: unknown | null; // narrowed to TpoSession[] once Phase 2 wires it in — kept loose here to avoid coupling this scaffold to tpo.ts's exact shape
  footprint: unknown | null;
  liquidity: unknown | null;
  orderBook: { bids: { price: number; qty: number }[]; asks: { price: number; qty: number }[] } | null;
  microstructure: unknown | null;
  macro: unknown | null;
  dataQuality: OracleDataSourceStatus[];
}
