// ---------------------------------------------------------------------------
// Phase 7.8 — Risk Intelligence fixtures (dev-only, not part of the app).
// Pure/offline — hand-typed OracleRiskPlan/RegimeContext/ScenarioContext/
// ContradictionReport/DecisionArbitration fixtures + a real synthetic
// candle series (so ATR(14) is genuinely computed, not mocked). No
// network/Binance call.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/risk-intelligence-fixtures.ts
// ---------------------------------------------------------------------------

import { buildRiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { OracleContext } from "@/lib/ai/oracle/types";
import type { OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { RegimeContext } from "@/lib/ai/oracle/regime";
import type { ScenarioContext, Scenario } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { LiquidityOrderFlowContext, LiquidityZone } from "@/lib/ai/oracle/liquidityOrderFlow";
import type { Candle } from "@/lib/elvoid/types";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function candle(i: number, open: number, high: number, low: number, close: number, volume = 100): Candle {
  return { time: i * 60_000, open, high, low, close, volume };
}

/** Real, deterministic candle series with a known, moderate ATR — enough history (>14) for atr(14) to be non-zero and meaningful. */
function buildCandles(count: number, base: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const level = base + i * 0.3 + 6 * Math.sin(i * 0.9);
    out.push(candle(i, level, level + 2, level - 2, level + 0.3));
  }
  return out;
}

function context(overrides: Partial<OracleContext> = {}): OracleContext {
  const candles = buildCandles(40, 100);
  return { symbol: "FIXTURE", currentPrice: candles[candles.length - 1].close, candles, tpo: null, footprint: null, liquidity: null, orderBook: null, microstructure: null, macro: null, dataQuality: [], ...overrides };
}

function riskPlan(overrides: Partial<OracleRiskPlan> = {}): OracleRiskPlan {
  return { entry: 100, stopLoss: 90, takeProfit: 120, riskReward: 2, ...overrides };
}

function regime(overrides: Partial<RegimeContext> = {}): RegimeContext {
  return { type: "TRENDING_UP", strength: 35, quality: "real", evidence: "fixture", timeframe: "15m", mtfAlignment: "ALIGNED", ...overrides };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "primary-long",
    role: "PRIMARY",
    direction: "LONG",
    thesis: "fixture",
    supportingEvidence: [],
    opposingEvidence: [],
    trigger: "fixture",
    invalidation: "fixture",
    strength: 65,
    regimeCompatibility: "COMPATIBLE",
    mtfCompatibility: "ALIGNED",
    ...overrides,
  };
}

function scenarios(primary: Scenario | null, alternative: Scenario | null = null): ScenarioContext {
  return { primary, alternative, contextQuality: "real" };
}

function contradictionReport(overrides: Partial<ContradictionReport> = {}): ContradictionReport {
  return { contradictions: [], hasUnresolvedGenuineContradiction: false, ...overrides };
}

function arbitration(overrides: Partial<DecisionArbitration> = {}): DecisionArbitration {
  return {
    canonicalSide: "LONG",
    canonicalGrade: "A",
    alignment: "STRONGLY_SUPPORTED",
    reasons: [],
    hasUnresolvedGenuineContradiction: false,
    regimeCompatibility: "COMPATIBLE",
    mtfCompatibility: "ALIGNED",
    hasAlternativeScenario: false,
    alternativeIsActiveOpposition: false,
    caveat: null,
    ...overrides,
  };
}

function zone(overrides: Partial<LiquidityZone> = {}): LiquidityZone {
  return { type: "SWING_HIGH", price: 121, side: "SHORT", strength: 5, source: "swing", evidence: "fixture zone", quality: "real", distanceFromPrice: 21, ...overrides };
}

