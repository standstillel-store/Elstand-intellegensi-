// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Intelligence Integration Foundation
// (Phase 8.2.0)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This module is a PURE, READ-ONLY INTEGRATION LAYER. It defines the
//     shape of a single structured snapshot that combines already-computed
//     canonical Oracle intelligence (Phase 7), Phase 8.0 Cognitive
//     Context, Phase 8.1.3 Decision Memory, and Phase 8.1.5 Learning
//     Validation. It computes nothing new, judges nothing, and decides
//     nothing.
//   - `AutonomousDecisionContext` is NOT a decision. There is deliberately
//     no EXECUTE/WAIT/REJECT/EXPIRE field, no action/decision/outcome
//     field of any kind, anywhere in this file. Producing an autonomous
//     decision from this context is a separately-approved, not-started
//     future phase (8.2.1+) — this module only assembles the read.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`,
//     `lib/ai/adaptiveConstraint/generate.ts`,
//     `lib/ai/failurePatterns/detect.ts`, `ai_signals`, or any
//     decision-lifecycle/autonomous-execution path. It imports only
//     type-only contracts from earlier phases (`gradingTypes.ts`,
//     `decisionOutcome/contracts.ts`, `cognitive/context.ts`,
//     `decisionMemory/contracts.ts`, `learningValidation/contracts.ts`).
//   - `canonical` is a fresh, independently-owned
//     `Readonly<Pick<OracleAssessment, ...>>`-shaped object — a verbatim
//     copy of named `OracleAssessment` fields, never a live reference,
//     never recomputed, never renamed to imply a second decision
//     authority (matching `lib/ai/cognitive/contracts.ts`'s own
//     `sourceAssessment` precedent). `grade` here is always `OracleGrade`
//     — Phase 7's canonical intelligence, per the spec's own framing
//     ("Phase 7 remains canonical intelligence: Oracle / grading / MTF /
//     evidence / risk / execution"). `TradeGrade` (the separate AI Signal
//     engine's 7-level scale) is explicitly OUT OF SCOPE for 8.2.0 and is
//     never imported, referenced, or merged into `canonical` or any other
//     field in this file — see CHANGES.md's Limitations section for why.
//   - `source` (`DecisionSource` — `"AI_SIGNAL" | "ELVOID_PRO_ORACLE"`,
//     reused verbatim from `decisionOutcome/contracts.ts`, no competing
//     enum declared here) is mandatory and is never `"all"`. The two
//     sources are never merged into a single context.
//   - `validConstraints` MUST already be filtered to `status === "VALID"`
//     AND `source` matching this context's own `source` — enforced by
//     `context.ts`'s `filterValidConstraints()`, never left to the
//     caller. `PROVISIONAL` / `STALE` / `INCONSISTENT` / `OVERFIT_RISK`
//     rows never reach this field under any circumstance.
//   - `cognitive` (Phase 8.0's `CognitiveDecisionContext`) and `memory`
//     (Phase 8.1.3's `DecisionMemoryResult`) are carried through by
//     REFERENCE, unchanged — both are already immutable-by-contract
//     outputs of earlier phases, so there is nothing to clone and nothing
//     to reinterpret (matching `cognitive/context.ts`'s own
//     reference-through convention for hypotheses/conflict). This module
//     does not re-filter, re-rank, or re-validate their contents — doing
//     so would risk re-implementing logic that already exists once,
//     upstream (a "second learning engine"), which this phase must not
//     create.
//   - Missing upstream context is represented as an explicit `null`,
//     never fabricated as an empty-but-present object — matching
//     `cognitive/context.ts`'s own `observation === null` anchor rule.
//     `validConstraints` is the one exception: it is always a (possibly
//     empty) array, never `null`, matching `DecisionMemoryResult`'s own
//     "closed arrays, never null" convention.
//   - Pure data shape only — no logic lives in this file. See `context.ts`
//     for the pure, deterministic assembler function.
//   - UNWIRED: nothing in the app imports from `lib/ai/autonomous/*` yet.
//     No route, no cron, no UI, no execution call-site. Wiring a consumer
//     is a separately-approved future phase (8.2.1+).
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { CognitiveDecisionContext } from "@/lib/ai/cognitive/context";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";

