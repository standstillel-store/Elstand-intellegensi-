// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Runtime Orchestrator Contracts (Phase 8.2.9)
//
// Pure data shapes for the orchestration layer's own structured runtime
// result — see orchestrator.ts's header for the full pipeline this
// describes. Nothing in this file computes anything; it only names the
// shape `runAutonomousCycle()` returns.
// ---------------------------------------------------------------------------

import type { AutonomousDecision, AutonomousDecisionEngineResult } from "@/lib/ai/autonomousDecision/contracts";
import type { AutonomousExecutionOutcome } from "@/lib/ai/autonomousExecution/contracts";
import type { AutonomousLearningLifecycleStatus } from "@/lib/ai/autonomousLearning/contracts";

/**
 * Closed set of reasons a cycle produced no decision at all — distinct
 * from `AutonomousDecision` (`EXECUTE | WAIT | REJECT`), which requires a
 * canonical Oracle assessment to exist in the first place. `NO_ASSESSMENT`
 * covers both "not enough candle history" (existing `/api/elvoid-pro/oracle`
 * behavior) and any unexpected error building the canonical read — this
 * cycle is skipped entirely rather than fabricating a WAIT/REJECT for a
 * symbol the Oracle never actually assessed.
 */
export type AutonomousCycleStage = "ASSESSED" | "NO_ASSESSMENT";

/**
 * The orchestrator's single structured output per symbol per cycle. Every
 * field is either copied verbatim from an existing phase's own output or
 * a plain boolean/string the orchestrator itself is responsible for
 * (`dedupApplied`, `stage`) — never a new score/grade/confidence value.
 */
export interface AutonomousCycleResult {
  readonly version: 1;
  readonly symbol: string;
  readonly generatedAt: string;
  readonly stage: AutonomousCycleStage;
  /** `null` only when `stage === "NO_ASSESSMENT"`. */
  readonly decision: AutonomousDecision | null;
  /**
   * `true` when Phase 8.2.9 §6's dedup boundary downgraded a candidate
   * EXECUTE into an effective WAIT because the setup identity
   * (`lib/ai/autonomousRuntime/dedup.ts`) matched the last-executed setup
   * for this symbol. `decision` above reflects the EFFECTIVE (post-dedup)
   * decision that was actually acted on — the pure engine's own original
   * answer is never silently lost; see orchestrator.ts.
   */
  readonly dedupApplied: boolean;
  readonly executionOutcome: AutonomousExecutionOutcome | null;
  readonly paperTradeId: string | null;
  readonly learningLifecycleStatus: AutonomousLearningLifecycleStatus | null;
  readonly error: string | null;
}

/**
 * One batch run's summary across every symbol attempted — what the
 * runtime trigger route returns. `results` preserves per-symbol failure
 * isolation: one symbol throwing never removes the others from this
 * array (see orchestrator.ts's `runAutonomousCycle` try/catch-per-symbol
 * boundary in the batch runner).
 */
export interface AutonomousBatchResult {
  readonly version: 1;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly symbolsAttempted: number;
  readonly results: readonly AutonomousCycleResult[];
}

export type { AutonomousDecisionEngineResult };
