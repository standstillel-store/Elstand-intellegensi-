// ---------------------------------------------------------------------------
// Phase 7.9 — LLM Reasoning fixtures (dev-only, not part of the app).
// Pure/offline. Cases A/B/C/D/E test the pure validate/assemble helpers
// directly (via __test__) to avoid needing network mocking. Case L
// exercises the real buildOracleReasoning() end-to-end — since no
// GROQ_API_KEY/OPENROUTER_API_KEY is configured in this sandbox,
// callAiCore() itself naturally returns null, which is exactly the "LLM
// failure never breaks the request" path.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/reasoning-fixtures.ts
// ---------------------------------------------------------------------------

import { buildOracleReasoning, __test__ } from "@/lib/ai/oracle/reasoning";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { RegimeContext } from "@/lib/ai/oracle/regime";
import type { MtfContext, TimeframeSlice } from "@/lib/ai/oracle/mtf";
import type { LiquidityOrderFlowContext, LiquidityZone } from "@/lib/ai/oracle/liquidityOrderFlow";
import type { ScenarioContext, Scenario } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";

const { isValidReasoningShape, filterKnownSourceRefs, collectKnownSourceIdentifiers, computePayloadQualityCeiling, clampQuality, buildPayload, deterministicFallback, assembleFromAiResult } = __test__;

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
    supportingEvidence: ["Market structure bullish."],
    contradictingEvidence: [],
    dataQuality: [{ source: "market_structure", quality: "real" }],
    riskStatus: "valid",
    risk: { entry: 100, stopLoss: 95, takeProfit: 110, riskReward: 2 },
    gradeReason: "A LONG fixture.",
    invalidation: "fixture invalidation",
    mainRisk: "none",
    ...overrides,
  };
}

function confluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return { symbol: "FIXTURE", timestamp: new Date(0).toISOString(), longScore: 40, shortScore: 5, factors: [], evidence: [], contradictions: [], dataQuality: ["real"], dominantSide: "LONG", ...overrides };
}

function regime(overrides: Partial<RegimeContext> = {}): RegimeContext {
  return { type: "TRENDING_UP", strength: 35, quality: "real", evidence: "fixture", timeframe: "15m", mtfAlignment: "ALIGNED", ...overrides };
}

function slice(overrides: Partial<TimeframeSlice> = {}): TimeframeSlice {
  return { timeframe: "4h", available: true, bias: "LONG", strength: 10, evidence: "fixture", protectiveLevel: null, ...overrides };
}

function mtf(overrides: Partial<MtfContext> = {}): MtfContext {
  return { anchorInterval: "15m", htf: slice(), mtf: slice({ timeframe: "15m" }), ltf: slice({ timeframe: "5m" }), relationship: "ALIGNED_BULLISH", relationshipEvidence: "fixture aligned.", ...overrides };
}

function zone(overrides: Partial<LiquidityZone> = {}): LiquidityZone {
  return { type: "SWING_HIGH", price: 121, side: "SHORT", strength: 5, source: "swing", evidence: "fixture zone", quality: "real", distanceFromPrice: 21, ...overrides };
}

function lof(overrides: Partial<LiquidityOrderFlowContext> = {}): LiquidityOrderFlowContext {
  return {
    zones: [],
    event: { type: "NO_CLEAR_EVENT", side: null, level: null, evidence: "fixture", quality: "real" },
    priceResponse: { interpretation: "NO_CLEAR_FLOW", deltaDirection: "neutral", deltaMagnitude: 0, priceDisplacement: 0, evidence: "fixture", quality: "real" },
    ...overrides,
  };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return { id: "primary-long", role: "PRIMARY", direction: "LONG", thesis: "fixture", supportingEvidence: [], opposingEvidence: [], trigger: "fixture", invalidation: "fixture", strength: 65, regimeCompatibility: "COMPATIBLE", mtfCompatibility: "ALIGNED", ...overrides };
}

function scenarios(primary: Scenario | null, alternative: Scenario | null = null): ScenarioContext {
  return { primary, alternative, contextQuality: "real" };
}

function contradictionReport(overrides: Partial<ContradictionReport> = {}): ContradictionReport {
  return { contradictions: [], hasUnresolvedGenuineContradiction: false, ...overrides };
}

