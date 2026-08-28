// ---------------------------------------------------------------------------
// Phase 7.6 — Contradiction Classifier fixtures (dev-only, not part of the
// app). Pure/offline — hand-typed ConfluenceResult/OracleAssessment/
// MtfContext/ScenarioContext fixtures, same approach as
// scripts/phase7/scenario-fixtures.ts. No network/Binance call.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/contradiction-fixtures.ts
// ---------------------------------------------------------------------------

import { classifyContradictions } from "@/lib/ai/oracle/contradiction";
import type { ConfluenceResult, ConfluenceFactor } from "@/lib/ai/oracle/confluenceTypes";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { MtfContext, TimeframeSlice } from "@/lib/ai/oracle/mtf";
import type { ScenarioContext, Scenario } from "@/lib/ai/oracle/scenario";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function factor(overrides: Partial<ConfluenceFactor> = {}): ConfluenceFactor {
  return { source: "market_structure", label: "Market Structure", longWeight: 0, shortWeight: 0, quality: "real", evidence: "fixture evidence", ...overrides };
}

function confluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    symbol: "FIXTURE",
    timestamp: new Date(0).toISOString(),
    longScore: 20,
    shortScore: 5,
    factors: [],
    evidence: [],
    contradictions: [],
    dataQuality: ["real"],
    dominantSide: "LONG",
    ...overrides,
  };
}

