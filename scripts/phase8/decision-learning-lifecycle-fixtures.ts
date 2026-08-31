// ---------------------------------------------------------------------------
// Phase 8.1.1.1 — Decision Learning lifecycle orchestrator fixtures
// (dev-only, not part of the app). Static source-inspection verification —
// no live Supabase connection, no network.
//
// WHY SOURCE-INSPECTION, NOT LIVE EXECUTION: lib/ai/decisionLearning/
// lifecycle.ts transitively imports lib/ai/decisionOutcome/repository.ts
// and lib/ai/decisionEvaluation/repository.ts, both of which import
// @supabase/supabase-js via lib/ai/learning/db.ts / lib/supabase.ts — an
// external package unavailable in this offline sandbox (same reasoning
// already documented in scripts/phase8/decision-outcome-fixtures.ts and
// scripts/phase8/learning-db-env-fixtures.ts). This file verifies the
// orchestrator's ordering, failure-isolation, idempotency-preservation,
// and INSUFFICIENT_EVIDENCE guard behavior structurally, by inspecting
// its actual source text — the same established pattern this repository
// already uses for every Supabase-dependent file's automated checks.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-learning-lifecycle-fixtures.ts
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const lifecycleSource = await readFile(new URL("../../lib/ai/decisionLearning/lifecycle.ts", import.meta.url), "utf-8");
const paperTraderSource = await readFile(new URL("../../lib/elvoid/paperTrader.ts", import.meta.url), "utf-8");
const decisionOutcomeRepoSource = await readFile(new URL("../../lib/ai/decisionOutcome/repository.ts", import.meta.url), "utf-8");
const decisionOutcomeContractsSource = await readFile(new URL("../../lib/ai/decisionOutcome/contracts.ts", import.meta.url), "utf-8");
const decisionOutcomeCaptureSource = await readFile(new URL("../../lib/ai/decisionOutcome/capture.ts", import.meta.url), "utf-8");
const decisionEvaluationRepoSource = await readFile(new URL("../../lib/ai/decisionEvaluation/repository.ts", import.meta.url), "utf-8");
const decisionEvaluationContractsSource = await readFile(new URL("../../lib/ai/decisionEvaluation/contracts.ts", import.meta.url), "utf-8");
const decisionEvaluationEvaluateSource = await readFile(new URL("../../lib/ai/decisionEvaluation/evaluate.ts", import.meta.url), "utf-8");

/** Strips line comments and block comments before substring/regex checks, to avoid false positives from this codebase's own explanatory doc comments (same technique already used in scripts/phase8/decision-evaluation-fixtures.ts's case 36). */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const lifecycleCode = codeOnly(lifecycleSource);

// ===========================================================================
// Ordering
// ===========================================================================

// 1. outcome capture executes before evaluation
{
  const outcomeCallIdx = lifecycleCode.indexOf("captureAndPersistOutcome(sourceSignalId)");
  const evalReadIdx = lifecycleCode.indexOf("getDecisionExperienceForEvaluation(sourceSignalId)");
  check("1. captureAndPersistOutcome() call appears before getDecisionExperienceForEvaluation() call in source order", outcomeCallIdx !== -1 && evalReadIdx !== -1 && outcomeCallIdx < evalReadIdx, `outcomeCallIdx=${outcomeCallIdx} evalReadIdx=${evalReadIdx}`);
}

// 2. evaluation does not begin before outcome step resolves
{
  const outcomeAwaitIdx = lifecycleCode.indexOf("await captureAndPersistOutcome(sourceSignalId)");
  const guardIdx = lifecycleCode.indexOf("if (!outcomeResult.persisted)");
  const evalAwaitIdx = lifecycleCode.indexOf("await getDecisionExperienceForEvaluation(sourceSignalId)");
  check(
    "2. Outcome call is awaited, its failure guard is checked, and only then is the experience read for evaluation — all in strict source order",
    outcomeAwaitIdx !== -1 && guardIdx !== -1 && evalAwaitIdx !== -1 && outcomeAwaitIdx < guardIdx && guardIdx < evalAwaitIdx,
    `outcomeAwaitIdx=${outcomeAwaitIdx} guardIdx=${guardIdx} evalAwaitIdx=${evalAwaitIdx}`
  );
}

