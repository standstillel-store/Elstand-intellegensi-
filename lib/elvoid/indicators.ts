import type { Candle } from "./types";

// ---------------------------------------------------------------------------
// Plain technical-analysis math over OHLCV candles — no external TA library,
// same "no black box" spirit as lib/scoring.ts. Every function here is a
// pure function: candles in, numbers out, nothing hidden. This is the layer
// lib/elvoid/scanners.ts reads from for every one of the 10 scan categories.
// ---------------------------------------------------------------------------

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    prev = prev === undefined ? values[i] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Average True Range, smoothed with the same EMA helper above. */
export function atr(candles: Candle[], period = 14): number[] {
  const trueRanges: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  return ema(trueRanges, period);
}

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
  time: number;
}

/**
 * Fractal-based swing detection: a bar is a swing high if its high is the
 * tallest within `lookback` bars on each side (mirrored for swing lows).
 * Market structure, liquidity pools, and liquidity sweeps are all read from
 * this list.
 */
export function findSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const c = candles[i];
    if (c.high === Math.max(...window.map((w) => w.high))) {
      points.push({ index: i, price: c.high, type: "high", time: c.time });
    }
    if (c.low === Math.min(...window.map((w) => w.low))) {
      points.push({ index: i, price: c.low, type: "low", time: c.time });
    }
  }
  return points;
}

export interface SrLevel {
  price: number;
  type: "support" | "resistance";
  touches: number;
}

/**
 * Clusters swing points into support/resistance levels: two swing points
 * within `tolerancePct` of each other count as the same level, and the more
 * touches a level has, the stronger it's treated as. A level is labeled
 * "resistance" if it sits above the current price, "support" if below.
 */
export function findSupportResistance(candles: Candle[], currentPrice: number, tolerancePct = 0.006): SrLevel[] {
  const swings = findSwingPoints(candles, 3);
  const clusters: { price: number; touches: number; type: "high" | "low" }[] = [];

  for (const s of swings) {
    const match = clusters.find((c) => c.type === s.type && Math.abs(c.price - s.price) / s.price <= tolerancePct);
    if (match) {
      match.touches += 1;
      match.price = (match.price * (match.touches - 1) + s.price) / match.touches; // running average
    } else {
      clusters.push({ price: s.price, touches: 1, type: s.type });
    }
  }

  return clusters
    .map((c) => ({
      price: c.price,
      touches: c.touches,
      type: (c.price >= currentPrice ? "resistance" : "support") as "support" | "resistance",
    }))
    .sort((a, b) => b.touches - a.touches);
}

export type TrendDirection = "uptrend" | "downtrend" | "sideways";

export interface TrendReading {
  direction: TrendDirection;
  strength: number; // 0-100
  detail: string;
}

/**
 * Trend read from EMA alignment (20/50/~100) plus market-structure
 * confirmation (higher-highs & higher-lows, or the reverse) from the last
 * few swing points. Agreement between the two raises strength; disagreement
 * pulls the read toward "sideways" instead of forcing a side.
 */
export function detectTrend(candles: Candle[]): TrendReading {
  const closes = candles.map((c) => c.close);
  const longPeriod = Math.min(100, Math.max(20, candles.length - 1));
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const emaLong = ema(closes, longPeriod);
  const last = closes.length - 1;

  const emaBullish = ema20[last] > ema50[last] && ema50[last] > emaLong[last];
  const emaBearish = ema20[last] < ema50[last] && ema50[last] < emaLong[last];

  const swings = findSwingPoints(candles, 3);
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);
  const higherHighs = highs.length >= 2 && highs[highs.length - 1].price > highs[0].price;
  const higherLows = lows.length >= 2 && lows[lows.length - 1].price > lows[0].price;
  const lowerHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[0].price;
  const lowerLows = lows.length >= 2 && lows[lows.length - 1].price < lows[0].price;

  const structureBullish = higherHighs && higherLows;
  const structureBearish = lowerHighs && lowerLows;

  if (emaBullish && structureBullish) {
    return { direction: "uptrend", strength: 85, detail: "EMA20>50>100 dan struktur higher-high/higher-low kompak." };
  }
  if (emaBearish && structureBearish) {
    return { direction: "downtrend", strength: 85, detail: "EMA20<50<100 dan struktur lower-high/lower-low kompak." };
  }
  if (emaBullish || structureBullish) {
    return {
      direction: "uptrend",
      strength: 55,
      detail: emaBullish
        ? "EMA condong bullish, struktur belum sepenuhnya konfirmasi."
        : "Struktur higher-high/higher-low, EMA belum sejajar penuh.",
    };
  }
  if (emaBearish || structureBearish) {
    return {
      direction: "downtrend",
      strength: 55,
      detail: emaBearish
        ? "EMA condong bearish, struktur belum sepenuhnya konfirmasi."
        : "Struktur lower-high/lower-low, EMA belum sejajar penuh.",
    };
  }
  return { direction: "sideways", strength: 30, detail: "EMA dan struktur belum menunjukkan arah yang jelas — range-bound." };
}

