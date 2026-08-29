// ---------------------------------------------------------------------------
// Phase 8.0.4 — Cognitive Conflict Resolution fixtures (dev-only, not part
// of the app). Pure/offline — hand-typed ScenarioContext/ContradictionReport/
// DecisionArbitration/RiskIntelligence/CognitiveObservation fixtures. No
// network/Binance call, no LLM call, no database access, no mocks that
// bypass actual resolution logic.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-conflict-fixtures.ts
// ---------------------------------------------------------------------------

import { resolveCognitiveConflict, type CognitiveConflictInputs } from "@/lib/ai/cognitive/conflict";
import type { Scenario, ScenarioContext, ScenarioEvidenceRef } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration, DecisionAlignment } from "@/lib/ai/oracle/arbitration";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { CognitiveEvidenceRef } from "@/lib/ai/cognitive/types";
import type { CognitiveHypothesis, CognitiveHypothesisSet } from "@/lib/ai/cognitive/hypothesis";

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
    supportingEvidence: [scenarioEvidence()],
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

function contradictionReport(overrides: Partial<ContradictionReport> = {}): ContradictionReport {
  return { contradictions: [], hasUnresolvedGenuineContradiction: false, ...overrides };
}

function arbitration(alignment: DecisionAlignment, overrides: Partial<DecisionArbitration> = {}): DecisionArbitration {
  return {
    canonicalSide: "LONG",
    canonicalGrade: "A",
    alignment,
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

function riskIntelligence(overrides: Partial<RiskIntelligence> = {}): RiskIntelligence {
  return { overall: "LOW", factors: [], invalidationDistanceAtr: 2.4, liquidityProximity: null, contextQuality: "real", ...overrides };
}

function evidenceRef(overrides: Partial<CognitiveEvidenceRef> = {}): CognitiveEvidenceRef {
  return { source: "market_structure", cluster: "structure", direction: "LONG", strength: 8, quality: "real", evidence: "fixture evidence", timeframe: "15m", invalidation: undefined, timestamp: "2026-01-01T00:00:00.000Z", ...overrides };
}

function observation(overrides: Partial<CognitiveObservation> = {}): CognitiveObservation {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    symbol: "FIXTURE",
    sourceAssessment: { side: "LONG", grade: "A", confidence: 72, riskStatus: "valid", invalidation: "fixture invalidation" },
    evidence: [evidenceRef()],
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

function hypothesis(overrides: Partial<CognitiveHypothesis> = {}): CognitiveHypothesis {
  return {
    id: "hyp-primary-long",
    statement: "fixture hypothesis statement",
    hypothesisDirection: "LONG",
    supportingEvidence: [scenarioEvidence()],
    opposingEvidence: [],
    status: "SUPPORTED",
    uncertainty: "LOW",
    origin: "scenario_primary",
    ...overrides,
  };
}

function hypothesisSet(overrides: Partial<CognitiveHypothesisSet> = {}): CognitiveHypothesisSet {
  return { hypotheses: [hypothesis()], generatedFrom: { hasScenarios: true, hasContradictions: true, hasArbitration: true }, ...overrides };
}

function fullInputs(overrides: Partial<CognitiveConflictInputs> = {}): CognitiveConflictInputs {
  return {
    scenarios: scenarioContext(),
    contradictions: contradictionReport(),
    arbitration: arbitration("STRONGLY_SUPPORTED"),
    riskIntelligence: riskIntelligence(),
    observation: observation(),
    hypotheses: hypothesisSet(),
    workingMemory: null,
    ...overrides,
  };
}

// 1. Fully aligned -> CONSISTENT ----------------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs());
  check("1. Fully aligned (STRONGLY_SUPPORTED, no contradiction, no active opposition) -> CONSISTENT", result.state === "CONSISTENT", `got ${JSON.stringify(result)}`);
}

// 2. Supported with caution -> CAUTIOUS ---------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ arbitration: arbitration("SUPPORTED_WITH_CAUTION") }));
  check("2. SUPPORTED_WITH_CAUTION, no genuine contradiction -> CAUTIOUS", result.state === "CAUTIOUS", `got ${JSON.stringify(result)}`);
}

// 3. Genuine contradiction + conflicted arbitration -> CONFLICTED ------------------
{
  const result = resolveCognitiveConflict(
    fullInputs({
      contradictions: contradictionReport({ hasUnresolvedGenuineContradiction: true }),
      arbitration: arbitration("CONFLICTED"),
    })
  );
  check("3. Genuine contradiction + CONFLICTED arbitration -> CONFLICTED", result.state === "CONFLICTED", `got ${JSON.stringify(result)}`);
}

// 4. Missing scenarios -> INSUFFICIENT_CONTEXT -------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ scenarios: null }));
  check("4. scenarios === null -> INSUFFICIENT_CONTEXT", result.state === "INSUFFICIENT_CONTEXT", `got ${JSON.stringify(result)}`);
}

