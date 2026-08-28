// ---------------------------------------------------------------------------
// Phase 7.7 — Decision Arbitration fixtures (dev-only, not part of the
// app). Pure/offline — hand-typed fixtures, same approach as
// scenario-fixtures.ts / contradiction-fixtures.ts. No network call.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/arbitration-fixtures.ts
// ---------------------------------------------------------------------------

import { arbitrateDecision } from "@/lib/ai/oracle/arbitration";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { RegimeContext } from "@/lib/ai/oracle/regime";
import type { MtfContext, TimeframeSlice } from "@/lib/ai/oracle/mtf";
import type { ScenarioContext, Scenario } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";

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

function regime(overrides: Partial<RegimeContext> = {}): RegimeContext {
  return { type: "TRENDING_UP", strength: 35, quality: "real", evidence: "ADX 35 uptrend.", timeframe: "15m", mtfAlignment: "ALIGNED", ...overrides };
}

function slice(overrides: Partial<TimeframeSlice> = {}): TimeframeSlice {
  return { timeframe: "4h", available: true, bias: "LONG", strength: 10, evidence: "fixture slice", protectiveLevel: null, ...overrides };
}

function mtf(overrides: Partial<MtfContext> = {}): MtfContext {
  return { anchorInterval: "15m", htf: slice(), mtf: slice({ timeframe: "15m" }), ltf: slice({ timeframe: "5m" }), relationship: "ALIGNED_BULLISH", relationshipEvidence: "fixture aligned.", ...overrides };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "primary-long",
    role: "PRIMARY",
    direction: "LONG",
    thesis: "fixture thesis",
    supportingEvidence: [],
    opposingEvidence: [],
    trigger: "fixture trigger",
    invalidation: "fixture invalidation",
    strength: 70,
    regimeCompatibility: "COMPATIBLE",
    mtfCompatibility: "ALIGNED",
    ...overrides,
  };
}

function scenarios(primary: Scenario | null, alternative: Scenario | null = null, contextQuality: ScenarioContext["contextQuality"] = "real"): ScenarioContext {
  return { primary, alternative, contextQuality };
}

function contradictionReport(hasUnresolvedGenuineContradiction: boolean): ContradictionReport {
  return { contradictions: [], hasUnresolvedGenuineContradiction };
}

// 1. NOT_APPLICABLE (NO_TRADE) ------------------------------------------------
{
  const a = assessment({ grade: "NO_TRADE", side: null });
  const result = arbitrateDecision(a, regime(), mtf(), scenarios(null), contradictionReport(false));
  check("1. NO_TRADE -> NOT_APPLICABLE", result.alignment === "NOT_APPLICABLE" && result.canonicalSide === null, `got ${JSON.stringify(result)}`);
}

// 2. CONFLICTED (unresolved genuine contradiction) ---------------------------
{
  const result = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario()), contradictionReport(true));
  check("2. Unresolved genuine contradiction -> CONFLICTED", result.alignment === "CONFLICTED", `got ${result.alignment}`);
}

// 3. UNSUPPORTED_CONTEXT (missing/degraded context) ---------------------------
{
  const resultNullRegime = arbitrateDecision(assessment(), null, mtf(), scenarios(scenario()), contradictionReport(false));
  check("3a. Missing regime -> UNSUPPORTED_CONTEXT", resultNullRegime.alignment === "UNSUPPORTED_CONTEXT", `got ${resultNullRegime.alignment}`);

  const resultDegraded = arbitrateDecision(assessment(), regime({ type: "VOLATILE_UNCLEAR" }), mtf(), scenarios(scenario({ regimeCompatibility: "DEGRADED" })), contradictionReport(false));
  check("3b. regimeCompatibility DEGRADED -> UNSUPPORTED_CONTEXT", resultDegraded.alignment === "UNSUPPORTED_CONTEXT", `got ${resultDegraded.alignment}`);
}