function lof(zones: LiquidityZone[] = []): LiquidityOrderFlowContext {
  return { zones, event: { type: "NO_CLEAR_EVENT", side: null, level: null, evidence: "fixture", quality: "real" }, priceResponse: { interpretation: "NO_CLEAR_FLOW", deltaDirection: "neutral", deltaMagnitude: 0, priceDisplacement: 0, evidence: "fixture", quality: "real" } };
}

// 1. Clean low-risk setup ------------------------------------------------------
{
  const ctx = context();
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof());
  check("1. Clean low-risk setup -> overall LOW, no factors", result.overall === "LOW" && result.factors.length === 0, `got ${JSON.stringify(result)}`);
}

// 2. Tight structural invalidation (SL well under 0.5x ATR) --------------------
{
  const ctx = context();
  const plan = riskPlan({ stopLoss: 99.9 }); // entry=100, so |100-99.9|=0.1, way under 0.5x ATR
  const result = buildRiskIntelligence(ctx, plan, "LONG", regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof());
  const structural = result.factors.find((f) => f.kind === "STRUCTURAL");
  check("2. Tight SL (<0.5x ATR) -> STRUCTURAL HIGH, overall HIGH", structural?.severity === "HIGH" && result.overall === "HIGH", `got ${JSON.stringify(result)}`);
}

// 3. High volatility (ATR unavailable -> honest degraded factor, never fabricated risk) --
{
  const ctx = context({ candles: buildCandles(5, 100) }); // too few candles for atr(14)
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof());
  const vol = result.factors.find((f) => f.kind === "VOLATILITY");
  check("3. ATR unavailable -> VOLATILITY factor quality=unavailable, capped LOW overall", vol?.quality === "unavailable" && result.overall === "LOW" && result.invalidationDistanceAtr === null, `got ${JSON.stringify(result)}`);
}

// 4. Nearby opposing liquidity (TP sits within 0.5x ATR of a real opposing zone) --
{
  const ctx = context();
  const atrEstimate = 2.4; // roughly matches buildCandles' own high-low spread
  const plan = riskPlan({ takeProfit: 120 });
  const nearZone = zone({ price: 120.5, side: "SHORT", quality: "real" }); // within 0.5x ATR (~1.2) of TP=120
  const result = buildRiskIntelligence(ctx, plan, "LONG", regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof([nearZone]));
  const prox = result.factors.find((f) => f.kind === "LIQUIDITY_PROXIMITY");
  check("4. TP near real opposing zone -> LIQUIDITY_PROXIMITY factor, withinRiskZone=true", !!prox && result.liquidityProximity?.withinRiskZone === true, `got ${JSON.stringify(result.liquidityProximity)}, factors=${JSON.stringify(result.factors)}`);
}

// 5. Genuine contradiction -> CONTRADICTION factor, overall at least MODERATE ----
{
  const ctx = context();
  const report = contradictionReport({
    hasUnresolvedGenuineContradiction: true,
    contradictions: [{ description: "Market Structure vs Footprint berlawanan arah.", sources: ["market_structure", "footprint"], severity: "HIGH", genuineness: "GENUINE", origin: "confluence" }],
  });
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", regime(), scenarios(scenario()), report, arbitration({ alignment: "CONFLICTED" }), lof());
  const cf = result.factors.find((f) => f.kind === "CONTRADICTION");
  check("5. Genuine unresolved contradiction -> CONTRADICTION factor, overall HIGH", cf?.severity === "HIGH" && result.overall === "HIGH", `got ${JSON.stringify(result)}`);
}

// 6. Degraded/unavailable context (missing regime/scenarios/etc) --------------
{
  const ctx = context();
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", null, null, null, null, null);
  check("6. Missing regime/scenarios/contradictions/arbitration/lof -> contextQuality degraded, no fabricated factors from them", result.contextQuality === "degraded" && !result.factors.some((f) => f.kind === "CONTEXT" || f.kind === "CONTRADICTION" || f.kind === "SCENARIO"), `got ${JSON.stringify(result)}`);
}

