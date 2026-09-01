// ---------------------------------------------------------------------------
// ELVOID Intelligence — Pre-Entry Market Validation (Phase 8.2.5)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a DOWNSTREAM, PURE VALIDATION LAYER over four already-produced
//     upstream shapes — Phase 8.2.0's `AutonomousDecisionContext`, Phase
//     8.2.2's `AutonomousQualificationResult`, Phase 8.2.3's
//     `MacroIntelligenceContext`, and Phase 8.2.4's `MarketImpactContext`.
//     It is NOT a second Oracle grading engine and NOT a second
//     qualification engine. It never recalculates, re-derives, or
//     overrides `grade`, `confidence`, `side`, `riskStatus`, `entry`,
//     `stopLoss`, `takeProfit`, or `QualificationStatus` — every one of
//     those is a read-only, verbatim-copied or compared-against-a-fixed-
//     value input here, never written back to anywhere.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`,
//     or any decision-lifecycle/autonomous-execution path. It imports only
//     type-only contracts from `lib/ai/autonomous/contracts.ts` (Phase
//     8.2.0), `lib/ai/decisionQualification/contracts.ts` (Phase 8.2.2),
//     `lib/ai/macroIntelligence/contracts.ts` (Phase 8.2.3), and
//     `lib/ai/eventImpact/contracts.ts` (Phase 8.2.4) — the four upstream
//     inputs this phase reads, and nothing else.
//   - Output is a CLOSED status enum — `VALID | CAUTION | BLOCKED |
//     INSUFFICIENT_CONTEXT` — plus a closed, boolean-only signal record.
//     There is deliberately no free-text/reason/explanation/narrative
//     field anywhere in this file's types, matching every other
//     8.1.x/8.2.x contracts module's "closed enums, booleans, timestamps
//     only" convention. No causal claim has a field to be attached to,
//     even by accident.
//   - `VALID`/`CAUTION`/`BLOCKED`/`INSUFFICIENT_CONTEXT` are ADVISORY
//     ONLY, for a later, separately-approved autonomous-decision phase to
//     read. There is no EXECUTE/WAIT/REJECT field anywhere in this file,
//     by design — deciding what to DO with a validation status is
//     explicitly out of scope for this phase, the same "assemble/
//     validate, do not decide" boundary every prior 8.1.x/8.2.x phase
//     already draws around its own outputs. This phase answers exactly
//     one question — "the signal is already valid (per Phase 8.2.2); is
//     current market context suitable to proceed toward entry?" — and
//     nothing else.
//   - `PreEntryValidationInput` is anchored on four caller-supplied,
//     already-computed upstream results — every field of the result is
//     either a narrow copy of an input field, a reference carried through
//     unchanged, or one of the independently computed booleans in
//     `PreEntryValidationSignals`. Nothing is fabricated, nothing is
//     recomputed from a source outside the four inputs themselves.
//   - Pure data shape only — no logic lives in this file. See `validate.ts`
//     for the pure, deterministic evaluator function.
//   - UNWIRED: nothing in the app imports from
//     `lib/ai/preEntryValidation/*` yet. No route, no cron, no UI, no
//     execution call-site. Wiring a consumer (and any EXECUTE/WAIT/REJECT
//     logic that would read this status) is a separately-approved future
//     phase (8.2.6+), NOT implemented here.
// ---------------------------------------------------------------------------

import type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource } from "@/lib/ai/autonomous/contracts";
import type { AutonomousQualificationResult, QualificationStatus } from "@/lib/ai/decisionQualification/contracts";
import type { MacroIntelligenceContext, MacroEventRiskLevel, MacroDataAvailability } from "@/lib/ai/macroIntelligence/contracts";
import type { MarketImpactContext, ImpactRisk, NewsDataAvailability } from "@/lib/ai/eventImpact/contracts";

// Re-exported so validate.ts/fixtures have a single import source for the
// upstream shapes they consume — this module does not define its own
// competing decision-context/qualification/macro/event-impact type,
// matching every earlier 8.2.x contracts module's own re-export
// convention.
export type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource, AutonomousQualificationResult, QualificationStatus, MacroIntelligenceContext, MacroEventRiskLevel, MacroDataAvailability, MarketImpactContext, ImpactRisk, NewsDataAvailability };

/**
 * Closed set of terminal pre-entry validation outcomes. Exactly one is
 * ever produced per input — see `validate.ts::selectValidationStatus()`
 * for the deterministic, fail-closed, priority-ordered selection. No
 * fifth value, no free-text status, no numeric score standing in for one
 * of these four.
 *
 *   - `VALID` — every concern below cleared; current market context is,
 *     on its own closed-signal terms, suitable to proceed toward a later
 *     entry-decision stage. This is advisory only — it is never itself an
 *     EXECUTE instruction.
 *   - `CAUTION` — market context is present and usable, but at least one
 *     lesser concern applies (an invalid/unavailable risk plan, a
 *     `CAUTION`-qualified signal, conflicting recent news impact, or
 *     partial macro/news data availability). Proceed, if at all, with
 *     reduced trust.
 *   - `BLOCKED` — a strong, closed-signal concern makes proceeding
 *     unsuitable: the upstream qualification itself is `CONFLICTED`
 *     (documented historical evidence conflicts with trusting this
 *     signal), or event risk is `ELEVATED` (an imminent/near high-impact
 *     macro event or an event-risk-elevated news window). Outranks
 *     `CAUTION` — both are stronger concerns than a missing risk plan, a
 *     `CAUTION` qualification, or partial data.
 *   - `INSUFFICIENT_CONTEXT` — there is not enough of the right kind of
 *     context to validate anything at all: a required upstream input is
 *     missing (`qualification`/`macro`/`eventImpact` is `null`), or the
 *     upstream qualification itself is `INSUFFICIENT_CONTEXT`. This is
 *     the fail-safe default whenever required context is missing; it is
 *     never skipped in favor of guessing `CAUTION`, `BLOCKED`, or
 *     `VALID`.
 */
