import {
  getFundingSnapshot,
  getFundingRateHistory,
  getCvdSeries,
  getOrderBookDepth,
  type FundingRatePoint,
} from "@/lib/binance";
import { getOkxFundingRateHistory, getOkxCurrentFundingRate } from "@/lib/okx";
import { getBybitFundingRateHistory, getBybitCurrentFundingRate } from "@/lib/bybit";

// ---------------------------------------------------------------------------
// ELSTAND PREMIUM — Futures Microstructure Intelligence adapter.
//
// Deliberately separate from lib/intelligence/btcMicrostructure.ts (which
// already has its own consumer(s) on the dashboard and stays BTC-only /
// untouched, per architectural decision). This file exists solely to feed
// the Premium dashboard's Funding Rate / Market Order Flow / Order Book
// Imbalance cards for BTC, ETH, BNB, SOL — additive only, no shared state
// with the existing microstructure module.
//
// Every field here traces to a real public exchange endpoint (Binance
// Futures, OKX, or Bybit — all public, no API key). If a call fails, the
// corresponding `connected` flag is false and the UI must render an
// explicit unavailable state — never a fabricated number.
//
// Funding Rate is the only card with cross-exchange data (Binance + OKX +
// Bybit) — Market Order Flow (taker buy/sell) and Order Book depth stay
// Binance-only, since OKX/Bybit's order-flow and depth-snapshot shapes
// aren't directly comparable without more work, and Karin's stated
// principle is real data or nothing, never an approximation dressed up as
// a real comparison.
// ---------------------------------------------------------------------------

export const SUPPORTED_PAIRS = ["BTC", "ETH", "BNB", "SOL"] as const;
export type SupportedPair = (typeof SUPPORTED_PAIRS)[number];

export const FUNDING_EXCHANGES = ["Binance", "OKX", "Bybit"] as const;
export type FundingExchange = (typeof FUNDING_EXCHANGES)[number];

export type MicrostructurePeriod = "1D" | "7D" | "1M";

// Binance USDT-M perps settle funding 3x/day (every 8h) for the vast
// majority of symbols on this watchlist — so a period maps to a settlement
// count, not a day count. Documented limitation: if a specific symbol ever
// settles on a different cadence, this will under/over-fetch slightly; it
// will never fabricate a point to compensate.
const SETTLEMENTS_PER_DAY = 3;
const PERIOD_DAYS: Record<MicrostructurePeriod, number> = { "1D": 1, "7D": 7, "1M": 30 };
// CVD/order-flow chart uses 1h candles; period maps directly to hour count.
const PERIOD_HOURS: Record<MicrostructurePeriod, number> = { "1D": 24, "7D": 24 * 7, "1M": 24 * 30 };

export interface FundingHistorySeries {
  points: FundingRatePoint[];
  connected: boolean;
}

/** One asset's Binance funding history + current rate, for the multi-asset overlay chart. */
export interface AssetFundingSeries {
  pair: SupportedPair;
  currentFundingRate?: number;
  history: FundingHistorySeries;
}

/** Current funding rate for one exchange, for the selected pair's cross-exchange comparison row. */
export interface ExchangeFundingReading {
  exchange: FundingExchange;
  currentFundingRate?: number;
  connected: boolean;
}

export interface OrderFlowSeries {
  points: { time: number; delta: number; cvd: number; buyVolumeUsd: number; sellVolumeUsd: number }[];
  connected: boolean;
}

export interface OrderBookDepthData {
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
  midPrice?: number;
  bidLiquidityUsd?: number;
  askLiquidityUsd?: number;
  bidDominancePercent?: number;
  askDominancePercent?: number;
  depthImbalancePercent?: number;
  connected: boolean;
}

export interface PremiumMicrostructureSnapshot {
  pair: SupportedPair;
  period: MicrostructurePeriod;
  asOf: string;
  currentFundingRate?: number;
  fundingHistory: FundingHistorySeries;
  /** All SUPPORTED_PAIRS' Binance funding history, for the multi-asset overlay chart. */
  multiAssetFunding: AssetFundingSeries[];
  /** Cross-exchange current funding rate for `pair` only — Binance/OKX/Bybit. */
  crossExchangeFunding: ExchangeFundingReading[];
  orderFlow: OrderFlowSeries;
  orderBook: OrderBookDepthData;
}

