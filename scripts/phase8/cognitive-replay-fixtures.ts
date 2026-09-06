// ---------------------------------------------------------------------------
// Phase 8.3.7 — Cognitive Replay fixtures (dev-only, not part of the app).
//
// build.ts's only imports are `import type` (all erased by
// --experimental-strip-types) — it has ZERO executable imports, so this
// script really imports and calls `buildCognitiveReplay()` with real
// constructed fixture rows (not just a shape/syntax check). repository.ts
// transitively imports @supabase/supabase-js via lib/ai/learning/db.ts
// (unavailable in this sandbox), so that file is checked by static source
// scan instead — same, already-documented pattern every 8.1.x-8.3.x
// fixture script in this tree uses for repository layers.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-replay-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { buildCognitiveReplay } from "@/lib/ai/cognitiveReplay/build";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function noAssessmentTrace(): CognitiveTraceRecord {
  return {
    id: "trace-no-assessment-1",
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: "2026-09-05T00:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.500Z",
    input: { interval: "1h", candleCount: 4, currentPrice: null, sufficientHistory: false, insufficientReason: "Candle history tidak cukup." },
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
  };
}

/** A full 6-stage cycle that WAITs — no paper trade, so OUTCOME/LEARNING are structurally unreachable (NOT_EXECUTED), not a join failure. */
function fullCycleWaitTrace(): CognitiveTraceRecord {
  return {
    id: "trace-full-wait-1",
    source: "ELVOID_PRO_ORACLE",
    symbol: "ETHUSDT",
    cycleAt: "2026-09-05T01:00:00.000Z",
    createdAt: "2026-09-05T01:00:05.000Z",
    input: { interval: "1h", candleCount: 200, currentPrice: 2500, sufficientHistory: true, insufficientReason: null },
    analysis: { dominantSide: "LONG", grade: "B+", confidence: 0.55, riskStatus: "valid", riskPlanPresent: true },
    analysisAt: "2026-09-05T01:00:01.000Z",
    evidence: { liquidityEvidence: "thin book above", structureEvidence: "range mid", volumeEvidence: "declining", mtfAvailable: true, regimeAvailable: true, scenariosAvailable: true, liquidityOrderFlowAvailable: true },
    evidenceAt: "2026-09-05T01:00:02.000Z",
    conflict: { state: "CAUTIOUS", reasons: ["mixed mtf bias"], contributingFactors: [{ source: "arbitration", detail: "mixed mtf bias" }] },
    conflictAt: "2026-09-05T01:00:03.000Z",
    contradictions: [{ description: "liquidity vs structure disagree on bias", sources: ["liquidity", "market_structure"], severity: "MODERATE", genuineness: "GENUINE", origin: "confluence" }],
    decision: { decision: "WAIT", side: "LONG", dedupApplied: false },
    decisionAt: "2026-09-05T01:00:04.000Z",
    execution: { outcome: "SKIPPED_WAIT", paperTradeId: null, error: null },
    executionAt: "2026-09-05T01:00:04.500Z",
  };
}

/** A full 6-stage cycle that EXECUTES — the only shape for which OUTCOME/LEARNING can ever be joined. */
function fullCycleExecutedTrace(paperTradeId: string): CognitiveTraceRecord {
  const base = fullCycleWaitTrace();
  return {
    ...base,
    id: "trace-full-executed-1",
    symbol: "SOLUSDT",
    decision: { decision: "EXECUTE", side: "LONG", dedupApplied: false },
    conflict: { state: "CONSISTENT", reasons: [], contributingFactors: [] },
    contradictions: [],
    execution: { outcome: "EXECUTED", paperTradeId, error: null },
  };
}

function closedWinningExperience(sourceSignalId: string): DecisionExperienceRecord {
  return {
    id: "exp-1",
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId,
    symbol: "SOLUSDT",
    side: "LONG",
    grade: "B",
    confidence: 0.55,
    decisionTimestamp: "2026-09-05T01:00:04.000Z",
    learningContext: null,
    outcome: { outcomeResult: "win", outcomeRr: 1.8, outcomeProfitPercent: 3.2, outcomeDurationMinutes: 90, outcomeClosedAt: "2026-09-05T02:30:00.000Z" },
    createdAt: "2026-09-05T01:00:05.000Z",
  };
}

function unclosedExperience(sourceSignalId: string): DecisionExperienceRecord {
  return { ...closedWinningExperience(sourceSignalId), outcome: null };
}

