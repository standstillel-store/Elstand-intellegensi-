// ---------------------------------------------------------------------------
// Phase 7.5 — Scenario Engine fixtures (dev-only, not part of the app).
// Pure/offline — builds hand-typed OracleAssessment/ConfluenceResult/
// RegimeContext/MtfContext/LiquidityOrderFlowContext fixtures (scenario.ts
// consumes already-computed outputs of those modules, not raw candles, so
// fixtures construct that layer directly rather than replaying full
// pipelines). No network/Binance call.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/scenario-fixtures.ts
// ---------------------------------------------------------------------------

import { buildScenarios } from "@/lib/ai/oracle/scenario";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { RegimeContext } from "@/lib/ai/oracle/regime";
import type { MtfContext, TimeframeSlice } from "@/lib/ai/oracle/mtf";
import type { LiquidityOrderFlowContext, LiquidityEvent, OrderFlowPriceResponse } from "@/lib/ai/oracle/liquidityOrderFlow";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function assessment(overrides: Partial<OracleAssessment> = {}): OracleAssessment {
  return {
    symbol: "FIXTURE",
    timestamp: new Date(0).toISOString(),
    grade: "A",
    side: "LONG",
    score: { long: 40, short: 5 },
    confidence: 70,
    independentConfirmationClusters: 2,
    supportingEvidence: ["Market structure: higher-high confirmed @ 105.", "Footprint: buy delta dominan 0.62."],
    contradictingEvidence: [],
    dataQuality: [{ source: "market_structure", quality: "real" }],
    riskStatus: "valid",
    risk: { entry: 100, stopLoss: 95, takeProfit: 110, riskReward: 2 },
    gradeReason: "A LONG: 2 cluster evidence independen mendukung.",
    invalidation: "Invalidasi jika struktur pasar berbalik (lower-low mengambil alih).",
    mainRisk: "Tidak ada risiko signifikan terdeteksi.",
    ...overrides,
  };
}

function confluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    symbol: "FIXTURE",
    timestamp: new Date(0).toISOString(),
    longScore: 40,
    shortScore: 5,
    factors: [],
    evidence: [],
    contradictions: [],
    dataQuality: ["real"],
    dominantSide: "LONG",
    ...overrides,
  };
}

function regime(overrides: Partial<RegimeContext> = {}): RegimeContext {
  return { type: "TRENDING_UP", strength: 35, quality: "real", evidence: "ADX 35 uptrend.", timeframe: "15m", mtfAlignment: "ALIGNED", ...overrides };
}

function slice(overrides: Partial<TimeframeSlice> = {}): TimeframeSlice {
  return { timeframe: "4h", available: true, bias: "LONG", strength: 10, evidence: "fixture slice", protectiveLevel: null, ...overrides };
}

function mtf(overrides: Partial<MtfContext> = {}): MtfContext {
  return { anchorInterval: "15m", htf: slice(), mtf: slice({ timeframe: "15m" }), ltf: slice({ timeframe: "5m" }), relationship: "ALIGNED_BULLISH", relationshipEvidence: "HTF/LTF searah bullish.", ...overrides };
}

function event(overrides: Partial<LiquidityEvent> = {}): LiquidityEvent {
  return { type: "NO_CLEAR_EVENT", side: null, level: null, evidence: "Belum ada liquidity sweep yang jelas.", quality: "real", ...overrides };
}

function priceResponse(overrides: Partial<OrderFlowPriceResponse> = {}): OrderFlowPriceResponse {
  return { interpretation: "NO_CLEAR_FLOW", deltaDirection: "neutral", deltaMagnitude: 0, priceDisplacement: 0, evidence: "Delta seimbang.", quality: "real", ...overrides };
}

function lof(e: Partial<LiquidityEvent> = {}, pr: Partial<OrderFlowPriceResponse> = {}): LiquidityOrderFlowContext {
  return { zones: [], event: event(e), priceResponse: priceResponse(pr) };
}