// 4. SUPPORTED_WITH_CAUTION (regime/MTF not fully aligned) --------------------
{
  const result = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario({ regimeCompatibility: "REQUIRES_STRONGER_EVIDENCE" })), contradictionReport(false));
  check("4a. regimeCompatibility REQUIRES_STRONGER_EVIDENCE -> SUPPORTED_WITH_CAUTION", result.alignment === "SUPPORTED_WITH_CAUTION", `got ${result.alignment}`);

  const resultMixed = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario({ mtfCompatibility: "MIXED" })), contradictionReport(false));
  check("4b. mtfCompatibility MIXED -> SUPPORTED_WITH_CAUTION", resultMixed.alignment === "SUPPORTED_WITH_CAUTION", `got ${resultMixed.alignment}`);
}

// 5. SUPPORTED_WITH_CAUTION (active-opposition alternative: confluence-sourced) -
{
  const alt = scenario({ id: "alt-short", direction: "SHORT", supportingEvidence: [{ source: "confluence", detail: "Footprint SHORT vs structure LONG." }] });
  const result = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario(), alt), contradictionReport(false));
  check(
    "5. Alternative seeded by confluence contradiction -> active opposition -> SUPPORTED_WITH_CAUTION",
    result.alignment === "SUPPORTED_WITH_CAUTION" && result.alternativeIsActiveOpposition === true,
    `got ${JSON.stringify(result)}`
  );
}

// 6. SUPPORTED_WITH_CAUTION (active opposition: HTF-threatened, not ordinary pullback) -
{
  const m = mtf({ relationship: "HTF_THESIS_THREATENED_BULLISH", relationshipEvidence: "Protective level broken, LTF confirms." });
  const alt = scenario({ id: "alt-short", direction: "SHORT", supportingEvidence: [{ source: "mtf", detail: m.relationshipEvidence }] });
  const result = arbitrateDecision(assessment(), regime(), m, scenarios(scenario(), alt), contradictionReport(false));
  check(
    "6. Alternative seeded only by HTF_THESIS_THREATENED mtf relationship -> active opposition -> SUPPORTED_WITH_CAUTION",
    result.alignment === "SUPPORTED_WITH_CAUTION" && result.alternativeIsActiveOpposition === true,
    `got ${JSON.stringify(result)}`
  );
}

// 7. STRONGLY_SUPPORTED, alternative is a MERE CONTINGENCY (ordinary MTF pullback) — must NOT downgrade
{
  const m = mtf({ relationship: "PULLBACK_IN_UPTREND", relationshipEvidence: "HTF bullish, LTF pullback bearish sementara." });
  const alt = scenario({ id: "alt-short", direction: "SHORT", thesis: "SHORT: Pullback within HTF structure — HTF bullish, LTF pullback.", supportingEvidence: [{ source: "mtf", detail: m.relationshipEvidence }] });
  const result = arbitrateDecision(assessment(), regime(), m, scenarios(scenario(), alt), contradictionReport(false));
  check(
    "7. Ordinary MTF-pullback-only alternative -> contingency, NOT active opposition -> STRONGLY_SUPPORTED",
    result.alignment === "STRONGLY_SUPPORTED" && result.hasAlternativeScenario === true && result.alternativeIsActiveOpposition === false,
    `got ${JSON.stringify(result)}`
  );
}

// 8. STRONGLY_SUPPORTED (fully aligned, no alternative at all) ----------------
{
  const result = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario(), null), contradictionReport(false));
  check("8. Fully aligned, no alternative -> STRONGLY_SUPPORTED", result.alignment === "STRONGLY_SUPPORTED" && result.hasAlternativeScenario === false, `got ${JSON.stringify(result)}`);
}

// 9. Precedence check: CONFLICTED wins over an otherwise-aligned context -----
{
  const result = arbitrateDecision(assessment(), regime(), mtf(), scenarios(scenario()), contradictionReport(true));
  check("9. CONFLICTED takes precedence even when regime/mtf/scenario are otherwise fully compatible", result.alignment === "CONFLICTED", `got ${result.alignment}`);
}

// 10. Never mutates assessment ------------------------------------------------
{
  const a = assessment();
  const snapshot = JSON.stringify(a);
  arbitrateDecision(a, regime(), mtf(), scenarios(scenario()), contradictionReport(true));
  check("10. assessment object left byte-identical after arbitration", JSON.stringify(a) === snapshot, "assessment was mutated");
}

console.log(failures === 0 ? "\nAll Phase 7.7 arbitration fixtures passed." : `\n${failures} Phase 7.7 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
