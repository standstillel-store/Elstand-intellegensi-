// ---------------------------------------------------------------------------
// Phase 8.0.5 — Cognitive Decision Context fixtures (dev-only, not part of
// the app). Pure/offline — hand-typed CognitiveObservation/
// CognitiveHypothesisSet/CognitiveConflictState/RiskIntelligence fixtures.
// No network/Binance call, no LLM call, no database access.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-context-fixtures.ts
// ---------------------------------------------------------------------------

import { buildDecisionContext } from "@/lib/ai/cognitive/context";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { CognitiveEvidenceRef } from "@/lib/ai/cognitive/types";
import type { CognitiveHypothesis, CognitiveHypothesisSet } from "@/lib/ai/cognitive/hypothesis";
import type { ScenarioEvidenceRef } from "@/lib/ai/oracle/scenario";
import type { CognitiveConflictState, CognitiveConflictFactor } from "@/lib/ai/cognitive/conflict";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

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

function scenarioEvidence(overrides: Partial<ScenarioEvidenceRef> = {}): ScenarioEvidenceRef {
  return { source: "confluence", detail: "fixture scenario evidence", ...overrides };
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

function conflictFactor(overrides: Partial<CognitiveConflictFactor> = {}): CognitiveConflictFactor {
  return { source: "arbitration", detail: "arbitration.alignment = STRONGLY_SUPPORTED", ...overrides };
}

function conflictState(overrides: Partial<CognitiveConflictState> = {}): CognitiveConflictState {
  return {
    state: "CONSISTENT",
    reasons: ["Arbitration STRONGLY_SUPPORTED tanpa kontradiksi genuine yang belum terselesaikan dan tanpa oposisi aktif dari skenario alternatif."],
    contributingFactors: [conflictFactor()],
    ...overrides,
  };
}

function riskIntelligence(overrides: Partial<RiskIntelligence> = {}): RiskIntelligence {
  return { overall: "LOW", factors: [{ kind: "VOLATILITY", severity: "LOW", evidence: "fixture", quality: "real", source: "fixture" }], invalidationDistanceAtr: 2.4, liquidityProximity: null, contextQuality: "real", ...overrides };
}

// 1. Basic construction succeeds ---------------------------------------------
{
  const obs = observation();
  const hyps = hypothesisSet();
  const conflict = conflictState();
  const risk = riskIntelligence();
  const ctx = buildDecisionContext(obs, hyps, conflict, risk);
  check("1. Basic construction succeeds with all inputs present", ctx !== null && ctx.observation === obs && ctx.hypotheses === hyps && ctx.conflict === conflict, `got ${JSON.stringify(ctx)}`);
}

// 2. Same inputs twice produce deep-equal output ------------------------------
{
  const obs = observation();
  const hyps = hypothesisSet();
  const conflict = conflictState();
  const risk = riskIntelligence();
  const a = buildDecisionContext(obs, hyps, conflict, risk);
  const b = buildDecisionContext(obs, hyps, conflict, risk);
  check("2. Same inputs twice -> deep-equal output", JSON.stringify(a) === JSON.stringify(b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

// 3. observation === null returns null ----------------------------------------
{
  const ctx = buildDecisionContext(null, hypothesisSet(), conflictState(), riskIntelligence());
  check("3. observation === null -> whole function returns null (no fabricated empty observation)", ctx === null, `got ${JSON.stringify(ctx)}`);
}

// 4. hypotheses === null produces context.hypotheses === null ------------------
{
  const ctx = buildDecisionContext(observation(), null, conflictState(), riskIntelligence());
  check("4. hypotheses === null -> context.hypotheses === null", ctx !== null && ctx.hypotheses === null, `got ${JSON.stringify(ctx)}`);
}

// 5. conflict === null produces context.conflict === null ----------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), null, riskIntelligence());
  check("5. conflict === null -> context.conflict === null", ctx !== null && ctx.conflict === null, `got ${JSON.stringify(ctx)}`);
}

// 6. riskIntelligence === null produces context.risk === null ------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflictState(), null);
  check("6. riskIntelligence === null -> context.risk === null", ctx !== null && ctx.risk === null, `got ${JSON.stringify(ctx)}`);
}

// 7. Observation input remains unchanged ----------------------------------------
{
  const obs = observation();
  const before = JSON.stringify(obs);
  buildDecisionContext(obs, hypothesisSet(), conflictState(), riskIntelligence());
  const after = JSON.stringify(obs);
  check("7. Observation input unchanged after construction", before === after, `before=${before} after=${after}`);
}

// 8. Hypotheses input remains unchanged ------------------------------------------
{
  const hyps = hypothesisSet();
  const before = JSON.stringify(hyps);
  buildDecisionContext(observation(), hyps, conflictState(), riskIntelligence());
  const after = JSON.stringify(hyps);
  check("8. Hypotheses input unchanged after construction", before === after, `before=${before} after=${after}`);
}

// 9. Conflict input remains unchanged ---------------------------------------------
{
  const conflict = conflictState();
  const before = JSON.stringify(conflict);
  buildDecisionContext(observation(), hypothesisSet(), conflict, riskIntelligence());
  const after = JSON.stringify(conflict);
  check("9. Conflict input unchanged after construction", before === after, `before=${before} after=${after}`);
}

// 10. RiskIntelligence input remains unchanged -------------------------------------
{
  const risk = riskIntelligence();
  const before = JSON.stringify(risk);
  buildDecisionContext(observation(), hypothesisSet(), conflictState(), risk);
  const after = JSON.stringify(risk);
  check("10. RiskIntelligence input unchanged after construction (including .factors, which is never read into the context)", before === after, `before=${before} after=${after}`);
}

// 11. Canonical sourceAssessment values pass through unchanged -----------------------
{
  const obs = observation({ sourceAssessment: { side: "SHORT", grade: "B+", confidence: 55, riskStatus: "invalid", invalidation: "unique invalidation marker" } });
  const ctx = buildDecisionContext(obs, hypothesisSet(), conflictState(), riskIntelligence());
  check(
    "11. Canonical sourceAssessment values pass through unchanged via context.observation.sourceAssessment",
    ctx !== null && ctx.observation.sourceAssessment.side === "SHORT" && ctx.observation.sourceAssessment.grade === "B+" && ctx.observation.sourceAssessment.confidence === 55 && ctx.observation.sourceAssessment.riskStatus === "invalid" && ctx.observation.sourceAssessment.invalidation === "unique invalidation marker",
    `got ${JSON.stringify(ctx?.observation.sourceAssessment)}`
  );
}

// 12. Hypotheses are not re-ranked or re-counted ---------------------------------------
{
  const hyps = hypothesisSet({
    hypotheses: [
      hypothesis({ id: "hyp-1", origin: "scenario_primary" }),
      hypothesis({ id: "hyp-2", origin: "scenario_alternative", hypothesisDirection: "SHORT" }),
      hypothesis({ id: "hyp-3", origin: "contradiction", hypothesisDirection: null }),
    ],
  });
  const ctx = buildDecisionContext(observation(), hyps, conflictState(), riskIntelligence());
  const orderPreserved = ctx?.hypotheses?.hypotheses.map((h) => h.id).join(",") === "hyp-1,hyp-2,hyp-3";
  check("12. Hypotheses order/count preserved exactly — no re-ranking, no re-counting, no filtering", orderPreserved, `got ${JSON.stringify(ctx?.hypotheses)}`);
}

// 13. Conflict is not recomputed --------------------------------------------------------
{
  const conflict = conflictState({ state: "CAUTIOUS", reasons: ["unique cautious reason marker"] });
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflict, riskIntelligence());
  check("13. Conflict state/reasons pass through exactly as given — never recomputed/reclassified", ctx?.conflict?.state === "CAUTIOUS" && ctx?.conflict?.reasons[0] === "unique cautious reason marker", `got ${JSON.stringify(ctx?.conflict)}`);
}

// 14. Conflict object reference is preserved ---------------------------------------------
{
  const conflict = conflictState();
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflict, riskIntelligence());
  check("14. context.conflict === the exact conflict object passed in (reference preserved)", ctx?.conflict === conflict, "conflict was cloned or reconstructed instead of referenced");
}

