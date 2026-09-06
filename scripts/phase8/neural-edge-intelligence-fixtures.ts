// ---------------------------------------------------------------------------
// Phase 8.3.3 — Neural Edge Intelligence fixtures (dev-only, not part of the
// app). edgeIntelligence.ts has zero external/DB dependencies (pure
// functions over already-fetched data), so it is imported and actually
// executed here — unlike lib/ai/cognitiveTrace/repository.ts (needs
// @supabase/supabase-js, unavailable in this sandbox), this module's real
// logic can be exercised directly.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/neural-edge-intelligence-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { classifyStructuralEdges, deriveDynamicEdges, STATIC_EDGE_CLASSIFICATION, type LearningInfluenceSource } from "@/lib/ai/cognitiveMap/edgeIntelligence";
import type { IntelligenceConnection } from "@/lib/ai/cognitiveMap/contracts";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const REGISTERED_NODE_IDS = new Set(["market", "macro", "pattern", "oracle", "risk", "decision", "execution", "learning", "memory"]);

const STRUCTURAL_EDGE_DEFS: readonly [string, string][] = [
  ["market", "macro"],
  ["market", "pattern"],
  ["macro", "oracle"],
  ["pattern", "oracle"],
  ["oracle", "risk"],
  ["risk", "decision"],
  ["decision", "execution"],
  ["execution", "learning"],
  ["memory", "decision"],
  ["learning", "oracle"],
];

function baseConnections(now: string): IntelligenceConnection[] {
  return STRUCTURAL_EDGE_DEFS.map(([from, to]) => ({
    id: `${from}->${to}`,
    from,
    to,
    active: true,
    lastActivatedAt: now,
    relationshipType: null,
    direction: "FORWARD",
    strength: null,
    evidenceRefs: [],
    evidenceGrounded: false,
    unsupportedReason: null,
    isDynamic: false,
  }));
}

function trace(overrides: Partial<CognitiveTraceRecord>): CognitiveTraceRecord {
  return {
    id: "t1",
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: "2026-09-05T00:00:00.000Z",
    input: { interval: "1h", candleCount: 200, currentPrice: 65000, sufficientHistory: true, insufficientReason: null },
    analysis: null,
    analysisAt: null,
    evidence: null,
    evidenceAt: null,
    conflict: null,
    conflictAt: null,
    contradictions: null,
    decision: null,
    decisionAt: null,
    execution: null,
    executionAt: null,
    createdAt: "2026-09-05T00:00:01.000Z",
    ...overrides,
  };
}

const now = "2026-09-05T00:00:00.000Z";
const structural = classifyStructuralEdges(baseConnections(now));

// ===========================================================================
// 1. Valid edge direction — every edge's `direction` is a closed value, and
//    no edge is a self-reference (from !== to).
// ===========================================================================
{
  const validDirections = structural.every((e) => e.direction === "FORWARD" || e.direction === "BIDIRECTIONAL");
  check("1a. every structural edge has a valid direction (FORWARD/BIDIRECTIONAL)", validDirections, JSON.stringify(structural.map((e) => e.direction)));
  const noSelfRef = structural.every((e) => e.from !== e.to);
  check("1b. no structural edge is a self-reference (from !== to)", noSelfRef, JSON.stringify(structural.filter((e) => e.from === e.to)));
}

// ===========================================================================
// 2. No self-reference invalid edge — same check extended to dynamic edges.
// ===========================================================================
{
  const conflictedTrace = new Map([["BTCUSDT", trace({ conflict: { state: "CONFLICTED", reasons: ["Arbitration vs contradiction mismatch."], contributingFactors: [{ source: "arbitration", detail: "x" }] }, conflictAt: "2026-09-05T00:00:00.800Z" })]]);
  const influenceSnapshot = new Map<string, LearningInfluenceSource>([["BTCUSDT", { symbol: "BTCUSDT", updatedAt: now, learningInfluence: "3 matched experiences, 1 matched pattern" }]]);
  const dynamic = deriveDynamicEdges(conflictedTrace, influenceSnapshot);
  check("2. no dynamic edge is a self-reference (from !== to)", dynamic.every((e) => e.from !== e.to), JSON.stringify(dynamic.filter((e) => e.from === e.to)));
  check("2b. dynamic edges produced exactly when evidence exists (2 here: CONTRADICTION + LEARNING_INFLUENCE)", dynamic.length === 2, `got ${dynamic.length}`);
}

// ===========================================================================
// 3. Source/target traceability — every edge's from/to resolve to a real
//    registered node id (COGNITIVE_MODULE_REGISTRY, 8.3.1).
// ===========================================================================
{
  const allEdges = [...structural, ...deriveDynamicEdges(new Map([["BTCUSDT", trace({ conflict: { state: "CONFLICTED", reasons: [], contributingFactors: [] } })]]), new Map())];
  const untraceable = allEdges.filter((e) => !REGISTERED_NODE_IDS.has(e.from) || !REGISTERED_NODE_IDS.has(e.to));
  check("3. every edge's from/to is a registered COGNITIVE_MODULE_REGISTRY node id", untraceable.length === 0, JSON.stringify(untraceable));
}

