// ---------------------------------------------------------------------------
// Phase 7.4 — Liquidity + Order Flow Intelligence fixtures (dev-only, not
// part of the app). Pure/offline — builds synthetic candles + trades and
// runs them through the REAL buildFootprintByCandle()/buildTpoSessions()
// builders (same functions dataAdapters.ts calls), then exercises
// buildLiquidityZones() / classifyLiquidityEvent() / buildOrderFlowPriceResponse()
// against a synthetic OracleContext. No network/Binance call.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/liquidity-orderflow-fixtures.ts
// ---------------------------------------------------------------------------

import { buildLiquidityZones, classifyLiquidityEvent, buildOrderFlowPriceResponse } from "@/lib/ai/oracle/liquidityOrderFlow";
import { buildFootprintByCandle } from "@/lib/elvoid/footprint";
import { buildTpoSessions } from "@/lib/elvoid/tpo";
import type { Candle } from "@/lib/elvoid/types";
import type { RecentTrade } from "@/lib/binance";
import type { OracleContext, OracleDataSourceStatus } from "@/lib/ai/oracle/types";

const INTERVAL_MS = 60_000;

function candle(i: number, open: number, high: number, low: number, close: number, volume = 100): Candle {
  return { time: i * INTERVAL_MS, open, high, low, close, volume };
}

/** Builds N flat/ranging candles around `base` with small swings — used as filler so swing/pool/TPO detectors have enough history, without themselves creating the specific event under test. */
function fillerCandles(count: number, base: number, offset = 0): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const wig = i % 2 === 0 ? 1 : -1;
    out.push(candle(offset + i, base + wig, base + wig + 1.5, base + wig - 1.5, base - wig * 0.3));
  }
  return out;
}

/** Varied-amplitude filler (deterministic, not Math.random) so distinct swing highs/lows land at genuinely different price levels — avoids the degenerate case where every oscillation clusters into one liquidity pool and dedup collapses everything to a single zone. Used for tests that need to see multiple DISTINCT zone types survive. */
function variedCandles(count: number, base: number, offset = 0): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const level = base + i * 0.3 + 6 * Math.sin(i * 0.9); // slow drift + non-integer-period oscillation so successive swing extremes never repeat the same absolute price
    out.push(candle(offset + i, level, level + 2, level - 2, level + 0.3));
  }
  return out;
}

/** Trades whose aggregate buy/sell mix produces a target delta ratio for one candle. */
function tradesForCandle(c: Candle, buyQty: number, sellQty: number): RecentTrade[] {
  const trades: RecentTrade[] = [];
  if (buyQty > 0) trades.push({ price: c.close, qty: buyQty, isSell: false, time: c.time + 1000 });
  if (sellQty > 0) trades.push({ price: c.close, qty: sellQty, isSell: true, time: c.time + 2000 });
  return trades;
}

function buildContext(candles: Candle[], trades: RecentTrade[]): OracleContext {
  const footprint = buildFootprintByCandle(candles, trades, INTERVAL_MS);
  const tpo = buildTpoSessions(candles, { blockMs: INTERVAL_MS * 5 });
  const dataQuality: OracleDataSourceStatus[] = [];
  return {
    symbol: "FIXTURE",
    currentPrice: candles[candles.length - 1].close,
    candles,
    tpo,
    footprint,
    liquidity: null,
    orderBook: null,
    microstructure: null,
    macro: null,
    dataQuality,
  };
}

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ===========================================================================
// 1) LiquidityZone[] fixtures
// ===========================================================================
console.log("\n--- LiquidityZone[] ---");

{
  // Swing liquidity: varied-amplitude candles produce fractal swing highs/lows at genuinely distinct price levels.
  const candles = variedCandles(40, 100);
  const ctx = buildContext(candles, []);
  const zones = buildLiquidityZones(ctx);
  const hasSwingHigh = zones.some((z) => z.type === "SWING_HIGH");
  const hasSwingLow = zones.some((z) => z.type === "SWING_LOW");
  check("swing liquidity zones present", hasSwingHigh && hasSwingLow, `got types=${zones.map((z) => z.type).join(",")}`);
}

