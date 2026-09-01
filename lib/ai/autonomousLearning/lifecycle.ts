// ---------------------------------------------------------------------------
// ELVOID Intelligence — Closed Learning Feedback Loop Classifier (Phase 8.2.8)
//
// Pure, synchronous, deterministic. Zero database/network/LLM calls. Zero
// `Date.now()`/randomness. Zero imports from `lib/ai/oracle/grading.ts`,
// `lib/elvoid/engine.ts`, `lib/elvoid/scanners.ts`, `lib/supabase.ts`, or
// any of `lib/ai/decisionOutcome/repository.ts` /
// `lib/ai/decisionEvaluation/*` / `lib/ai/failurePatterns/*` /
// `lib/ai/adaptiveConstraint/*` / `lib/ai/learningValidation/*` /
// `lib/ai/decisionLearning/lifecycle.ts` (the actual outcome-capture,
// evaluation, pattern-detection, constraint-generation, and
// constraint-validation logic these comments describe) — this file states
// what those modules already, verifiably do (see contracts.ts's header for
// the full discovered call chain); it never calls, re-implements, or
// duplicates any of it.
//
// This module does not call `executeAutonomousPaperTrade()` (Phase 8.2.7)
// either — it classifies an ALREADY-PRODUCED `AutonomousPaperExecutionResult`
// after the fact. It performs no execution of its own and cannot trigger a
// trade.
// ---------------------------------------------------------------------------

import type { AutonomousPaperExecutionResult, ClosedLearningFeedbackLoopResult, AutonomousLearningLifecycleStatus } from "./contracts";

function statusFor(execution: AutonomousPaperExecutionResult): AutonomousLearningLifecycleStatus {
  switch (execution.outcome) {
    case "EXECUTED":
      // Belt-and-suspenders: `executeAutonomousPaperTrade()`'s own contract
      // guarantees `paperTradeId !== null` whenever `outcome === "EXECUTED"`
      // (see autonomousExecution/contracts.ts), but this function never
      // simply trusts a label — a defensive fallback keeps this
      // classification honest even if that invariant were ever violated
      // upstream, without throwing (this module never throws).
      return execution.paperTradeId ? "LIFECYCLE_REACHABLE" : "SKIPPED_EXECUTION_FAILED";
    case "SKIPPED_WAIT":
      return "SKIPPED_WAIT";
    case "SKIPPED_REJECT":
      return "SKIPPED_REJECT";
    case "SKIPPED_UNSUPPORTED_SOURCE":
      return "SKIPPED_UNSUPPORTED_SOURCE";
    case "EXECUTION_FAILED":
      return "SKIPPED_EXECUTION_FAILED";
  }
}

/**
 * Classifies one already-produced Phase 8.2.7 result into whether the
 * pre-existing Phase 8.1.0/8.1.1.1 outcome-and-evaluation lifecycle is
 * guaranteed to be entered for it once the resulting position closes.
 *
 * Reuses `execution.paperTradeId` verbatim as `sourceSignalId` — the exact
 * value `lib/elvoid/paperTrader.ts::writeClose()` already calls
 * `completeDecisionLearningLifecycle(signal.id)` with when this same
 * `ai_signals` row eventually closes. This function does not — and could
 * not, being pure/offline — cause that call to happen; it only reports
 * that the already-existing wiring guarantees it will, for this specific
 * successful `EXECUTE`.
 *
 * Never mutates `execution`. Deterministic: identical input always
 * produces a deep-equal output, so calling this twice for the same
 * `execution` (e.g. once at execution time, once later for a status
 * dashboard) never does or implies any duplicate work — there is no
 * lifecycle *call* here to duplicate in the first place.
 */
export function classifyAutonomousLearningLifecycle(execution: AutonomousPaperExecutionResult): ClosedLearningFeedbackLoopResult {
  const status = statusFor(execution);
  const willEnterLearningLifecycleOnClose = status === "LIFECYCLE_REACHABLE";
  return {
    version: 1,
    symbol: execution.symbol,
    status,
    willEnterLearningLifecycleOnClose,
    sourceSignalId: willEnterLearningLifecycleOnClose ? execution.paperTradeId : null,
  };
}
