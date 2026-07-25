// ---------------------------------------------------------------------------
// Shared, transparent, rule-based helpers for the Market Intelligence
// dashboard (Global Intelligence Map, Sector Rotation, Altcoin Scanner).
// Same philosophy as lib/scoring.ts and lib/market-insights.ts elsewhere in
// this app: every number on screen should be traceable to a simple rule, not
// a black-box model. Nothing here predicts price; it only labels what the
// data already shows.
// ---------------------------------------------------------------------------

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export type TrendTone = "up" | "down" | "neutral";

/** Wider palette for UI elements that also need a highlighted/"watch" state. */
export type DisplayTone = TrendTone | "amber";

export interface TrendReading {
  label: string;
  tone: TrendTone;
}

/** Simple 24h/7d agreement rule — only calls Bullish/Bearish when both windows agree. */
export function deriveTrend(change24h?: number, change7d?: number): TrendReading {
  const c24 = change24h ?? 0;
  const c7 = change7d ?? c24;
  if (c24 > 0.5 && c7 > 0) return { label: "Bullish", tone: "up" };
  if (c24 < -0.5 && c7 < 0) return { label: "Bearish", tone: "down" };
  return { label: "Netral", tone: "neutral" };
}

// Note: the 3-state Risk On/Neutral/Risk Off reader that used to live here
// has been superseded by deriveGlobalSentiment() in ./globalSentiment.ts,
// which adds a 4th "transition" state, per-signal reasons, and a confidence
// score, and is now the single source of truth shared by both the Top
// Market Overview card and the Global Intelligence Map header.

// ---------------------------------------------------------------------------
// Sector taxonomy — seed list only. CoinGecko/CMC category coverage is much
// larger; this is a deliberately small, readable starter map for the six
// sectors the Sector Rotation panel tracks. Extend freely as coverage grows.
// ---------------------------------------------------------------------------

export type Sector = "AI" | "RWA" | "DeFi" | "Gaming" | "Layer 1" | "Layer 2";

export const SECTOR_LIST: Sector[] = ["AI", "RWA", "DeFi", "Gaming", "Layer 1", "Layer 2"];

const SECTOR_SEED_TAGS: Record<string, Sector> = {
  // AI
  FET: "AI",
  RNDR: "AI",
  RENDER: "AI",
  TAO: "AI",
  AGIX: "AI",
  OCEAN: "AI",
  AKT: "AI",
  WLD: "AI",
  NMR: "AI",
  GRT: "AI",
  // RWA
  ONDO: "RWA",
  POLYX: "RWA",
  RIO: "RWA",
  CFG: "RWA",
  TRU: "RWA",
  OM: "RWA",
  PROPS: "RWA",
  // DeFi
  UNI: "DeFi",
  AAVE: "DeFi",
  MKR: "DeFi",
  LDO: "DeFi",
  CRV: "DeFi",
  SNX: "DeFi",
  COMP: "DeFi",
  DYDX: "DeFi",
  PENDLE: "DeFi",
  // Gaming
  SAND: "Gaming",
  AXS: "Gaming",
  IMX: "Gaming",
  GALA: "Gaming",
  ILV: "Gaming",
  MAGIC: "Gaming",
  BEAM: "Gaming",
  RON: "Gaming",
  PIXEL: "Gaming",
  // Layer 1
  ETH: "Layer 1",
  SOL: "Layer 1",
  AVAX: "Layer 1",
  SUI: "Layer 1",
  APT: "Layer 1",
  NEAR: "Layer 1",
  ADA: "Layer 1",
  DOT: "Layer 1",
  TON: "Layer 1",
  ATOM: "Layer 1",
  SEI: "Layer 1",
  // Layer 2
  ARB: "Layer 2",
  OP: "Layer 2",
  MATIC: "Layer 2",
  POL: "Layer 2",
  STRK: "Layer 2",
  ZK: "Layer 2",
  MNT: "Layer 2",
  METIS: "Layer 2",
};

export function getSectorForSymbol(symbol: string): Sector | undefined {
  return SECTOR_SEED_TAGS[symbol.toUpperCase()];
}

/**
 * Small, transparent 0-100 composite: momentum (weighted 24h/7d change) with
 * a penalty for extreme funding (crowded positioning = squeeze risk). Not a
 * prediction — a rule-based read of current conditions, same spirit as the
 * rest of this file.
 */
export function computeAssetAiScore(input: { change24h?: number; change7d?: number; fundingRate?: number }): number {
  let score = 50;
  score += clamp((input.change24h ?? 0) * 2, -20, 20);
  score += clamp((input.change7d ?? 0) * 0.5, -10, 10);
  if (input.fundingRate !== undefined) {
    const extremity = Math.min(Math.abs(input.fundingRate) * 10000, 20);
    score -= extremity * 0.3;
  }
  return clamp(Math.round(score), 0, 100);
}