// 7. Scenario-specific risk (active-opposition alternative) -------------------
{
  const ctx = context();
  const alt = scenario({ id: "alt-short", direction: "SHORT", thesis: "SHORT: Reversal via real opposing event." });
  const arb = arbitration({ alignment: "SUPPORTED_WITH_CAUTION", hasAlternativeScenario: true, alternativeIsActiveOpposition: true });
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", regime(), scenarios(scenario(), alt), contradictionReport(), arb, lof());
  const sf = result.factors.find((f) => f.kind === "SCENARIO");
  check("7. Active-opposition alternative -> SCENARIO factor MODERATE", sf?.severity === "MODERATE", `got ${JSON.stringify(result.factors)}`);
}

// 8. Mixed MTF (arbitration SUPPORTED_WITH_CAUTION from mtfCompatibility MIXED) -> CONTEXT factor absent (only CONFLICTED/UNSUPPORTED_CONTEXT produce a CONTEXT factor) --
{
  const ctx = context();
  const arb = arbitration({ alignment: "SUPPORTED_WITH_CAUTION", mtfCompatibility: "MIXED", reasons: ["mtfCompatibility is MIXED"] });
  const result = buildRiskIntelligence(ctx, riskPlan(), "LONG", regime(), scenarios(scenario()), contradictionReport(), arb, lof());
  const cf = result.factors.find((f) => f.kind === "CONTEXT");
  check("8. SUPPORTED_WITH_CAUTION (mixed MTF) -> no CONTEXT factor (only CONFLICTED/UNSUPPORTED_CONTEXT produce one), overall stays LOW", cf === undefined && result.overall === "LOW", `got ${JSON.stringify(result.factors)}`);
}

// 9. Proxy-quality liquidity zone -> factor never produced from non-real zone data --
{
  const ctx = context();
  const proxyZone = zone({ price: 120.5, side: "SHORT", quality: "proxy" });
  const result = buildRiskIntelligence(ctx, riskPlan({ takeProfit: 120 }), "LONG", regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof([proxyZone]));
  const prox = result.factors.find((f) => f.kind === "LIQUIDITY_PROXIMITY");
  check("9. Proxy-quality zone -> never counted as liquidity proximity risk", prox === undefined, `got ${JSON.stringify(result.factors)}`);
}

// 10. No risk plan / no side -> insufficient, no fabricated factors -----------
{
  const ctx = context();
  const result = buildRiskIntelligence(ctx, null, null, regime(), scenarios(scenario()), contradictionReport(), arbitration(), lof());
  check("10. No risk plan -> contextQuality insufficient, empty factors, overall LOW", result.contextQuality === "insufficient" && result.factors.length === 0 && result.overall === "LOW", `got ${JSON.stringify(result)}`);
}

// 11. Mutation safety — inputs left byte-identical -----------------------------
{
  const ctx = context();
  const plan = riskPlan();
  const rg = regime();
  const sc = scenarios(scenario());
  const cr = contradictionReport();
  const arb = arbitration();
  const lofCtx = lof([zone()]);
  const snapshots = [JSON.stringify(ctx), JSON.stringify(plan), JSON.stringify(rg), JSON.stringify(sc), JSON.stringify(cr), JSON.stringify(arb), JSON.stringify(lofCtx)];
  buildRiskIntelligence(ctx, plan, "LONG", rg, sc, cr, arb, lofCtx);
  const after = [JSON.stringify(ctx), JSON.stringify(plan), JSON.stringify(rg), JSON.stringify(sc), JSON.stringify(cr), JSON.stringify(arb), JSON.stringify(lofCtx)];
  check("11. All inputs left byte-identical after buildRiskIntelligence()", snapshots.every((s, i) => s === after[i]), "one or more inputs were mutated");
}

console.log(failures === 0 ? "\nAll Phase 7.8 risk intelligence fixtures passed." : `\n${failures} Phase 7.8 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
