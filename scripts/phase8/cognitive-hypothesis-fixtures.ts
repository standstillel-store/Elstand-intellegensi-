// ---------------------------------------------------------------------------
// Phase 8.0.3 — Cognitive Hypothesis Engine fixtures (dev-only, not part of
// the app). Pure/offline — hand-typed Scenario/ScenarioContext/
// ContradictionReport/DecisionArbitration/CognitiveWorkingMemory fixtures.
// No network/Binance call, no LLM call, no database access.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-hypothesis-fixtures.ts
// ---------------------------------------------------------------------------

import { buildHypotheses } from "@/lib/ai/cognitive/hypothesis";
import type { CognitiveWorkingMemory } from "@/lib/ai/cognitive/memory";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { CognitiveEvidenceRef } from "@/lib/ai/cognitive/types";
import type { Scenario, ScenarioContext, ScenarioEvidenceRef } from "@/lib/ai/oracle/scenario";
import type { ClassifiedContradiction, ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function scenarioEvidence(overrides: Partial<ScenarioEvidenceRef> = {}): ScenarioEvidenceRef {
  return { source: "confluence", detail: "fixture scenario evidence", ...overrides };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "primary-long",
    role: "PRIMARY",
    direction: "LONG",
    thesis: "LONG: fixture primary thesis",
    supportingEvidence: [scenarioEvidence({ detail: "supporting A" })],
    opposingEvidence: [],
    trigger: "fixture trigger",
    invalidation: "fixture invalidation",
    strength: 70,
    regimeCompatibility: "COMPATIBLE",
    mtfCompatibility: "ALIGNED",
    ...overrides,
  };
}

function scenarioContext(overrides: Partial<ScenarioContext> = {}): ScenarioContext {
  return { primary: scenario(), alternative: null, contextQuality: "real", ...overrides };
}

function classifiedContradiction(overrides: Partial<ClassifiedContradiction> = {}): ClassifiedContradiction {
  return { description: "fixture contradiction description", sources: ["market_structure", "smc_ict"], severity: "MODERATE", genuineness: "GENUINE", origin: "confluence", ...overrides };
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

function evidenceRef(overrides: Partial<CognitiveEvidenceRef> = {}): CognitiveEvidenceRef {
  return { source: "market_structure", cluster: "structure", direction: "LONG", strength: 8, quality: "real", evidence: "fixture evidence", timeframe: "15m", invalidation: undefined, timestamp: "2026-01-01T00:00:00.000Z", ...overrides };
}

function observation(overrides: Partial<CognitiveObservation> = {}): CognitiveObservation {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    symbol: "FIXTURE",
    sourceAssessment: { side: "LONG", grade: "A", confidence: 72, riskStatus: "valid", invalidation: "fixture invalidation" },
    evidence: [evidenceRef({ source: "market_structure", cluster: "structure" }), evidenceRef({ source: "smc_ict", cluster: "structure" })],
    context: {
      confluenceAvailable: true,
      mtfAvailable: true,
      regimeAvailable: true,
      liquidityAvailable: true,
      scenariosAvailable: true,
      contradictionsAvailable: true,
      arbitrationAvailable: true,
      riskIntelligenceAvailable: true,
    },
    quality: "real",
    ...overrides,
  };
}

function workingMemory(obsOverrides: Partial<CognitiveObservation> = {}): CognitiveWorkingMemory {
  return { observation: observation(obsOverrides), notes: [] };
}

// 1. Deterministic hypothesis generation (baseline case) -------------------
{
  const memory = workingMemory();
  const scenarios = scenarioContext();
  const contradictions = contradictionReport();
  const arb = arbitration();
  const set = buildHypotheses(memory, scenarios, contradictions, arb);
  check("1. Deterministic hypothesis generation succeeds with a plausible fixture set", set.hypotheses.length >= 1 && set.generatedFrom.hasScenarios && set.generatedFrom.hasContradictions && set.generatedFrom.hasArbitration, `got ${JSON.stringify(set)}`);
}

