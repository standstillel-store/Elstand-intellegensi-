// ---------------------------------------------------------------------------
// Phase 7.3B — Regime-Aware Interpretation fixtures (dev-only, not part of
// the app).
//
// Tests classifyMarketRegime() directly against synthetic candle series
// (pure function, no network/Binance call — same sandbox constraint as
// scripts/phase7/mtf-fixtures.ts) plus hand-built MtfContext objects for
// the mtfAlignment cases. Covers Phase 7.3B spec's 8 fixture cases.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/regime-fixtures.ts
// ---------------------------------------------------------------------------

import { classifyMarketRegime, type RegimeType, type MtfAlignment } from "@/lib/ai/oracle/regime";
import type { MtfContext, TimeframeSlice } from "@/lib/ai/oracle/mtf";
import type { Candle } from "@/lib/elvoid/types";

/** Builds a deterministic synthetic candle series. `drift` per-candle price change (positive = up), `noise` amplitude of a small alternating zig-zag layered on top so EMA/swing structure has something to read, `count` total candles (kept well above MIN_CANDLES_FOR_ADX). */
function buildCandles(count: number, start: number, drift: number, noise: number): Candle[] {
  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const zigzag = i % 2 === 0 ? noise : -noise * 0.4; // asymmetric so net drift still dominates direction
    const open = price;
    price = price + drift + zigzag;
    const close = price;
    const high = Math.max(open, close) + Math.abs(noise) * 0.2;
    const low = Math.min(open, close) - Math.abs(noise) * 0.2;
    candles.push({ time: i * 60_000, open, high, low, close, volume: 100 + Math.abs(zigzag) });
  }
  return candles;
}

/** Pure alternating flat/chop series — no net drift, small symmetric noise -> low ADX, sideways structure. */
function buildRangingCandles(count: number, base: number, noise: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const wiggle = i % 2 === 0 ? noise : -noise;
    const open = base + wiggle;
    const close = base - wiggle * 0.6;
    const high = Math.max(open, close) + noise * 0.3;
    const low = Math.min(open, close) - noise * 0.3;
    candles.push({ time: i * 60_000, open, high, low, close, volume: 100 });
  }
  return candles;
}

function slice(timeframe: string, available: boolean, bias: TimeframeSlice["bias"]): TimeframeSlice {
  return { timeframe, available, bias, strength: available && bias !== "NEUTRAL" ? 10 : 0, evidence: `fixture ${timeframe}`, protectiveLevel: null };
}

function mtfCtx(htf: TimeframeSlice | null, ltf: TimeframeSlice | null): MtfContext {
  return {
    anchorInterval: "15m",
    htf,
    mtf: slice("15m", true, "NEUTRAL"),
    ltf,
    relationship: "NEUTRAL_OR_MIXED",
    relationshipEvidence: "fixture",
  };
}

interface Case {
  name: string;
  candles: Candle[];
  mtf?: MtfContext | null;
  expectType: RegimeType;
  expectAlignment?: MtfAlignment;
}

const uptrend = buildCandles(60, 100, 0.6, 0.15);
const downtrend = buildCandles(60, 100, -0.6, 0.15);
const ranging = buildRangingCandles(60, 100, 0.3);
/**
 * ADX measures directional PERSISTENCE, not magnitude — a candle-to-candle
 * high/low that moves the same direction every single bar hits ADX~100
 * even at tiny amplitude. To honestly produce a "structure leans one way,
 * but ADX is weak" series, the high/low must actually reverse direction
 * bar-to-bar (oscillation), which cancels +DM/-DM into a low ADX, while a
 * slow sinusoidal-plus-drift mean still gives EMA/swing structure a mild
 * net upward read. This is the "structure suggests a direction, ADX
 * disagrees" fixture (case 4).
 */
function buildWeakTrendNoisyCandles(count: number, start: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const mean = start + i * 0.15 + Math.sin(i * 1.3) * 6; // slow net drift + fast oscillation that reverses direction every bar
    const prevMean = start + (i - 1) * 0.15 + Math.sin((i - 1) * 1.3) * 6;
    const open = i === 0 ? mean : prevMean;
    const close = mean;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    candles.push({ time: i * 60_000, open, high, low, close, volume: 100 });
  }
  return candles;
}

const weakTrendNoisy = buildWeakTrendNoisyCandles(60, 100);
const tooFewCandles = buildCandles(10, 100, 0.6, 0.15);

const cases: Case[] = [
  {
    name: "1. Clean uptrend + strong ADX",
    candles: uptrend,
    expectType: "TRENDING_UP",
  },
  {
    name: "2. Clean downtrend + strong ADX",
    candles: downtrend,
    expectType: "TRENDING_DOWN",
  },
  {
    name: "3. Sideways + low ADX",
    candles: ranging,
    expectType: "RANGING",
  },
  {
    name: "4. Directional structure but weak ADX -> must not falsely trend",
    candles: weakTrendNoisy,
    expectType: "RANGING", // ADX<20 always resolves to RANGING regardless of EMA/structure slope
  },
  {
    name: "5. Insufficient candles for ADX -> VOLATILE_UNCLEAR/unavailable",
    candles: tooFewCandles,
    expectType: "VOLATILE_UNCLEAR",
  },
  {
    name: "6. HTF aligned with anchor (TRENDING_UP + HTF/LTF both LONG)",
    candles: uptrend,
    mtf: mtfCtx(slice("4h", true, "LONG"), slice("5m", true, "LONG")),
    expectType: "TRENDING_UP",
    expectAlignment: "ALIGNED",
  },
  {
    name: "7. HTF/LTF mixed (TRENDING_UP anchor, HTF bullish, LTF bearish pullback)",
    candles: uptrend,
    mtf: mtfCtx(slice("4h", true, "LONG"), slice("5m", true, "SHORT")),
    expectType: "TRENDING_UP",
    expectAlignment: "MIXED",
  },
  {
    name: "8. MTF unavailable",
    candles: uptrend,
    mtf: null,
    expectType: "TRENDING_UP",
    expectAlignment: "UNAVAILABLE",
  },
];

let failures = 0;
for (const c of cases) {
  const result = classifyMarketRegime(c.candles, "15m", c.mtf);
  const typeOk = result.type === c.expectType;
  const alignmentOk = c.expectAlignment === undefined || result.mtfAlignment === c.expectAlignment;
  const pass = typeOk && alignmentOk;
  if (!pass) failures++;
  console.log(
    `${pass ? "PASS" : "FAIL"} — ${c.name} -> got type=${result.type} mtfAlignment=${result.mtfAlignment} (adx-based strength=${result.strength.toFixed(1)}, quality=${result.quality})` +
      (pass ? "" : ` | expected type=${c.expectType}${c.expectAlignment ? `, mtfAlignment=${c.expectAlignment}` : ""}`)
  );
}

console.log(failures === 0 ? `\nAll ${cases.length} regime fixtures passed.` : `\n${failures}/${cases.length} fixtures FAILED.`);
if (failures > 0) process.exitCode = 1;
