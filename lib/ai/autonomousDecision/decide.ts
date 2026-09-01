// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Engine (Phase 8.2.6)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` — the only timestamp in the output is copied
// verbatim from the caller-supplied `input.decisionContext.generatedAt`,
// never wall-clock-read internally, mirroring how `validate.ts`
// (`preEntryValidation/validate.ts`) and `qualify.ts`
// (`decisionQualification/qualify.ts`) never read a fresh timestamp
// either. Zero randomness. Zero imports from lib/ai/oracle/*,
// lib/ai/cognitive/*, lib/elvoid/*, or any trading-execution module — this
// file depends ONLY on the five plain, already-computed inputs it is
// given (`AutonomousDecisionContext`, `AutonomousQualificationResult`,
// `MacroIntelligenceContext`, `MarketImpactContext`,
// `PreEntryValidationResult`).
//
// THIS IS NOT A SECOND ORACLE GRADING ENGINE, NOT A SECOND QUALIFICATION
// ENGINE, AND NOT A SECOND PRE-ENTRY VALIDATOR. `decideAutonomous()` never
// recomputes `grade`/`confidence`/`side`/`riskStatus`, never derives an
// entry/stopLoss/takeProfit, never re-derives `QualificationStatus` or
// `PreEntryValidationStatus` themselves. It answers exactly one question —
// "given everything already computed upstream, should this decision
// EXECUTE, WAIT, or REJECT" — and nothing else. Every upstream field it
// reads is read once, compared against a fixed value, and never written
// anywhere.
//
// NO EXECUTION WIRING YET. This function returns a plain in-memory
// `AutonomousDecisionEngineResult` value — it does not place an order,
// does not call `paperTrader.ts`/`execute.ts`, does not write a
// `decisionTrace` row, does not touch `ai_signals`, and has no route/
// cron/UI call-site anywhere in this phase. Acting on `decision` is a
// separately-approved future phase (8.2.7+), not implemented here.
// ---------------------------------------------------------------------------

import type { AutonomousDecision, AutonomousDecisionEngineInput, AutonomousDecisionEngineResult, AutonomousDecisionSignals } from "./contracts";

/**
 * Computes the eleven closed, independently derived booleans this
 * engine's decision is a pure function of. Each field reads a fixed
 * field off one of the four optional inputs and nothing else — no
 * recomputation, no re-derivation of any upstream value's own internal
 * logic (e.g. `preEntryBlocked` compares `preEntry.status` against a
 * fixed literal; it never re-runs Phase 8.2.5's own
 * `selectValidationStatus()` signal logic).
 */
function computeSignals(input: AutonomousDecisionEngineInput): AutonomousDecisionSignals {
  const { qualification, macro, eventImpact, preEntry } = input;

  const qualificationPresent = qualification !== null;
  const macroPresent = macro !== null;
  const eventImpactPresent = eventImpact !== null;
  const preEntryPresent = preEntry !== null;

  const requiredContextMissing = !qualificationPresent || !macroPresent || !eventImpactPresent || !preEntryPresent;

  const qualificationInsufficient = qualificationPresent && qualification!.status === "INSUFFICIENT_CONTEXT";
  const preEntryInsufficient = preEntryPresent && preEntry!.status === "INSUFFICIENT_CONTEXT";
  const preEntryBlocked = preEntryPresent && preEntry!.status === "BLOCKED";
  const qualificationConflicted = qualificationPresent && qualification!.status === "CONFLICTED";
  const preEntryCaution = preEntryPresent && preEntry!.status === "CAUTION";
  const preEntryValid = preEntryPresent && preEntry!.status === "VALID";
  const qualificationQualified = qualificationPresent && qualification!.status === "QUALIFIED";

  return {
    qualificationPresent,
    macroPresent,
    eventImpactPresent,
    preEntryPresent,
    requiredContextMissing,
    qualificationInsufficient,
    preEntryInsufficient,
    preEntryBlocked,
    qualificationConflicted,
    preEntryCaution,
    preEntryValid,
    qualificationQualified,
  };
}