// 2. Primary scenario produces one hypothesis --------------------------------
{
  const memory = workingMemory();
  const set = buildHypotheses(memory, scenarioContext(), contradictionReport(), arbitration());
  const primaries = set.hypotheses.filter((h) => h.origin === "scenario_primary");
  check("2. Primary scenario produces exactly one hypothesis", primaries.length === 1, `got ${JSON.stringify(set.hypotheses)}`);
}

// 3. Alternative scenario produces one hypothesis only when provided -----------
{
  const memoryNoAlt = workingMemory();
  const setNoAlt = buildHypotheses(memoryNoAlt, scenarioContext({ alternative: null }), contradictionReport(), arbitration());
  const altScenario = scenario({ id: "alternative-short", role: "ALTERNATIVE", direction: "SHORT", thesis: "SHORT: fixture alternative thesis", supportingEvidence: [scenarioEvidence({ detail: "alt supporting" })], opposingEvidence: [scenarioEvidence({ detail: "alt opposing" })], strength: 25 });
  const memoryWithAlt = workingMemory({ evidence: [evidenceRef({ source: "market_structure", cluster: "structure", direction: "SHORT" }), evidenceRef({ source: "smc_ict", cluster: "structure", direction: "SHORT" })] });
  const setWithAlt = buildHypotheses(memoryWithAlt, scenarioContext({ alternative: altScenario }), contradictionReport(), arbitration({ hasAlternativeScenario: true, alternativeIsActiveOpposition: true, alignment: "SUPPORTED_WITH_CAUTION" }));
  const noAltCount = setNoAlt.hypotheses.filter((h) => h.origin === "scenario_alternative").length;
  const withAltCount = setWithAlt.hypotheses.filter((h) => h.origin === "scenario_alternative").length;
  check("3. Alternative hypothesis appears only when scenarios.alternative is provided", noAltCount === 0 && withAltCount === 1, `noAlt=${noAltCount} withAlt=${withAltCount}`);
}

// 4. Supporting evidence preserved -------------------------------------------
{
  const s = scenario({ supportingEvidence: [scenarioEvidence({ detail: "unique-support-marker" })] });
  const set = buildHypotheses(workingMemory(), scenarioContext({ primary: s }), contradictionReport(), arbitration());
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  check("4. Supporting evidence preserved verbatim (same reference) from Scenario.supportingEvidence", !!primary && primary.supportingEvidence === s.supportingEvidence && primary.supportingEvidence[0].detail === "unique-support-marker", `got ${JSON.stringify(primary)}`);
}

// 5. Opposing evidence preserved ---------------------------------------------
{
  const s = scenario({ opposingEvidence: [scenarioEvidence({ detail: "unique-oppose-marker" })] });
  const set = buildHypotheses(workingMemory(), scenarioContext({ primary: s }), contradictionReport(), arbitration());
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  check("5. Opposing evidence preserved verbatim (same reference) from Scenario.opposingEvidence", !!primary && primary.opposingEvidence === s.opposingEvidence && primary.opposingEvidence[0].detail === "unique-oppose-marker", `got ${JSON.stringify(primary)}`);
}

// 6. No evidence re-normalization ---------------------------------------------
{
  const set = buildHypotheses(workingMemory(), scenarioContext(), contradictionReport(), arbitration());
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  const shapeIsScenarioEvidenceRef = !!primary && primary.supportingEvidence.every((e) => "source" in e && "detail" in e && !("cluster" in e) && !("strength" in e));
  check("6. Hypothesis evidence stays ScenarioEvidenceRef-shaped — no re-normalization into NormalizedEvidence/a new schema", shapeIsScenarioEvidenceRef, `got ${JSON.stringify(primary?.supportingEvidence)}`);
}

// 7. No mutation of Scenario input ---------------------------------------------
{
  const s = scenario();
  const sc = scenarioContext({ primary: s });
  const before = JSON.stringify(sc);
  buildHypotheses(workingMemory(), sc, contradictionReport(), arbitration());
  const after = JSON.stringify(sc);
  check("7. ScenarioContext (and its Scenario) unchanged after buildHypotheses()", before === after, `before=${before} after=${after}`);
}