function assessment(overrides: Partial<OracleAssessment> = {}): OracleAssessment {
  return {
    symbol: "FIXTURE",
    timestamp: new Date(0).toISOString(),
    grade: "A",
    side: "LONG",
    score: { long: 20, short: 5 },
    confidence: 65,
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

function slice(overrides: Partial<TimeframeSlice> = {}): TimeframeSlice {
  return { timeframe: "4h", available: true, bias: "LONG", strength: 10, evidence: "fixture slice", protectiveLevel: null, ...overrides };
}

function mtf(overrides: Partial<MtfContext> = {}): MtfContext {
  return { anchorInterval: "15m", htf: slice(), mtf: slice({ timeframe: "15m" }), ltf: slice({ timeframe: "5m" }), relationship: "ALIGNED_BULLISH", relationshipEvidence: "fixture aligned.", ...overrides };
}

function scenarioOf(opposingEvidence: Scenario["opposingEvidence"]): ScenarioContext {
  const primary: Scenario = {
    id: "primary-long",
    role: "PRIMARY",
    direction: "LONG",
    thesis: "fixture thesis",
    supportingEvidence: [],
    opposingEvidence,
    trigger: "fixture trigger",
    invalidation: "fixture invalidation",
    strength: 65,
    regimeCompatibility: "COMPATIBLE",
    mtfCompatibility: "ALIGNED",
  };
  return { primary, alternative: null, contextQuality: "real" };
}

// 1. Genuine cross-source contradiction (different clusters, both real, strong magnitude) --------
{
  const ms = factor({ source: "market_structure", longWeight: 0, shortWeight: 9, quality: "real" });
  const fp = factor({ source: "footprint", longWeight: 9, shortWeight: 0, quality: "real" });
  const c = confluence({ factors: [ms, fp], contradictions: [{ description: "Market Structure condong SHORT sementara Footprint condong LONG.", sources: ["market_structure", "footprint"] }] });
  const report = classifyContradictions(c, assessment(), null, null);
  const entry = report.contradictions[0];
  check(
    "1. Genuine cross-source contradiction -> GENUINE + HIGH",
    entry?.genuineness === "GENUINE" && entry.severity === "HIGH" && report.hasUnresolvedGenuineContradiction === true,
    `got ${JSON.stringify(report)}`
  );
}

// 2. Same-cluster disagreement (both "structure") — genuineness tag differs, severity independent ---
{
  const ms = factor({ source: "market_structure", longWeight: 0, shortWeight: 9, quality: "real" });
  const smc = factor({ source: "smc_ict", longWeight: 9, shortWeight: 0, quality: "real" });
  const c = confluence({ factors: [ms, smc], contradictions: [{ description: "Market Structure vs SMC/ICT berlawanan arah.", sources: ["market_structure", "smc_ict"] }] });
  const report = classifyContradictions(c, assessment(), null, null);
  const entry = report.contradictions[0];
  check(
    "2. Same-cluster contradiction -> SAME_CLUSTER genuineness, but severity still HIGH (independent of genuineness)",
    entry?.genuineness === "SAME_CLUSTER" && entry.severity === "HIGH",
    `got ${JSON.stringify(entry)}`
  );
}

// 3. Data-gap (one side proxy/unavailable) — not a genuine disagreement --------------------------
{
  const ms = factor({ source: "market_structure", longWeight: 0, shortWeight: 9, quality: "real" });
  const liq = factor({ source: "liquidity", longWeight: 9, shortWeight: 0, quality: "proxy" });
  const c = confluence({ factors: [ms, liq], contradictions: [{ description: "Market Structure vs Liquidity berlawanan arah.", sources: ["market_structure", "liquidity"] }] });
  const report = classifyContradictions(c, assessment(), null, null);
  const entry = report.contradictions[0];
  check("3. Data-gap contradiction -> DATA_GAP genuineness", entry?.genuineness === "DATA_GAP", `got ${JSON.stringify(entry)}`);
}

// 4. HTF-threatened, conditions actually satisfied (assessment.side matches threatened bias) -----
{
  const m = mtf({ relationship: "HTF_THESIS_THREATENED_BULLISH", relationshipEvidence: "Level protektif HTF sudah dilewati dan LTF mengonfirmasi arah sebaliknya." });
  const report = classifyContradictions(confluence(), assessment({ side: "LONG" }), m, null);
  const entry = report.contradictions.find((x) => x.origin === "mtf_thesis_threatened");
  check("4a. HTF-threatened matching traded side -> HIGH/GENUINE", entry?.severity === "HIGH" && entry.genuineness === "GENUINE", `got ${JSON.stringify(entry)}`);

  // Threat is BULLISH but traded side is SHORT -> should NOT be classified (threat doesn't apply to what's actually being traded).
  const reportOppositeSide = classifyContradictions(confluence(), assessment({ side: "SHORT" }), m, null);
  const noEntry = reportOppositeSide.contradictions.find((x) => x.origin === "mtf_thesis_threatened");
  check("4b. HTF-threatened NOT matching traded side -> not classified", noEntry === undefined, `got ${JSON.stringify(reportOppositeSide.contradictions)}`);
}

// 5. Duplicate/deduplication — same conflict surfacing via both confluence AND scenario opposing evidence ---
{
  const ms = factor({ source: "market_structure", longWeight: 0, shortWeight: 9, quality: "real" });
  const fp = factor({ source: "footprint", longWeight: 9, shortWeight: 0, quality: "real" });
  const description = "Market Structure condong SHORT sementara Footprint condong LONG.";
  const c = confluence({ factors: [ms, fp], contradictions: [{ description, sources: ["market_structure", "footprint"] }] });
  const scenarios = scenarioOf([{ source: "confluence", detail: description }]);
  const report = classifyContradictions(c, assessment(), null, scenarios);
  const matching = report.contradictions.filter((x) => x.description === description);
  check("5. Same conflict via confluence + scenario -> deduplicated to 1 entry", matching.length === 1, `got ${matching.length} entries: ${JSON.stringify(matching)}`);
}

// 6. No contradiction at all -> empty report -------------------------------------------------------
{
  const report = classifyContradictions(confluence(), assessment(), mtf(), scenarioOf([]));
  check("6. No contradictions -> empty report, hasUnresolvedGenuineContradiction=false", report.contradictions.length === 0 && report.hasUnresolvedGenuineContradiction === false, `got ${JSON.stringify(report)}`);
}

// Extra: internal single-factor ambiguity -> fixed LOW severity, GENUINE genuineness --------------
{
  const ambiguous = factor({ source: "footprint", longWeight: 5, shortWeight: 5, quality: "real" });
  const c = confluence({ factors: [ambiguous], contradictions: [{ description: "Footprint punya bukti untuk LONG dan SHORT sekaligus.", sources: ["footprint"] }] });
  const report = classifyContradictions(c, assessment(), null, null);
  const entry = report.contradictions[0];
  check("7. Internal single-factor ambiguity -> LOW severity (not counted in hasUnresolvedGenuineContradiction)", entry?.severity === "LOW" && report.hasUnresolvedGenuineContradiction === false, `got ${JSON.stringify(report)}`);
}

console.log(failures === 0 ? "\nAll Phase 7.6 contradiction fixtures passed." : `\n${failures} Phase 7.6 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