function arbitration(overrides: Partial<DecisionArbitration> = {}): DecisionArbitration {
  return { canonicalSide: "LONG", canonicalGrade: "A", alignment: "STRONGLY_SUPPORTED", reasons: [], hasUnresolvedGenuineContradiction: false, regimeCompatibility: "COMPATIBLE", mtfCompatibility: "ALIGNED", hasAlternativeScenario: false, alternativeIsActiveOpposition: false, caveat: null, ...overrides };
}

function riskIntel(overrides: Partial<RiskIntelligence> = {}): RiskIntelligence {
  return { overall: "LOW", factors: [], invalidationDistanceAtr: 1.2, liquidityProximity: null, contextQuality: "real", ...overrides };
}

const validRawResponse = {
  summary: "Setup LONG cukup solid.",
  thesis: "LONG: struktur bullish didukung confluence.",
  supportingEvidence: ["Market structure bullish."],
  opposingEvidence: [],
  riskAssessment: "Overall risk LOW.",
  scenarioAssessment: "Primary scenario dominan, tidak ada alternative aktif.",
  uncertainty: null,
  caveats: [],
  sourceRefs: ["confluence", "regime"],
  quality: "real",
};

// A. Valid AI response -> generatedBy "ai" ------------------------------------
{
  const payload = buildPayload(assessment(), regime(), mtf(), lof(), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  const result = assembleFromAiResult(payload, validRawResponse as any);
  check("A. Valid AI response -> generatedBy=ai, fields copied", result.generatedBy === "ai" && result.summary === validRawResponse.summary, `got ${JSON.stringify(result)}`);
}

// B. Malformed JSON (not even an object) -> shape validation fails ------------
{
  const parsed = "not json object";
  check("B. Malformed (non-object) -> isValidReasoningShape false", isValidReasoningShape(parsed) === false, `got ${isValidReasoningShape(parsed)}`);
}

// C. Invalid schema (wrong field types) -> fails -------------------------------
{
  const parsed = { ...validRawResponse, supportingEvidence: "should be an array, not a string" };
  check("C. Invalid schema (wrong type) -> isValidReasoningShape false", isValidReasoningShape(parsed) === false, "type guard accepted a malformed shape");
}

// D. Missing required field -> fails -------------------------------------------
{
  const { thesis: _omit, ...missingThesis } = validRawResponse;
  check("D. Missing required field (thesis) -> isValidReasoningShape false", isValidReasoningShape(missingThesis) === false, "type guard accepted a shape missing a required field");
}

// E. LLM attempts to provide canonical decision fields -> ignored -------------
{
  const withCanonicalFields = { ...validRawResponse, side: "SHORT", grade: "S", confidence: 999, entry: 12345, stopLoss: 1, takeProfit: 999999, riskStatus: "invalid", invalidation: "hacked" };
  check("E. Extra canonical-looking fields still pass shape validation (ignored, not required)", isValidReasoningShape(withCanonicalFields) === true, "shape validation unexpectedly rejected extra fields");
  const payload = buildPayload(assessment(), regime(), mtf(), lof(), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  const result: any = assembleFromAiResult(payload, withCanonicalFields as any);
  const hasNoCanonicalFields = !("side" in result) && !("grade" in result) && !("confidence" in result) && !("entry" in result) && !("stopLoss" in result) && !("takeProfit" in result) && !("riskStatus" in result) && !("invalidation" in result);
  check("E. Assembled OracleReasoning never carries canonical decision fields even if the model volunteered them", hasNoCanonicalFields, `got keys: ${Object.keys(result).join(",")}`);
}

// F. Proxy evidence -> reasoning quality never becomes "real" -----------------
{
  const proxyZone = zone({ quality: "proxy" });
  const payload = buildPayload(assessment(), regime(), mtf(), lof({ zones: [proxyZone] }), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  const ceiling = computePayloadQualityCeiling(payload);
  check("F. Proxy zone in payload -> quality ceiling capped below real", ceiling !== "real", `got ceiling=${ceiling}`);
  const clamped = clampQuality("real", ceiling); // model dishonestly claims "real"
  check("F. Model claiming quality=real is clamped down to the payload's own ceiling", clamped === ceiling && clamped !== "real", `got clamped=${clamped}`);
}

// G. Unavailable evidence -> represented as uncertainty/degradation -----------
{
  const payload = buildPayload(assessment(), null, null, null, null, null, null, null); // everything missing -> degraded
  const fb = deterministicFallback(assessment(), payload);
  check("G. Missing context -> fallback quality=degraded and uncertainty is non-null", fb.quality === "degraded" && fb.uncertainty !== null, `got ${JSON.stringify({ quality: fb.quality, uncertainty: fb.uncertainty })}`);
}

// H. Top-5 liquidity zone trimming ---------------------------------------------
{
  const manyZones: LiquidityZone[] = Array.from({ length: 12 }, (_, i) => zone({ price: 100 + i, distanceFromPrice: i })); // already "sorted" ascending by distance, matching buildLiquidityZones()' own contract
  const payload = buildPayload(assessment(), regime(), mtf(), lof({ zones: manyZones }), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  check("H. Payload trims to at most 5 nearest zones, preserving existing order", payload.liquidityOrderFlow?.zones.length === 5 && payload.liquidityOrderFlow.zones[0].distanceFromPrice === 0, `got ${JSON.stringify(payload.liquidityOrderFlow?.zones.map((z) => z.distanceFromPrice))}`);
}

// I. No raw candles in the LLM payload -----------------------------------------
{
  const payload = buildPayload(assessment(), regime(), mtf(), lof(), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  const serialized = JSON.stringify(payload);
  check("I. Payload contains no 'candles' key anywhere", !("candles" in payload) && !serialized.includes('"candles"'), `payload keys: ${Object.keys(payload).join(",")}`);
}

// J. Provenance/sourceRefs validation -------------------------------------------
{
  const payload = buildPayload(assessment(), regime(), mtf(), lof(), scenarios(scenario(), scenario({ id: "alt", direction: "SHORT", supportingEvidence: [{ source: "mtf", detail: "fixture" }] })), contradictionReport({ contradictions: [{ description: "x", sources: ["market_structure"], severity: "LOW", genuineness: "GENUINE", origin: "confluence" }] }), arbitration(), riskIntel({ factors: [{ kind: "STRUCTURAL", severity: "LOW", evidence: "x", quality: "real", source: "risk.stopLoss vs ATR(14)" }] }));
  const known = collectKnownSourceIdentifiers(payload);
  const attemptedRefs = ["confluence", "mtf", "risk.stopLoss vs ATR(14)", "totally-invented-source-the-model-made-up"];
  const filtered = filterKnownSourceRefs(payload, attemptedRefs);
  check("J. sourceRefs filtered to only known identifiers, invented ones dropped", filtered.includes("confluence") && filtered.includes("risk.stopLoss vs ATR(14)") && !filtered.includes("totally-invented-source-the-model-made-up"), `got ${JSON.stringify(filtered)}, known=${JSON.stringify(Array.from(known))}`);
}

// K. Mutation safety — deterministic inputs remain byte-identical -------------
{
  const a = assessment();
  const rg = regime();
  const m = mtf();
  const l = lof({ zones: [zone()] });
  const s = scenarios(scenario());
  const c = contradictionReport();
  const arb = arbitration();
  const ri = riskIntel();
  const snapshots = [a, rg, m, l, s, c, arb, ri].map((x) => JSON.stringify(x));
  const payload = buildPayload(a, rg, m, l, s, c, arb, ri);
  assembleFromAiResult(payload, validRawResponse as any);
  deterministicFallback(a, payload);
  const after = [a, rg, m, l, s, c, arb, ri].map((x) => JSON.stringify(x));
  check("K. All deterministic inputs left byte-identical", snapshots.every((snap, i) => snap === after[i]), "one or more inputs were mutated");
}

// L. LLM failure never breaks the Oracle response (end-to-end, real call path) --
async function runCaseL() {
  const a = assessment();
  const result = await buildOracleReasoning(a, confluence(), regime(), mtf(), lof(), scenarios(scenario()), contradictionReport(), arbitration(), riskIntel());
  const isCompleteShape = typeof result.summary === "string" && typeof result.thesis === "string" && Array.isArray(result.supportingEvidence) && (result.generatedBy === "ai" || result.generatedBy === "fallback");
  check("L. buildOracleReasoning() always resolves to a complete OracleReasoning (no API keys configured in this sandbox -> exercises the fallback path for real)", isCompleteShape, `got ${JSON.stringify(result)}`);
}

runCaseL().then(() => {
  console.log(failures === 0 ? "\nAll Phase 7.9 reasoning fixtures passed." : `\n${failures} Phase 7.9 fixture(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
});
