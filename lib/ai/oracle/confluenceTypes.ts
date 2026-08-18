// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — confluence types (Phase 2)
//
// Every factor produces EVIDENCE (a real number + a specific reason string
// referencing actually-detected features), not a boolean. LONG and SHORT
// are scored independently — a factor can contribute to both, one, or
// neither depending on what it actually found (e.g. Footprint absorption
// can be genuinely ambiguous and support neither side).
// ---------------------------------------------------------------------------

import type { OracleDataQuality } from "./types";

export type ConfluenceSource = "market_structure" | "smc_ict" | "tpo" | "footprint" | "orderbook" | "liquidity" | "microstructure" | "macro";

/**
 * One factor's read. `longWeight`/`shortWeight` are independent — nothing
 * forces them to sum to a fixed total, and both can be 0 (factor found
 * nothing actionable) or, rarely, both > 0 (genuinely conflicting internal
 * evidence, e.g. footprint delta says one thing, absorption says another —
 * that conflict itself is useful information, surfaced via `contradicts`).
 */
export interface ConfluenceFactor {
  source: ConfluenceSource;
  label: string;
  longWeight: number;
  shortWeight: number;
  /** real | proxy | unavailable — proxy factors are weight-capped below what a real-data factor of the same kind can score (see PROXY_WEIGHT_CAP). */
  quality: OracleDataQuality;
  /** Specific, evidence-bearing description — must reference actual detected values (price levels, delta, imbalance count, etc), never a generic template. */
  evidence: string;
}

/** A detected internal conflict — e.g. Footprint buy-delta while price structure is bearish. Surfaced, never silently dropped. */
export interface ConfluenceContradiction {
  description: string;
  sources: ConfluenceSource[];
}

export interface ConfluenceResult {
  symbol: string;
  timestamp: string;
  longScore: number;
  shortScore: number;
  factors: ConfluenceFactor[];
  evidence: string[]; // flattened, ordered list of every factor's evidence string — convenience for Phase 4 narrative
  contradictions: ConfluenceContradiction[];
  dataQuality: OracleDataQuality[]; // per-source quality flags, sourced from OracleContext.dataQuality (Phase 1)
  dominantSide: "LONG" | "SHORT" | "NEUTRAL"; // NEUTRAL when scores are tied or both ~0 — grading (Phase 3) decides what to do with that, this layer just reports it
}