// 5. Scenario insufficient quality -> INSUFFICIENT_CONTEXT --------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ scenarios: scenarioContext({ contextQuality: "insufficient" }) }));
  check("5. scenarios.contextQuality === insufficient -> INSUFFICIENT_CONTEXT", result.state === "INSUFFICIENT_CONTEXT", `got ${JSON.stringify(result)}`);
}

// 6. HIGH risk alone -> must NOT become CONFLICTED (mandatory guardrail) ------------
{
  const result = resolveCognitiveConflict(fullInputs({ riskIntelligence: riskIntelligence({ overall: "HIGH", factors: [{ kind: "VOLATILITY", severity: "HIGH", evidence: "fixture", quality: "real", source: "fixture" }] }) }));
  check("6. riskIntelligence.overall = HIGH alone (clean contradiction/arbitration) -> CONSISTENT, never CONFLICTED", result.state === "CONSISTENT", `got ${JSON.stringify(result)}`);
}

// 7. Three hypotheses -> must NOT automatically become CONFLICTED ------------------
{
  const threeHyps = hypothesisSet({
    hypotheses: [
      hypothesis({ id: "hyp-1", origin: "scenario_primary", status: "SUPPORTED" }),
      hypothesis({ id: "hyp-2", origin: "scenario_alternative", status: "REJECTED", hypothesisDirection: "SHORT" }),
      hypothesis({ id: "hyp-3", origin: "contradiction", status: "CHALLENGED", hypothesisDirection: null }),
    ],
  });
  const result = resolveCognitiveConflict(fullInputs({ hypotheses: threeHyps }));
  check("7. Three hypotheses present, otherwise coherent -> not automatically CONFLICTED (still CONSISTENT)", result.state === "CONSISTENT", `got ${JSON.stringify(result)}`);
}

// 8. Active opposition + genuine contradiction -> CONFLICTED ------------------------
{
  const result = resolveCognitiveConflict(
    fullInputs({
      contradictions: contradictionReport({ hasUnresolvedGenuineContradiction: true }),
      arbitration: arbitration("SUPPORTED_WITH_CAUTION", { alternativeIsActiveOpposition: true, hasAlternativeScenario: true }),
    })
  );
  check("8. alternativeIsActiveOpposition + hasUnresolvedGenuineContradiction -> CONFLICTED", result.state === "CONFLICTED", `got ${JSON.stringify(result)}`);
}