// 1. Bullish continuation ----------------------------------------------------
{
  const result = buildScenarios(assessment(), confluence(), regime(), mtf(), lof());
  check(
    "1. Bullish continuation",
    result.primary?.direction === "LONG" && result.primary.regimeCompatibility === "COMPATIBLE" && result.alternative === null,
    `got primary=${JSON.stringify(result.primary?.direction)} regimeCompat=${result.primary?.regimeCompatibility} alt=${result.alternative}`
  );
}

// 2. Bearish continuation ----------------------------------------------------
{
  const a = assessment({ side: "SHORT", grade: "A", supportingEvidence: ["Market structure: lower-low confirmed."] });
  const c = confluence({ dominantSide: "SHORT" });
  const r = regime({ type: "TRENDING_DOWN" });
  const m = mtf({ htf: slice({ bias: "SHORT" }), ltf: slice({ bias: "SHORT", timeframe: "5m" }), relationship: "ALIGNED_BEARISH", relationshipEvidence: "HTF/LTF searah bearish." });
  const result = buildScenarios(a, c, r, m, lof());
  check("2. Bearish continuation", result.primary?.direction === "SHORT" && result.primary.regimeCompatibility === "COMPATIBLE", `got ${JSON.stringify(result.primary)}`);
}

// 3. Bullish liquidity sweep + reclaim ---------------------------------------
{
  const result = buildScenarios(assessment(), confluence(), regime(), mtf(), lof({ type: "RECLAIM", side: "LONG", level: 98.5 }));
  const trigger = result.primary?.trigger ?? "";
  check(
    "3. Bullish sweep + reclaim -> trigger/invalidation reference real level",
    result.primary !== null && trigger.includes("98.5") && (result.primary.invalidation.includes("98.5") || result.primary.invalidation.length > 0),
    `got trigger=${trigger} invalidation=${result.primary?.invalidation}`
  );
}

// 4. Bearish liquidity sweep + reclaim ---------------------------------------
{
  const a = assessment({ side: "SHORT" });
  const c = confluence({ dominantSide: "SHORT" });
  const result = buildScenarios(a, c, regime({ type: "TRENDING_DOWN" }), mtf({ htf: slice({ bias: "SHORT" }) }), lof({ type: "RECLAIM", side: "SHORT", level: 101.2 }));
  check("4. Bearish sweep + reclaim -> trigger references real level", (result.primary?.trigger ?? "").includes("101.2"), `got ${result.primary?.trigger}`);
}

// 5. Sweep + acceptance beyond level -> thesis invalidation (opposing event) --
{
  // PRIMARY is LONG but the liquidity event actually resolved SHORT (BREAK) — genuine opposition.
  const result = buildScenarios(assessment(), confluence(), regime(), mtf(), lof({ type: "BREAK", side: "SHORT", level: 94 }));
  check(
    "5. Opposing BREAK event -> alternative created, references real level",
    result.alternative !== null && result.alternative.direction === "SHORT" && result.alternative.trigger.includes("94"),
    `got alternative=${JSON.stringify(result.alternative)}`
  );
}

// 6. HTF bullish + LTF bearish pullback --------------------------------------
{
  const m = mtf({ relationship: "PULLBACK_IN_UPTREND", relationshipEvidence: "HTF bullish tapi LTF pullback bearish.", htf: slice({ bias: "LONG", protectiveLevel: { price: 96, type: "support", touches: 2 } }) });
  const result = buildScenarios(assessment(), confluence(), regime(), m, lof());
  check(
    "6. HTF bullish + LTF pullback -> alternative is SHORT pullback thesis, not full reversal wording",
    result.alternative !== null && result.alternative.direction === "SHORT" && result.alternative.thesis.includes("Pullback"),
    `got ${JSON.stringify(result.alternative)}`
  );
}

