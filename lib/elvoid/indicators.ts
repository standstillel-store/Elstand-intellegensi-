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