/** Last candle's volume vs the average of the prior `period` candles. */
export function volumeAnomaly(candles: Candle[], period = 20): { ratio: number; spiking: boolean } {
  if (candles.length < period + 1) return { ratio: 1, spiking: false };
  const recent = candles.slice(-period - 1, -1);
  const avg = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const last = candles[candles.length - 1].volume;
  const ratio = avg > 0 ? last / avg : 1;
  return { ratio, spiking: ratio >= 1.8 };
}

export interface MacdReading {
  macd: number;
  signal: number;
  histogram: number;
  trend: "bullish" | "bearish" | "neutral";
  /** A fresh cross on the most recent candle — "none" means the current trend has already been running. */
  crossover: "bullish_cross" | "bearish_cross" | "none";
}

/** Standard 12/26/9 MACD. `ema()` above returns a full aligned series, so this is a direct composition — no separate warm-up handling needed. */
export function calcMacd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): MacdReading | undefined {
  if (candles.length < slow + signalPeriod) return undefined;
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);

  const last = macdLine.length - 1;
  const prev = last - 1;
  const macd = macdLine[last];
  const signal = signalLine[last];
  const hist = histogram[last];

  let crossover: MacdReading["crossover"] = "none";
  if (prev >= 0) {
    if (macdLine[prev] <= signalLine[prev] && macd > signal) crossover = "bullish_cross";
    if (macdLine[prev] >= signalLine[prev] && macd < signal) crossover = "bearish_cross";
  }

  return {
    macd,
    signal,
    histogram: hist,
    trend: hist > 0 ? "bullish" : hist < 0 ? "bearish" : "neutral",
    crossover,
  };
}

// ---------------------------------------------------------------------------
// Additional indicators for the AI Signal "Indicators Suite" panel. Same
// rules as above: pure functions, real OHLCV in, numbers out, nothing
// fabricated — every function below returns `undefined` (or an
// "insufficient data" flag where relevant) when there simply isn't enough
// history yet, instead of guessing.
// ---------------------------------------------------------------------------

export interface BollingerReading {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number; // (upper-lower)/middle, as a plain ratio
  percentB: number; // where the last close sits within the bands, 0..1 (can exceed if outside)
}

export function calcBollinger(candles: Candle[], period = 20, stdDevMult = 2): BollingerReading | undefined {
  if (candles.length < period) return undefined;
  const closes = candles.map((c) => c.close);
  const window = closes.slice(-period);
  const middle = window.reduce((s, v) => s + v, 0) / period;
  const variance = window.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + stdDevMult * stdDev;
  const lower = middle - stdDevMult * stdDev;
  const last = closes[closes.length - 1];
  return {
    upper,
    middle,
    lower,
    bandwidth: middle !== 0 ? (upper - lower) / middle : 0,
    percentB: upper !== lower ? (last - lower) / (upper - lower) : 0.5,
  };
}

export interface AdxReading {
  adx: number;
  plusDI: number;
  minusDI: number;
  trendStrength: "weak" | "developing" | "strong";
}

/** Wilder's ADX/+DI/-DI. Needs roughly 2x period candles for the smoothing to settle. */
export function calcAdx(candles: Candle[], period = 14): AdxReading | undefined {
  if (candles.length < period * 2 + 1) return undefined;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }
  const smooth = (series: number[]): number[] => {
    const out: number[] = new Array(series.length).fill(NaN);
    let sum = series.slice(1, period + 1).reduce((s, v) => s + v, 0);
    out[period] = sum;
    for (let i = period + 1; i < series.length; i++) {
      sum = sum - sum / period + series[i];
      out[i] = sum;
    }
    return out;
  };
  const trSm = smooth(tr);
  const plusSm = smooth(plusDM);
  const minusSm = smooth(minusDM);

  const plusDIArr = trSm.map((v, i) => (v ? (plusSm[i] / v) * 100 : NaN));
  const minusDIArr = trSm.map((v, i) => (v ? (minusSm[i] / v) * 100 : NaN));
  const dx = plusDIArr.map((p, i) => {
    const m = minusDIArr[i];
    const sum = p + m;
    return sum ? (Math.abs(p - m) / sum) * 100 : NaN;
  });

  const validDx = dx.filter((v) => !Number.isNaN(v));
  if (validDx.length < period) return undefined;
  const adxSeries = ema(validDx, period);
  const adx = adxSeries[adxSeries.length - 1];
  const plusDI = plusDIArr[plusDIArr.length - 1];
  const minusDI = minusDIArr[minusDIArr.length - 1];

  return {
    adx,
    plusDI,
    minusDI,
    trendStrength: adx >= 40 ? "strong" : adx >= 20 ? "developing" : "weak",
  };
}

