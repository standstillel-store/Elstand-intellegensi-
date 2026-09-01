// ---------------------------------------------------------------------------
// Phase 8.2.7 — Autonomous Paper Execution Adapter fixtures (dev-only, not
// part of the app). Pure/offline — exercises `execute.ts`'s
// `executeAutonomousPaperTrade()` against INJECTED fake
// `executeOracleSignal`/`persistDecisionTrace` dependencies (the adapter's
// one testability seam — see contracts.ts's header) so this script never
// requires a live Supabase/Learning DB connection and never makes a real
// network call, matching every prior 8.x fixture script's offline
// convention.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-paper-execution-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { executeAutonomousPaperTrade } from "@/lib/ai/autonomousExecution/execute";
import type { AutonomousExecutionDeps, AutonomousPaperExecutionInput, OracleAssessment, OracleRiskPlan, AutonomousDecisionEngineResult, AutonomousDecision } from "@/lib/ai/autonomousExecution/contracts";
import type { ExecuteOracleSignalResult, ExecuteOracleSignalError } from "@/lib/ai/oracle/execute";
import type { PersistDecisionTraceResult } from "@/lib/ai/decisionTrace/repository";

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

const GENERATED_AT = "2026-02-01T00:00:00.000Z";

function assessment(overrides: Partial<OracleAssessment> = {}): OracleAssessment {
  return {
    symbol: "BTCUSDT",
    timestamp: "2026-01-31T23:55:00.000Z",
    grade: "A",
    side: "LONG",
    score: { long: 78, short: 22 },
    confidence: 81,
    independentConfirmationClusters: 2,
    supportingEvidence: ["RSI bullish divergence", "VWAP reclaim"],
    contradictingEvidence: [],
    dataQuality: [{ source: "orderbook", quality: "real" }],
    riskStatus: "valid",
    risk: null,
    gradeReason: "Strong confluence across 3 clusters.",
    invalidation: "close below 41,200",
    mainRisk: "Macro event risk in next 4h.",
    ...overrides,
  };
}

function risk(overrides: Partial<OracleRiskPlan> = {}): OracleRiskPlan {
  return {
    entry: 42000,
    stopLoss: 41200,
    takeProfit: 44200,
    riskReward: 2.75,
    ...overrides,
  };
}

function decisionSignals(overrides: Partial<AutonomousDecisionEngineResult["signals"]> = {}) {
  return {
    qualificationPresent: true,
    macroPresent: true,
    eventImpactPresent: true,
    preEntryPresent: true,
    requiredContextMissing: false,
    qualificationInsufficient: false,
    preEntryInsufficient: false,
    preEntryBlocked: false,
    qualificationConflicted: false,
    preEntryCaution: false,
    preEntryValid: true,
    qualificationQualified: true,
    ...overrides,
  };
}

function decisionResult(decision: AutonomousDecision, overrides: Partial<AutonomousDecisionEngineResult> = {}): AutonomousDecisionEngineResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    generatedAt: GENERATED_AT,
    decision,
    signals: decisionSignals(),
    ...overrides,
  };
}

