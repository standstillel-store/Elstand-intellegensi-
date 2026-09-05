// ---------------------------------------------------------------------------
// Phase 8.3.2 — Cognitive Trace fixtures (dev-only, not part of the app).
//
// contracts.ts has zero runtime logic (type definitions only — unlike
// decisionTrace/contracts.ts's `validateDecisionTraceInput`), so there is no
// pure function to unit-test in isolation. This script instead:
//   (a) really imports contracts.ts's types and constructs both a
//       NO_ASSESSMENT-shaped and a full 6-stage `CognitiveTraceInput` —
//       exercising real TypeScript syntax/shape validity (`import type` is
//       erased by --experimental-strip-types, so this costs nothing at
//       runtime but still fails loudly on a real syntax error).
//   (b) static source-scan checks for repository.ts/schema.sql/
//       orchestrator.ts — repository.ts transitively imports
//       @supabase/supabase-js via lib/ai/learning/db.ts, unavailable in
//       this sandbox (no node_modules/network) — same, already-documented
//       constraint every prior 8.1.x/8.2.x fixture script works around by
//       reading repository.ts as text rather than importing it live.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-trace-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import type { CognitiveTraceInput } from "@/lib/ai/cognitiveTrace/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders — real values typed against the real contract. A field
// renamed/removed in contracts.ts without updating this file would fail
// TypeScript's structural check the moment a real `tsc` run is possible;
// today's --experimental-strip-types pass at least confirms the shape
// parses and every referenced field name exists in this file's own object
// literals.
// ---------------------------------------------------------------------------

function noAssessmentTrace(): CognitiveTraceInput {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: "2026-09-05T00:00:00.000Z",
    input: { interval: "1h", candleCount: 4, currentPrice: null, sufficientHistory: false, insufficientReason: "Candle history tidak cukup." },
    analysis: null,
    analysisAt: null,
    evidence: null,
    evidenceAt: null,
    conflict: null,
    conflictAt: null,
    decision: null,
    decisionAt: null,
    execution: null,
    executionAt: null,
  };
}

function fullTrace(): CognitiveTraceInput {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: "2026-09-05T00:00:00.000Z",
    input: { interval: "1h", candleCount: 200, currentPrice: 65000, sufficientHistory: true, insufficientReason: null },
    analysis: { dominantSide: "LONG", grade: "A", confidence: 0.74, riskStatus: "valid", riskPlanPresent: true },
    analysisAt: "2026-09-05T00:00:00.400Z",
    evidence: { liquidityEvidence: "POC 64800", structureEvidence: "BOS bullish H1", volumeEvidence: null, mtfAvailable: true, regimeAvailable: true, scenariosAvailable: true, liquidityOrderFlowAvailable: true },
    evidenceAt: "2026-09-05T00:00:00.800Z",
    conflict: { state: "CONSISTENT", reasons: ["Arbitration STRONGLY_SUPPORTED tanpa kontradiksi genuine."], contributingFactors: [{ source: "arbitration", detail: "arbitration.alignment = STRONGLY_SUPPORTED" }] },
    conflictAt: "2026-09-05T00:00:00.820Z",
    decision: { decision: "EXECUTE", side: "LONG", dedupApplied: false },
    decisionAt: "2026-09-05T00:00:01.100Z",
    execution: { outcome: "EXECUTED", paperTradeId: "trade-1", error: null },
    executionAt: "2026-09-05T00:00:01.400Z",
  };
}

// ===========================================================================
// 1. A NO_ASSESSMENT-shaped input is a valid CognitiveTraceInput — every
//    post-input field null together, matching the module's own invariant.
// ===========================================================================
{
  const t = noAssessmentTrace();
  const allNull = t.analysis === null && t.evidence === null && t.conflict === null && t.decision === null && t.execution === null && t.analysisAt === null && t.evidenceAt === null && t.conflictAt === null && t.decisionAt === null && t.executionAt === null;
  check("1. NO_ASSESSMENT-shaped input: every post-INPUT stage/timestamp is null together", allNull, JSON.stringify(t));
}