function matchingEvaluation(sourceSignalId: string): DecisionEvaluation {
  return {
    version: 1,
    sourceSignalId,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "ALIGNED",
    conflictAlignment: "ALIGNED",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: ["HIGH_GRADE", "CONSISTENT_STATE_PRESENT"],
    evaluatedAt: "2026-09-05T02:30:05.000Z",
  };
}

// ---------------------------------------------------------------------------
// 1. Complete chain — every stage available, incl. OUTCOME/LEARNING
// ---------------------------------------------------------------------------
{
  const paperTradeId = "signal-executed-1";
  const trace = fullCycleExecutedTrace(paperTradeId);
  const experience = closedWinningExperience(paperTradeId);
  const evaluation = matchingEvaluation(paperTradeId);
  const result = buildCognitiveReplay({ trace, experience, evaluation, learningDbConfigured: true });

  check("complete chain: input available", result.input.available === true, JSON.stringify(result.input));
  check("complete chain: analysis available", result.analysis.available === true, JSON.stringify(result.analysis));
  check("complete chain: evidence available", result.evidence.available === true, JSON.stringify(result.evidence));
  check("complete chain: conflict available", result.conflict.available === true, JSON.stringify(result.conflict));
  check("complete chain: contradictions available (empty array is valid data, not unavailable)", result.contradictions.available === true && Array.isArray(result.contradictions.data) && result.contradictions.data.length === 0, JSON.stringify(result.contradictions));
  check("complete chain: decision available", result.decision.available === true, JSON.stringify(result.decision));
  check("complete chain: execution available", result.execution.available === true, JSON.stringify(result.execution));
  check("complete chain: outcome available, verbatim outcomeResult", result.outcome.available === true && (result.outcome.data as any)?.outcomeResult === "win", JSON.stringify(result.outcome));
  check("complete chain: outcome.at === outcomeClosedAt verbatim", result.outcome.at === "2026-09-05T02:30:00.000Z", String(result.outcome.at));
  check("complete chain: learning available, verbatim evaluationClass", result.learning.available === true && (result.learning.data as any)?.evaluationClass === "GOOD_DECISION_GOOD_OUTCOME", JSON.stringify(result.learning));
}

// ---------------------------------------------------------------------------
// 2. MEMORY unavailable — unconditionally, in every case, no exceptions
// ---------------------------------------------------------------------------
{
  for (const [label, trace] of [
    ["NO_ASSESSMENT", noAssessmentTrace()],
    ["full WAIT", fullCycleWaitTrace()],
    ["full EXECUTED", fullCycleExecutedTrace("x")],
  ] as const) {
    const result = buildCognitiveReplay({ trace, learningDbConfigured: true });
    check(`MEMORY unavailable (${label})`, result.memory.available === false && result.memory.data === null && result.memory.at === null && result.memory.unavailableReason === "MEMORY_NOT_PERSISTED_PER_CYCLE", JSON.stringify(result.memory));
    check(`MEMORY limitation prose present (${label})`, result.limitations.some((l) => l.includes("MEMORY stage is never replayable")), JSON.stringify(result.limitations));
  }
}

// ---------------------------------------------------------------------------
// 3. NO_ASSESSMENT cycle — only INPUT available, every other stage honestly unavailable
// ---------------------------------------------------------------------------
{
  const result = buildCognitiveReplay({ trace: noAssessmentTrace(), learningDbConfigured: true });
  check("NO_ASSESSMENT: input available", result.input.available === true, JSON.stringify(result.input));
  check("NO_ASSESSMENT: analysis unavailable, reason NO_ASSESSMENT_CYCLE", result.analysis.available === false && result.analysis.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.analysis));
  check("NO_ASSESSMENT: evidence unavailable", result.evidence.available === false && result.evidence.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.evidence));
  check("NO_ASSESSMENT: conflict unavailable", result.conflict.available === false && result.conflict.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.conflict));
  check("NO_ASSESSMENT: decision unavailable", result.decision.available === false && result.decision.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.decision));
  check("NO_ASSESSMENT: execution unavailable, reason NO_EXECUTION_ATTEMPTED", result.execution.available === false && result.execution.unavailableReason === "NO_EXECUTION_ATTEMPTED", JSON.stringify(result.execution));
  check("NO_ASSESSMENT: outcome unavailable, reason NO_ASSESSMENT_CYCLE (no execution stage at all)", result.outcome.available === false && result.outcome.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.outcome));
  check("NO_ASSESSMENT: learning unavailable, reason NO_ASSESSMENT_CYCLE", result.learning.available === false && result.learning.unavailableReason === "NO_ASSESSMENT_CYCLE", JSON.stringify(result.learning));
}

