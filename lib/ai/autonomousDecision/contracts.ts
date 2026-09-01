// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Engine (Phase 8.2.6)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a DOWNSTREAM, PURE FINAL-DECISION LAYER over five
//     already-produced upstream shapes — Phase 8.2.0's
//     `AutonomousDecisionContext`, Phase 8.2.2's
//     `AutonomousQualificationResult`, Phase 8.2.3's
//     `MacroIntelligenceContext`, Phase 8.2.4's `MarketImpactContext`, and
//     Phase 8.2.5's `PreEntryValidationResult`. It is the first phase in
//     this whole 8.2.x line that is actually permitted to produce an
//     EXECUTE/WAIT/REJECT value — every prior phase's header explicitly
//     deferred that selection to "a later, separately-approved phase";
//     this is that phase, and it goes no further than the selection
//     itself.
//   - This is NOT a second Oracle grading engine, NOT a second
//     qualification engine, and NOT a second pre-entry validator. It
//     never recalculates, re-derives, or overrides `grade`, `confidence`,
//     `side`, `riskStatus`, `entry`, `stopLoss`, `takeProfit`,
//     `QualificationStatus`, or `PreEntryValidationStatus` — every one of
//     those is a read-only input here, compared against a fixed value or
//     existence-checked, never written back to anywhere.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`,
//     `lib/elvoid/scanners.ts`, `lib/supabase.ts`, or any decision-
//     lifecycle/autonomous-execution path. It imports only type-only
//     contracts from `lib/ai/autonomous/contracts.ts` (Phase 8.2.0),
//     `lib/ai/decisionQualification/contracts.ts` (Phase 8.2.2),
//     `lib/ai/macroIntelligence/contracts.ts` (Phase 8.2.3),
//     `lib/ai/eventImpact/contracts.ts` (Phase 8.2.4), and
//     `lib/ai/preEntryValidation/contracts.ts` (Phase 8.2.5) — the five
//     upstream inputs this phase reads, and nothing else.
//   - Output is a CLOSED, THREE-MEMBER decision enum — `EXECUTE | WAIT |
//     REJECT` — deliberately narrower than `decisionTrace/contracts.ts`'s
//     own four-member `TraceOutcome` (`EXECUTE | WAIT | REJECT | EXPIRE`):
//     `EXPIRE` is a time-based outcome that only makes sense once a trace
//     already exists and later goes stale, which is out of scope for a
//     single, synchronous, point-in-time decision function that has no
//     wall-clock access at all (see the "Zero `Date.now()`" note below) —
//     never conflated with or merged into this phase's own
//     `AutonomousDecision` type.
//   - EXECUTE/WAIT/REJECT here is ADVISORY ONLY. There is no order
//     placement, no paper-trade call, no `ai_signals`/Learning DB write,
//     no route, no cron, no UI anywhere in this phase — see the "No
//     execution wiring yet" note in `decide.ts`'s header. Producing this
//     value and ACTING on it are two separately-approved concerns; this
//     phase only produces the value.
//   - `AutonomousDecisionEngineInput` is anchored on `decisionContext`
//     (required, for identity fields only) plus four independently
//     nullable upstream results — every field of the result is either a
//     narrow copy of an input field or one of the independently computed
//     booleans in `AutonomousDecisionSignals`. Nothing is fabricated,
//     nothing is recomputed from a source outside the five inputs
//     themselves.
//   - Pure data shape only — no logic lives in this file. See `decide.ts`
//     for the pure, deterministic decision function.
//   - UNWIRED: nothing in the app imports from
//     `lib/ai/autonomousDecision/*` yet. No route, no cron, no UI, no
//     execution call-site. Wiring an actual consumer that ACTS on
//     `AutonomousDecision` (placing an order, writing a trace, etc.) is a
//     separately-approved future phase (8.2.7+), NOT implemented here.
// ---------------------------------------------------------------------------