// 8. No mutation of ContradictionReport input -----------------------------------
{
  const cr = contradictionReport({ contradictions: [classifiedContradiction()], hasUnresolvedGenuineContradiction: true });
  const before = JSON.stringify(cr);
  buildHypotheses(workingMemory(), scenarioContext(), cr, arbitration());
  const after = JSON.stringify(cr);
  check("8. ContradictionReport unchanged after buildHypotheses()", before === after, `before=${before} after=${after}`);
}

// 9. No mutation of DecisionArbitration input ------------------------------------
{
  const arb = arbitration({ alignment: "CONFLICTED" });
  const before = JSON.stringify(arb);
  buildHypotheses(workingMemory(), scenarioContext(), contradictionReport(), arb);
  const after = JSON.stringify(arb);
  check("9. DecisionArbitration unchanged after buildHypotheses()", before === after, `before=${before} after=${after}`);
}

// 10. No mutation of CognitiveObservation -----------------------------------------
{
  const memory = workingMemory();
  const before = JSON.stringify(memory.observation);
  buildHypotheses(memory, scenarioContext(), contradictionReport(), arbitration());
  const after = JSON.stringify(memory.observation);
  check("10. CognitiveObservation unchanged after buildHypotheses()", before === after, `before=${before} after=${after}`);
}

// 11. No mutation of CognitiveWorkingMemory ----------------------------------------
{
  const memory = workingMemory();
  const before = JSON.stringify(memory);
  buildHypotheses(memory, scenarioContext(), contradictionReport(), arbitration());
  const after = JSON.stringify(memory);
  check("11. CognitiveWorkingMemory (incl. notes) unchanged after buildHypotheses()", before === after, `before=${before} after=${after}`);
}

// 12. Canonical sourceAssessment unchanged -----------------------------------------
{
  const memory = workingMemory();
  const beforeSnap = JSON.stringify(memory.observation.sourceAssessment);
  buildHypotheses(memory, scenarioContext(), contradictionReport(), arbitration());
  const afterSnap = JSON.stringify(memory.observation.sourceAssessment);
  check("12. memory.observation.sourceAssessment unchanged after buildHypotheses()", beforeSnap === afterSnap, `before=${beforeSnap} after=${afterSnap}`);
}

// 13. Forbidden keys absent ---------------------------------------------------------
{
  const set = buildHypotheses(workingMemory(), scenarioContext(), contradictionReport({ contradictions: [classifiedContradiction()], hasUnresolvedGenuineContradiction: true }), arbitration());
  const forbidden = ["cognitiveSide", "cognitiveGrade", "hypothesisSignal", "recommendedTrade", "alternativeSignal", "hypothesisConfidence", "entry", "stopLoss", "takeProfit", "order", "positionSize"];
  const setAny = set as unknown as Record<string, unknown>;
  const anyHypAny = set.hypotheses.map((h) => h as unknown as Record<string, unknown>);
  const noneAtTopLevel = forbidden.every((k) => !(k in setAny));
  const noneOnHypotheses = anyHypAny.every((h) => forbidden.every((k) => !(k in h)));
  check("13. No forbidden field names anywhere in CognitiveHypothesisSet or its hypotheses", noneAtTopLevel && noneOnHypotheses, `got ${JSON.stringify(set)}`);
}

// 14. Status deterministic -----------------------------------------------------------
{
  const runOnce = () => buildHypotheses(workingMemory(), scenarioContext(), contradictionReport(), arbitration({ alignment: "SUPPORTED_WITH_CAUTION" }));
  const a = runOnce();
  const b = runOnce();
  check("14. Status is a deterministic function of inputs (same inputs -> same status)", a.hypotheses[0]?.status === b.hypotheses[0]?.status, `a=${a.hypotheses[0]?.status} b=${b.hypotheses[0]?.status}`);
}

// 15. Uncertainty deterministic -------------------------------------------------------
{
  const runOnce = () => buildHypotheses(workingMemory(), scenarioContext(), contradictionReport(), arbitration());
  const a = runOnce();
  const b = runOnce();
  check("15. Uncertainty is a deterministic function of inputs (same inputs -> same uncertainty)", a.hypotheses[0]?.uncertainty === b.hypotheses[0]?.uncertainty, `a=${a.hypotheses[0]?.uncertainty} b=${b.hypotheses[0]?.uncertainty}`);
}