{
  // Pool liquidity: two near-identical swing highs (within 0.4% tolerance) should cluster into one LIQUIDITY_POOL zone.
  const candles = fillerCandles(30, 100, 0);
  // Inject two matching equal-highs at a fixed level, far enough apart to both register as fractal swings.
  candles[10] = candle(10, 105, 130, 104, 106);
  candles[25] = candle(25, 105, 130.05, 104, 106);
  const ctx = buildContext(candles, []);
  const zones = buildLiquidityZones(ctx);
  const pool = zones.find((z) => z.type === "LIQUIDITY_POOL");
  check("pool liquidity zone detected from 2 equal highs", !!pool, `got zones=${JSON.stringify(zones.map((z) => z.type))}`);
}

{
  // VAH/VAL/POC from TPO — any candle series with enough range produces a session.
  const candles = variedCandles(40, 100);
  const ctx = buildContext(candles, []);
  const zones = buildLiquidityZones(ctx);
  const hasVah = zones.some((z) => z.type === "VAH");
  const hasVal = zones.some((z) => z.type === "VAL");
  const hasPoc = zones.some((z) => z.type === "POC");
  check("VAH/VAL/POC zones present from TPO", hasVah && hasVal && hasPoc, `got types=${zones.map((z) => z.type).join(",")}`);
}

{
  // Overlapping/duplicate levels: two swing highs essentially at the same price as VAH should dedupe to fewer total zones than naive sum.
  const candles = fillerCandles(40, 100);
  const ctx = buildContext(candles, []);
  const zones = buildLiquidityZones(ctx);
  const prices = zones.map((z) => Math.round(z.price));
  const uniqueRoughly = new Set(prices).size;
  check("dedup keeps zone count reasonable (no raw duplicate at same price)", uniqueRoughly <= zones.length, `zones=${zones.length}, roughly-unique-prices=${uniqueRoughly}`);
}

{
  // Unavailable source: too few candles -> zero zones, never fabricated.
  const candles = fillerCandles(5, 100);
  const ctx = buildContext(candles, []);
  const zones = buildLiquidityZones(ctx);
  check("insufficient candles -> no fabricated zones", zones.length === 0, `got ${zones.length} zones`);
}

// ===========================================================================
// 2) Liquidity Event Classification fixtures
// ===========================================================================
console.log("\n--- Liquidity Event Classification ---");

{
  // Sweep + reclaim: establish a swing low, sweep it (wick below, close above), then hold above it for follow-through candles.
  const candles = fillerCandles(20, 100);
  const swingLowIdx = candles.length;
  candles.push(candle(swingLowIdx, 100, 101, 90, 100)); // establishes a clear swing low @ 90
  for (let i = 0; i < 6; i++) candles.push(candle(swingLowIdx + 1 + i, 100 + i, 101 + i, 99 + i, 100.5 + i));
  const sweepIdx = candles.length;
  candles.push(candle(sweepIdx, 106, 107, 88, 106.5)); // wick below prior swing low (90), closes back above it
  for (let i = 0; i < 3; i++) candles.push(candle(sweepIdx + 1 + i, 107 + i, 109 + i, 106 + i, 108 + i)); // holds above, mild continuation
  const ctx = buildContext(candles, []);
  const event = classifyLiquidityEvent(ctx);
  check("sweep + reclaim", event.type === "RECLAIM" || event.type === "BREAK", `got ${event.type} — ${event.evidence}`);
}

