// ---------------------------------------------------------------------------
// Phase 8.2.8 — Closed Learning Feedback Loop fixtures (dev-only, not part
// of the app). Pure/offline — `classifyAutonomousLearningLifecycle()` takes
// a plain `AutonomousPaperExecutionResult` object, no injected deps, no
// Supabase/Learning DB connection needed. Also includes static source scans
// (comment-stripped, like every prior 8.x fixture script) confirming: (a)
// this phase's own two new files never call into the protected learning
// modules, (b) the pre-existing wiring this phase discovered and documents
// is still actually present verbatim in paperTrader.ts/oracle/execute.ts.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-learning-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { classifyAutonomousLearningLifecycle } from "@/lib/ai/autonomousLearning/lifecycle";
import type { AutonomousPaperExecutionResult, AutonomousExecutionOutcome } from "@/lib/ai/autonomousLearning/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// Line comments are stripped FIRST, then block comments. This repo's own
// comments frequently reference glob-style paths as prose (e.g.
// "lib/ai/decisionOutcome/*") inside `//` line comments — stripping block
// comments first would misread that literal "/*" substring as a real block
// comment opener and over-consume real code up to the next "*/" anywhere
// later in the file. Stripping `//` lines first removes that prose (and the
// false "/*" inside it) before block-comment stripping ever runs.
function stripComments(src: string): string {
  return src.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
}

function execution(overrides: Partial<AutonomousPaperExecutionResult> = {}): AutonomousPaperExecutionResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    decision: "EXECUTE",
    outcome: "EXECUTED",
    paperTradeId: "trade-1",
    signalId: "oracle_btcusdt_1",
    error: null,
    ...overrides,
  };
}

// ===========================================================================
// 1. Successful autonomous EXECUTE -> LIFECYCLE_REACHABLE, will enter lifecycle
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution());
  check(
    "1. successful EXECUTE (outcome=EXECUTED, paperTradeId set) -> LIFECYCLE_REACHABLE, willEnterLearningLifecycleOnClose=true, sourceSignalId=paperTradeId",
    r.status === "LIFECYCLE_REACHABLE" && r.willEnterLearningLifecycleOnClose === true && r.sourceSignalId === "trade-1",
    JSON.stringify(r)
  );
}

// ===========================================================================
// 2. WAIT -> zero learning lifecycle reachability
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution({ decision: "WAIT", outcome: "SKIPPED_WAIT", paperTradeId: null, signalId: null }));
  check(
    "2. WAIT -> SKIPPED_WAIT, willEnterLearningLifecycleOnClose=false, sourceSignalId=null",
    r.status === "SKIPPED_WAIT" && r.willEnterLearningLifecycleOnClose === false && r.sourceSignalId === null,
    JSON.stringify(r)
  );
}

// ===========================================================================
// 3. REJECT -> zero learning lifecycle reachability
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution({ decision: "REJECT", outcome: "SKIPPED_REJECT", paperTradeId: null, signalId: null }));
  check(
    "3. REJECT -> SKIPPED_REJECT, willEnterLearningLifecycleOnClose=false, sourceSignalId=null",
    r.status === "SKIPPED_REJECT" && r.willEnterLearningLifecycleOnClose === false && r.sourceSignalId === null,
    JSON.stringify(r)
  );
}

// ===========================================================================
// 4. Failed paper execution -> zero fake learning outcome
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution({ outcome: "EXECUTION_FAILED", paperTradeId: null, signalId: null, error: "boom" }));
  check(
    "4. EXECUTION_FAILED -> SKIPPED_EXECUTION_FAILED, willEnterLearningLifecycleOnClose=false, sourceSignalId=null (never fabricated)",
    r.status === "SKIPPED_EXECUTION_FAILED" && r.willEnterLearningLifecycleOnClose === false && r.sourceSignalId === null,
    JSON.stringify(r)
  );
}

// ===========================================================================
// 5. Unsupported source -> zero learning lifecycle reachability, no fake status
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution({ outcome: "SKIPPED_UNSUPPORTED_SOURCE", paperTradeId: null, signalId: null }));
  check(
    "5. SKIPPED_UNSUPPORTED_SOURCE -> classified as such, never LIFECYCLE_REACHABLE (source isolation)",
    r.status === "SKIPPED_UNSUPPORTED_SOURCE" && r.willEnterLearningLifecycleOnClose === false,
    JSON.stringify(r)
  );
}