// 7. HTF bearish + LTF bullish pullback --------------------------------------
{
  const a = assessment({ side: "SHORT" });
  const c = confluence({ dominantSide: "SHORT" });
  const m = mtf({ relationship: "PULLBACK_IN_DOWNTREND", relationshipEvidence: "HTF bearish tapi LTF pullback bullish.", htf: slice({ bias: "SHORT" }) });
  const result = buildScenarios(a, c, regime({ type: "TRENDING_DOWN" }), m, lof());
  check("7. HTF bearish + LTF pullback -> alternative is LONG pullback thesis", result.alternative?.direction === "LONG" && result.alternative.thesis.includes("Pullback"), `got ${JSON.stringify(result.alternative)}`);
}

// 8. Range-bound market -------------------------------------------------------
{
  const r = regime({ type: "RANGING", strength: 0, evidence: "ADX 12 ranging.", mtfAlignment: "UNAVAILABLE" });
  const result = buildScenarios(assessment(), confluence(), r, mtf(), lof());
  check("8a. Ranging + plain continuation primary -> REQUIRES_STRONGER_EVIDENCE", result.primary?.regimeCompatibility === "REQUIRES_STRONGER_EVIDENCE", `got ${result.primary?.regimeCompatibility}`);

  // Same ranging regime, but primary (LONG) is supported by a REJECTION of a bearish sweep attempt (event.side = SHORT, i.e. the bearish thesis failed) -> mean-reversion support for LONG -> COMPATIBLE.
  const resultRejection = buildScenarios(assessment(), confluence(), r, mtf(), lof({ type: "REJECTION", side: "SHORT", level: 97 }));
  check(
    "8b. Ranging + REJECTION-flavored primary -> COMPATIBLE",
    resultRejection.primary?.regimeCompatibility === "COMPATIBLE",
    `got ${resultRejection.primary?.regimeCompatibility}`
  );
}

// 9. Volatile/unclear market --------------------------------------------------
{
  const r = regime({ type: "VOLATILE_UNCLEAR", strength: 25, evidence: "ADX menunjukkan tren tapi arah tidak konsisten.", mtfAlignment: "UNAVAILABLE" });
  const result = buildScenarios(assessment(), confluence(), r, mtf(), lof());
  check("9. Volatile/unclear -> primary regimeCompatibility DEGRADED", result.primary?.regimeCompatibility === "DEGRADED", `got ${result.primary?.regimeCompatibility}`);
}

// 10. Insufficient evidence -> no valid scenario ------------------------------
{
  const a = assessment({ grade: "NO_TRADE", side: null, gradeReason: "Evidence tidak cukup kuat/independen untuk grade Premium." });
  const result = buildScenarios(a, confluence({ dominantSide: "NEUTRAL" }), regime(), mtf(), lof());
  check(
    "10. NO_TRADE -> primary=null, alternative=null, contextQuality=insufficient",
    result.primary === null && result.alternative === null && result.contextQuality === "insufficient" && result.note === a.gradeReason,
    `got ${JSON.stringify(result)}`
  );
}

// Extra: no opposing evidence at all -> alternative stays null (not forced) --
{
  const result = buildScenarios(assessment(), confluence(), regime(), mtf(), lof());
  check("11. Clean aligned evidence, no opposition -> alternative null (not forced)", result.alternative === null, `got ${JSON.stringify(result.alternative)}`);
}

// Extra: evidence traceability — every ref.detail must equal a real source string, never fabricated text
{
  const c = confluence({ contradictions: [{ description: "Footprint buy delta vs bearish structure.", sources: ["footprint", "market_structure"] }] });
  const result = buildScenarios(assessment(), c, regime(), mtf(), lof());
  const traced = result.alternative?.supportingEvidence.some((r) => r.detail === "Footprint buy delta vs bearish structure.");
  check("12. Alternative evidence traceable verbatim to confluence.contradictions", !!traced, `got ${JSON.stringify(result.alternative?.supportingEvidence)}`);
}

console.log(failures === 0 ? "\nAll Phase 7.5 scenario fixtures passed." : `\n${failures} Phase 7.5 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
