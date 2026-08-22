import type { Candle } from "./types";

export interface ProfileBin {
  priceLow: number;
  priceHigh: number;
  /** Volume-weighted total (Volume Profile) or candle-touch count (TPO). */
  value: number;
}

export interface PriceProfile {
  bins: ProfileBin[];
  poc: ProfileBin | null; // Point of Control — the highest-value bin
  vah: number | null; // Value Area High
  val: number | null; // Value Area Low
  rangeHigh: number;
  rangeLow: number;
}

/**
 * Builds a price-bucketed profile from OHLCV candles.
 *
 * There's no free tick/trade-level feed wired up yet, so this uses the
 * standard approximation every terminal without raw trade data falls back
 * to: each candle's volume (or, for TPO, a single "touch") is spread
 * uniformly across its own high↔low range. This is real exchange data
 * (Binance klines), not simulated — just distributed rather than exact
 * per-trade. POC/VAH/VAL are computed the standard way: POC is the bin with
 * the most value, then the value area grows outward from POC until it
 * covers `valueAreaPct` of total value.
 */
export function buildPriceProfile(
  candles: Candle[],
  weightMode: "volume" | "time",
  bins = 28,
  valueAreaPct = 0.7
): PriceProfile {
  if (candles.length === 0) {
    return { bins: [], poc: null, vah: null, val: null, rangeHigh: 0, rangeLow: 0 };
  }

  const rangeHigh = Math.max(...candles.map((c) => c.high));
  const rangeLow = Math.min(...candles.map((c) => c.low));
  const span = rangeHigh - rangeLow || 1;
  const binSize = span / bins;

  const values = new Array(bins).fill(0);

  for (const c of candles) {
    const cSpan = c.high - c.low || binSize;
    const startBin = Math.max(0, Math.floor((c.low - rangeLow) / binSize));
    const endBin = Math.min(bins - 1, Math.floor((c.high - rangeLow) / binSize));
    const touched = endBin - startBin + 1;
    const weight = weightMode === "volume" ? c.volume : 1;
    for (let b = startBin; b <= endBin; b++) {
      // Split proportional to how much of the candle's own range falls in this bin.
      const binLow = rangeLow + b * binSize;
      const binHigh = binLow + binSize;
      const overlap = Math.max(0, Math.min(c.high, binHigh) - Math.max(c.low, binLow));
      const fraction = touched > 0 ? overlap / (cSpan || binSize) : 1 / touched;
      values[b] += weight * (isFinite(fraction) && fraction > 0 ? fraction : 1 / touched);
    }
  }

  const profileBins: ProfileBin[] = values.map((value, i) => ({
    priceLow: rangeLow + i * binSize,
    priceHigh: rangeLow + (i + 1) * binSize,
    value,
  }));

  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return { bins: profileBins, poc: null, vah: null, val: null, rangeHigh, rangeLow };

  let pocIdx = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[pocIdx]) pocIdx = i;
  const poc = profileBins[pocIdx];

  // Grow the value area outward from POC, always adding whichever
  // neighbor (above/below) has more value, until valueAreaPct is covered.
  let covered = values[pocIdx];
  let lo = pocIdx;
  let hi = pocIdx;
  while (covered / total < valueAreaPct && (lo > 0 || hi < values.length - 1)) {
    const below = lo > 0 ? values[lo - 1] : -1;
    const above = hi < values.length - 1 ? values[hi + 1] : -1;
    if (above >= below) {
      hi++;
      covered += values[hi];
    } else {
      lo--;
      covered += values[lo];
    }
  }

  return {
    bins: profileBins,
    poc,
    vah: profileBins[hi].priceHigh,
    val: profileBins[lo].priceLow,
    rangeHigh,
    rangeLow,
  };
}