/**
 * Deterministic, fail-closed decision selection from the twelve
 * independently computed signals. Priority order (first match wins) —
 * most-fundamental concern first, mirroring `preEntryValidation/
 * validate.ts`'s own `selectValidationStatus()` pattern, and matching the
 * exact 6-step priority the task specifies:
 *
 *   1. `requiredContextMissing || qualificationInsufficient ||
 *      preEntryInsufficient` -> `WAIT` (missing or insufficient context
 *      is the fail-safe default — never guessed past).
 *   2. `preEntryBlocked` -> `REJECT` (Phase 8.2.5 already found a strong,
 *      closed-signal reason market context is unsuitable).
 *   3. `qualificationConflicted` -> `REJECT` (Phase 8.2.2 already found
 *      documented historical Decision Memory evidence conflicting with
 *      trusting this signal).
 *   4. `preEntryCaution` -> `WAIT` (a lesser market-context concern —
 *      proceed, if at all, later with more information, not now).
 *   5. `preEntryValid && qualificationQualified` -> `EXECUTE` (every
 *      concern independently cleared by both upstream engines).
 *   6. Otherwise -> `WAIT` (anything ambiguous — e.g. `preEntryValid`
 *      without `qualificationQualified`, or any combination not matched
 *      above — fails safe to `WAIT`, never silently defaults to
 *      `EXECUTE`).
 *
 * Exactly one decision is ever returned; there is no fallthrough case
 * that silently defaults to `EXECUTE`.
 */
function selectAutonomousDecision(signals: AutonomousDecisionSignals): AutonomousDecision {
  if (signals.requiredContextMissing || signals.qualificationInsufficient || signals.preEntryInsufficient) return "WAIT";
  if (signals.preEntryBlocked) return "REJECT";
  if (signals.qualificationConflicted) return "REJECT";
  if (signals.preEntryCaution) return "WAIT";
  if (signals.preEntryValid && signals.qualificationQualified) return "EXECUTE";
  return "WAIT";
}

/**
 * Pure, deterministic, synchronous. The same `input` always produces a
 * byte-identical `AutonomousDecisionEngineResult`. Never mutates `input`
 * or anything nested inside it (`decisionContext`/`qualification`/
 * `macro`/`eventImpact`/`preEntry` are only ever read, never written).
 * Holds no state across calls.
 *
 * `symbol`/`source`/`generatedAt` are carried forward verbatim from
 * `input.decisionContext` — never re-derived. `signals` are twelve
 * independently computed booleans; `decision` is a deterministic function
 * of `signals` alone (see `selectAutonomousDecision()`).
 *
 * Note that `input.decisionContext.canonical`/`cognitive`/`memory`/
 * `validConstraints` are deliberately never read directly by this
 * function or by `computeSignals()`, and `input.macro`/`input.eventImpact`
 * are read ONLY for their presence (`macroPresent`/`eventImpactPresent`),
 * never for any field inside them — Phase 8.2.5's `preEntry` result
 * already summarizes every macro/event-impact concern this phase needs
 * (`BLOCKED`/`CAUTION`/`VALID`/`INSUFFICIENT_CONTEXT`); re-reading
 * `macro.eventRisk`/`eventImpact.impactRisk`/etc. directly here would
 * risk re-implementing Phase 8.2.5's own `selectValidationStatus()` logic
 * a second time, which this phase's own rules forbid. `macro`/
 * `eventImpact` remain required INPUT parameters (per the task's own
 * closed input list) purely so this phase can independently confirm they
 * were actually supplied upstream — their presence is part of "required
 * context", even though their contents are never inspected here.
 */
export function decideAutonomous(input: AutonomousDecisionEngineInput): AutonomousDecisionEngineResult {
  const signals = computeSignals(input);

  return {
    version: 1,
    symbol: input.decisionContext.symbol,
    source: input.decisionContext.source,
    generatedAt: input.decisionContext.generatedAt,
    decision: selectAutonomousDecision(signals),
    signals,
  };
}
