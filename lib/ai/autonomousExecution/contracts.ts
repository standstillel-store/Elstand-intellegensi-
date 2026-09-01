// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Paper Execution Adapter (Phase 8.2.7)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a NARROW EXECUTION ADAPTER, and nothing else. It is the first
//     phase in the 8.2.x line permitted to actually CALL an execution
//     path — every phase before it (8.2.0-8.2.6) was explicitly read-only/
//     advisory. This phase still decides nothing: `AutonomousDecision`
//     (`EXECUTE | WAIT | REJECT`, Phase 8.2.6) is the sole authority over
//     whether execution happens at all.
//   - Execution happens ONLY when `input.decision.decision === "EXECUTE"`.
//     `WAIT` and `REJECT` NEVER reach the underlying paper-trade execution
//     call under any circumstance — see `execute.ts`'s `selectExecutionOutcome()`.
//   - This module never recomputes, re-derives, or mutates `grade`, `side`,
//     `confidence`, `entry`, `stopLoss`, `takeProfit`, or `riskReward`.
//     `assessment` (`OracleAssessment`, Phase 3) and `risk` (`OracleRiskPlan`,
//     Phase 3) are forwarded VERBATIM to the existing
//     `lib/ai/oracle/execute.ts::executeOracleSignal()` entry point — the
//     exact same canonical Phase 7 Oracle intelligence every ELVOID PRO
//     Execute-Signal click already goes through. Nothing here reads,
//     compares, or rewrites a single numeric field inside `assessment`/
//     `risk`.
//   - This module never imports from, and never re-implements logic in,
//     `lib/ai/oracle/grading.ts`, `lib/elvoid/engine.ts`, or
//     `lib/elvoid/scanners.ts`. It reuses the EXISTING execution
//     infrastructure end to end: `executeOracleSignal()` ->
//     `lib/elvoid/paperTrader.ts::executeSignal()` -> the existing
//     new -> open/pending -> tp1_hit -> closed lifecycle. No trade-creation
//     logic is duplicated anywhere in this phase.
//   - Scoped to `source === "ELVOID_PRO_ORACLE"` only, matching
//     `lib/ai/decisionTrace/contracts.ts`'s own hard `TraceSource` boundary
//     (Phase 8.2.1) — that module structurally cannot accept an `AI_SIGNAL`
//     trace row yet, so this phase does not attempt to wire an `AI_SIGNAL`
//     execution path either. Any other `DecisionSource` value is a safe,
//     documented no-op (`SKIPPED_UNSUPPORTED_SOURCE`) — never a silent
//     `EXECUTE`.
//   - Traceability: every attempted call links Phase 8.2.1's decision-trace
//     semantics via the EXISTING, UNCHANGED
//     `lib/ai/decisionTrace/repository.ts::persistDecisionTrace()` +
//     `lib/ai/decisionTrace/contracts.ts::validateDecisionTraceInput()` —
//     best-effort, fire-and-forget, exactly like
//     `lib/ai/oracle/execute.ts::captureDecisionExperienceBestEffort()`
//     already does for Decision Experience capture. A trace-write failure
//     (Learning DB unconfigured, network error, etc.) can NEVER affect the
//     trading result this function returns. `sourceSignalId` is populated
//     on the trace ONLY when `outcome === "EXECUTED"` and a real paper
//     trade id was produced — `WAIT`/`REJECT`/a failed `EXECUTE` attempt
//     always trace with `sourceSignalId: null`, matching
//     `validateDecisionTraceInput`'s own invariant untouched here.
//   - The one testability seam this module introduces: `executeOracleSignal`/
//     `persistDecisionTrace` are accepted as optional, injectable
//     dependencies (`AutonomousExecutionDeps`) that default to the REAL,
//     unmodified functions from `lib/ai/oracle/execute.ts` and
//     `lib/ai/decisionTrace/repository.ts`. This exists ONLY so fixtures can
//     assert call counts without a live Supabase/Learning DB connection —
//     it is not a second execution path, and production call-sites never
//     need to pass `deps` at all.
// ---------------------------------------------------------------------------

import type { AutonomousDecisionEngineResult, AutonomousDecision } from "@/lib/ai/autonomousDecision/contracts";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OrderType } from "@/lib/elvoid/types";
import type { LearningContextSnapshot } from "@/lib/ai/decisionOutcome/contracts";

// Re-exported so execute.ts/fixtures have a single import source for the
// shapes they consume — matching every earlier 8.2.x contracts module's own
// re-export convention.
export type { AutonomousDecisionEngineResult, AutonomousDecision, OracleAssessment, OracleRiskPlan, ConfluenceResult, OrderType, LearningContextSnapshot };

