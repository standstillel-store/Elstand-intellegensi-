// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Paper Execution Adapter (Phase 8.2.7)
//
// AutonomousDecision (8.2.6) -> this adapter -> lib/ai/oracle/execute.ts's
// existing executeOracleSignal() -> lib/elvoid/paperTrader.ts's existing
// executeSignal() -> the existing new -> open/pending -> tp1_hit -> closed
// lifecycle. See contracts.ts's header for the full authority boundary.
//
// THIS FILE CONTAINS NO DECISION LOGIC. It does not re-evaluate, re-grade,
// or second-guess `input.decision.decision` — it is a single fixed gate
// (`decision === "EXECUTE"`) followed by a fixed dispatch (source ===
// "ELVOID_PRO_ORACLE" -> existing executeOracleSignal(), anything else ->
// safe no-op). Every other concern (risk-plan validity, idempotency,
// duplicate-click protection, wallet math, the open/pending/closed
// lifecycle itself) already lives in executeOracleSignal()/executeSignal()
// and is never re-implemented, re-checked, or bypassed here.
//
// Zero imports from lib/ai/oracle/grading.ts, lib/elvoid/engine.ts, or
// lib/elvoid/scanners.ts. Zero direct Supabase/network calls in this file
// itself — every DB touch happens exclusively inside the existing,
// unmodified executeOracleSignal()/persistDecisionTrace() functions this
// file calls.
// ---------------------------------------------------------------------------

import { executeOracleSignal as realExecuteOracleSignal } from "@/lib/ai/oracle/execute";
import { persistDecisionTrace as realPersistDecisionTrace } from "@/lib/ai/decisionTrace/repository";
import type { TraceOutcome } from "@/lib/ai/decisionTrace/contracts";
import type { AutonomousExecutionDeps, AutonomousExecutionOutcome, AutonomousPaperExecutionInput, AutonomousPaperExecutionResult } from "./contracts";

/** Copied 1:1 from `AutonomousDecision`'s own three members — `decideAutonomous()` (8.2.6) never produces a fourth value. */
function traceOutcomeFor(decision: AutonomousPaperExecutionInput["decision"]["decision"]): TraceOutcome {
  return decision; // "EXECUTE" | "WAIT" | "REJECT" — each is already a valid TraceOutcome member.
}

/**
 * Best-effort, fire-and-forget decision-trace write — links this attempt to
 * Phase 8.2.1's own trace semantics without ever affecting the execution
 * result this module returns. Scoped to `source === "ELVOID_PRO_ORACLE"`
 * only, matching `TraceSource`'s own hard boundary (see contracts.ts
 * header) — traced for every outcome (`EXECUTE`/`WAIT`/`REJECT`), not just
 * successful executions, mirroring `decisionTrace/contracts.ts`'s own "every
 * autonomous decision resolves to exactly one of four traced outcomes"
 * framing (`EXPIRE` is structurally unreachable here — 8.2.6 never
 * produces it).
 */
function persistTraceBestEffort(
  input: AutonomousPaperExecutionInput,
  paperTradeId: string | null,
  persist: NonNullable<AutonomousExecutionDeps["persistDecisionTrace"]>
): void {
  if (input.decision.source !== "ELVOID_PRO_ORACLE") return;
  persist({
    source: "ELVOID_PRO_ORACLE",
    outcome: traceOutcomeFor(input.decision.decision),
    symbol: input.decision.symbol,
    side: input.assessment?.side ?? null,
    decisionTimestamp: input.decision.generatedAt,
    snapshot: input.learningContext ?? null,
    sourceSignalId: paperTradeId,
  }).catch(() => {
    // Intentionally swallowed — same convention as
    // lib/ai/oracle/execute.ts::captureDecisionExperienceBestEffort().
    // Trace-write failure must never affect the trading result.
  });
}

function result(
  input: AutonomousPaperExecutionInput,
  outcome: AutonomousExecutionOutcome,
  paperTradeId: string | null,
  signalId: string | null,
  error: string | null
): AutonomousPaperExecutionResult {
  return {
    version: 1,
    symbol: input.decision.symbol,
    decision: input.decision.decision,
    outcome,
    paperTradeId,
    signalId,
    error,
  };
}

/**
 * The adapter's sole entry point. Pure gate + dispatch — see this file's
 * header. Never mutates `input` or anything nested inside it (`decision`,
 * `assessment`, `risk`, `confluence`, `learningContext` are only ever read,
 * never written).
 *
 * `deps` is an optional testability seam (see contracts.ts) — omit it in
 * production; both dependencies default to the real, unmodified functions.
 */
export async function executeAutonomousPaperTrade(input: AutonomousPaperExecutionInput, deps: AutonomousExecutionDeps = {}): Promise<AutonomousPaperExecutionResult> {
  const executeOracle = deps.executeOracleSignal ?? realExecuteOracleSignal;
  const persistTrace = deps.persistDecisionTrace ?? realPersistDecisionTrace;

  // --- Rule: WAIT -> absolutely no trade execution. ---
  if (input.decision.decision === "WAIT") {
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "SKIPPED_WAIT", null, null, null);
  }

  // --- Rule: REJECT -> absolutely no trade execution. ---
  if (input.decision.decision === "REJECT") {
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "SKIPPED_REJECT", null, null, null);
  }

  // From here on, input.decision.decision === "EXECUTE".

  // --- Rule: only ELVOID_PRO_ORACLE has a wired execution path in this phase. ---
  if (input.decision.source !== "ELVOID_PRO_ORACLE") {
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "SKIPPED_UNSUPPORTED_SOURCE", null, null, `No autonomous execution path is wired for source "${input.decision.source}" in Phase 8.2.7.`);
  }

  // --- Required canonical inputs must actually be present, and must identify the same decision. ---
  if (!input.assessment || !input.risk) {
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "EXECUTION_FAILED", null, null, "EXECUTE decision received with no assessment/risk plan to forward — nothing to execute.");
  }
  if (input.assessment.symbol !== input.decision.symbol) {
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "EXECUTION_FAILED", null, null, `assessment.symbol ("${input.assessment.symbol}") does not match decision.symbol ("${input.decision.symbol}") — refusing to execute a mismatched signal.`);
  }

  // --- Reuse the EXISTING execution path verbatim. Never duplicated, never bypassed. ---
  try {
    const outcome = await executeOracle(input.assessment, input.risk, input.confluence, input.orderType ?? "market", input.learningContext);
    if (!outcome.success) {
      persistTraceBestEffort(input, null, persistTrace);
      return result(input, "EXECUTION_FAILED", null, null, outcome.error);
    }
    persistTraceBestEffort(input, outcome.paperTradeId, persistTrace);
    return result(input, "EXECUTED", outcome.paperTradeId, outcome.signalId, null);
  } catch (err) {
    // executeOracleSignal() is documented as non-throwing (typed error
    // union), but this guards against an unexpected rejection anyway —
    // an execution-adapter crash must never propagate as an uncaught
    // exception to whatever future caller wires this in.
    persistTraceBestEffort(input, null, persistTrace);
    return result(input, "EXECUTION_FAILED", null, null, err instanceof Error ? err.message : String(err));
  }
}