// ===========================================================================
// 2. A full trace's timestamps are monotonically non-decreasing — the
//    real orchestrator captures them in this exact order.
// ===========================================================================
{
  const t = fullTrace();
  const order = [t.cycleAt, t.analysisAt, t.evidenceAt, t.conflictAt, t.decisionAt, t.executionAt].map((iso) => Date.parse(iso as string));
  const monotonic = order.every((v, i) => i === 0 || v >= order[i - 1]);
  check("2. full trace: cycleAt <= analysisAt <= evidenceAt <= conflictAt <= decisionAt <= executionAt", monotonic, JSON.stringify(order));
}

// ===========================================================================
// 3. Full trace's conflict stage is the real, unnarrowed CognitiveConflictState
//    shape — state + reasons + contributingFactors, not a bare enum string.
// ===========================================================================
{
  const t = fullTrace();
  const rich = t.conflict !== null && typeof t.conflict === "object" && "state" in t.conflict && "reasons" in t.conflict && "contributingFactors" in t.conflict;
  check("3. conflict stage carries state + reasons + contributingFactors (unnarrowed)", rich, JSON.stringify(t.conflict));
}

// ---------------------------------------------------------------------------
// Static-scan checks — mirrors every prior 8.1.x/8.2.x fixture script's
// convention for repository.ts (requires a live Learning DB / npm-installed
// @supabase/supabase-js, unavailable in this sandbox) and for schema.sql/
// orchestrator.ts invariants a runtime call alone can't observe.
// ---------------------------------------------------------------------------
const contractsSrc = readFileSync(new URL("../../lib/ai/cognitiveTrace/contracts.ts", import.meta.url), "utf8");
const repoSrc = readFileSync(new URL("../../lib/ai/cognitiveTrace/repository.ts", import.meta.url), "utf8");
const schemaSrc = readFileSync(new URL("../../supabase/learning/schema.sql", import.meta.url), "utf8");
const orchestratorSrc = readFileSync(new URL("../../lib/ai/autonomousRuntime/orchestrator.ts", import.meta.url), "utf8");

// 4. repository.ts degrades gracefully (not_configured) rather than throwing when the Learning DB is unconfigured.
{
  const hasDegradePath = repoSrc.includes('return { persisted: false, reason: "not_configured" }') && repoSrc.includes("if (!learningDb) return [];");
  check("4. repository.ts has the not_configured / empty-array degrade-gracefully paths", hasDegradePath, "degrade-gracefully pattern not found");
}

// 5. No Main Supabase client import — Learning DB only.
{
  const hit = repoSrc.includes('from "@/lib/supabase"') || repoSrc.includes("from '@/lib/supabase'");
  check("5. repository.ts never imports the Main Supabase client (Learning DB only)", !hit, "found Main DB import");
}

