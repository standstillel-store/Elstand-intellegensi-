import type { Candle } from "./types";

export interface LiquidityVolumeBin {
  priceLow: number;
  priceHigh: number;
}

export interface LiquidityVolumeColumn {
  time: number; // candle open time (ms) this column represents
  values: number[]; // one value per bin, same order/length as `bins`
  touch: number[]; // how many real candles in this column's window actually touched that bin — real evidence count, used to fade bubble/cell confidence, never fabricated
}

export interface LiquidityVolumeMap {
  bins: LiquidityVolumeBin[];
  columns: LiquidityVolumeColumn[];
  maxValue: number;
}

/**
 * Rolling volume-at-price heatmap built from real OHLCV candles.
 *
 * This is a deliberate standalone sibling to buildPriceProfile() in
 * marketProfile.ts, not a shared refactor of it — Volume Profile and TPO
 * both depend on that function and must not change. The underlying
 * technique is the same real-data approximation Volume Profile already
 * uses (every terminal without raw tick history falls back to this): each
 * candle's own traded volume (real Binance kline data) is spread
 * proportionally across the portion of each price bin its high↔low range
 * actually covers. Nothing here is random or fabricated.
 *
 * The key difference from a single static profile: bin PRICE boundaries
 * are computed once from the full candle set passed in, then each time
 * column re-accumulates only its own trailing `rollingWindow` candles into
 * those SAME fixed boundaries. That's what lets a given row mean "the same
 * price level" across every column, so real horizontal liquidity bands
 * (a price level repeatedly traded over time) can emerge — instead of each
 * column having its own incomparable price scale.
 *
 * Each column also applies a linear decay across its own trailing window
 * (oldest candle weighted ~15%, newest 100%), so a zone that stops trading
 * fades out over several columns instead of cutting off sharply the moment
 * it exits the window — real values throughout, only the weighting changes.
 */
export function buildLiquidityVolumeMap(candles: Candle[], binCount = 28, rollingWindow = 15): LiquidityVolumeMap {
  if (candles.length === 0) return { bins: [], columns: [], maxValue: 0 };

  const rangeHigh = Math.max(...candles.map((c) => c.high));
  const rangeLow = Math.min(...candles.map((c) => c.low));
  const span = rangeHigh - rangeLow || 1;
  const binSize = span / binCount;

  const bins: LiquidityVolumeBin[] = Array.from({ length: binCount }, (_, i) => ({
    priceLow: rangeLow + i * binSize,
    priceHigh: rangeLow + (i + 1) * binSize,
  }));

  function distribute(window: Candle[]): { values: number[]; touch: number[] } {
    const values = new Array(binCount).fill(0);
    const touch = new Array(binCount).fill(0);
    const windowLen = window.length;
    for (let j = 0; j < windowLen; j++) {
      const c = window[j];
      // Linear decay: the oldest candle in the window contributes at ~15%
      // weight, the newest at 100%. Real volume either way — this only
      // changes how much a given real number *counts*, so a price level
      // that stops trading tapers out over several columns instead of
      // disappearing the instant it exits the trailing window.
      const weight = windowLen === 1 ? 1 : 0.15 + 0.85 * ((j + 1) / windowLen);
      const cSpan = c.high - c.low || binSize;
      const startBin = Math.max(0, Math.floor((c.low - rangeLow) / binSize));
      const endBin = Math.min(binCount - 1, Math.floor((c.high - rangeLow) / binSize));
      const touched = endBin - startBin + 1;
      for (let b = startBin; b <= endBin; b++) {
        const binLow = rangeLow + b * binSize;
        const binHigh = binLow + binSize;
        const overlap = Math.max(0, Math.min(c.high, binHigh) - Math.max(c.low, binLow));
        const fraction = overlap > 0 ? overlap / cSpan : 1 / touched;
        values[b] += c.volume * fraction * weight;
        touch[b] += 1;
      }
    }
    return { values, touch };
  }

  const columns: LiquidityVolumeColumn[] = candles.map((c, i) => {
    const start = Math.max(0, i - rollingWindow + 1);
    const { values, touch } = distribute(candles.slice(start, i + 1));
    return { time: c.time, values, touch };
  });

  const maxValue = Math.max(...columns.flatMap((col) => col.values), 1e-9);
  return { bins, columns, maxValue };
}
