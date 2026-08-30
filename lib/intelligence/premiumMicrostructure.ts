import {
  getFundingSnapshot,
  getFundingRateHistory,
  getCvdSeries,
  getOrderBookDepth,
  type FundingRatePoint,
} from "@/lib/binance";

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
// Every field here traces to a real public Binance Futures endpoint. If a
// call fails, the corresponding `connected.*` flag is false and the UI must
// render an explicit unavailable state — never a fabricated number.
// ---------------------------------------------------------------------------

export const SUPPORTED_PAIRS = ["BTC", "ETH", "BNB", "SOL"] as const;
export type SupportedPair = (typeof SUPPORTED_PAIRS)[number];

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

export interface OrderFlowSeries {
  points: { time: number; delta: number; cvd: number }[];
  connected: boolean;
}

export interface OrderBookDepthData {
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
  midPrice?: number;
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
  orderFlow: OrderFlowSeries;
  orderBook: OrderBookDepthData;
}

function sumQty(levels: { qty: number }[]): number {
  return levels.reduce((s, l) => s + l.qty, 0);
}

export async function getPremiumMicrostructure(
  pair: SupportedPair,
  period: MicrostructurePeriod
): Promise<PremiumMicrostructureSnapshot> {
  const fundingLimit = PERIOD_DAYS[period] * SETTLEMENTS_PER_DAY;
  const hoursLimit = Math.min(500, PERIOD_HOURS[period]); // Binance klines cap per request

  const [fundingSnapshot, fundingHistoryRaw, cvdRaw, orderbookRaw] = await Promise.all([
    getFundingSnapshot().catch(() => undefined),
    getFundingRateHistory(pair, fundingLimit).catch(() => undefined),
    getCvdSeries(pair, "1h", hoursLimit).catch(() => undefined),
    getOrderBookDepth(pair, 50).catch(() => undefined),
  ]);

  const currentFundingRate = fundingSnapshot?.find((f) => f.symbol === `${pair}USDT`)?.lastFundingRate;

  const orderBook: OrderBookDepthData = {
    bids: orderbookRaw?.bids ?? [],
    asks: orderbookRaw?.asks ?? [],
    connected: Boolean(orderbookRaw?.bids.length && orderbookRaw?.asks.length),
  };
  if (orderBook.connected) {
    const bestBid = orderBook.bids[0].price;
    const bestAsk = orderBook.asks[0].price;
    orderBook.midPrice = (bestBid + bestAsk) / 2;
    const bidVol = sumQty(orderBook.bids);
    const askVol = sumQty(orderBook.asks);
    const total = bidVol + askVol;
    if (total > 0) {
      orderBook.bidDominancePercent = (bidVol / total) * 100;
      orderBook.askDominancePercent = (askVol / total) * 100;
      orderBook.depthImbalancePercent = orderBook.bidDominancePercent - orderBook.askDominancePercent;
    }
  }

  return {
    pair,
    period,
    asOf: new Date().toISOString(),
    currentFundingRate,
    fundingHistory: {
      points: fundingHistoryRaw ?? [],
      connected: Boolean(fundingHistoryRaw && fundingHistoryRaw.length >= 2),
    },
    orderFlow: {
      points: cvdRaw ?? [],
      connected: Boolean(cvdRaw && cvdRaw.length >= 2),
    },
    orderBook,
  };
}