function input(overrides: Partial<AutonomousPaperExecutionInput> = {}): AutonomousPaperExecutionInput {
  return {
    decision: decisionResult("EXECUTE"),
    assessment: assessment(),
    risk: risk(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake dependency helpers — count calls, never touch a real DB/network.
// ---------------------------------------------------------------------------

function fakeSuccessOracle(paperTradeId = "trade-1", signalId = "oracle_btcusdt_abc123") {
  let calls = 0;
  const capturedArgs: unknown[][] = [];
  const fn = async (...args: unknown[]): Promise<ExecuteOracleSignalResult> => {
    calls++;
    capturedArgs.push(args);
    return { success: true, signalId, source: "ELVOID_PRO_ORACLE", grade: "A", paperTradeId, premium: true, alreadyExecuted: false };
  };
  return { fn: fn as unknown as AutonomousExecutionDeps["executeOracleSignal"], getCalls: () => calls, getArgs: () => capturedArgs };
}

function fakeFailingOracle(error = "Supabase belum dikonfigurasi — sinyal ini tidak bisa dieksekusi sebagai paper trade.") {
  let calls = 0;
  const fn = async (): Promise<ExecuteOracleSignalError> => {
    calls++;
    return { success: false, error };
  };
  return { fn: fn as unknown as AutonomousExecutionDeps["executeOracleSignal"], getCalls: () => calls };
}

function fakeThrowingOracle() {
  let calls = 0;
  const fn = async (): Promise<never> => {
    calls++;
    throw new Error("unexpected network error");
  };
  return { fn: fn as unknown as AutonomousExecutionDeps["executeOracleSignal"], getCalls: () => calls };
}

function fakeTrace() {
  let calls = 0;
  const capturedArgs: unknown[][] = [];
  const fn = async (...args: unknown[]): Promise<PersistDecisionTraceResult> => {
    calls++;
    capturedArgs.push(args);
    return { persisted: false, reason: "not_configured" };
  };
  return { fn: fn as unknown as AutonomousExecutionDeps["persistDecisionTrace"], getCalls: () => calls, getArgs: () => capturedArgs };
}

// ===========================================================================
// 1. EXECUTE triggers exactly one paper execution
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input(), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("1a. EXECUTE calls executeOracleSignal exactly once", oracle.getCalls() === 1, `calls=${oracle.getCalls()}`);
  check("1b. EXECUTE outcome is EXECUTED with paperTradeId/signalId populated", r.outcome === "EXECUTED" && r.paperTradeId === "trade-1" && r.signalId === "oracle_btcusdt_abc123", JSON.stringify(r));
}

// ===========================================================================
// 2. WAIT triggers zero execution
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input({ decision: decisionResult("WAIT"), assessment: null, risk: null }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("2a. WAIT calls executeOracleSignal zero times", oracle.getCalls() === 0, `calls=${oracle.getCalls()}`);
  check("2b. WAIT outcome is SKIPPED_WAIT with no paperTradeId/signalId", r.outcome === "SKIPPED_WAIT" && r.paperTradeId === null && r.signalId === null, JSON.stringify(r));
}

// ===========================================================================
// 3. REJECT triggers zero execution
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input({ decision: decisionResult("REJECT"), assessment: null, risk: null }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("3a. REJECT calls executeOracleSignal zero times", oracle.getCalls() === 0, `calls=${oracle.getCalls()}`);
  check("3b. REJECT outcome is SKIPPED_REJECT with no paperTradeId/signalId", r.outcome === "SKIPPED_REJECT" && r.paperTradeId === null && r.signalId === null, JSON.stringify(r));
}

// ===========================================================================
// 3c. WAIT/REJECT still attempt a best-effort trace write (decision-trace linkage), even though no trade is created
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const traceWait = fakeTrace();
  await executeAutonomousPaperTrade(input({ decision: decisionResult("WAIT"), assessment: null, risk: null }), { executeOracleSignal: oracle.fn, persistDecisionTrace: traceWait.fn });
  const waitArgs = traceWait.getArgs()[0]?.[0] as { outcome: string; sourceSignalId: string | null } | undefined;
  check("3c. WAIT trace call has outcome=WAIT and sourceSignalId=null", traceWait.getCalls() === 1 && waitArgs?.outcome === "WAIT" && waitArgs?.sourceSignalId === null, JSON.stringify(waitArgs));
}

// ===========================================================================
// 4. Canonical fields (assessment/risk) unchanged after passing through the adapter
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const fixtureAssessment = assessment();
  const fixtureRisk = risk();
  const before = JSON.parse(JSON.stringify({ assessment: fixtureAssessment, risk: fixtureRisk }));
  await executeAutonomousPaperTrade(input({ assessment: fixtureAssessment, risk: fixtureRisk }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  const after = { assessment: fixtureAssessment, risk: fixtureRisk };
  check("4. assessment/risk objects deep-equal before/after execution", JSON.stringify(before) === JSON.stringify(after), "assessment/risk mutated");
}

// ===========================================================================
// 5. No duplicated decision logic — execute.ts never imports decide.ts/grading.ts, and never branches on anything but the closed decision string
// ===========================================================================
{
  const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  const importLines = [...executeSrc.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["autonomousDecision/decide", "oracle/grading", "elvoid/engine", "elvoid/scanners"];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("5. execute.ts imports none of decide.ts/grading.ts/engine.ts/scanners.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 6. Execution failure handled safely — a failing executeOracleSignal never throws out of the adapter
// ===========================================================================
{
  const oracle = fakeFailingOracle("Risk plan tidak valid.");
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input(), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("6a. failing executeOracleSignal -> EXECUTION_FAILED, not a thrown error", r.outcome === "EXECUTION_FAILED" && r.error === "Risk plan tidak valid." && r.paperTradeId === null, JSON.stringify(r));
}

// ===========================================================================
// 6b. Execution failure handled safely — a THROWING executeOracleSignal is caught, never propagates
// ===========================================================================
{
  const oracle = fakeThrowingOracle();
  const trace = fakeTrace();
  let threw = false;
  let r: Awaited<ReturnType<typeof executeAutonomousPaperTrade>> | null = null;
  try {
    r = await executeAutonomousPaperTrade(input(), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  } catch {
    threw = true;
  }
  check("6b. a throwing executeOracleSignal is caught -> EXECUTION_FAILED, no uncaught exception", !threw && r?.outcome === "EXECUTION_FAILED" && r?.error === "unexpected network error", JSON.stringify(r));
}

// ===========================================================================
// 7. Determinism — same input + same fake deps -> byte-identical result
// ===========================================================================
{
  const fixtureInput = input();
  const oracleA = fakeSuccessOracle("trade-x", "oracle_btcusdt_x");
  const traceA = fakeTrace();
  const r1 = await executeAutonomousPaperTrade(fixtureInput, { executeOracleSignal: oracleA.fn, persistDecisionTrace: traceA.fn });
  const oracleB = fakeSuccessOracle("trade-x", "oracle_btcusdt_x");
  const traceB = fakeTrace();
  const r2 = await executeAutonomousPaperTrade(fixtureInput, { executeOracleSignal: oracleB.fn, persistDecisionTrace: traceB.fn });
  check("7. identical input+deps -> byte-identical result", JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
}

// ===========================================================================
// 8. Input immutability — executeAutonomousPaperTrade never mutates its input or nested objects
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const fixtureInput = input();
  const before = JSON.parse(JSON.stringify(fixtureInput));
  await executeAutonomousPaperTrade(fixtureInput, { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("8. input deep-equal before/after executeAutonomousPaperTrade() call", JSON.stringify(fixtureInput) === JSON.stringify(before), "input mutated");
}

// ===========================================================================
// 9. Paper-only guarantee — the real (non-injected) executeOracleSignal path never places a live order; static scan confirms no live-trading token appears in this phase's two files
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/contracts.ts", import.meta.url), "utf8");
  const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  const combined = contractsSrc + executeSrc;
  const liveTradingTokens = ["placeLiveOrder", "realExchange", "binance.createOrder", "ccxt", "sendTransaction(", "signTransaction(", "eth_sendTransaction", "writeContract(", "wallet.send("];
  const violations = liveTradingTokens.filter((needle) => combined.includes(needle));
  check("9. no live-trading token found in contracts.ts/execute.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 10. Static scan — no forbidden on-chain / wallet / ethers / viem / wagmi import anywhere in this phase's two files
// ===========================================================================
{
  const contractsSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/contracts.ts", import.meta.url), "utf8");
  const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  const importLines = [...contractsSrc.matchAll(/^import .*$/gm), ...executeSrc.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["wagmi", "viem", "ethers", "@reown/appkit", "web3.js", "lib/web3/"];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("10. no on-chain/wallet import statement found in contracts.ts/execute.ts", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 11. No grading/confidence/side mutation — the exact assessment object reference is forwarded to executeOracleSignal with fields unchanged
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const fixtureAssessment = assessment({ grade: "A+", side: "SHORT", confidence: 91 });
  const fixtureRisk = risk({ entry: 100, stopLoss: 95, takeProfit: 115, riskReward: 3 });
  await executeAutonomousPaperTrade(input({ assessment: fixtureAssessment, risk: fixtureRisk }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  const [calledAssessment, calledRisk] = oracle.getArgs()[0] as [OracleAssessment, OracleRiskPlan];
  const unchanged = calledAssessment.grade === "A+" && calledAssessment.side === "SHORT" && calledAssessment.confidence === 91 && calledRisk.entry === 100 && calledRisk.stopLoss === 95 && calledRisk.takeProfit === 115 && calledRisk.riskReward === 3;
  check("11. grade/side/confidence/entry/stopLoss/takeProfit/riskReward forwarded unchanged to executeOracleSignal", unchanged, JSON.stringify({ calledAssessment, calledRisk }));
}

// ===========================================================================
// 12. Static scan — forbidden imports/calls: no oracle/grading, no paperTrader duplication (only the single documented executeSignal reuse via executeOracleSignal), no elvoid/engine, no elvoid/scanners, no direct supabase import
// ===========================================================================
{
  const executeSrc = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  const importLines = [...executeSrc.matchAll(/^import .*$/gm)].map((m) => m[0]);
  const forbidden = ["lib/ai/oracle/grading", "lib/elvoid/paperTrader", "lib/elvoid/engine", "lib/elvoid/scanners", "lib/supabase\""];
  const violations = importLines.filter((line) => forbidden.some((needle) => line.includes(needle)));
  check("12. execute.ts imports none of grading.ts/paperTrader.ts(direct)/engine.ts/scanners.ts/supabase.ts directly", violations.length === 0, `violations: ${JSON.stringify(violations)}`);
}

// ===========================================================================
// 13. Unsupported source (AI_SIGNAL) with decision EXECUTE -> safe no-op, never calls executeOracleSignal
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input({ decision: decisionResult("EXECUTE", { source: "AI_SIGNAL" }) }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("13. AI_SIGNAL source with EXECUTE decision -> SKIPPED_UNSUPPORTED_SOURCE, zero executeOracleSignal calls", r.outcome === "SKIPPED_UNSUPPORTED_SOURCE" && oracle.getCalls() === 0, JSON.stringify(r));
}

// ===========================================================================
// 14. EXECUTE with missing assessment/risk -> EXECUTION_FAILED, never calls executeOracleSignal
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input({ assessment: null, risk: null }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("14. EXECUTE with null assessment/risk -> EXECUTION_FAILED, zero executeOracleSignal calls", r.outcome === "EXECUTION_FAILED" && oracle.getCalls() === 0, JSON.stringify(r));
}

// ===========================================================================
// 15. EXECUTE with a symbol-mismatched assessment -> EXECUTION_FAILED, never calls executeOracleSignal
// ===========================================================================
{
  const oracle = fakeSuccessOracle();
  const trace = fakeTrace();
  const r = await executeAutonomousPaperTrade(input({ assessment: assessment({ symbol: "ETHUSDT" }) }), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  check("15. mismatched assessment.symbol vs decision.symbol -> EXECUTION_FAILED, zero executeOracleSignal calls", r.outcome === "EXECUTION_FAILED" && oracle.getCalls() === 0, JSON.stringify(r));
}

// ===========================================================================
// 16. Trace linkage on successful EXECUTE — sourceSignalId is populated only on real success
// ===========================================================================
{
  const oracle = fakeSuccessOracle("trade-99", "oracle_btcusdt_99");
  const trace = fakeTrace();
  await executeAutonomousPaperTrade(input(), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  const args = trace.getArgs()[0]?.[0] as { outcome: string; sourceSignalId: string | null } | undefined;
  check("16. EXECUTED trace call has outcome=EXECUTE and sourceSignalId=paperTradeId", trace.getCalls() === 1 && args?.outcome === "EXECUTE" && args?.sourceSignalId === "trade-99", JSON.stringify(args));
}

// ===========================================================================
// 17. Trace linkage on FAILED EXECUTE — sourceSignalId stays null (no trade was actually created)
// ===========================================================================
{
  const oracle = fakeFailingOracle("boom");
  const trace = fakeTrace();
  await executeAutonomousPaperTrade(input(), { executeOracleSignal: oracle.fn, persistDecisionTrace: trace.fn });
  const args = trace.getArgs()[0]?.[0] as { outcome: string; sourceSignalId: string | null } | undefined;
  check("17. FAILED EXECUTE trace call still has outcome=EXECUTE but sourceSignalId=null", trace.getCalls() === 1 && args?.outcome === "EXECUTE" && args?.sourceSignalId === null, JSON.stringify(args));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