export type PreEntryValidationStatus = "VALID" | "CAUTION" | "BLOCKED" | "INSUFFICIENT_CONTEXT";

/**
 * Closed, boolean-only signal record. Each field is one independently
 * computed concern; `status` is a deterministic function of this record
 * alone (see `validate.ts::selectValidationStatus()`), never an
 * independent judgment call. No signal here is a score/confidence/
 * probability — every member is a plain boolean, matching
 * `QualificationSignals`'s own convention
 * (`decisionQualification/contracts.ts`).
 */
export interface PreEntryValidationSignals {
  /** `input.qualification !== null` — a Phase 8.2.2 qualification result was supplied at all. */
  readonly qualificationPresent: boolean;
  /** `input.macro !== null` — a Phase 8.2.3 macro intelligence context was supplied at all. */
  readonly macroPresent: boolean;
  /** `input.eventImpact !== null` — a Phase 8.2.4 market impact context was supplied at all. */
  readonly eventImpactPresent: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "INSUFFICIENT_CONTEXT"` — copied as a
   * comparison against the upstream engine's own closed status, never
   * re-derived from `qualification.signals` directly (that would risk
   * re-implementing Phase 8.2.2's own `selectQualificationStatus()`
   * priority logic a second time).
   */
  readonly qualificationInsufficient: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "CONFLICTED"` — a documented
   * historical Decision Memory conflict was already found upstream.
   */
  readonly qualificationConflicted: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "CAUTION"` — the qualification
   * engine itself found a lesser concern (invalid risk plan or an
   * advisory constraint).
   */
  readonly qualificationCaution: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.signals.riskValid` — copied verbatim from Phase
   * 8.2.2's own already-computed signal, never recomputed from
   * `decisionContext.canonical.riskStatus` a second time.
   */
  readonly riskValid: boolean;
  /**
   * Only meaningful when `macroPresent`. `input.macro.eventRisk ===
   * "ELEVATED"` — copied as a comparison against Phase 8.2.3's own
   * closed enum, never re-derived from raw calendar data.
   */
  readonly macroEventRiskElevated: boolean;
  /**
   * Only meaningful when `eventImpactPresent`. `input.eventImpact.
   * impactRisk === "ELEVATED"` — copied as a comparison against Phase
   * 8.2.4's own closed enum (itself a direct alias of
   * `MacroEventRiskLevel`, verbatim-copied from `input.macro.eventRisk`
   * — see `eventImpact/contracts.ts`'s own doc comment), never
   * re-derived.
   */
  readonly eventImpactRiskElevated: boolean;
  /**
   * Only meaningful when `eventImpactPresent`.
   * `input.eventImpact.conflictingImpact` — copied verbatim from Phase
   * 8.2.4's own already-computed existence/conflict signal, never
   * re-derived from raw news sentiment a second time.
   */
  readonly conflictingImpactPresent: boolean;
  /**
   * Only meaningful when `macroPresent`.
   * `input.macro.dataAvailability !== "AVAILABLE"` (covers both
   * `PARTIAL` and `UNAVAILABLE`) — copied as a comparison against Phase
   * 8.2.3's own closed enum, never re-derived.
   */
  readonly macroDataIncomplete: boolean;
  /**
   * Only meaningful when `eventImpactPresent`.
   * `input.eventImpact.newsAvailability !== "AVAILABLE"` (covers both
   * `PARTIAL` and `UNAVAILABLE`) — copied as a comparison against Phase
   * 8.2.4's own closed enum, never re-derived.
   */
  readonly newsDataIncomplete: boolean;
}

/**
 * The pure evaluator's single input type. `decisionContext` (Phase 8.2.0)
 * is the sole required upstream input carried through for identity fields
 * (`symbol`/`source`/`generatedAt`) — this phase never reads
 * `decisionContext.canonical`/`cognitive`/`memory`/`validConstraints`
 * directly; those are already summarized by `qualification` (Phase
 * 8.2.2), which this phase reads instead, to avoid a second, drifting
 * copy of Phase 8.2.2's own qualification logic. `qualification`,
 * `macro`, and `eventImpact` are each independently nullable — a `null`
 * value represents an honest "this context was not supplied", never
 * fabricated as an empty-but-present object — matching
 * `AutonomousDecisionContext`'s own `cognitive`/`memory` null convention.
 */
export interface PreEntryValidationInput {
  /** Phase 8.2.0's own context. Read-only; never mutated, never re-derived. Only `symbol`/`source`/`generatedAt` are read from it (see `validate.ts`). */
  readonly decisionContext: AutonomousDecisionContext;
  /** Phase 8.2.2's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly qualification: AutonomousQualificationResult | null;
  /** Phase 8.2.3's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly macro: MacroIntelligenceContext | null;
  /** Phase 8.2.4's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly eventImpact: MarketImpactContext | null;
}

/**
 * The pure evaluator's single output type. `symbol`, `source`, and
 * `generatedAt` are copied verbatim from `input.decisionContext` — never
 * re-derived, never wall-clock-generated here. `status` is a
 * deterministic function of `signals` alone.
 */
export interface PreEntryValidationResult {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly symbol: string;
  readonly source: DecisionSource;
  /** = `input.decisionContext.generatedAt`, copied verbatim — the instant the *decision context* was assembled, not a new validation-time read. */
  readonly generatedAt: string;
  readonly status: PreEntryValidationStatus;
  readonly signals: PreEntryValidationSignals;
}