/**
 * Closed set of terminal outcomes this adapter can produce. Exactly one is
 * ever returned per call.
 *
 *   - `EXECUTED` — `decision === "EXECUTE"`, source was `ELVOID_PRO_ORACLE`,
 *     and the existing `executeOracleSignal()` path reported success.
 *   - `SKIPPED_WAIT` — `decision === "WAIT"`. No execution attempted.
 *   - `SKIPPED_REJECT` — `decision === "REJECT"`. No execution attempted.
 *   - `SKIPPED_UNSUPPORTED_SOURCE` — `decision === "EXECUTE"` but
 *     `input.decision.source !== "ELVOID_PRO_ORACLE"`. No wired execution
 *     path exists for any other source in this phase; fails safe to a
 *     no-op rather than guessing at one.
 *   - `EXECUTION_FAILED` — `decision === "EXECUTE"` and the source was
 *     supported, but either the required `assessment`/`risk` inputs were
 *     missing/mismatched, or the underlying `executeOracleSignal()` call
 *     itself reported failure (Supabase unconfigured, DB error,
 *     `riskStatus !== "valid"`, etc. — all of that validation already lives
 *     in `executeOracleSignal()`/`executeSignal()` and is never
 *     re-implemented here).
 */
export type AutonomousExecutionOutcome = "EXECUTED" | "SKIPPED_WAIT" | "SKIPPED_REJECT" | "SKIPPED_UNSUPPORTED_SOURCE" | "EXECUTION_FAILED";

/**
 * The adapter's single input type. `decision` (Phase 8.2.6's own output) is
 * the sole authority over whether execution is attempted at all —
 * `assessment`/`risk`/`confluence`/`orderType`/`learningContext` are the
 * SAME already-existing canonical Phase 7 Oracle values every normal
 * ELVOID PRO Execute-Signal click already supplies to `executeOracleSignal()`,
 * carried through here untouched. `assessment`/`risk` are `null`-able
 * because a `WAIT`/`REJECT` call may legitimately have no risk plan to
 * forward at all (e.g. `riskStatus !== "valid"` upstream) — required
 * (non-null) ONLY when `decision.decision === "EXECUTE"` and
 * `decision.source === "ELVOID_PRO_ORACLE"`; enforced at runtime in
 * `execute.ts`, never assumed.
 */
export interface AutonomousPaperExecutionInput {
  /** Phase 8.2.6's own final decision. Read-only; never mutated, never re-derived, never re-decided. */
  readonly decision: AutonomousDecisionEngineResult;
  /** Phase 3's canonical Oracle assessment. Forwarded verbatim to `executeOracleSignal()` — never inspected beyond an identity (`symbol`) check. */
  readonly assessment: OracleAssessment | null;
  /** Phase 3's canonical, already-validated risk plan (`entry`/`stopLoss`/`takeProfit`/`riskReward`). Forwarded verbatim — never recomputed, never mutated. */
  readonly risk: OracleRiskPlan | null;
  readonly confluence?: ConfluenceResult;
  /** Defaults to `"market"` inside `executeOracleSignal()` itself when omitted — this adapter does not impose its own default. */
  readonly orderType?: OrderType;
  /** Phase 8.1.0's optional Decision Experience snapshot — forwarded to `executeOracleSignal()` and, when present, to the best-effort decision-trace write. */
  readonly learningContext?: LearningContextSnapshot | null;
}

/**
 * The adapter's single output type. `symbol`/`decision` are copied verbatim
 * from `input.decision` — never re-derived. `paperTradeId`/`signalId` are
 * `null` for every outcome except `EXECUTED`.
 */
export interface AutonomousPaperExecutionResult {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly symbol: string;
  /** = `input.decision.decision`, copied verbatim. */
  readonly decision: AutonomousDecision;
  readonly outcome: AutonomousExecutionOutcome;
  /** = the resulting `ai_signals.id`, only ever non-null when `outcome === "EXECUTED"`. */
  readonly paperTradeId: string | null;
  /** = `buildOracleSignalId(assessment)`'s deterministic id, only ever non-null when `outcome === "EXECUTED"`. */
  readonly signalId: string | null;
  readonly error: string | null;
}

/**
 * Optional, injectable dependencies — see this file's header for why this
 * seam exists. Both default to the real, unmodified functions when omitted;
 * production call-sites never need to supply this parameter.
 */
export interface AutonomousExecutionDeps {
  readonly executeOracleSignal?: typeof import("@/lib/ai/oracle/execute").executeOracleSignal;
  readonly persistDecisionTrace?: typeof import("@/lib/ai/decisionTrace/repository").persistDecisionTrace;
}