// ===========================================================================
// 4. Unsupported causal claim rejected — the three pairs with no real
//    call-graph evidence must carry relationshipType: null, not a fabricated
//    type, and must explain why.
// ===========================================================================
{
  const unsupportedIds = ["market->macro", "macro->oracle", "learning->oracle"];
  const ok = unsupportedIds.every((id) => {
    const e = structural.find((x) => x.id === id);
    return e && e.relationshipType === null && e.evidenceGrounded === false && typeof e.unsupportedReason === "string" && e.unsupportedReason.length > 0;
  });
  check("4a. the 3 call-graph-unsupported pairs carry relationshipType: null with a real unsupportedReason (no invented causation)", ok, JSON.stringify(structural.filter((e) => unsupportedIds.includes(e.id))));

  // No CONTRADICTION/LEARNING_INFLUENCE fires without triggering evidence.
  const noEvidence = deriveDynamicEdges(new Map(), new Map());
  check("4b. no dynamic edge is produced when no trace/snapshot evidence is supplied", noEvidence.length === 0, JSON.stringify(noEvidence));

  const nonConflicted = deriveDynamicEdges(new Map([["BTCUSDT", trace({ conflict: { state: "CONSISTENT", reasons: [], contributingFactors: [] } })]]), new Map());
  check("4c. CONTRADICTION is not produced when the latest trace's conflict.state is not CONFLICTED", nonConflicted.length === 0, JSON.stringify(nonConflicted));
}

// ===========================================================================
// 5. Relationship type consistency — evidenceGrounded is true iff
//    relationshipType !== null iff unsupportedReason === null, for every
//    edge this module can produce.
// ===========================================================================
{
  const allEdges = [...structural, ...deriveDynamicEdges(new Map([["BTCUSDT", trace({ conflict: { state: "CONFLICTED", reasons: ["r"], contributingFactors: [{ source: "arbitration", detail: "d" }] } })]]), new Map([["BTCUSDT", { symbol: "BTCUSDT", updatedAt: now, learningInfluence: "note" }]]))];
  const consistent = allEdges.every((e) => (e.relationshipType !== null) === e.evidenceGrounded && (e.unsupportedReason === null) === (e.relationshipType !== null));
  check("5. evidenceGrounded / relationshipType / unsupportedReason are mutually consistent on every edge", consistent, JSON.stringify(allEdges.filter((e) => (e.relationshipType !== null) !== e.evidenceGrounded)));

  const strengthRange = allEdges.every((e) => e.strength === null || (e.strength >= 0 && e.strength <= 1));
  check("5b. every edge's strength is null or within [0, 1] — never a fabricated out-of-range value", strengthRange, JSON.stringify(allEdges.map((e) => e.strength)));
}

// ---------------------------------------------------------------------------
// 6. Existing pipeline unchanged — static-scan checks.
// ---------------------------------------------------------------------------
const edgeIntelSrc = readFileSync(new URL("../../lib/ai/cognitiveMap/edgeIntelligence.ts", import.meta.url), "utf8");
const orchestratorSrc = readFileSync(new URL("../../lib/ai/autonomousRuntime/orchestrator.ts", import.meta.url), "utf8");
const decideSrc = readFileSync(new URL("../../lib/ai/autonomousDecision/decide.ts", import.meta.url), "utf8");
const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");

{
  check("6a. edgeIntelligence.ts never uses Math.random()", !edgeIntelSrc.includes("Math.random"), "found Math.random()");
  check("6b. orchestrator.ts's Step 10 (Phase 8.3.2 persistCognitiveTrace) is untouched — still exactly 3 call sites", (orchestratorSrc.match(/persistCognitiveTrace\(\{/g) ?? []).length === 3, "persistCognitiveTrace call-site count changed");
  check("6c. orchestrator.ts does not import edgeIntelligence.ts — Phase 8.3.3 has no path into decision authority", !orchestratorSrc.includes("cognitiveMap/edgeIntelligence"), "orchestrator.ts imports edgeIntelligence");
  check("6d. autonomousDecision/decide.ts does not import edgeIntelligence.ts", !decideSrc.includes("cognitiveMap/edgeIntelligence"), "decide.ts imports edgeIntelligence");
  check("6e. autonomousExecution/execute.ts does not import edgeIntelligence.ts", !executeSrc.includes("cognitiveMap/edgeIntelligence"), "execute.ts imports edgeIntelligence");
  check("6f. STATIC_EDGE_CLASSIFICATION covers exactly the 10 existing edgeDefs pairs — no added/removed static pair beyond the documented Phase 8.3.4 memory->decision extension", Object.keys(STATIC_EDGE_CLASSIFICATION).length === 10, `found ${Object.keys(STATIC_EDGE_CLASSIFICATION).length}`);
  const gradedCount = Object.values(STATIC_EDGE_CLASSIFICATION).filter((c) => c.type !== null).length;
  check("6g. exactly 7 of the 10 static pairs are evidence-grounded, 3 are honestly unsupported", gradedCount === 7, `${gradedCount} grounded of 10`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
