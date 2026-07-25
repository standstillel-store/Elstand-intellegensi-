export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
}

export interface FundingInfo {
  symbol: string;
  lastFundingRate: number;
  markPrice: number;
  openInterest?: number;
  openInterestValue?: number;
}

export interface WhaleTransfer {
  hash: string;
  asset: string;
  valueUsd: number;
  from: string;
  to: string;
  direction: "in" | "out" | "wallet-to-wallet";
  timestamp: string;
}

export interface NewsItem {
  id: number | string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface FearGreedPoint {
  value: number;
  classification: string;
  timestamp: string;
}

export interface DexPool {
  id: string;
  network: string;
  name: string;
  baseSymbol: string;
  priceUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  fdvUsd?: number;
  poolCreatedAt?: string;
  priceChange24h?: number;
}

export interface PumpCandidate {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  change24h: number;
  score: number;
  /** 0-100: how many independent signal categories corroborate this read
   * (momentum, turnover, DEX confirmation, whale flow, funding) — not the
   * same thing as the score itself, which measures strength rather than
   * agreement. */
  confidence: number;
  reasons: string[];
}

export interface RugpullRisk {
  id: string;
  symbol: string;
  name: string;
  network: string;
  score: number;
  /** 0-100: derived from how many independent flags fired, not the score
   * itself — two tokens can share a score but differ in how many separate
   * checks agree on it. */
  confidence: number;
  flags: string[];
  liquidityUsd: number;
  volume24hUsd: number;
}

export interface EconomicEvent {
  title: string;
  country: string;
  date: string; // ISO
  impact: "high" | "medium" | "low";
  forecast?: string;
  previous?: string;
}