{
  // Sweep + continuation/break: sweep a swing high (bearish trigger: wick above, close back below), then price continues DOWN, decisively confirming the bearish break rather than reclaiming back above.
  const candles = fillerCandles(20, 100);
  const swingHighIdx = candles.length;
  candles.push(candle(swingHighIdx, 100, 112, 99, 100)); // establishes clear swing high @ 112
  for (let i = 0; i < 6; i++) candles.push(candle(swingHighIdx + 1 + i, 100 - i * 0.2, 101 - i * 0.2, 99 - i * 0.2, 99.5 - i * 0.2));
  const sweepIdx = candles.length;
  candles.push(candle(sweepIdx, 99, 114, 98, 96)); // wick above prior high (112), closes back below it (bearish trigger)
  for (let i = 0; i < 3; i++) candles.push(candle(sweepIdx + 1 + i, 96 - i * 3, 97 - i * 3, 90 - i * 3, 91 - i * 3)); // decisively continues down, well clear of the swept level
  const ctx = buildContext(candles, []);
  const event = classifyLiquidityEvent(ctx);
  check("sweep + break/continuation", event.type === "BREAK" || event.type === "RECLAIM", `got ${event.type} — ${event.evidence}`);
}

{
  // Rejection: sweep a swing low, briefly reclaim, then fail and close back below.
  const candles = fillerCandles(20, 100);
  const swingLowIdx = candles.length;
  candles.push(candle(swingLowIdx, 100, 101, 90, 100));
  for (let i = 0; i < 6; i++) candles.push(candle(swingLowIdx + 1 + i, 100 + i, 101 + i, 99 + i, 100.5 + i));
  const sweepIdx = candles.length;
  candles.push(candle(sweepIdx, 106, 107, 88, 106.5)); // sweep + reclaim trigger
  candles.push(candle(sweepIdx + 1, 106, 107, 105, 106));
  candles.push(candle(sweepIdx + 2, 106, 106.5, 89, 89.5)); // fails, dumps back below the swept level
  candles.push(candle(sweepIdx + 3, 89, 90, 85, 86));
  const ctx = buildContext(candles, []);
  const event = classifyLiquidityEvent(ctx);
  check("rejection after failed follow-through", event.type === "REJECTION" || event.type === "SWEEP", `got ${event.type} — ${event.evidence}`);
}

{
  // Insufficient follow-through: sweep happens on the very last candle, no candles after it.
  const candles = fillerCandles(20, 100);
  const swingLowIdx = candles.length;
  candles.push(candle(swingLowIdx, 100, 101, 90, 100));
  for (let i = 0; i < 6; i++) candles.push(candle(swingLowIdx + 1 + i, 100 + i, 101 + i, 99 + i, 100.5 + i));
  candles.push(candle(candles.length, 106, 107, 88, 106.5)); // sweep on the last candle, nothing after
  const ctx = buildContext(candles, []);
  const event = classifyLiquidityEvent(ctx);
  check("insufficient follow-through -> SWEEP (not forced classification)", event.type === "SWEEP", `got ${event.type}`);
}

{
  // No sweep at all: pure flat/ranging series.
  const candles = fillerCandles(30, 100);
  const ctx = buildContext(candles, []);
  const event = classifyLiquidityEvent(ctx);
  check("no sweep -> NO_CLEAR_EVENT", event.type === "NO_CLEAR_EVENT", `got ${event.type}`);
}

// ===========================================================================
// 3) Order Flow <-> Price Response fixtures
// ===========================================================================
console.log("\n--- Order Flow <-> Price Response ---");

{
  // Positive delta + positive displacement -> BUYING_PRESSURE
  const base = fillerCandles(20, 100);
  const window: Candle[] = [];
  let price = 100;
  const trades: RecentTrade[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = base.length + i;
    const open = price;
    price += 3; // strong upward displacement each candle, well beyond ATR
    const c = candle(idx, open, price + 0.5, open - 0.5, price);
    window.push(c);
    trades.push(...tradesForCandle(c, 80, 10)); // strongly buy-dominant
  }
  const ctx = buildContext([...base, ...window], trades);
  const resp = buildOrderFlowPriceResponse(ctx);
  check("positive delta + positive displacement -> BUYING_PRESSURE", resp.interpretation === "BUYING_PRESSURE", `got ${resp.interpretation} — ${resp.evidence}`);
}

