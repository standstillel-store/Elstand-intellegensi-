// ---------------------------------------------------------------------------
// ELVOID Intelligence — Closed Learning Feedback Loop (Phase 8.2.8)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This phase is ORCHESTRATION/INTEGRATION ONLY. It contains zero
//     evaluation, pattern-detection, constraint-generation, or
//     constraint-validation logic — all of that remains exclusively owned
//     by Phases 8.1.0-8.1.5 (`lib/ai/decisionOutcome/*`,
//     `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`,
//     `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`,
//     `lib/ai/decisionLearning/lifecycle.ts`). This module never imports
//     any of those modules' logic files — only the type of Phase 8.2.7's
//     own output (`AutonomousExecutionOutcome`) and Phase 8.2.6's
//     `DecisionSource`.
//   - DISCOVERED, NOT ASSUMED: direct inspection of
//     `lib/elvoid/paperTrader.ts::writeClose()` and
//     `lib/ai/oracle/execute.ts::executeOracleSignal()` (both pre-existing,
//     UNMODIFIED by this phase) confirms the outcome/evaluation half of the
//     loop is ALREADY fully wired and already reachable from Phase 8.2.7's
//     `executeAutonomousPaperTrade()`:
//
//       Autonomous EXECUTE (8.2.6)
//         -> executeAutonomousPaperTrade() (8.2.7, THIS pass's caller)
//         -> executeOracleSignal() (pre-existing, Phase 5)
//              -> lib/elvoid/paperTrader.ts::executeSignal()  [creates the
//                 ai_signals row -> "open"/"pending"]
//              -> captureDecisionExperienceBestEffort()        [Phase 8.1.0,
//                 already wired inside executeOracleSignal() BEFORE this
//                 phase existed — fires for every ELVOID_PRO_ORACLE
//                 execution, success path only]
//         -> ... position runs, then closes via
//            evaluateOpenTrades()/closeSignalManually() ...
//         -> lib/elvoid/paperTrader.ts::writeClose()
//              -> completeDecisionLearningLifecycle(signal.id)  [Phase
//                 8.1.1.1, already wired inside writeClose() BEFORE this
//                 phase existed — sequences outcome-capture-then-evaluation
//                 for EVERY closed signal; naturally a no-op for any
//                 signal that never got a decision_experiences row, which
//                 is exactly every non-ELVOID_PRO_ORACLE signal, since
//                 captureDecisionExperience() is only ever called from
//                 executeOracleSignal()]
//
//     This means: EXECUTE -> Paper Trade -> Trade Outcome -> Decision
//     Experience -> Decision Evaluation is a closed loop with ZERO
//     additional source-file changes required — the connection already
//     existed, contributed by Phases 8.1.0 and 8.1.1.1, and Phase 8.2.7
//     reached it "for free" by reusing `executeOracleSignal()` verbatim.
//   - Failure Pattern (8.1.2) / Adaptive Constraint (8.1.4) / Constraint
//     Validation (8.1.5) remain deliberately UN-auto-triggered
//     recompute-and-upsert aggregates over the whole historical
//     population (see each module's own repository.ts header) — this
//     phase does NOT add a per-trade trigger for any of them. Forcing a
//     full recompute after every single trade close would contradict
//     their own aggregate-recompute design and was explicitly excluded
//     from this phase's scope. Wiring an automatic (e.g. scheduled)
//     trigger for those three remains a future, separately-approved
//     change, exactly like every prior 8.1.x/8.2.x phase's own
//     "left uncalled until its own separately-approved wiring phase" note.
//   - "future decision context" reachability already exists structurally
//     as of Phase 8.2.0: `buildAutonomousDecisionContext()` already
//     accepts a `DecisionMemoryResult` and a `ConstraintValidation[]` and
//     folds them into `AutonomousDecisionContext.memory` /
//     `.validConstraints`. Supplying REAL memory/constraint values to that
//     assembler (as opposed to advisory infrastructure) is decision-context
//     wiring, not learning-feedback wiring, and stays out of this phase's
//     scope per the task's own authority boundaries (8.1.x remain the
//     learning authorities; this phase never reads/writes
//     `decision_memory`/`adaptive_constraints`/`constraint_validations`).
//
// WHAT THIS FILE ACTUALLY ADDS: a small, pure, side-effect-free
// classification of Phase 8.2.7's own `AutonomousPaperExecutionResult` into
// whether the (already-existing) learning lifecycle is guaranteed to have
// been entered for that specific autonomous decision. This gives any
// future caller (monitoring/dashboard/ops tooling) a single, honest,
// non-duplicating answer to "did this autonomous decision's trade enter
// the learning pipeline?" without re-deriving the WAIT/REJECT/
// unsupported-source/execution-failed rules ad hoc, and without touching
// any protected file.
// ---------------------------------------------------------------------------

