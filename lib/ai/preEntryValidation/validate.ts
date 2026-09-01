// ---------------------------------------------------------------------------
// ELVOID Intelligence — Pre-Entry Market Validation (Phase 8.2.5)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` — every timestamp in the output is copied
// verbatim from the caller-supplied `input.decisionContext.generatedAt`,
// never wall-clock-read internally, mirroring how `qualify.ts`
// (`decisionQualification/qualify.ts`) never reads a fresh timestamp
// either. Zero randomness. Zero imports from lib/ai/oracle/*,
// lib/ai/cognitive/*, lib/elvoid/*, or any trading-execution module — this
// file depends ONLY on the four plain, already-computed inputs it is
// given (`AutonomousDecisionContext`, `AutonomousQualificationResult`,
// `MacroIntelligenceContext`, `MarketImpactContext`).
//
// THIS IS NOT A SECOND ORACLE GRADING ENGINE AND NOT A SECOND
// QUALIFICATION ENGINE. `validatePreEntry()` never recomputes
// `grade`/`confidence`/`side`/`riskStatus`, never derives an
// entry/stopLoss/takeProfit, never re-derives `QualificationStatus`
// itself, and never selects EXECUTE/WAIT/REJECT. It answers exactly one
// question — "the signal is already valid (per Phase 8.2.2); is current
// market context, on closed-signal terms, suitable to proceed toward a
// later entry-decision stage" — and nothing else. Every upstream field it
// reads is read once, compared against a fixed value, and never written
// anywhere.
// ---------------------------------------------------------------------------

import type { PreEntryValidationInput, PreEntryValidationResult, PreEntryValidationSignals, PreEntryValidationStatus } from "./contracts";

/**
 * Computes the eleven closed, independently derived booleans this
 * engine's status decision is a pure function of. Each field reads a
 * fixed field off one of the three optional inputs and nothing else — no
 * recomputation, no re-derivation of any upstream value's own internal
 * logic (e.g. `qualificationConflicted` compares `qualification.status`
 * against a fixed literal; it never re-runs Phase 8.2.2's own
 * `selectQualificationStatus()` signal logic).
 */
function computeSignals(input: PreEntryValidationInput): PreEntryValidationSignals {
  const { qualification, macro, eventImpact } = input;

  const qualificationPresent = qualification !== null;
  const macroPresent = macro !== null;
  const eventImpactPresent = eventImpact !== null;

  const qualificationInsufficient = qualificationPresent && qualification!.status === "INSUFFICIENT_CONTEXT";
  const qualificationConflicted = qualificationPresent && qualification!.status === "CONFLICTED";
  const qualificationCaution = qualificationPresent && qualification!.status === "CAUTION";
  const riskValid = qualificationPresent && qualification!.signals.riskValid;

  const macroEventRiskElevated = macroPresent && macro!.eventRisk === "ELEVATED";
  const eventImpactRiskElevated = eventImpactPresent && eventImpact!.impactRisk === "ELEVATED";
  const conflictingImpactPresent = eventImpactPresent && eventImpact!.conflictingImpact === true;

  const macroDataIncomplete = macroPresent && macro!.dataAvailability !== "AVAILABLE";
  const newsDataIncomplete = eventImpactPresent && eventImpact!.newsAvailability !== "AVAILABLE";

  return {
    qualificationPresent,
    macroPresent,
    eventImpactPresent,
    qualificationInsufficient,
    qualificationConflicted,
    qualificationCaution,
    riskValid,
    macroEventRiskElevated,
    eventImpactRiskElevated,
    conflictingImpactPresent,
    macroDataIncomplete,
    newsDataIncomplete,
  };
}