// 16. Proxy/unavailable backing data never results in LOW uncertainty ------------------
{
  const memoryProxy = workingMemory({ evidence: [evidenceRef({ source: "market_structure", cluster: "structure", direction: "LONG", quality: "proxy" }), evidenceRef({ source: "smc_ict", cluster: "structure", direction: "LONG", quality: "real" })] });
  const set = buildHypotheses(memoryProxy, scenarioContext(), contradictionReport(), arbitration());
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  check("16. Proxy-quality backing evidence forces uncertainty to HIGH, never LOW", primary?.uncertainty === "HIGH", `got uncertainty=${primary?.uncertainty}`);
}

// Clean-quality, 2-cluster case should reach LOW (sanity check for the branch above)
{
  const memoryClean = workingMemory({ evidence: [evidenceRef({ source: "market_structure", cluster: "structure", direction: "LONG", quality: "real" }), evidenceRef({ source: "macro", cluster: "context", direction: "LONG", quality: "real" })] });
  const set = buildHypotheses(memoryClean, scenarioContext(), contradictionReport(), arbitration());
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  check("16b. Clean real-quality evidence across 2+ independent clusters with no contradiction reaches LOW uncertainty", primary?.uncertainty === "LOW", `got uncertainty=${primary?.uncertainty}`);
}

// 17. Meaningful genuine contradiction affects interpretation appropriately --------------
{
  const cr = contradictionReport({ contradictions: [classifiedContradiction({ genuineness: "GENUINE", severity: "HIGH" })], hasUnresolvedGenuineContradiction: true });
  const memoryClean = workingMemory({ evidence: [evidenceRef({ source: "market_structure", cluster: "structure", direction: "LONG", quality: "real" }), evidenceRef({ source: "macro", cluster: "context", direction: "LONG", quality: "real" })] });
  const set = buildHypotheses(memoryClean, scenarioContext(), cr, arbitration({ alignment: "CONFLICTED", hasUnresolvedGenuineContradiction: true }));
  const primary = set.hypotheses.find((h) => h.origin === "scenario_primary");
  const contradictionHyp = set.hypotheses.find((h) => h.origin === "contradiction");
  check(
    "17. A meaningful genuine contradiction pushes primary status to CHALLENGED and produces a contradiction-origin hypothesis with HIGH uncertainty",
    primary?.status === "CHALLENGED" && primary?.uncertainty === "HIGH" && !!contradictionHyp && contradictionHyp.uncertainty === "HIGH" && contradictionHyp.status === "CHALLENGED",
    `primary=${JSON.stringify(primary)} contradictionHyp=${JSON.stringify(contradictionHyp)}`
  );
}

// 18. hypotheses.length <= 3 --------------------------------------------------------------
{
  const altScenario = scenario({ id: "alternative-short", role: "ALTERNATIVE", direction: "SHORT", thesis: "SHORT: alt thesis", supportingEvidence: [scenarioEvidence({ detail: "alt support" })], opposingEvidence: [scenarioEvidence({ detail: "alt oppose" })] });
  const cr = contradictionReport({ contradictions: [classifiedContradiction({ description: "totally distinct contradiction text" })], hasUnresolvedGenuineContradiction: true });
  const set = buildHypotheses(workingMemory(), scenarioContext({ alternative: altScenario }), cr, arbitration({ hasAlternativeScenario: true, alternativeIsActiveOpposition: true }));
  check("18. hypotheses.length never exceeds 3", set.hypotheses.length <= 3, `got length=${set.hypotheses.length}`);
}