import type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource } from "@/lib/ai/autonomous/contracts";
import type { AutonomousQualificationResult, QualificationStatus } from "@/lib/ai/decisionQualification/contracts";
import type { MacroIntelligenceContext, MacroEventRiskLevel, MacroDataAvailability } from "@/lib/ai/macroIntelligence/contracts";
import type { MarketImpactContext, ImpactRisk, NewsDataAvailability } from "@/lib/ai/eventImpact/contracts";
import type { PreEntryValidationResult, PreEntryValidationStatus, PreEntryValidationSignals } from "@/lib/ai/preEntryValidation/contracts";

// Re-exported so decide.ts/fixtures have a single import source for the
// upstream shapes they consume — this module does not define its own
// competing decision-context/qualification/macro/event-impact/pre-entry
// type, matching every earlier 8.2.x contracts module's own re-export
// convention.
export type { AutonomousDecisionContext, AutonomousCanonicalSnapshot, DecisionSource, AutonomousQualificationResult, QualificationStatus, MacroIntelligenceContext, MacroEventRiskLevel, MacroDataAvailability, MarketImpactContext, ImpactRisk, NewsDataAvailability, PreEntryValidationResult, PreEntryValidationStatus, PreEntryValidationSignals };

/**
 * Closed, three-member final decision enum — the sole output of this
 * phase. Exactly one is ever produced per input — see
 * `decide.ts::selectAutonomousDecision()` for the deterministic,
 * fail-closed, priority-ordered selection. No fourth value, no free-text
 * decision, no numeric score standing in for one of these three.
 * Deliberately narrower than `TraceOutcome` (`decisionTrace/contracts.ts`)
 * — see this file's header for why `EXPIRE` does not belong here.
 *
 *   - `EXECUTE` — every concern below cleared: `PreEntryValidationStatus
 *     === "VALID"` AND `QualificationStatus === "QUALIFIED"`. This is the
 *     narrowest, most-cleared path — both the qualification engine and
 *     the pre-entry validator independently found nothing to flag.
 *   - `WAIT` — the fail-safe default. Produced whenever required context
 *     is missing/insufficient, whenever `PreEntryValidationStatus ===
 *     "CAUTION"`, or whenever the input is otherwise ambiguous (does not
 *     match any `REJECT` or `EXECUTE` condition below). `WAIT` is never
 *     itself a rejection — it means "not enough confidence to act right
 *     now", not "this signal is bad".
 *   - `REJECT` — a strong, closed-signal concern makes proceeding
 *     unsuitable: `PreEntryValidationStatus === "BLOCKED"`, or
 *     `QualificationStatus === "CONFLICTED"`. Both outrank `WAIT` — a
 *     documented block or historical conflict is a stronger, more
 *     specific concern than an ambiguous or missing-context state.
 */
export type AutonomousDecision = "EXECUTE" | "WAIT" | "REJECT";

/**
 * Closed, boolean-only signal record. Each field is one independently
 * computed concern; `decision` is a deterministic function of this
 * record alone (see `decide.ts::selectAutonomousDecision()`), never an
 * independent judgment call. No signal here is a score/confidence/
 * probability — every member is a plain boolean, matching
 * `PreEntryValidationSignals`'s own convention
 * (`preEntryValidation/contracts.ts`).
 */