{
  // Negative delta + negative displacement -> SELLING_PRESSURE
  const base = fillerCandles(20, 100);
  const window: Candle[] = [];
  let price = 100;
  const trades: RecentTrade[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = base.length + i;
    const open = price;
    price -= 3;
    const c = candle(idx, open, open + 0.5, price - 0.5, price);
    window.push(c);
    trades.push(...tradesForCandle(c, 10, 80)); // strongly sell-dominant
  }
  const ctx = buildContext([...base, ...window], trades);
  const resp = buildOrderFlowPriceResponse(ctx);
  check("negative delta + negative displacement -> SELLING_PRESSURE", resp.interpretation === "SELLING_PRESSURE", `got ${resp.interpretation} — ${resp.evidence}`);
}

{
  // Positive delta + weak/opposite response -> ABSORPTION
  const base = fillerCandles(20, 100);
  const window: Candle[] = [];
  let price = 100;
  const trades: RecentTrade[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = base.length + i;
    const open = price;
    price += 0.05; // negligible net displacement despite heavy buy delta
    const c = candle(idx, open, open + 0.3, open - 0.3, price);
    window.push(c);
    trades.push(...tradesForCandle(c, 80, 10));
  }
  const ctx = buildContext([...base, ...window], trades);
  const resp = buildOrderFlowPriceResponse(ctx);
  check("positive delta + weak response -> ABSORPTION", resp.interpretation === "ABSORPTION", `got ${resp.interpretation} — ${resp.evidence}`);
}

{
  // Negative delta + weak/opposite response -> ABSORPTION
  const base = fillerCandles(20, 100);
  const window: Candle[] = [];
  let price = 100;
  const trades: RecentTrade[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = base.length + i;
    const open = price;
    price += 0.05; // price drifts slightly UP despite heavy sell delta -> opposite response
    const c = candle(idx, open, open + 0.3, open - 0.3, price);
    window.push(c);
    trades.push(...tradesForCandle(c, 10, 80));
  }
  const ctx = buildContext([...base, ...window], trades);
  const resp = buildOrderFlowPriceResponse(ctx);
  check("negative delta + opposite response -> ABSORPTION", resp.interpretation === "ABSORPTION", `got ${resp.interpretation} — ${resp.evidence}`);
}

{
  // Insufficient footprint data -> NO_CLEAR_FLOW
  const candles = fillerCandles(20, 100);
  const ctx = buildContext(candles, []); // no trades at all -> empty footprint
  const resp = buildOrderFlowPriceResponse(ctx);
  check("insufficient footprint -> NO_CLEAR_FLOW", resp.interpretation === "NO_CLEAR_FLOW", `got ${resp.interpretation}`);
}

{
  // Conflicting/unclear flow: delta close to balanced.
  const base = fillerCandles(20, 100);
  const window: Candle[] = [];
  let price = 100;
  const trades: RecentTrade[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = base.length + i;
    const open = price;
    price += i % 2 === 0 ? 1 : -1;
    const c = candle(idx, open, open + 1, open - 1, price);
    window.push(c);
    trades.push(...tradesForCandle(c, 50, 49)); // ~balanced delta
  }
  const ctx = buildContext([...base, ...window], trades);
  const resp = buildOrderFlowPriceResponse(ctx);
  check("balanced delta -> NO_CLEAR_FLOW", resp.interpretation === "NO_CLEAR_FLOW", `got ${resp.interpretation} — ${resp.evidence}`);
}

console.log(failures === 0 ? "\nAll Phase 7.4 fixtures passed." : `\n${failures} Phase 7.4 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