// Re-exported so context.ts (and fixtures) have a single import source for
// the shapes they consume — this module does not define its own competing
// source/cognitive-context/memory-result/constraint-validation types,
// matching decisionMemory/contracts.ts's and learningValidation/
// contracts.ts's own re-export convention.
export type { DecisionSource, CognitiveDecisionContext, DecisionMemoryResult, ConstraintValidation };

/**
 * A small, flat, frozen-in-spirit copy of already-computed
 * `OracleAssessment` fields — never a live reference into `assessment`,
 * never recomputed. Deliberately excludes `score`, `independentConfirmationClusters`,
 * `supportingEvidence`, `contradictingEvidence`, `dataQuality`, `risk`,
 * `gradeReason`, and `mainRisk` — only status/identity-level fields cross
 * this boundary, matching `LearningContextSnapshot`'s own "narrow, never
 * the full nested object" convention (`decisionOutcome/contracts.ts`).
 */
export interface AutonomousCanonicalSnapshot {
  readonly symbol: string;
  readonly timestamp: string;
  /** Always `OracleGrade` (Phase 7 Oracle scale) — never `TradeGrade`. */
  readonly grade: OracleAssessment["grade"];
  readonly side: OracleAssessment["side"];
  readonly confidence: OracleAssessment["confidence"];
  readonly riskStatus: OracleAssessment["riskStatus"];
  readonly invalidation: OracleAssessment["invalidation"];
}

/**
 * A single, structured, read-only integration snapshot — the sole output
 * type of this phase. Combines four already-computed inputs; introduces
 * no new computed field. This is NOT a decision: there is no
 * EXECUTE/WAIT/REJECT/EXPIRE field anywhere on this type, by design.
 */
export interface AutonomousDecisionContext {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly generatedAt: string; // ISO — the only naturally time-dependent field
  readonly symbol: string;

  /**
   * `DecisionSource` this context concerns. Mandatory, never `"all"`.
   * `memory` and `validConstraints` are expected to have already been
   * retrieved/filtered for this SAME source by the caller (via
   * `DecisionMemoryQuery.source` and `ConstraintValidation.source`
   * respectively) — this field is the single declared source of truth
   * for which population this context represents.
   */
  readonly source: DecisionSource;

  /**
   * Canonical Phase 7 Oracle intelligence for this symbol/moment, or
   * `null` when no `OracleAssessment` was supplied (e.g. an
   * `AI_SIGNAL`-sourced context, or a moment the Oracle has not yet
   * assessed) — never fabricated.
   */
  readonly canonical: AutonomousCanonicalSnapshot | null;

  /**
   * Phase 8.0.5 Cognitive Decision Context, carried through by reference,
   * unchanged. `null` when no cognitive context exists for this decision
   * (true for every current `AI_SIGNAL`-sourced decision — see
   * `LearningContextSnapshot`'s own doc comment in
   * `decisionOutcome/contracts.ts`) — a valid, expected state, never an
   * error.
   */
  readonly cognitive: CognitiveDecisionContext | null;

  /**
   * Phase 8.1.3 Decision Memory retrieval result, carried through by
   * reference, unchanged. `null` when no memory retrieval was performed
   * for this context (e.g. Learning DB unavailable, or the caller chose
   * not to query) — never fabricated as an empty-but-present result.
   */
  readonly memory: DecisionMemoryResult | null;

  /**
   * Phase 8.1.5 Learning Validation rows for this context's `source`,
   * pre-filtered to `status === "VALID"` only — see `context.ts`'s
   * `filterValidConstraints()`. Always a (possibly empty) array, never
   * `null`. `PROVISIONAL` / `STALE` / `INCONSISTENT` / `OVERFIT_RISK`
   * rows never appear here under any circumstance.
   */
  readonly validConstraints: readonly ConstraintValidation[];
}