import type { AutonomousExecutionOutcome, AutonomousPaperExecutionResult } from "@/lib/ai/autonomousExecution/contracts";
import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";

export type { AutonomousExecutionOutcome, AutonomousPaperExecutionResult, DecisionSource };

/**
 * The ordered stage names of the discovered closed loop, for documentation/
 * logging purposes only — never used as a state machine, never persisted,
 * never drives any branching logic in `lifecycle.ts`. `FAILURE_PATTERN`,
 * `ADAPTIVE_CONSTRAINT`, and `CONSTRAINT_VALIDATION` are listed for
 * completeness of the requested loop description but are explicitly
 * recompute-based aggregates (see this file's header) — their presence in
 * this array does NOT imply this phase triggers them.
 */
export const CLOSED_LEARNING_LOOP_STAGES = [
  "AUTONOMOUS_EXECUTE",
  "PAPER_TRADE",
  "TRADE_OUTCOME",
  "DECISION_EXPERIENCE",
  "DECISION_EVALUATION",
  "FAILURE_PATTERN",
  "ADAPTIVE_CONSTRAINT",
  "CONSTRAINT_VALIDATION",
  "FUTURE_DECISION_CONTEXT",
] as const;
export type ClosedLearningLoopStage = (typeof CLOSED_LEARNING_LOOP_STAGES)[number];

/**
 * Closed set of reasons a given `AutonomousPaperExecutionResult` either
 * will or will not reach the existing outcome/evaluation lifecycle.
 * Exactly one is ever returned by `classifyAutonomousLearningLifecycle()`.
 *
 *   - `LIFECYCLE_REACHABLE` — the ONLY status where a real
 *     `decision_experiences` row exists (written by
 *     `captureDecisionExperienceBestEffort()` inside the already-executed
 *     `executeOracleSignal()` call) and where a future `writeClose()` on
 *     this exact `paperTradeId` is guaranteed to invoke
 *     `completeDecisionLearningLifecycle()`.
 *   - `SKIPPED_WAIT` / `SKIPPED_REJECT` — Phase 8.2.7 never called
 *     `executeOracleSignal()` at all; no `ai_signals` row, no
 *     `decision_experiences` row, nothing to ever close.
 *   - `SKIPPED_UNSUPPORTED_SOURCE` — an `EXECUTE` decision from any source
 *     other than `ELVOID_PRO_ORACLE`; Phase 8.2.7 has no wired execution
 *     path for it, so nothing was created.
 *   - `SKIPPED_EXECUTION_FAILED` — an `EXECUTE` attempt for
 *     `ELVOID_PRO_ORACLE` that did not produce a paper trade (missing
 *     inputs, mismatched symbol, or `executeOracleSignal()` itself
 *     reporting failure). No fake outcome is ever synthesized for this
 *     case — `paperTradeId`/`signalId` stay `null` all the way through.
 */
export type AutonomousLearningLifecycleStatus =
  | "LIFECYCLE_REACHABLE"
  | "SKIPPED_WAIT"
  | "SKIPPED_REJECT"
  | "SKIPPED_UNSUPPORTED_SOURCE"
  | "SKIPPED_EXECUTION_FAILED";

/**
 * `classifyAutonomousLearningLifecycle()`'s single output shape.
 * `sourceSignalId` mirrors the exact identifier
 * `completeDecisionLearningLifecycle(sourceSignalId)` will eventually be
 * called with by `paperTrader.ts::writeClose()` — this file reuses that
 * existing semantics verbatim (it IS `AutonomousPaperExecutionResult.paperTradeId`,
 * which IS the `ai_signals.id` `writeClose()` already keys off of) rather
 * than inventing a second identifier.
 */
export interface ClosedLearningFeedbackLoopResult {
  /** Schema-evolution marker only. */
  readonly version: 1;
  readonly symbol: string;
  readonly status: AutonomousLearningLifecycleStatus;
  /** True only for `status === "LIFECYCLE_REACHABLE"`. */
  readonly willEnterLearningLifecycleOnClose: boolean;
  /**
   * = `execution.paperTradeId` when `willEnterLearningLifecycleOnClose` is
   * true, `null` otherwise. Never a fabricated id — copied verbatim from
   * Phase 8.2.7's own result, never re-derived.
   */
  readonly sourceSignalId: string | null;
}