// 6. No UPDATE/UPSERT call anywhere in repository.ts — insert-only, immutable.
{
  const hasMutatingUpdate = /\.(update|upsert)\(/.test(repoSrc);
  check("6. repository.ts has no update()/upsert() call — insert-only (immutable rows)", !hasMutatingUpdate, "found update()/upsert()");
}

// 7. repository.ts writes only to cognitive_trace (no other table name appears in a write call).
{
  const writesToOtherTable = /\.from\(["'](?!cognitive_trace)[a-z_]+["']\)\s*\.\s*(insert|update|upsert|delete)/.test(repoSrc);
  check("7. repository.ts writes only to cognitive_trace (static scan)", !writesToOtherTable, "found a write to a different table");
}

// 8. contracts.ts contains no OUTCOME/LEARNING stage type — deliberately out of scope this phase (see module header).
{
  const hasOutcomeOrLearningStage = /CognitiveTrace(Outcome|Learning)Stage/.test(contractsSrc);
  check("8. contracts.ts defines no CognitiveTraceOutcomeStage/CognitiveTraceLearningStage (deliberately deferred)", !hasOutcomeOrLearningStage, "found an OUTCOME/LEARNING stage type");
}

// 9. contracts.ts reuses CognitiveConflictState verbatim rather than redefining conflict shape.
{
  const reusesConflictState = contractsSrc.includes('import type { CognitiveConflictState } from "@/lib/ai/cognitive/conflict"') && contractsSrc.includes("CognitiveTraceConflictStage = CognitiveConflictState");
  check("9. conflict stage reuses CognitiveConflictState verbatim (no second conflict schema)", reusesConflictState, "conflict stage does not alias CognitiveConflictState");
}

// 10. schema.sql: cognitive_trace table defined exactly once (additive, append-only file edit).
{
  const occurrences = (schemaSrc.match(/create table if not exists cognitive_trace/g) ?? []).length;
  check("10. cognitive_trace table defined exactly once in schema.sql", occurrences === 1, `found ${occurrences} definitions`);
}

// 11. schema.sql: cognitive_trace.source is a single-value CHECK ('ELVOID_PRO_ORACLE' only), matching decision_traces/autonomous_intelligence_snapshot.
{
  const chunk = schemaSrc.slice(schemaSrc.indexOf("create table if not exists cognitive_trace"));
  const singleValueSource = /source text not null check \(source in \('ELVOID_PRO_ORACLE'\)\)/.test(chunk);
  check("11. cognitive_trace.source is a single-value CHECK ('ELVOID_PRO_ORACLE' only)", singleValueSource, "source CHECK not single-valued");
}

// 12. schema.sql: RLS enabled with no policy (service-role-only), same as every other table.
{
  const chunk = schemaSrc.slice(schemaSrc.indexOf("create table if not exists cognitive_trace"));
  const rlsEnabledNoPolicy = chunk.includes("alter table cognitive_trace enable row level security") && !chunk.includes("create policy");
  check("12. cognitive_trace has RLS enabled with no policy (service-role-only)", rlsEnabledNoPolicy, "RLS/policy convention not matched");
}

// 13. orchestrator.ts calls persistCognitiveTrace exactly 3 times (2 NO_ASSESSMENT exits + 1 full end-of-cycle write) — every real exit point covered, none doubled up.
{
  const occurrences = (orchestratorSrc.match(/persistCognitiveTrace\(\{/g) ?? []).length;
  check("13. orchestrator.ts calls persistCognitiveTrace at exactly 3 real exit points", occurrences === 3, `found ${occurrences} call sites`);
}

// 14. Every persistCognitiveTrace call in orchestrator.ts is awaited-with-catch (best-effort — a Learning DB outage can never fail the cycle).
{
  const calls = orchestratorSrc.split("persistCognitiveTrace({").length - 1;
  const bestEffortCalls = (orchestratorSrc.match(/await persistCognitiveTrace\(\{[\s\S]*?\}\)\.catch\(\(\) => \{\}\);/g) ?? []).length;
  check("14. every persistCognitiveTrace call is awaited with .catch(() => {}) (best-effort)", calls === bestEffortCalls && calls === 3, `${bestEffortCalls}/${calls} calls are best-effort`);
}

// 15. orchestrator.ts's Step 10 persist call passes cognitiveConflictInternal verbatim as `conflict` — never a narrowed/rebuilt object.
{
  const hasVerbatimConflict = /conflict:\s*cognitiveConflictInternal,/.test(orchestratorSrc);
  check("15. Step 10 passes cognitiveConflictInternal verbatim as the conflict stage (no narrowing)", hasVerbatimConflict, "conflict field is not a verbatim pass-through");
}

// 16. orchestrator.ts still has exactly one `export async function runAutonomousCycle` — Phase 8.3.2 added calls inside it, never a second entry point.
{
  const occurrences = (orchestratorSrc.match(/export async function runAutonomousCycle/g) ?? []).length;
  check("16. exactly one runAutonomousCycle export in orchestrator.ts (no duplicated entry point)", occurrences === 1, `found ${occurrences}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