// ---------------------------------------------------------------------------
// 4. Missing/partial stages — a WAIT cycle: reached DECISION, never EXECUTEd
// ---------------------------------------------------------------------------
{
  const result = buildCognitiveReplay({ trace: fullCycleWaitTrace(), learningDbConfigured: true });
  check("WAIT cycle: decision available (reached this stage)", result.decision.available === true, JSON.stringify(result.decision));
  check("WAIT cycle: execution available (SKIPPED_WAIT is still a real, resolved execution stage)", result.execution.available === true, JSON.stringify(result.execution));
  check("WAIT cycle: outcome unavailable, reason NOT_EXECUTED", result.outcome.available === false && result.outcome.unavailableReason === "NOT_EXECUTED", JSON.stringify(result.outcome));
  check("WAIT cycle: learning unavailable, reason NOT_EXECUTED", result.learning.available === false && result.learning.unavailableReason === "NOT_EXECUTED", JSON.stringify(result.learning));
}

// ---------------------------------------------------------------------------
// 5. Broken/missing joins on an EXECUTED cycle
// ---------------------------------------------------------------------------
{
  const paperTradeId = "signal-executed-2";
  const trace = fullCycleExecutedTrace(paperTradeId);

  // 5a. No decision_experiences row found at all.
  {
    const result = buildCognitiveReplay({ trace, experience: null, evaluation: null, learningDbConfigured: true });
    check("broken join: no experience row -> NO_DECISION_EXPERIENCE_ROW", result.outcome.available === false && result.outcome.unavailableReason === "NO_DECISION_EXPERIENCE_ROW", JSON.stringify(result.outcome));
    check("broken join: no evaluation row (experience also missing) -> NO_DECISION_EVALUATION_ROW", result.learning.available === false && result.learning.unavailableReason === "NO_DECISION_EVALUATION_ROW", JSON.stringify(result.learning));
  }

  // 5b. Trade found but not yet closed.
  {
    const experience = unclosedExperience(paperTradeId);
    const result = buildCognitiveReplay({ trace, experience, evaluation: null, learningDbConfigured: true });
    check("broken join: outcome_result=null -> TRADE_NOT_YET_CLOSED", result.outcome.available === false && result.outcome.unavailableReason === "TRADE_NOT_YET_CLOSED", JSON.stringify(result.outcome));
  }

  // 5c. Trade closed but never evaluated (evaluateAndPersistDecision never ran).
  {
    const experience = closedWinningExperience(paperTradeId);
    const result = buildCognitiveReplay({ trace, experience, evaluation: null, learningDbConfigured: true });
    check("broken join: experience closed, no evaluation row -> NO_DECISION_EVALUATION_ROW", result.learning.available === false && result.learning.unavailableReason === "NO_DECISION_EVALUATION_ROW", JSON.stringify(result.learning));
    check("broken join: outcome still available independent of learning's absence", result.outcome.available === true, JSON.stringify(result.outcome));
  }

  // 5d. Learning DB unconfigured entirely.
  {
    const result = buildCognitiveReplay({ trace, learningDbConfigured: false });
    check("broken join: Learning DB unconfigured -> LEARNING_DB_NOT_CONFIGURED (outcome)", result.outcome.available === false && result.outcome.unavailableReason === "LEARNING_DB_NOT_CONFIGURED", JSON.stringify(result.outcome));
    check("broken join: Learning DB unconfigured -> LEARNING_DB_NOT_CONFIGURED (learning)", result.learning.available === false && result.learning.unavailableReason === "LEARNING_DB_NOT_CONFIGURED", JSON.stringify(result.learning));
  }
}

