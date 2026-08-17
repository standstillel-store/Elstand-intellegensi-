import type { RecentTrade } from "../binance";
import type { Candle } from "./types";

export interface FootprintCell {
  priceLow: number;
  priceHigh: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  /** true when this cell's dominant side is 3x+ the other — a "stacked imbalance" flag. */
  imbalance: boolean;
}

export interface FootprintLadder {
  cells: FootprintCell[]; // highest price first
  poc: FootprintCell | null; // highest total volume
  totalBuy: number;
  totalSell: number;
}

/** Builds a Footprint-style bid/ask price ladder from real recent trades. */
export function buildFootprintLadder(trades: RecentTrade[], bins = 20): FootprintLadder {
  if (trades.length === 0) return { cells: [], poc: null, totalBuy: 0, totalSell: 0 };

  const prices = trades.map((t) => t.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const span = high - low || high * 0.001 || 1;
  const binSize = span / bins;

  const buy = new Array(bins).fill(0);
  const sell = new Array(bins).fill(0);

  for (const t of trades) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((t.price - low) / binSize)));
    if (t.isSell) sell[idx] += t.qty;
    else buy[idx] += t.qty;
  }

  const cells: FootprintCell[] = [];
  let totalBuy = 0;
  let totalSell = 0;
  for (let i = bins - 1; i >= 0; i--) {
    const b = buy[i];
    const s = sell[i];
    totalBuy += b;
    totalSell += s;
    const dominant = Math.max(b, s);
    const weak = Math.min(b, s);
    cells.push({
      priceLow: low + i * binSize,
      priceHigh: low + (i + 1) * binSize,
      buyVolume: b,
      sellVolume: s,
      delta: b - s,
      imbalance: dominant > 0 && weak >= 0 && dominant >= weak * 3 && dominant > 0,
    });
  }

  let poc: FootprintCell | null = null;
  for (const c of cells) {
    const total = c.buyVolume + c.sellVolume;
    if (!poc || total > poc.buyVolume + poc.sellVolume) poc = c;
  }

  return { cells, poc, totalBuy, totalSell };
}

export interface CandleFootprint {
  candleTime: number;
  cells: FootprintCell[]; // highest price first, small ladder (few levels) sized to fit inside one candle
  poc: FootprintCell | null; // this candle's highest-volume price level
  delta: number; // candle-level buy - sell
  totalVolume: number; // candle-level buy + sell, reusing the same cells (no extra data source)
}

/**
 * Buckets real trades into the candle they actually happened in (by
 * timestamp), then builds a small bid/ask ladder using that candle's own
 * OHLC high↔low range — this is what gets drawn directly on top of each
 * candlestick. Using the candle's real range (not the trades' own min/max)
 * matters: trades inside a quiet candle can cluster in a narrow sub-range,
 * and building the ladder off their min/max instead of the candle's actual
 * body caused cells to misalign with the candle's rendered coordinates
 * (the "giant solid block" glitch). Only candles whose time window is
 * covered by the trade sample get a footprint; older candles are simply
 * left blank rather than showing fabricated numbers.
 *
 * Row count is ADAPTIVE per candle rather than one fixed number for every
 * candle: a quiet candle with a handful of trades doesn't need (and can't
 * honestly fill) 10+ empty rows, while a big/volatile candle with a wide
 * high-low range and many trades genuinely has room for more distinct
 * price levels — this is what spec section C means by "large candles MUST
 * also receive complete footprint levels... do not skip because trade
 * count is high or candle range is large". Bin count scales with real
 * trade count (sqrt, so it grows sub-linearly) between minBins and maxBins.
 */
export function buildFootprintByCandle(candles: Candle[], trades: RecentTrade[], intervalMs: number, minBins = 5, maxBins = 12): Map<number, CandleFootprint> {
  const byCandle = new Map<number, RecentTrade[]>();
  for (const t of trades) {
    const bucket = candles.find((c) => t.time >= c.time && t.time < c.time + intervalMs);
    if (!bucket) continue;
    const arr = byCandle.get(bucket.time) ?? [];
    arr.push(t);
    byCandle.set(bucket.time, arr);
  }

  const result = new Map<number, CandleFootprint>();
  for (const candle of candles) {
    const candleTrades = byCandle.get(candle.time);
    if (!candleTrades || candleTrades.length === 0) continue;

    // Adaptive resolution: sqrt(tradeCount) grows the ladder for genuinely
    // busy candles without ballooning a quiet one into mostly-empty rows.
    const binsPerCandle = Math.max(minBins, Math.min(maxBins, Math.round(Math.sqrt(candleTrades.length) * 1.6)));

    const high = candle.high;
    const low = candle.low;
    const span = high - low || high * 0.0005 || 1;
    const binSize = span / binsPerCandle;

    const buy = new Array(binsPerCandle).fill(0);
    const sell = new Array(binsPerCandle).fill(0);
    for (const t of candleTrades) {
      const idx = Math.min(binsPerCandle - 1, Math.max(0, Math.floor((t.price - low) / binSize)));
      if (t.isSell) sell[idx] += t.qty;
      else buy[idx] += t.qty;
    }

    const cells: FootprintCell[] = [];
    for (let i = binsPerCandle - 1; i >= 0; i--) {
      const b = buy[i];
      const s = sell[i];
      if (b === 0 && s === 0) continue; // skip empty rows — real candles rarely fill every bin evenly
      const dominant = Math.max(b, s);
      const weak = Math.min(b, s);
      cells.push({
        priceLow: low + i * binSize,
        priceHigh: low + (i + 1) * binSize,
        buyVolume: b,
        sellVolume: s,
        delta: b - s,
        imbalance: dominant > 0 && dominant >= weak * 3,
      });
    }
    if (cells.length === 0) continue;

    let poc: FootprintCell | null = null;
    let delta = 0;
    let totalVolume = 0;
    for (const c of cells) {
      delta += c.delta;
      totalVolume += c.buyVolume + c.sellVolume;
      const total = c.buyVolume + c.sellVolume;
      if (!poc || total > poc.buyVolume + poc.sellVolume) poc = c;
    }

    result.set(candle.time, { candleTime: candle.time, cells, poc, delta, totalVolume });
  }
  return result;
}