// 9. Determinism --------------------------------------------------------------------
{
  const inputs = fullInputs({ arbitration: arbitration("SUPPORTED_WITH_CAUTION") });
  const a = resolveCognitiveConflict(inputs);
  const b = resolveCognitiveConflict(inputs);
  check("9. Identical inputs -> byte-identical output", JSON.stringify(a) === JSON.stringify(b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

// 10. Input immutability -------------------------------------------------------------
{
  const inputs = fullInputs({
    contradictions: contradictionReport({ hasUnresolvedGenuineContradiction: true }),
    arbitration: arbitration("CONFLICTED"),
  });
  const snapshot = {
    scenarios: JSON.stringify(inputs.scenarios),
    contradictions: JSON.stringify(inputs.contradictions),
    arbitration: JSON.stringify(inputs.arbitration),
    riskIntelligence: JSON.stringify(inputs.riskIntelligence),
    observation: JSON.stringify(inputs.observation),
    hypotheses: JSON.stringify(inputs.hypotheses),
  };
  resolveCognitiveConflict(inputs);
  const after = {
    scenarios: JSON.stringify(inputs.scenarios),
    contradictions: JSON.stringify(inputs.contradictions),
    arbitration: JSON.stringify(inputs.arbitration),
    riskIntelligence: JSON.stringify(inputs.riskIntelligence),
    observation: JSON.stringify(inputs.observation),
    hypotheses: JSON.stringify(inputs.hypotheses),
  };
  check("10. All original input objects remain unchanged after resolveCognitiveConflict()", JSON.stringify(snapshot) === JSON.stringify(after), "one or more inputs were mutated");
}

// 11. No infrastructure dependency ----------------------------------------------------
{
  const conflictModule = await import("@/lib/ai/cognitive/conflict");
  const exportedFunctionKeys = Object.keys(conflictModule).filter((k) => typeof (conflictModule as unknown as Record<string, unknown>)[k] === "function");
  check("11. conflict.ts exposes only resolveCognitiveConflict as a runtime function export — no fetch/Supabase/database/Map-cache surface", JSON.stringify(exportedFunctionKeys) === JSON.stringify(["resolveCognitiveConflict"]), `function exports=${exportedFunctionKeys.join(",")}`);
}

// 12. NOT_APPLICABLE -> INSUFFICIENT_CONTEXT --------------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ arbitration: arbitration("NOT_APPLICABLE") }));
  check("12. arbitration.alignment = NOT_APPLICABLE, otherwise available context -> INSUFFICIENT_CONTEXT", result.state === "INSUFFICIENT_CONTEXT", `got ${JSON.stringify(result)}`);
}

// 13. Genuine contradiction alone (no arbitration corroboration) -> must NOT become CONFLICTED ---
{
  const result = resolveCognitiveConflict(
    fullInputs({
      contradictions: contradictionReport({ hasUnresolvedGenuineContradiction: true }),
      arbitration: arbitration("STRONGLY_SUPPORTED", { alternativeIsActiveOpposition: false }),
    })
  );
  check("13. hasUnresolvedGenuineContradiction=true but arbitration STRONGLY_SUPPORTED + no active opposition -> not CONFLICTED (per approved hierarchy)", result.state !== "CONFLICTED", `got ${JSON.stringify(result)}`);
}

// 14. Unsupported context -> CAUTIOUS -------------------------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ arbitration: arbitration("UNSUPPORTED_CONTEXT") }));
  check("14. arbitration.alignment = UNSUPPORTED_CONTEXT, no hard context blocker -> CAUTIOUS", result.state === "CAUTIOUS", `got ${JSON.stringify(result)}`);
}

// 15. Observation unavailable -> INSUFFICIENT_CONTEXT -----------------------------------------
{
  const result = resolveCognitiveConflict(fullInputs({ observation: observation({ quality: "unavailable" }) }));
  check("15. observation.quality = unavailable -> INSUFFICIENT_CONTEXT", result.state === "INSUFFICIENT_CONTEXT", `got ${JSON.stringify(result)}`);
}

// Extra 16. riskIntelligence.contextQuality = insufficient -> INSUFFICIENT_CONTEXT (Rule 2, second branch) ---
{
  const result = resolveCognitiveConflict(fullInputs({ riskIntelligence: riskIntelligence({ contextQuality: "insufficient" }) }));
  check("16. riskIntelligence.contextQuality = insufficient -> INSUFFICIENT_CONTEXT", result.state === "INSUFFICIENT_CONTEXT", `got ${JSON.stringify(result)}`);
}

// Extra 17. Missing contradictions/arbitration individually also trigger Rule 1 -----------------
{
  const rA = resolveCognitiveConflict(fullInputs({ contradictions: null }));
  const rB = resolveCognitiveConflict(fullInputs({ arbitration: null }));
  check("17. contradictions === null or arbitration === null individually -> INSUFFICIENT_CONTEXT", rA.state === "INSUFFICIENT_CONTEXT" && rB.state === "INSUFFICIENT_CONTEXT", `A=${JSON.stringify(rA)} B=${JSON.stringify(rB)}`);
}

// Extra 18. contributingFactors present internally and traceable to actual fields ---------------
{
  const result = resolveCognitiveConflict(
    fullInputs({
      contradictions: contradictionReport({ hasUnresolvedGenuineContradiction: true }),
      arbitration: arbitration("CONFLICTED"),
    })
  );
  const tracesToRealFields = result.contributingFactors.every((f) => f.detail.includes("=") && (f.detail.includes("contradictions.") || f.detail.includes("arbitration.") || f.detail.includes(" = null")));
  check("18. Every contributingFactor traces to an actual upstream field/value, never invented text", tracesToRealFields && result.contributingFactors.length > 0, `got ${JSON.stringify(result.contributingFactors)}`);
}

console.log(failures === 0 ? "\nAll Phase 8.0.4 cognitive conflict fixtures passed." : `\n${failures} Phase 8.0.4 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