// 15. Hypotheses object reference is preserved -------------------------------------------
{
  const hyps = hypothesisSet();
  const ctx = buildDecisionContext(observation(), hyps, conflictState(), riskIntelligence());
  check("15. context.hypotheses === the exact hypotheses object passed in (reference preserved)", ctx?.hypotheses === hyps, "hypotheses was cloned or reconstructed instead of referenced");
}

// 16. Risk contains exactly overall + contextQuality ---------------------------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence({ overall: "MODERATE", contextQuality: "mixed" }));
  const keys = ctx?.risk ? Object.keys(ctx.risk).sort() : [];
  check("16. context.risk contains exactly {overall, contextQuality}", JSON.stringify(keys) === JSON.stringify(["contextQuality", "overall"]) && ctx?.risk?.overall === "MODERATE" && ctx?.risk?.contextQuality === "mixed", `got keys=${JSON.stringify(keys)} risk=${JSON.stringify(ctx?.risk)}`);
}

// 17. Risk must NOT contain factors ------------------------------------------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence());
  const riskAny = ctx?.risk as unknown as Record<string, unknown> | null;
  check("17. context.risk never contains a 'factors' key", !!riskAny && !("factors" in riskAny), `got ${JSON.stringify(ctx?.risk)}`);
}

// 18. Context contains exactly four top-level fields ---------------------------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence());
  const keys = ctx ? Object.keys(ctx).sort() : [];
  check("18. CognitiveDecisionContext has exactly {observation, hypotheses, conflict, risk} — nothing extra", JSON.stringify(keys) === JSON.stringify(["conflict", "hypotheses", "observation", "risk"]), `got keys=${JSON.stringify(keys)}`);
}

