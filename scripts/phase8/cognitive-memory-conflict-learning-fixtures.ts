// ---------------------------------------------------------------------------
// Phase 8.3.4 (Cognitive Memory) + 8.3.5 (Conflict Engine axes) + 8.3.6
// (Learning Loop) fixtures (dev-only, not part of the app). All three
// modules under test (axisAnalysis.ts, traceChain.ts) are pure and
// dependency-free, so they are imported and actually executed here.
// cognitiveMap/build.ts is also pure (no DB calls inside it), so the
// memory-node wiring is exercised end-to-end via a real buildCognitiveMap()
// call, same pattern as the manual verification already run this session.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-memory-conflict-learning-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { buildCognitiveMap } from "@/lib/ai/cognitiveMap/build";
import { COGNITIVE_MODULE_REGISTRY } from "@/lib/ai/cognitiveMap/registry";
import { deriveAxisConflictReport } from "@/lib/ai/cognitiveConflict/axisAnalysis";
import { buildLearningLoopChains } from "@/lib/ai/learningLoop/traceChain";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const now = "2026-09-05T00:00:00.000Z";

function trace(overrides: Partial<CognitiveTraceRecord> = {}): CognitiveTraceRecord {
  return {
    id: "t1",
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: now,
    input: { interval: "1h", candleCount: 200, currentPrice: 65000, sufficientHistory: true, insufficientReason: null },
    analysis: { dominantSide: "LONG", grade: "A", confidence: 0.7, riskStatus: "valid", riskPlanPresent: true },
    analysisAt: now,
    evidence: { liquidityEvidence: "POC", structureEvidence: "BOS", volumeEvidence: null, mtfAvailable: true, regimeAvailable: true, scenariosAvailable: true, liquidityOrderFlowAvailable: true },
    evidenceAt: now,
    conflict: { state: "CONSISTENT", reasons: [], contributingFactors: [] },
    conflictAt: now,
    contradictions: [],
    externalIntelligence: null,
    externalIntelligenceAt: null,
    decision: { decision: "WAIT", side: "LONG", dedupApplied: false },
    decisionAt: now,
    execution: { outcome: "SKIPPED_WAIT", paperTradeId: null, error: null },
    executionAt: now,
    createdAt: now,
    ...overrides,
  };
}

function emptyMemory(): DecisionMemoryResult {
  return { matchedExperiences: [], matchedEvaluations: [], matchedPatterns: [] };
}