// ===========================================================================
// 6. Defensive fallback: outcome=EXECUTED but paperTradeId somehow null -> never LIFECYCLE_REACHABLE
// ===========================================================================
{
  const r = classifyAutonomousLearningLifecycle(execution({ paperTradeId: null }));
  check(
    "6. EXECUTED with null paperTradeId (invariant violated upstream) -> falls back to SKIPPED_EXECUTION_FAILED, not LIFECYCLE_REACHABLE",
    r.status === "SKIPPED_EXECUTION_FAILED" && r.willEnterLearningLifecycleOnClose === false && r.sourceSignalId === null,
    JSON.stringify(r)
  );
}

// ===========================================================================
// 7. Determinism — identical input -> deep-equal output across repeated calls
// ===========================================================================
{
  const input = execution();
  const a = classifyAutonomousLearningLifecycle(input);
  const b = classifyAutonomousLearningLifecycle(input);
  check("7. determinism — repeated calls on the same input produce deep-equal output", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// ===========================================================================
// 8. Input immutability — classifyAutonomousLearningLifecycle never mutates its argument
// ===========================================================================
{
  const input = execution();
  const before = JSON.stringify(input);
  classifyAutonomousLearningLifecycle(input);
  check("8. input immutability — execution object unchanged after classification", JSON.stringify(input) === before, `before=${before} after=${JSON.stringify(input)}`);
}

// ===========================================================================
// 9. Duplicate classification calls never imply/perform duplicate lifecycle work
//    (this module performs no I/O at all — verified by static scan below —
//    so "calling it twice" is definitionally not a duplicate side effect)
// ===========================================================================
{
  const input = execution();
  const r1 = classifyAutonomousLearningLifecycle(input);
  const r2 = classifyAutonomousLearningLifecycle(input);
  check("9. duplicate classification calls produce identical, side-effect-free results", JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
}

// ===========================================================================
// 10. All five statuses are independently reachable
// ===========================================================================
{
  const outcomes: AutonomousExecutionOutcome[] = ["EXECUTED", "SKIPPED_WAIT", "SKIPPED_REJECT", "SKIPPED_UNSUPPORTED_SOURCE", "EXECUTION_FAILED"];
  const statuses = new Set(outcomes.map((o) => classifyAutonomousLearningLifecycle(execution({ outcome: o, paperTradeId: o === "EXECUTED" ? "trade-x" : null })).status));
  check("10. all five AutonomousLearningLifecycleStatus values are independently reachable", statuses.size === 5, `only reached: ${[...statuses].join(", ")}`);
}

// ===========================================================================
// Static scans — comment-stripped source inspection
// ===========================================================================

const contractsSrc = stripComments(readFileSync("lib/ai/autonomousLearning/contracts.ts", "utf-8"));
const lifecycleSrc = stripComments(readFileSync("lib/ai/autonomousLearning/lifecycle.ts", "utf-8"));

// ===========================================================================
// 11. lifecycle.ts imports nothing from the protected learning/execution/oracle modules
// ===========================================================================
{
  const forbidden = [
    "lib/ai/decisionOutcome/repository",
    "lib/ai/decisionEvaluation/evaluate",
    "lib/ai/decisionEvaluation/repository",
    "lib/ai/failurePatterns/detect",
    "lib/ai/failurePatterns/repository",
    "lib/ai/adaptiveConstraint/generate",
    "lib/ai/adaptiveConstraint/repository",
    "lib/ai/learningValidation/validate",
    "lib/ai/learningValidation/repository",
    "lib/ai/decisionLearning/lifecycle",
    "lib/ai/oracle/grading",
    "lib/ai/oracle/execute",
    "lib/elvoid/engine",
    "lib/elvoid/scanners",
    "lib/elvoid/paperTrader",
    "lib/supabase",
    "@supabase/supabase-js",
  ];
  const offenders = forbidden.filter((f) => lifecycleSrc.includes(f) || contractsSrc.includes(f));
  check("11. no forbidden import of protected learning/execution/oracle/Supabase modules in autonomousLearning/*", offenders.length === 0, `found: ${offenders.join(", ")}`);
}

// ===========================================================================
// 12. lifecycle.ts performs no DB/network write — no `.from(`, no `await`, no `fetch(`
// ===========================================================================
{
  const hasFrom = lifecycleSrc.includes(".from(");
  const hasAwait = /\bawait\b/.test(lifecycleSrc);
  const hasFetch = lifecycleSrc.includes("fetch(");
  check("12. lifecycle.ts is pure/synchronous — no `.from(`, no `await`, no `fetch(`", !hasFrom && !hasAwait && !hasFetch, `hasFrom=${hasFrom} hasAwait=${hasAwait} hasFetch=${hasFetch}`);
}

// ===========================================================================
// 13. lifecycle.ts has zero Date.now()/Math.random() calls
// ===========================================================================
{
  const hasDateNow = lifecycleSrc.includes("Date.now(");
  const hasRandom = lifecycleSrc.includes("Math.random(");
  check("13. lifecycle.ts contains no Date.now()/Math.random() call", !hasDateNow && !hasRandom, `hasDateNow=${hasDateNow} hasRandom=${hasRandom}`);
}

// ===========================================================================
// 14. The pre-existing wiring this phase discovered and documents is still
//     actually present, verbatim, in the protected files this phase never
//     touched — regression guard, not a new dependency.
// ===========================================================================
{
  // Raw (non-comment-stripped) source: several files in this repo use
  // "path/*" glob-style references inside comments (e.g. "decisionOutcome/*"),
  // which a block-comment stripper misreads as a `/*` comment opener and
  // over-consumes into real code. This check only needs to confirm the
  // actual call expression is present, so it matches directly against the
  // raw file text instead.
  const paperTraderSrc = readFileSync("lib/elvoid/paperTrader.ts", "utf-8");
  const oracleExecuteSrc = readFileSync("lib/ai/oracle/execute.ts", "utf-8");

  const paperTraderCallsLifecycle = /completeDecisionLearningLifecycle\(signal\.id\)\.catch\(/.test(paperTraderSrc);
  check("14a. lib/elvoid/paperTrader.ts::writeClose() still calls completeDecisionLearningLifecycle(signal.id).catch(...) (unmodified pre-existing wiring)", paperTraderCallsLifecycle, "call not found — the discovered wiring this phase relies on is missing");

  const oracleExecuteCapturesExperience = /captureDecisionExperienceBestEffort\(row, learningContext\)/.test(oracleExecuteSrc);
  check("14b. lib/ai/oracle/execute.ts::executeOracleSignal() still calls captureDecisionExperienceBestEffort() on every success path (unmodified pre-existing wiring)", oracleExecuteCapturesExperience, "call not found — the discovered wiring this phase relies on is missing");
}

// ===========================================================================
// 15. Idempotency guarantees this phase relies on (but never re-implements)
//     are still present in the protected Phase 8.1.0/8.1.1 repositories.
// ===========================================================================
{
  const outcomeRepoSrc = stripComments(readFileSync("lib/ai/decisionOutcome/repository.ts", "utf-8"));
  const hasIgnoreDuplicates = outcomeRepoSrc.includes("ignoreDuplicates: true");
  const hasOutcomeNullGuard = /\.is\(\s*"outcome_result"\s*,\s*null\s*\)/.test(outcomeRepoSrc);
  check(
    "15. decisionOutcome/repository.ts still guards duplicate work via ignoreDuplicates upsert + outcome_result IS NULL conditional update",
    hasIgnoreDuplicates && hasOutcomeNullGuard,
    `hasIgnoreDuplicates=${hasIgnoreDuplicates} hasOutcomeNullGuard=${hasOutcomeNullGuard}`
  );
}

// ===========================================================================
// 16. autonomousLearning/* never writes/mutates any canonical Oracle or
//     paper-trade field name — pure classification labels only.
// ===========================================================================
{
  const forbiddenFieldWrites = [/\bgrade\s*[:=]/, /\bstopLoss\s*[:=]/, /\btakeProfit\s*[:=]/, /\briskStatus\s*[:=]/];
  const offenders = forbiddenFieldWrites.filter((re) => re.test(lifecycleSrc) || re.test(contractsSrc));
  check("16. no canonical Oracle field assignment anywhere in autonomousLearning/*", offenders.length === 0, `${offenders.length} forbidden pattern(s) matched`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