/**
 * Deterministic, fail-closed status selection from the eleven
 * independently computed signals. Priority order (first match wins) —
 * most-fundamental concern first, mirroring
 * `decisionQualification/qualify.ts`'s own `selectQualificationStatus()`
 * pattern:
 *
 *   1. `!qualificationPresent || !macroPresent || !eventImpactPresent` ->
 *      `INSUFFICIENT_CONTEXT` (a required upstream input was not
 *      supplied at all — nothing can be honestly validated without it).
 *   2. `qualificationInsufficient` -> `INSUFFICIENT_CONTEXT` (the
 *      upstream qualification engine itself had insufficient context —
 *      this phase inherits that fail-safe rather than guessing past it).
 *   3. `qualificationConflicted` -> `BLOCKED` (documented historical
 *      Decision Memory evidence already conflicts with trusting this
 *      signal, per Phase 8.2.2 — outranks every market-context concern
 *      below).
 *   4. `macroEventRiskElevated || eventImpactRiskElevated` -> `BLOCKED`
 *      (an imminent/near high-impact macro event, or an event-risk-
 *      elevated news window — a strong, closed-signal reason market
 *      context is currently unsuitable).
 *   5. `conflictingImpactPresent` -> `CAUTION` (recent news is internally
 *      conflicted — a lesser concern than elevated event risk).
 *   6. `!riskValid` -> `CAUTION` (no valid risk plan on the underlying
 *      signal).
 *   7. `macroDataIncomplete || newsDataIncomplete` -> `CAUTION` (market
 *      context is honestly incomplete, even if nothing above fired).
 *   8. `qualificationCaution` -> `CAUTION` (the qualification engine
 *      itself already flagged a lesser concern).
 *   9. Otherwise -> `VALID` (every concern cleared).
 *
 * Exactly one status is ever returned; there is no fallthrough case that
 * silently defaults to `VALID`.
 */
function selectValidationStatus(signals: PreEntryValidationSignals): PreEntryValidationStatus {
  if (!signals.qualificationPresent || !signals.macroPresent || !signals.eventImpactPresent) return "INSUFFICIENT_CONTEXT";
  if (signals.qualificationInsufficient) return "INSUFFICIENT_CONTEXT";
  if (signals.qualificationConflicted) return "BLOCKED";
  if (signals.macroEventRiskElevated || signals.eventImpactRiskElevated) return "BLOCKED";
  if (signals.conflictingImpactPresent) return "CAUTION";
  if (!signals.riskValid) return "CAUTION";
  if (signals.macroDataIncomplete || signals.newsDataIncomplete) return "CAUTION";
  if (signals.qualificationCaution) return "CAUTION";
  return "VALID";
}

/**
 * Pure, deterministic, synchronous. The same `input` always produces a
 * byte-identical `PreEntryValidationResult`. Never mutates `input` or
 * anything nested inside it (`decisionContext`/`qualification`/`macro`/
 * `eventImpact` are only ever read, never written). Holds no state across
 * calls.
 *
 * `symbol`/`source`/`generatedAt` are carried forward verbatim from
 * `input.decisionContext` — never re-derived. `signals` are eleven
 * independently computed booleans; `status` is a deterministic function
 * of `signals` alone (see `selectValidationStatus()`).
 *
 * Note that `input.decisionContext.canonical`/`cognitive`/`memory`/
 * `validConstraints` are deliberately never read directly by this
 * function or by `computeSignals()`. Phase 8.2.2's `qualification` result
 * already summarizes the canonical assessment and Decision Memory
 * concerns this phase needs (`riskValid`, `status`); re-reading
 * `decisionContext` fields directly here would risk re-implementing Phase
 * 8.2.2's own qualification logic a second time, which this phase's own
 * rules forbid.
 */
export function validatePreEntry(input: PreEntryValidationInput): PreEntryValidationResult {
  const signals = computeSignals(input);

  return {
    version: 1,
    symbol: input.decisionContext.symbol,
    source: input.decisionContext.source,
    generatedAt: input.decisionContext.generatedAt,
    status: selectValidationStatus(signals),
    signals,
  };
}