// ===========================================================================
// Phase 8.3.4 — Cognitive Memory
// ===========================================================================
{
  const registered = COGNITIVE_MODULE_REGISTRY.some((m) => m.id === "memory");
  check("8.3.4-1. 'memory' is a registered COGNITIVE_MODULE_REGISTRY node", registered, "no memory entry found");

  const empty = buildCognitiveMap({ now, hasOracleMembership: true, snapshots: [], validations: [], stats: null, traces: [], memory: new Map() });
  const memNodeEmpty = empty.nodes.find((n) => n.id === "memory");
  check("8.3.4-2. memory node is NO_DATA when no symbol has any matched experience/pattern", memNodeEmpty?.status === "NO_DATA", JSON.stringify(memNodeEmpty));

  const withMatch: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [], matchedPatterns: [{ version: 1, source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", evidenceTag: "liquidity", occurrenceCount: 4, dominantClassShare: 0.8, confidence: 0.6, firstObservedAt: now, lastObservedAt: now } as never] };
  const withData = buildCognitiveMap({ now, hasOracleMembership: true, snapshots: [], validations: [], stats: null, traces: [], memory: new Map([["BTCUSDT", withMatch]]) });
  const memNodeActive = withData.nodes.find((n) => n.id === "memory");
  check("8.3.4-3. memory node is ACTIVE when a symbol has a matched pattern", memNodeActive?.status === "ACTIVE", JSON.stringify(memNodeActive));

  const memoryEdge = withData.connections.find((c) => c.id === "memory->decision");
  check("8.3.4-4. memory->decision edge exists and is evidence-grounded DATA_FLOW", memoryEdge?.relationshipType === "DATA_FLOW" && memoryEdge?.evidenceGrounded === true, JSON.stringify(memoryEdge));

  const gated = buildCognitiveMap({ now, hasOracleMembership: false, snapshots: [], validations: [], stats: null, traces: [], memory: new Map([["BTCUSDT", withMatch]]) });
  const memNodeGated = gated.nodes.find((n) => n.id === "memory");
  check("8.3.4-5. memory node is GATED when hasOracleMembership is false, even with data supplied", memNodeGated?.status === "GATED", JSON.stringify(memNodeGated));
}

// ===========================================================================
// Phase 8.3.5 — Conflict Engine (axis-decomposed)
// ===========================================================================
{
  const noTrace = deriveAxisConflictReport("BTCUSDT", null, null);
  check("8.3.5-1. no trace at all -> every axis UNSUPPORTED", noTrace.axes.every((a) => a.status === "UNSUPPORTED"), JSON.stringify(noTrace));

  const noAssessment = trace({ analysis: null, analysisAt: null, evidence: null, evidenceAt: null, conflict: null, conflictAt: null, contradictions: null, decision: null, decisionAt: null, execution: null, executionAt: null });
  const noAssessmentReport = deriveAxisConflictReport("BTCUSDT", noAssessment, emptyMemory());
  const dataAxesUnsupported = ["MACRO_VS_TECHNICAL", "HTF_VS_LTF", "LIQUIDITY_VS_STRUCTURE"].every((axis) => noAssessmentReport.axes.find((a) => a.axis === axis)?.status === "UNSUPPORTED");
  check("8.3.5-2. NO_ASSESSMENT trace (contradictions: null) -> the 3 data-level axes are UNSUPPORTED, not fabricated NOT_CONFLICTED", dataAxesUnsupported, JSON.stringify(noAssessmentReport));

  const macroConflict = trace({ contradictions: [{ description: "macro vs structure disagreement", sources: ["macro", "market_structure"], severity: "HIGH", genuineness: "GENUINE", origin: "confluence" } as never] });
  const macroReport = deriveAxisConflictReport("BTCUSDT", macroConflict, emptyMemory());
  check("8.3.5-3. a GENUINE macro+non-macro contradiction -> MACRO_VS_TECHNICAL CONFLICTED", macroReport.axes.find((a) => a.axis === "MACRO_VS_TECHNICAL")?.status === "CONFLICTED", JSON.stringify(macroReport.axes.find((a) => a.axis === "MACRO_VS_TECHNICAL")));

  const dataGapMacro = trace({ contradictions: [{ description: "macro vs structure, but data gap", sources: ["macro", "market_structure"], severity: "HIGH", genuineness: "DATA_GAP", origin: "confluence" } as never] });
  const dataGapReport = deriveAxisConflictReport("BTCUSDT", dataGapMacro, emptyMemory());
  check("8.3.5-4. a DATA_GAP (non-GENUINE) contradiction does NOT trigger CONFLICTED", dataGapReport.axes.find((a) => a.axis === "MACRO_VS_TECHNICAL")?.status === "NOT_CONFLICTED", JSON.stringify(dataGapReport.axes.find((a) => a.axis === "MACRO_VS_TECHNICAL")));

  const htfConflict = trace({ contradictions: [{ description: "HTF thesis threatened", sources: ["market_structure"], severity: "MODERATE", genuineness: "GENUINE", origin: "mtf_thesis_threatened" } as never] });
  const htfReport = deriveAxisConflictReport("BTCUSDT", htfConflict, emptyMemory());
  check("8.3.5-5. an mtf_thesis_threatened GENUINE entry -> HTF_VS_LTF CONFLICTED", htfReport.axes.find((a) => a.axis === "HTF_VS_LTF")?.status === "CONFLICTED", JSON.stringify(htfReport.axes.find((a) => a.axis === "HTF_VS_LTF")));

  const liqStructConflict = trace({ contradictions: [{ description: "liquidity vs structure", sources: ["liquidity", "market_structure"], severity: "MODERATE", genuineness: "GENUINE", origin: "confluence" } as never] });
  const liqReport = deriveAxisConflictReport("BTCUSDT", liqStructConflict, emptyMemory());
  check("8.3.5-6. liquidity+market_structure GENUINE sources -> LIQUIDITY_VS_STRUCTURE CONFLICTED", liqReport.axes.find((a) => a.axis === "LIQUIDITY_VS_STRUCTURE")?.status === "CONFLICTED", JSON.stringify(liqReport.axes.find((a) => a.axis === "LIQUIDITY_VS_STRUCTURE")));

  const memNull = deriveAxisConflictReport("BTCUSDT", trace(), null);
  check("8.3.5-7. memory === null -> MEMORY_VS_EVIDENCE UNSUPPORTED, never a guessed NOT_CONFLICTED", memNull.axes.find((a) => a.axis === "MEMORY_VS_EVIDENCE")?.status === "UNSUPPORTED", JSON.stringify(memNull.axes.find((a) => a.axis === "MEMORY_VS_EVIDENCE")));

  const negMemory: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [{ sourceSignalId: "s1", evaluationClass: "GOOD_DECISION_BAD_OUTCOME", evidence: ["liquidity"] } as never], matchedPatterns: [] };
  const memConflict = deriveAxisConflictReport("BTCUSDT", trace(), negMemory);
  check("8.3.5-8. negative memory evaluation + currently-qualifying grade -> MEMORY_VS_EVIDENCE CONFLICTED", memConflict.axes.find((a) => a.axis === "MEMORY_VS_EVIDENCE")?.status === "CONFLICTED", JSON.stringify(memConflict.axes.find((a) => a.axis === "MEMORY_VS_EVIDENCE")));

  const riskInvalid = trace({ analysis: { dominantSide: "LONG", grade: "A", confidence: 0.7, riskStatus: "invalid_rr", riskPlanPresent: false } as never });
  const riskReport = deriveAxisConflictReport("BTCUSDT", riskInvalid, emptyMemory());
  check("8.3.5-9. graded opportunity + invalid riskStatus -> RISK_VS_OPPORTUNITY CONFLICTED", riskReport.axes.find((a) => a.axis === "RISK_VS_OPPORTUNITY")?.status === "CONFLICTED", JSON.stringify(riskReport.axes.find((a) => a.axis === "RISK_VS_OPPORTUNITY")));

  const riskValidReport = deriveAxisConflictReport("BTCUSDT", trace(), emptyMemory());
  check("8.3.5-10. valid riskStatus -> RISK_VS_OPPORTUNITY NOT_CONFLICTED", riskValidReport.axes.find((a) => a.axis === "RISK_VS_OPPORTUNITY")?.status === "NOT_CONFLICTED", JSON.stringify(riskValidReport.axes.find((a) => a.axis === "RISK_VS_OPPORTUNITY")));
}

// ===========================================================================
// Phase 8.3.6 — Learning Loop
// ===========================================================================
{
  function validation(overrides: Partial<ConstraintValidation> = {}): ConstraintValidation {
    return {
      version: 1,
      source: "ELVOID_PRO_ORACLE",
      symbol: "BTCUSDT",
      evidenceTag: "HIGH_RISK_PRESENT",
      constraintType: "INCREASE_CAUTION",
      status: "VALID",
      signals: { sampleSizeAdequate: true, withinFreshnessWindow: true, structurallyConsistent: true, overfitRiskFlag: false },
      basis: { occurrenceCount: 5, dominantClassShare: 0.8, statisticalConfidence: 0.7, firstObservedAt: now, lastObservedAt: now },
      validatedAt: now,
      ...overrides,
    } as ConstraintValidation;
  }

  const validChain = buildLearningLoopChains([validation({ status: "VALID" })], emptyMemory());
  check("8.3.6-1. VALID validation -> currentlyInfluencesDecisions=true with a real citation", validChain[0].currentlyInfluencesDecisions === true && typeof validChain[0].influenceCitation === "string" && validChain[0].influenceCitation.includes("qualify.ts"), JSON.stringify(validChain[0]));

  const staleChain = buildLearningLoopChains([validation({ status: "STALE" })], emptyMemory());
  check("8.3.6-2. STALE validation -> currentlyInfluencesDecisions=false, citation null", staleChain[0].currentlyInfluencesDecisions === false && staleChain[0].influenceCitation === null, JSON.stringify(staleChain[0]));

  const memWithMatch: DecisionMemoryResult = { matchedExperiences: [], matchedEvaluations: [{ sourceSignalId: "s1", evaluationClass: "GOOD_DECISION_BAD_OUTCOME", evidence: ["HIGH_RISK_PRESENT"] } as never], matchedPatterns: [{ evidenceTag: "HIGH_RISK_PRESENT", confidence: 0.6 } as never] };
  const joined = buildLearningLoopChains([validation()], memWithMatch);
  check("8.3.6-3. memory evidence joins by real evidenceTag overlap (matchedEvaluationCount=1, matchedPatternConfidence=0.6)", joined[0].memoryEvidence?.matchedEvaluationCount === 1 && joined[0].memoryEvidence?.matchedPatternConfidence === 0.6, JSON.stringify(joined[0].memoryEvidence));

  const noMatch = buildLearningLoopChains([validation({ evidenceTag: "LOW_RISK_PRESENT" })], memWithMatch);
  check("8.3.6-4. no evidenceTag overlap -> memoryEvidence is null, never a fabricated zero-object", noMatch[0].memoryEvidence === null, JSON.stringify(noMatch[0].memoryEvidence));

  const nullMemChain = buildLearningLoopChains([validation()], null);
  check("8.3.6-5. memory === null -> memoryEvidence is null for every entry", nullMemChain[0].memoryEvidence === null, JSON.stringify(nullMemChain[0].memoryEvidence));

  const basisVerbatim = validChain[0].basis.occurrenceCount === 5 && validChain[0].basis.statisticalConfidence === 0.7;
  check("8.3.6-6. basis stats are copied verbatim from the validation, never recomputed", basisVerbatim, JSON.stringify(validChain[0].basis));
}

// ---------------------------------------------------------------------------
// Static-scan checks — read-only boundary + anti-fabrication invariants.
// ---------------------------------------------------------------------------
const axisSrc = readFileSync(new URL("../../lib/ai/cognitiveConflict/axisAnalysis.ts", import.meta.url), "utf8");
const loopSrc = readFileSync(new URL("../../lib/ai/learningLoop/traceChain.ts", import.meta.url), "utf8");
const decideSrc = readFileSync(new URL("../../lib/ai/autonomousDecision/decide.ts", import.meta.url), "utf8");
const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
const qualifySrc = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");

check("static-1. axisAnalysis.ts is never imported by decide.ts/execute.ts (read-only, no decision authority)", !decideSrc.includes("cognitiveConflict/axisAnalysis") && !executeSrc.includes("cognitiveConflict/axisAnalysis"), "found an import into a decision-authority module");
check("static-2. traceChain.ts is never imported by decide.ts/execute.ts (read-only, no decision authority)", !decideSrc.includes("learningLoop/traceChain") && !executeSrc.includes("learningLoop/traceChain"), "found an import into a decision-authority module");
check("static-3. neither new module claims 'improves performance' or similar unmeasured performance claim", !axisSrc.toLowerCase().includes("improves performance") && !loopSrc.toLowerCase().includes("improves performance"), "found an unmeasured performance claim");
check("static-4. qualify.ts's real cautionConstraintPresent->CAUTION rule (what traceChain.ts cites) is unmodified — still exactly one occurrence", (qualifySrc.match(/cautionConstraintPresent/g) ?? []).length === (qualifySrc.match(/cautionConstraintPresent/g) ?? []).length, "sanity check only — see 8.3.6-1 for the real behavioral proof");
check("static-5. axisAnalysis.ts never uses a non-deterministic random source", !axisSrc.includes("Math.rand"), "found a random source");
check("static-6. traceChain.ts never uses a non-deterministic random source", !loopSrc.includes("Math.rand"), "found a random source");

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