// ---------------------------------------------------------------------------
// 6. Identity isolation — a joined row whose own (source, symbol) or
//    sourceSignalId disagrees with this trace/paperTradeId must be refused,
//    never silently attached.
// ---------------------------------------------------------------------------
{
  const paperTradeId = "signal-executed-3";
  const trace = fullCycleExecutedTrace(paperTradeId); // symbol: SOLUSDT

  // 6a. Experience row reports a different symbol for the same paperTradeId.
  {
    const wrongSymbolExperience: DecisionExperienceRecord = { ...closedWinningExperience(paperTradeId), symbol: "BTCUSDT" };
    const result = buildCognitiveReplay({ trace, experience: wrongSymbolExperience, evaluation: null, learningDbConfigured: true });
    check("identity isolation: experience.symbol mismatch -> IDENTITY_MISMATCH (outcome)", result.outcome.available === false && result.outcome.unavailableReason === "IDENTITY_MISMATCH", JSON.stringify(result.outcome));
    check("identity isolation: experience.symbol mismatch -> IDENTITY_MISMATCH (learning, cascades)", result.learning.available === false && result.learning.unavailableReason === "IDENTITY_MISMATCH", JSON.stringify(result.learning));
    check("identity isolation: mismatch is reported in limitations, not silently dropped", result.limitations.some((l) => l.includes("disagrees with this trace's own")), JSON.stringify(result.limitations));
  }

  // 6b. Experience row reports a different source for the same paperTradeId.
  {
    const wrongSourceExperience: DecisionExperienceRecord = { ...closedWinningExperience(paperTradeId), source: "AI_SIGNAL" as DecisionExperienceRecord["source"] };
    const result = buildCognitiveReplay({ trace, experience: wrongSourceExperience, evaluation: null, learningDbConfigured: true });
    check("identity isolation: experience.source mismatch -> IDENTITY_MISMATCH", result.outcome.available === false && result.outcome.unavailableReason === "IDENTITY_MISMATCH", JSON.stringify(result.outcome));
  }

  // 6c. Evaluation row's own sourceSignalId disagrees with the requested paperTradeId (defensive — should never occur given a correct repository-layer .eq() filter, but never trusted blindly).
  {
    const experience = closedWinningExperience(paperTradeId);
    const wrongEvaluation: DecisionEvaluation = { ...matchingEvaluation(paperTradeId), sourceSignalId: "some-other-signal-id" };
    const result = buildCognitiveReplay({ trace, experience, evaluation: wrongEvaluation, learningDbConfigured: true });
    check("identity isolation: evaluation.sourceSignalId mismatch -> IDENTITY_MISMATCH (learning only, outcome still valid)", result.learning.available === false && result.learning.unavailableReason === "IDENTITY_MISMATCH" && result.outcome.available === true, JSON.stringify({ outcome: result.outcome, learning: result.learning }));
  }

  // 6d. Cross-check: two DIFFERENT symbols' correctly-matched joins never bleed into each other.
  {
    const btcPaperTradeId = "signal-btc-1";
    const btcTrace = { ...fullCycleExecutedTrace(btcPaperTradeId), symbol: "BTCUSDT" };
    const btcExperience: DecisionExperienceRecord = { ...closedWinningExperience(btcPaperTradeId), symbol: "BTCUSDT" };
    const btcResult = buildCognitiveReplay({ trace: btcTrace, experience: btcExperience, evaluation: null, learningDbConfigured: true });
    check("identity isolation: correctly-matched (source,symbol) join is accepted, not falsely rejected", btcResult.outcome.available === true, JSON.stringify(btcResult.outcome));
  }
}

// ---------------------------------------------------------------------------
// 7. Chronological / verbatim-timestamp integrity — build.ts never reorders,
//    derives, or overwrites a timestamp; each stage's `at` is exactly the
//    trace's own per-stage column.
// ---------------------------------------------------------------------------
{
  const paperTradeId = "signal-chrono-1";
  const trace = fullCycleExecutedTrace(paperTradeId);
  const experience = closedWinningExperience(paperTradeId);
  const evaluation = matchingEvaluation(paperTradeId);
  const result = buildCognitiveReplay({ trace, experience, evaluation, learningDbConfigured: true });

  check("chronological: input.at === cycleAt verbatim", result.input.at === trace.cycleAt, String(result.input.at));
  check("chronological: analysis.at === analysisAt verbatim", result.analysis.at === trace.analysisAt, String(result.analysis.at));
  check("chronological: evidence.at === evidenceAt verbatim", result.evidence.at === trace.evidenceAt, String(result.evidence.at));
  check("chronological: conflict.at === conflictAt verbatim", result.conflict.at === trace.conflictAt, String(result.conflict.at));
  check("chronological: contradictions.at === conflictAt verbatim (shared timestamp, per contracts.ts)", result.contradictions.at === trace.conflictAt, String(result.contradictions.at));
  check("chronological: decision.at === decisionAt verbatim", result.decision.at === trace.decisionAt, String(result.decision.at));
  check("chronological: execution.at === executionAt verbatim", result.execution.at === trace.executionAt, String(result.execution.at));
  check("chronological: outcome.at === experience.outcome.outcomeClosedAt verbatim (never re-derived)", result.outcome.at === experience.outcome!.outcomeClosedAt, String(result.outcome.at));
  check("chronological: learning.at === evaluation.evaluatedAt verbatim", result.learning.at === evaluation.evaluatedAt, String(result.learning.at));

  const stageOrder = [result.input.at, result.analysis.at, result.evidence.at, result.conflict.at, result.decision.at, result.execution.at, result.outcome.at, result.learning.at].map((t) => Date.parse(t!));
  const monotonic = stageOrder.every((t, i) => i === 0 || t >= stageOrder[i - 1]);
  check("chronological: every available stage's real timestamp is non-decreasing across the cycle", monotonic, JSON.stringify(stageOrder));
}