// 19. All three generation paths produce exactly 3 when simultaneously applicable ------------
{
  const altScenario = scenario({ id: "alternative-short", role: "ALTERNATIVE", direction: "SHORT", thesis: "SHORT: alt thesis", supportingEvidence: [scenarioEvidence({ detail: "alt support text" })], opposingEvidence: [scenarioEvidence({ detail: "alt oppose text" })] });
  const cr = contradictionReport({ contradictions: [classifiedContradiction({ description: "a third, unrelated genuine contradiction" })], hasUnresolvedGenuineContradiction: true });
  const set = buildHypotheses(workingMemory(), scenarioContext({ alternative: altScenario }), cr, arbitration({ hasAlternativeScenario: true, alternativeIsActiveOpposition: true }));
  const origins = set.hypotheses.map((h) => h.origin).sort();
  check("19. Primary + alternative + a genuinely distinct contradiction together produce exactly 3 hypotheses, one per origin", set.hypotheses.length === 3 && JSON.stringify(origins) === JSON.stringify(["contradiction", "scenario_alternative", "scenario_primary"]), `got origins=${JSON.stringify(origins)}`);
}

// 20. Identical inputs produce byte-identical output ------------------------------------------
{
  const memory = workingMemory();
  const scenarios = scenarioContext();
  const cr = contradictionReport();
  const arb = arbitration();
  const a = buildHypotheses(memory, scenarios, cr, arb);
  const b = buildHypotheses(memory, scenarios, cr, arb);
  check("20. Identical inputs produce byte-identical JSON output", JSON.stringify(a) === JSON.stringify(b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

// 21. No LLM/network/database imports or calls -------------------------------------------------
{
  // Static/structural check, same style as memory-fixtures.ts case 11 and
  // reasoning-fixtures.ts's own documented network limitation.
  const hypothesisModule = await import("@/lib/ai/cognitive/hypothesis");
  const exportedKeys = Object.keys(hypothesisModule).sort();
  check("21. hypothesis.ts exposes only buildHypotheses as a runtime export — no fetch/LLM/database surface", JSON.stringify(exportedKeys) === JSON.stringify(["buildHypotheses"]), `exports=${exportedKeys.join(",")}`);
}

// 22. Independent hypotheses do not accidentally share mutable outer arrays --------------------
{
  const s1 = scenario({ id: "primary-long", supportingEvidence: [scenarioEvidence({ detail: "set1-support" })] });
  const s2 = scenario({ id: "primary-long", supportingEvidence: [scenarioEvidence({ detail: "set2-support" })] });
  const setA = buildHypotheses(workingMemory(), scenarioContext({ primary: s1 }), contradictionReport(), arbitration());
  const setB = buildHypotheses(workingMemory(), scenarioContext({ primary: s2 }), contradictionReport(), arbitration());
  const primaryA = setA.hypotheses.find((h) => h.origin === "scenario_primary");
  const primaryB = setB.hypotheses.find((h) => h.origin === "scenario_primary");
  check(
    "22. Independent hypothesis sets never share evidence array references",
    !!primaryA && !!primaryB && primaryA.supportingEvidence !== primaryB.supportingEvidence && primaryA.supportingEvidence[0].detail === "set1-support" && primaryB.supportingEvidence[0].detail === "set2-support",
    `A=${JSON.stringify(primaryA)} B=${JSON.stringify(primaryB)}`
  );
}

// Extra: REJECTED status reachability (narrow, deterministic path) --------------------------------
{
  const altScenario = scenario({ id: "alternative-short", role: "ALTERNATIVE", direction: "SHORT", thesis: "SHORT: contingency-only alt", supportingEvidence: [scenarioEvidence({ source: "mtf", detail: "ordinary pullback, not active opposition" })], opposingEvidence: [] });
  const set = buildHypotheses(workingMemory(), scenarioContext({ alternative: altScenario }), contradictionReport(), arbitration({ alignment: "STRONGLY_SUPPORTED", hasAlternativeScenario: true, alternativeIsActiveOpposition: false }));
  const alt = set.hypotheses.find((h) => h.origin === "scenario_alternative");
  check("23. REJECTED is reachable via the narrow, deterministic rule (STRONGLY_SUPPORTED + alternative not active opposition)", alt?.status === "REJECTED", `got ${JSON.stringify(alt)}`);
}

console.log(failures === 0 ? "\nAll Phase 8.0.3 cognitive hypothesis fixtures passed." : `\n${failures} Phase 8.0.3 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
