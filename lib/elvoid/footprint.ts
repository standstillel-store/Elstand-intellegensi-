import type { RecentTrade } from "../binance";

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
