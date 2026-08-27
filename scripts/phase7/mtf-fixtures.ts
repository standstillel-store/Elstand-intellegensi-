// ---------------------------------------------------------------------------
// Phase 7.2 — MTF relationship fixtures (dev-only, not part of the app).
//
// Tests classifyMtfRelationship() directly against hand-built TimeframeSlice
// objects (no network/Binance call — buildMtfContext()'s getKlines() fetch
// is intentionally not exercised here since this sandbox has no network
// access; see changes.md "Known Limitations"). Covers spec Phase 7.2 Step
// 11 cases 1, 2, 3, 4, 5, 6/7 (6 and 7 collapse into the same
// INSUFFICIENT_DATA path as case 5 — see assertions below).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/mtf-fixtures.ts
// ---------------------------------------------------------------------------

import { classifyMtfRelationship, type TimeframeSlice } from "@/lib/ai/oracle/mtf";

function slice(timeframe: string, available: boolean, bias: TimeframeSlice["bias"], protectivePrice: number | null): TimeframeSlice {
  return {
    timeframe,
    available,
    bias,
    strength: available && bias !== "NEUTRAL" ? 10 : 0,
    evidence: `fixture ${timeframe}`,
    protectiveLevel: protectivePrice === null ? null : { price: protectivePrice, type: bias === "LONG" ? "support" : "resistance", touches: 2 },
  };
}

interface Case {
  name: string;
  htf: TimeframeSlice | null;
  mtf: TimeframeSlice;
  ltf: TimeframeSlice | null;
  currentPrice: number;
  expect: string;
}

const cases: Case[] = [
  {
    name: "1. HTF bullish / MTF bullish / LTF bullish",
    htf: slice("4h", true, "LONG", 48000),
    mtf: slice("15m", true, "LONG", 49000),
    ltf: slice("5m", true, "LONG", 49500),
    currentPrice: 50000,
    expect: "ALIGNED_BULLISH",
  },
  {
    name: "2. HTF bullish / MTF bearish / LTF bearish, HTF level intact",
    htf: slice("4h", true, "LONG", 48000),
    mtf: slice("15m", true, "SHORT", 49500),
    ltf: slice("5m", true, "SHORT", 49700),
    currentPrice: 49800, // still above HTF protective level (48000) -> not broken
    expect: "PULLBACK_IN_UPTREND",
  },
  {
    name: "3. HTF bullish / MTF bearish / LTF bullish -> continuation candidate",
    htf: slice("4h", true, "LONG", 48000),
    mtf: slice("15m", true, "SHORT", 49500),
    ltf: slice("5m", true, "LONG", 49600),
    currentPrice: 49800,
    expect: "CONTINUATION_AFTER_PULLBACK_BULLISH",
  },
  {
    name: "4. HTF bullish, HTF structural level broken, LTF confirms bearish",
    htf: slice("4h", true, "LONG", 48000),
    mtf: slice("15m", true, "SHORT", 49000),
    ltf: slice("5m", true, "SHORT", 48500),
    currentPrice: 47500, // below HTF protective level (48000) -> broken
    expect: "HTF_THESIS_THREATENED_BULLISH",
  },
  {
    name: "5. HTF unavailable, MTF/LTF available",
    htf: null,
    mtf: slice("15m", true, "LONG", 49000),
    ltf: slice("5m", true, "LONG", 49500),
    currentPrice: 50000,
    expect: "INSUFFICIENT_DATA",
  },
  {
    name: "6. LTF unavailable (HTF/MTF available, aligned)",
    htf: slice("4h", true, "LONG", 48000),
    mtf: slice("15m", true, "LONG", 49000),
    ltf: null,
    currentPrice: 50000,
    expect: "ALIGNED_BULLISH", // single missing timeframe must not block a relationship read from what IS available
  },
  {
    name: "7. Only anchor timeframe available (HTF and LTF both unavailable)",
    htf: null,
    mtf: slice("15m", true, "LONG", 49000),
    ltf: null,
    currentPrice: 50000,
    expect: "INSUFFICIENT_DATA",
  },
];

let failures = 0;
for (const c of cases) {
  const { relationship } = classifyMtfRelationship(c.htf, c.mtf, c.ltf, c.currentPrice);
  const pass = relationship === c.expect;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${c.name} -> got ${relationship}, expected ${c.expect}`);
}

console.log(failures === 0 ? `\nAll ${cases.length} MTF relationship fixtures passed.` : `\n${failures}/${cases.length} fixtures FAILED.`);
if (failures > 0) process.exitCode = 1;