export interface AutonomousDecisionSignals {
  /** `input.qualification !== null` — a Phase 8.2.2 qualification result was supplied at all. */
  readonly qualificationPresent: boolean;
  /** `input.macro !== null` — a Phase 8.2.3 macro intelligence context was supplied at all. */
  readonly macroPresent: boolean;
  /** `input.eventImpact !== null` — a Phase 8.2.4 market impact context was supplied at all. */
  readonly eventImpactPresent: boolean;
  /** `input.preEntry !== null` — a Phase 8.2.5 pre-entry validation result was supplied at all. */
  readonly preEntryPresent: boolean;
  /**
   * `true` when ANY required input is missing (`qualificationPresent`,
   * `macroPresent`, `eventImpactPresent`, or `preEntryPresent` is
   * `false`) — a single derived existence signal, not a re-statement of
   * the four booleans above under a new name; `decide.ts` reads this one
   * field for the top-priority check.
   */
  readonly requiredContextMissing: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "INSUFFICIENT_CONTEXT"` — copied as a
   * comparison against Phase 8.2.2's own closed status, never re-derived
   * from `qualification.signals` directly.
   */
  readonly qualificationInsufficient: boolean;
  /**
   * Only meaningful when `preEntryPresent`.
   * `input.preEntry.status === "INSUFFICIENT_CONTEXT"` — copied as a
   * comparison against Phase 8.2.5's own closed status, never re-derived
   * from `preEntry.signals` directly.
   */
  readonly preEntryInsufficient: boolean;
  /**
   * Only meaningful when `preEntryPresent`.
   * `input.preEntry.status === "BLOCKED"` — copied as a comparison
   * against Phase 8.2.5's own closed status, never re-derived.
   */
  readonly preEntryBlocked: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "CONFLICTED"` — copied as a
   * comparison against Phase 8.2.2's own closed status, never re-derived.
   */
  readonly qualificationConflicted: boolean;
  /**
   * Only meaningful when `preEntryPresent`.
   * `input.preEntry.status === "CAUTION"` — copied as a comparison
   * against Phase 8.2.5's own closed status, never re-derived.
   */
  readonly preEntryCaution: boolean;
  /**
   * Only meaningful when `preEntryPresent`.
   * `input.preEntry.status === "VALID"` — copied as a comparison against
   * Phase 8.2.5's own closed status, never re-derived.
   */
  readonly preEntryValid: boolean;
  /**
   * Only meaningful when `qualificationPresent`.
   * `input.qualification.status === "QUALIFIED"` — copied as a
   * comparison against Phase 8.2.2's own closed status, never re-derived.
   */
  readonly qualificationQualified: boolean;
}

/**
 * The pure decision function's single input type. `decisionContext`
 * (Phase 8.2.0) is the sole required upstream input, carried through for
 * identity fields (`symbol`/`source`/`generatedAt`) only — this phase
 * never reads `decisionContext.canonical`/`cognitive`/`memory`/
 * `validConstraints` directly; those are already summarized by
 * `qualification` (Phase 8.2.2) and `preEntry` (Phase 8.2.5), which this
 * phase reads instead, to avoid a second, drifting copy of either
 * engine's own logic. `qualification`, `macro`, `eventImpact`, and
 * `preEntry` are each independently nullable — a `null` value represents
 * an honest "this context was not supplied", never fabricated as an
 * empty-but-present object — matching `PreEntryValidationInput`'s own
 * null convention (`preEntryValidation/contracts.ts`).
 */
export interface AutonomousDecisionEngineInput {
  /** Phase 8.2.0's own context. Read-only; never mutated, never re-derived. Only `symbol`/`source`/`generatedAt` are read from it (see `decide.ts`). */
  readonly decisionContext: AutonomousDecisionContext;
  /** Phase 8.2.2's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly qualification: AutonomousQualificationResult | null;
  /** Phase 8.2.3's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly macro: MacroIntelligenceContext | null;
  /** Phase 8.2.4's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly eventImpact: MarketImpactContext | null;
  /** Phase 8.2.5's already-computed output, or `null` when not supplied. Read-only; never mutated, never re-derived. */
  readonly preEntry: PreEntryValidationResult | null;
}

/**
 * The pure decision function's single output type. `symbol`, `source`,
 * and `generatedAt` are copied verbatim from `input.decisionContext` —
 * never re-derived, never wall-clock-generated here. `decision` is a
 * deterministic function of `signals` alone.
 */
export interface AutonomousDecisionEngineResult {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly symbol: string;
  readonly source: DecisionSource;
  /** = `input.decisionContext.generatedAt`, copied verbatim — the instant the *decision context* was assembled, not a new decision-time read. */
  readonly generatedAt: string;
  readonly decision: AutonomousDecision;
  readonly signals: AutonomousDecisionSignals;
}