// 3. sequential await ordering is structurally verifiable (no Promise.all/allSettled racing the two steps)
{
  const hasPromiseAll = /Promise\.(all|allSettled|race)\s*\(/.test(lifecycleCode);
  check("3. No Promise.all/allSettled/race combinator is used to run outcome capture and evaluation concurrently", !hasPromiseAll, "found a concurrent Promise combinator");
}

// ===========================================================================
// Failure isolation
// ===========================================================================

// 4. outcome failure prevents evaluation
{
  // Extract the guard's `if` line plus the following few lines (up to the
  // next blank line, which reliably ends this short single-statement
  // block in the actual source) rather than brace-matching with regex —
  // a naive `{...}` regex mis-terminates on the `}` that closes the
  // `${outcomeResult.reason}` template-literal interpolation inside the
  // guard body itself.
  const guardStartIdx = lifecycleCode.indexOf("if (!outcomeResult.persisted) {");
  const guardEndIdx = lifecycleCode.indexOf("\n\n", guardStartIdx);
  const guardBody = guardStartIdx !== -1 && guardEndIdx !== -1 ? lifecycleCode.slice(guardStartIdx, guardEndIdx) : "";
  check("4. The outcome-failure guard body contains a `throw` — execution cannot fall through to evaluation", guardBody.includes("throw"), `guard body="${guardBody.trim()}"`);
}

// 5. evaluation failure does not roll back outcome
{
  // No delete/rollback/undo call exists anywhere touching decision_experiences
  // or the outcome fields after the evaluation step — the outcome write is
  // never referenced again once step 1 succeeds.
  const forbiddenRollbackTerms = ["rollback", "undo", ".delete(", "outcome_result: null", "outcomeResult: null"];
  const noneAppear = forbiddenRollbackTerms.every((t) => !lifecycleCode.includes(t));
  check("5. No rollback/delete/undo of the outcome write exists anywhere in the lifecycle after evaluation begins", noneAppear, `contains one of: ${forbiddenRollbackTerms.join(", ")}`);
}

// 6. lifecycle error can propagate to caller-level catch
{
  // completeDecisionLearningLifecycle itself has no internal try/catch
  // around its own throws — any thrown Error propagates out of the
  // returned Promise to whoever calls it (paperTrader.ts's `.catch()`).
  const hasInternalTryCatch = /try\s*\{/.test(lifecycleCode);
  check("6. completeDecisionLearningLifecycle() has no internal try/catch swallowing its own errors — they propagate to the caller", !hasInternalTryCatch, "found an internal try block that could swallow an error before it reaches the caller");
}

// 7. writeClose() does not await the lifecycle call
{
  const notAwaited = /(?<!await\s{0,20})completeDecisionLearningLifecycle\(signal\.id\)\.catch/.test(paperTraderSource);
  check("7. writeClose() does not `await` completeDecisionLearningLifecycle(...) — fire-and-forget from the trading lifecycle's perspective", notAwaited, "expected an un-awaited call with a .catch() handler");
}

// 8. trading lifecycle remains structurally independent from Learning DB failure
{
  const hasCatchHandler = /completeDecisionLearningLifecycle\(signal\.id\)\.catch\(/.test(paperTraderSource);
  const statusUpdateIdx = paperTraderSource.indexOf('.from("ai_signals").update({ status: "closed" })');
  const lifecycleCallIdx = paperTraderSource.indexOf("completeDecisionLearningLifecycle(signal.id)");
  check(
    "8. The lifecycle call has a .catch() handler AND the ai_signals status update is a separate, unconditional statement after it (not inside any lifecycle callback)",
    hasCatchHandler && statusUpdateIdx !== -1 && lifecycleCallIdx !== -1 && statusUpdateIdx > lifecycleCallIdx,
    `hasCatchHandler=${hasCatchHandler} statusUpdateIdx=${statusUpdateIdx} lifecycleCallIdx=${lifecycleCallIdx}`
  );
}

// ===========================================================================
// Idempotency
// ===========================================================================

// 9. repeated lifecycle invocation remains safe (delegates entirely to already-idempotent primitives)
{
  const delegatesToExistingPrimitives = lifecycleCode.includes("captureAndPersistOutcome(") && lifecycleCode.includes("persistDecisionEvaluation(");
  const noOwnUpsertLogic = !lifecycleCode.includes(".upsert(") && !lifecycleCode.includes(".update(") && !lifecycleCode.includes(".insert(");
  check("9. The lifecycle contains no direct database write of its own — it exclusively delegates to the already-idempotent captureAndPersistOutcome()/persistDecisionEvaluation() primitives", delegatesToExistingPrimitives && noOwnUpsertLogic, `delegatesToExistingPrimitives=${delegatesToExistingPrimitives} noOwnUpsertLogic=${noOwnUpsertLogic}`);
}

// 10. outcome already populated must still allow evaluation ("updated: false" is not treated as failure)
{
  // The success check is `if (!outcomeResult.persisted)`, NOT a check on
  // `.updated` — so `{persisted: true, updated: false}` (outcome already
  // existed before this call) correctly falls through to evaluation
  // rather than being treated as a failure.
  const checksOnlyPersisted = lifecycleCode.includes("if (!outcomeResult.persisted)") && !lifecycleCode.includes("outcomeResult.updated");
  check("10. Success condition checks only `.persisted` (not `.updated`) — an already-populated outcome (updated: false) still allows evaluation to proceed", checksOnlyPersisted, "found a reference to .updated, or the guard does not check .persisted alone");
}

// 11. duplicate evaluation persistence remains safe
{
  // The lifecycle calls the existing persistDecisionEvaluation() adapter
  // directly (not a hand-rolled insert), so it inherits that function's
  // own UNIQUE(source_signal_id) + ignoreDuplicates upsert guarantee
  // without reimplementing it.
  check("11. Evaluation persistence goes through the existing persistDecisionEvaluation() adapter (inherits its ignoreDuplicates idempotency), not a hand-rolled insert", lifecycleCode.includes("persistDecisionEvaluation(withTimestamp)"), "expected a call to the existing persistDecisionEvaluation() adapter");
}

// 12. concurrent lifecycle calls cannot produce evaluation-before-outcome ordering (within a single invocation)
{
  // Already covered structurally by fixtures 1-3 (strict await ordering,
  // no concurrent combinator) — re-asserted here as the specific
  // concurrency-framed case: every evaluation-related call is textually
  // and causally downstream of the outcome guard, so no code path within
  // a single completeDecisionLearningLifecycle() call can reach
  // evaluation before the outcome await resolves.
  const guardIdx = lifecycleCode.indexOf("if (!outcomeResult.persisted)");
  const evalCallIdx = lifecycleCode.indexOf("evaluateDecision(experience)");
  check("12. evaluateDecision() call is textually and causally downstream of the outcome success guard within the same function body", guardIdx !== -1 && evalCallIdx !== -1 && evalCallIdx > guardIdx, `guardIdx=${guardIdx} evalCallIdx=${evalCallIdx}`);
}

// ===========================================================================
// Insufficient evidence protection
// ===========================================================================

// 13. automatic lifecycle must not permanently persist a transient INSUFFICIENT_EVIDENCE result
{
  const guardBlockMatch = lifecycleCode.match(/if \(evaluation\.evaluationClass === "INSUFFICIENT_EVIDENCE"\) \{([\s\S]*?)\}/);
  const guardBody = guardBlockMatch?.[1] ?? "";
  const skipsPersistence = guardBody.length > 0 && !guardBody.includes("persistDecisionEvaluation");
  check("13. The INSUFFICIENT_EVIDENCE branch does NOT call persistDecisionEvaluation() — automatic persistence is skipped for this class", skipsPersistence, `guard body="${guardBody.trim()}"`);
}

// 14. manual/historical evaluation semantics remain untouched
{
  // evaluateAndPersistDecision() (the manual/historical convenience
  // wrapper) is never called by the lifecycle orchestrator at all — the
  // orchestrator composes getDecisionExperienceForEvaluation +
  // evaluateDecision + persistDecisionEvaluation directly instead, so the
  // wrapper's own unconditional-persist behavior (including a legitimate
  // INSUFFICIENT_EVIDENCE for a real historical gap) is never modified or
  // bypassed for its own callers.
  check("14. The lifecycle orchestrator never calls evaluateAndPersistDecision() — that manual/historical wrapper's unconditional-persist behavior is untouched", !lifecycleCode.includes("evaluateAndPersistDecision("), "orchestrator unexpectedly calls the manual wrapper");
  check("14b. lib/ai/decisionEvaluation/repository.ts's evaluateAndPersistDecision() still persists unconditionally for manual use (file untouched)", decisionEvaluationRepoSource.includes("return persistDecisionEvaluation(evaluation);"), "manual wrapper's persistence call was modified");
}

// ===========================================================================
// Scope guards
// ===========================================================================

// 15. paperTrader.ts contains exactly the orchestrator lifecycle trigger, not separate unordered outcome/evaluation calls
{
  const hasOrchestratorCall = paperTraderSource.includes("completeDecisionLearningLifecycle(signal.id)");
  const hasDirectOutcomeCall = paperTraderSource.includes("captureAndPersistOutcome(signal.id)");
  const hasDirectEvalCall = paperTraderSource.includes("evaluateAndPersistDecision(") || paperTraderSource.includes("evaluateDecision(");
  check("15. paperTrader.ts calls completeDecisionLearningLifecycle() exactly, with no separate direct captureAndPersistOutcome()/evaluateAndPersistDecision() calls of its own", hasOrchestratorCall && !hasDirectOutcomeCall && !hasDirectEvalCall, `hasOrchestratorCall=${hasOrchestratorCall} hasDirectOutcomeCall=${hasDirectOutcomeCall} hasDirectEvalCall=${hasDirectEvalCall}`);
}

// 16. decisionOutcome files do not import decisionEvaluation (behavioral coupling check — type-only re-exports are not the concern here)
{
  const files = { "capture.ts": decisionOutcomeCaptureSource, "contracts.ts": decisionOutcomeContractsSource, "repository.ts": decisionOutcomeRepoSource };
  const violations = Object.entries(files)
    .filter(([, src]) => src.includes('from "@/lib/ai/decisionEvaluation/repository"') || src.includes('from "@/lib/ai/decisionEvaluation/evaluate"'))
    .map(([name]) => name);
  check("16. No file under lib/ai/decisionOutcome/* imports decisionEvaluation's repository.ts or evaluate.ts (no behavioral coupling)", violations.length === 0, `violations: ${violations.join(", ")}`);
}

// 17. decisionEvaluation's behavioral files do not import decisionOutcome's behavioral files.
//     NOTE: lib/ai/decisionEvaluation/contracts.ts legitimately imports the
//     TYPE `DecisionExperienceRecord` from lib/ai/decisionOutcome/contracts.ts
//     — this is the existing, protected (untouched by this phase), shared
//     input-shape definition, not a runtime/behavioral coupling between the
//     two domains' repository logic. This fixture checks specifically for
//     the coupling this task's dependency-direction rule actually cares
//     about: neither domain's repository.ts (the DB-touching layer) may
//     call into the other's repository.ts or capture.ts/evaluate.ts.
{
  const files = { "evaluate.ts": decisionEvaluationEvaluateSource, "repository.ts": decisionEvaluationRepoSource };
  const violations = Object.entries(files)
    .filter(([, src]) => src.includes('from "@/lib/ai/decisionOutcome/repository"') || src.includes('from "@/lib/ai/decisionOutcome/capture"'))
    .map(([name]) => name);
  check("17. Neither lib/ai/decisionEvaluation/evaluate.ts nor repository.ts imports decisionOutcome's repository.ts or capture.ts (no behavioral coupling; the existing type-only DecisionExperienceRecord import in contracts.ts is unaffected and out of scope for this check)", violations.length === 0, `violations: ${violations.join(", ")}`);
}

// 18. lifecycle orchestrator is the composition boundary — it, and only it, imports both domains
{
  const importsOutcome = lifecycleSource.includes('from "@/lib/ai/decisionOutcome/repository"');
  const importsEvaluation = lifecycleSource.includes('from "@/lib/ai/decisionEvaluation/repository"') || lifecycleSource.includes('from "@/lib/ai/decisionEvaluation/evaluate"') || lifecycleSource.includes('from "@/lib/ai/decisionEvaluation/contracts"');
  check("18. lib/ai/decisionLearning/lifecycle.ts imports from BOTH lib/ai/decisionOutcome/* and lib/ai/decisionEvaluation/* — it is the sole composition boundary", importsOutcome && importsEvaluation, `importsOutcome=${importsOutcome} importsEvaluation=${importsEvaluation}`);
}

// 19. no retry infrastructure introduced
{
  const forbiddenRetryTerms = ["setTimeout(", "setInterval(", "cron", "queue", "Queue", "retry", "Retry", "backoff"];
  const foundIn = [lifecycleCode, codeOnly(paperTraderSource)].map((src) => forbiddenRetryTerms.filter((t) => src.includes(t))).flat();
  check("19. No retry/queue/cron/polling/backoff infrastructure was introduced in lifecycle.ts or paperTrader.ts", foundIn.length === 0, `found: ${foundIn.join(", ")}`);
}

// 20. no auto-trading/order execution introduced
{
  const forbiddenTradingTerms = ["placeOrder", "executeSignal(", "OpenAI", "Claude", "auto_trade", "autoTrade", "Binance", "binance"];
  const found = forbiddenTradingTerms.filter((t) => lifecycleCode.includes(t));
  check("20. No auto-trading/order-execution/LLM/Binance terms appear in lifecycle.ts", found.length === 0, `found: ${found.join(", ")}`);
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Decision Learning lifecycle fixtures passed.` : `\n${failures} Decision Learning lifecycle fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