// ---------------------------------------------------------------------------
// 8. Deterministic rerun — identical input, byte-identical output, twice.
// ---------------------------------------------------------------------------
{
  const paperTradeId = "signal-determinism-1";
  const trace = fullCycleExecutedTrace(paperTradeId);
  const experience = closedWinningExperience(paperTradeId);
  const evaluation = matchingEvaluation(paperTradeId);

  const first = buildCognitiveReplay({ trace, experience, evaluation, learningDbConfigured: true });
  const second = buildCognitiveReplay({ trace, experience, evaluation, learningDbConfigured: true });
  check("deterministic rerun: identical input -> byte-identical JSON output", JSON.stringify(first) === JSON.stringify(second), "outputs diverged on an identical rerun");

  // Also across the NO_ASSESSMENT / broken-join / identity-mismatch paths.
  const noAssessResultA = buildCognitiveReplay({ trace: noAssessmentTrace(), learningDbConfigured: true });
  const noAssessResultB = buildCognitiveReplay({ trace: noAssessmentTrace(), learningDbConfigured: true });
  check("deterministic rerun: NO_ASSESSMENT path is also byte-identical", JSON.stringify(noAssessResultA) === JSON.stringify(noAssessResultB), "outputs diverged");
}

// ---------------------------------------------------------------------------
// 9. Static source-scan checks — repository.ts (supabase-touching, not
//    live-imported here) and contracts.ts's architecture boundary.
// ---------------------------------------------------------------------------
{
  const repoSrc = readFileSync(new URL("../../lib/ai/cognitiveReplay/repository.ts", import.meta.url), "utf8");
  check("repository.ts: no write/insert/update/upsert call anywhere (read-only module)", !/\.(insert|update|upsert|delete)\(/.test(repoSrc), "found a write-shaped call");
  check("repository.ts: joins OUTCOME/LEARNING by paperTradeId (real join key)", repoSrc.includes("paperTradeId") && repoSrc.includes("getDecisionExperienceForEvaluation(paperTradeId") && repoSrc.includes("getDecisionEvaluationBySignalId(paperTradeId"), "expected join-key usage not found");
  check("repository.ts: never falls back to Date.now()/Math.random for any id or timestamp", !/Date\.now\(\)|Math\.random\(\)/.test(repoSrc), "found a non-deterministic call");
  check("repository.ts: gates the join behind execution.outcome === EXECUTED", repoSrc.includes('outcome === "EXECUTED"'), "EXECUTED gate not found");

  const buildSrc = readFileSync(new URL("../../lib/ai/cognitiveReplay/build.ts", import.meta.url), "utf8");
  check("build.ts: zero executable imports (type-only) — no I/O possible from this file", !/^import (?!type)/m.test(buildSrc), "found a non-type-only import");
  check("build.ts: never calls Date.now()/Math.random", !/Date\.now\(\)|Math\.random\(\)/.test(buildSrc), "found a non-deterministic call");

  const contractsSrc = readFileSync(new URL("../../lib/ai/cognitiveReplay/contracts.ts", import.meta.url), "utf8");
  check("contracts.ts: MEMORY_NOT_PERSISTED_PER_CYCLE is a documented, closed reason", contractsSrc.includes("MEMORY_NOT_PERSISTED_PER_CYCLE"), "reason missing");
  check("contracts.ts: memory stage typed ReplayStage<never> (structurally can never carry data)", contractsSrc.includes("readonly memory: ReplayStage<never>"), "memory field not typed never");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed (Phase 8.3.7 Cognitive Replay)`);
if (failures > 0) process.exit(1);