function sumNotionalUsd(levels: { price: number; qty: number }[]): number {
  return levels.reduce((s, l) => s + l.price * l.qty, 0);
}

async function getAssetFunding(pair: SupportedPair, fundingLimit: number, currentByPair: Map<string, number>): Promise<AssetFundingSeries> {
  const history = await getFundingRateHistory(pair, fundingLimit).catch(() => undefined);
  return {
    pair,
    currentFundingRate: currentByPair.get(`${pair}USDT`),
    history: {
      points: history ?? [],
      connected: Boolean(history && history.length >= 2),
    },
  };
}

async function getCrossExchangeFunding(pair: SupportedPair, binanceRate: number | undefined): Promise<ExchangeFundingReading[]> {
  const [okxRate, bybitRate] = await Promise.all([
    getOkxCurrentFundingRate(pair).catch(() => undefined),
    getBybitCurrentFundingRate(pair).catch(() => undefined),
  ]);
  return [
    { exchange: "Binance", currentFundingRate: binanceRate, connected: binanceRate !== undefined },
    { exchange: "OKX", currentFundingRate: okxRate, connected: okxRate !== undefined },
    { exchange: "Bybit", currentFundingRate: bybitRate, connected: bybitRate !== undefined },
  ];
}

export async function getPremiumMicrostructure(
  pair: SupportedPair,
  period: MicrostructurePeriod
): Promise<PremiumMicrostructureSnapshot> {
  const fundingLimit = PERIOD_DAYS[period] * SETTLEMENTS_PER_DAY;
  const hoursLimit = Math.min(500, PERIOD_HOURS[period]); // Binance klines cap per request

  const [fundingSnapshot, cvdRaw, orderbookRaw] = await Promise.all([
    getFundingSnapshot().catch(() => undefined),
    getCvdSeries(pair, "1h", hoursLimit).catch(() => undefined),
    getOrderBookDepth(pair, 50).catch(() => undefined),
  ]);

  const currentByPair = new Map<string, number>();
  for (const f of fundingSnapshot ?? []) currentByPair.set(f.symbol, f.lastFundingRate);

  const multiAssetFunding = await Promise.all(SUPPORTED_PAIRS.map((p) => getAssetFunding(p, fundingLimit, currentByPair)));
  const selected = multiAssetFunding.find((a) => a.pair === pair)!;
  const currentFundingRate = selected.currentFundingRate;

  const crossExchangeFunding = await getCrossExchangeFunding(pair, currentFundingRate);

  const orderBook: OrderBookDepthData = {
    bids: orderbookRaw?.bids ?? [],
    asks: orderbookRaw?.asks ?? [],
    connected: Boolean(orderbookRaw?.bids.length && orderbookRaw?.asks.length),
  };
  if (orderBook.connected) {
    const bestBid = orderBook.bids[0].price;
    const bestAsk = orderBook.asks[0].price;
    orderBook.midPrice = (bestBid + bestAsk) / 2;
    const bidUsd = sumNotionalUsd(orderBook.bids);
    const askUsd = sumNotionalUsd(orderBook.asks);
    orderBook.bidLiquidityUsd = bidUsd;
    orderBook.askLiquidityUsd = askUsd;
    const total = bidUsd + askUsd;
    if (total > 0) {
      orderBook.bidDominancePercent = (bidUsd / total) * 100;
      orderBook.askDominancePercent = (askUsd / total) * 100;
      orderBook.depthImbalancePercent = orderBook.bidDominancePercent - orderBook.askDominancePercent;
    }
  }

  return {
    pair,
    period,
    asOf: new Date().toISOString(),
    currentFundingRate,
    fundingHistory: selected.history,
    multiAssetFunding,
    crossExchangeFunding,
    orderFlow: {
      points: cvdRaw ?? [],
      connected: Boolean(cvdRaw && cvdRaw.length >= 2),
    },
    orderBook,
  };
}