// 19. No timestamp is generated ------------------------------------------------------------
{
  const ctx = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence());
  const ctxAny = ctx as unknown as Record<string, unknown> | null;
  check("19. No timestamp/generatedAt field exists on CognitiveDecisionContext itself (only nested inside observation, which already had one)", !!ctxAny && !("generatedAt" in ctxAny) && !("timestamp" in ctxAny), `got top-level keys=${ctx ? Object.keys(ctx).join(",") : "null"}`);
}

// 20. No network/database/LLM dependency exists ---------------------------------------------
{
  const contextModule = await import("@/lib/ai/cognitive/context");
  const exportedFunctionKeys = Object.keys(contextModule).filter((k) => typeof (contextModule as unknown as Record<string, unknown>)[k] === "function");
  check("20. context.ts exposes only buildDecisionContext as a runtime function export — no fetch/Supabase/database/LLM surface", JSON.stringify(exportedFunctionKeys) === JSON.stringify(["buildDecisionContext"]), `function exports=${exportedFunctionKeys.join(",")}`);
}

// 21. Structural dependency check: no Phase 7 intelligence-producing function import ---------
{
  const view = await import("node:fs/promises");
  const source = await view.readFile(new URL("../../lib/ai/cognitive/context.ts", import.meta.url), "utf-8");
  const forbiddenImports = ["gradeConfluence", "computeConfluence", "buildOracleRiskPlan", "buildMtfContext", "classifyMarketRegime", "buildLiquidityOrderFlowContext", "buildScenarios", "classifyContradictions", "arbitrateDecision", "buildRiskIntelligence", "buildOracleReasoning", "normalizeEvidence", "buildHypotheses", "resolveCognitiveConflict", "createWorkingMemory", "buildCognitiveObservation"];
  const foundForbidden = forbiddenImports.filter((name) => source.includes(name));
  check("21. context.ts does not import any Phase 7/8 intelligence-producing function — types only", foundForbidden.length === 0, `found=${foundForbidden.join(",")}`);
}

// 22. Equivalent but separately-created deep-equal inputs produce deep-equal results ----------
{
  const a = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence());
  const b = buildDecisionContext(observation(), hypothesisSet(), conflictState(), riskIntelligence());
  check("22. Separately-constructed but deep-equal inputs -> deep-equal output", JSON.stringify(a) === JSON.stringify(b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

console.log(failures === 0 ? "\nAll Phase 8.0.5 cognitive decision context fixtures passed." : `\n${failures} Phase 8.0.5 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