export interface VwapReading {
  vwap: number;
  deviationPct: number; // last close vs VWAP, as %
}

/**
 * Cumulative VWAP over whatever candle window was loaded (this page has no
 * exchange session boundary to anchor to, so it's "VWAP since the loaded
 * window" rather than a calendar-session VWAP — labeled as such in the UI).
 */
export function calcVwap(candles: Candle[]): VwapReading | undefined {
  if (!candles.length) return undefined;
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumVol += c.volume;
  }
  if (cumVol <= 0) return undefined;
  const vwap = cumPV / cumVol;
  const last = candles[candles.length - 1].close;
  return { vwap, deviationPct: ((last - vwap) / vwap) * 100 };
}

export interface IchimokuReading {
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  cloud: "bullish" | "bearish" | "flat";
  priceVsCloud: "above" | "below" | "inside";
}

/** Standard 9/26/52 Ichimoku. Senkou A/B are reported at their current (unshifted) value — this panel shows current state, not a forward-projected cloud drawing. */
export function calcIchimoku(candles: Candle[]): IchimokuReading | undefined {
  if (candles.length < 52) return undefined;
  const donchianMid = (period: number, endIdx: number) => {
    const window = candles.slice(Math.max(0, endIdx - period + 1), endIdx + 1);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));
    return (high + low) / 2;
  };
  const lastIdx = candles.length - 1;
  const tenkan = donchianMid(9, lastIdx);
  const kijun = donchianMid(26, lastIdx);
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = donchianMid(52, lastIdx);
  const last = candles[lastIdx].close;
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    cloud: senkouA > senkouB ? "bullish" : senkouA < senkouB ? "bearish" : "flat",
    priceVsCloud: last > cloudTop ? "above" : last < cloudBottom ? "below" : "inside",
  };
}

export interface SupertrendReading {
  value: number;
  direction: "up" | "down";
  flippedThisBar: boolean;
}

/** Standard ATR-based Supertrend (multiplier x ATR period), computed candle-by-candle so the direction flip is genuine, not just a snapshot. */
export function calcSupertrend(candles: Candle[], period = 10, multiplier = 3): SupertrendReading | undefined {
  if (candles.length < period + 2) return undefined;
  const atrSeries = atr(candles, period);
  let direction: "up" | "down" = "up";
  let st = candles[0].close;
  let flipped = false;
  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    const a = atrSeries[i];
    if (Number.isNaN(a)) continue;
    const mid = (c.high + c.low) / 2;
    const upperBand = mid + multiplier * a;
    const lowerBand = mid - multiplier * a;
    const prevDirection = direction;
    if (c.close > st) direction = "up";
    else if (c.close < st) direction = "down";
    st = direction === "up" ? Math.max(lowerBand, i > period && prevDirection === "up" ? st : lowerBand) : Math.min(upperBand, i > period && prevDirection === "down" ? st : upperBand);
    flipped = i === candles.length - 1 && prevDirection !== direction;
  }
  return { value: st, direction, flippedThisBar: flipped };
}

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  volume: number;
}

export interface VolumeProfileReading {
  buckets: VolumeProfileBucket[];
  pocPrice: number; // Point of Control — price bucket with the most traded volume
  maxVolume: number;
}

/** Splits the visible candle range into `bins` equal price buckets and sums each candle's real volume into whichever bucket its close falls in. */
export function calcVolumeProfile(candles: Candle[], bins = 12): VolumeProfileReading | undefined {
  if (candles.length < 5) return undefined;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  if (max <= min) return undefined;
  const step = (max - min) / bins;
  const buckets: VolumeProfileBucket[] = Array.from({ length: bins }, (_, i) => ({
    priceLow: min + i * step,
    priceHigh: min + (i + 1) * step,
    volume: 0,
  }));
  for (const c of candles) {
    let idx = Math.floor((c.close - min) / step);
    idx = Math.max(0, Math.min(bins - 1, idx));
    buckets[idx].volume += c.volume;
  }
  const maxVolume = Math.max(...buckets.map((b) => b.volume), 1e-9);
  const poc = buckets.reduce((best, b) => (b.volume > best.volume ? b : best), buckets[0]);
  return { buckets, pocPrice: (poc.priceLow + poc.priceHigh) / 2, maxVolume };
}
