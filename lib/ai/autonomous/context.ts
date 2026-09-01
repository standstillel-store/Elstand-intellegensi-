// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Context Assembly (Phase 8.2.0)
//
// ARCHITECTURE / AUTHORITY:
//   - ASSEMBLY BOUNDARY, NOT A THINKING LAYER. `buildAutonomousDecisionContext()`
//     never recomputes confidence/grade/side/risk/entry/stopLoss/
//     takeProfit, never re-ranks or re-filters `cognitive`/`memory`
//     contents, never re-derives a `ConstraintValidation`'s `status`, and
//     performs zero LLM/network/database calls. It answers "what is the
//     integrated read-only state right now" — never "what should we do."
//   - `canonical` is anchored on the caller-supplied `OracleAssessment`:
//     `assessment === null` means `canonical === null` — no fabricated
//     empty snapshot, no fake defaults. Every other input
//     (`cognitive`/`memory`/`constraints`) is independently optional —
//     any of them being absent only means that particular upstream step
//     didn't run or isn't available, not that the whole context is
//     invalid. This mirrors `lib/ai/cognitive/context.ts`'s own
//     `observation`-anchor pattern, adapted here because
//     `AutonomousDecisionContext` has no single mandatory upstream input
//     the way `CognitiveDecisionContext` has `observation` — `source`,
//     `symbol`, and `generatedAt` are supplied directly by the caller as
//     the context's own identity, not derived from any one upstream
//     module, so this function always returns an object (never `null`).
//   - `cognitive` and `memory` are carried through by REFERENCE, unchanged
//     — both are already immutable-by-contract outputs of earlier phases
//     (8.0.5, 8.1.3). There is nothing to clone and nothing to
//     reinterpret. This function never imports, calls, or duplicates any
//     logic from `lib/ai/cognitive/*` or `lib/ai/decisionMemory/*` beyond
//     their type-only contracts — building a `CognitiveDecisionContext`
//     or a `DecisionMemoryResult` is entirely the caller's job, using
//     those phases' own existing builders/retrievers.
//   - `filterValidConstraints()` is the ONLY logic in this file that
//     filters anything, and it is a plain, non-recomputing SELECT on two
//     already-computed fields (`status`, `source`) — it never re-derives
//     `status`, never touches `basis`/`signals`, and never re-implements
//     any part of `lib/ai/learningValidation/validate.ts`'s own priority-
//     ordered status logic. This is the enforcement point for the
//     mandatory "only VALID, only this source" rule — never left to the
//     caller.
//   - Pure, synchronous, deterministic. No `Date.now()`, no randomness, no
//     module-level state, no mutation of any input array/object. Same
//     inputs -> deep-equal output.
//   - UNWIRED: this file has zero callers anywhere else in the app. No
//     route, no cron, no UI, no execution call-site imports from this
//     module. Wiring a consumer is a separately-approved future phase
//     (8.2.1+).
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { AutonomousCanonicalSnapshot, AutonomousDecisionContext, DecisionSource, CognitiveDecisionContext, DecisionMemoryResult, ConstraintValidation } from "./contracts";

/**
 * Narrows a `ConstraintValidation[]` population down to exactly the rows
 * this context is allowed to carry: `status === "VALID"` AND
 * `source === source` (this context's own source — the two Decision
 * Sources are never mixed into one context's `validConstraints`). A plain
 * boolean-AND filter over two already-computed enum fields — computes
 * nothing new, re-derives nothing. Returns `[]` (never `null`) when the
 * input is `null` or has no qualifying rows — matching
 * `DecisionMemoryResult`'s own "closed arrays, never null" convention.
 *
 * Exported directly so callers/fixtures can exercise this exact filter in
 * isolation without going through the full assembler.
 */
export function filterValidConstraints(constraints: readonly ConstraintValidation[] | null, source: DecisionSource): readonly ConstraintValidation[] {
  if (constraints === null) return [];
  return constraints.filter((constraint) => constraint.status === "VALID" && constraint.source === source);
}

/**
 * Pure, deterministic assembly of four already-computed inputs into one
 * `AutonomousDecisionContext`. ASSEMBLE, DO NOT DECIDE — every field is
 * either a narrow, named copy of specific `OracleAssessment` fields, a
 * direct reference to an already-immutable upstream output, or the result
 * of `filterValidConstraints()`'s single non-recomputing SELECT.
 *
 * `source`, `symbol`, and `generatedAt` are the context's own identity,
 * supplied directly by the caller — this function does not derive them
 * from `assessment`/`cognitive`/`memory` (even though `assessment.symbol`
 * usually matches `symbol`, they are deliberately independent parameters
 * so a caller can build a context for a symbol the Oracle has not yet
 * assessed, i.e. `assessment === null`).
 *
 * Never returns `null` — unlike `lib/ai/cognitive/context.ts`'s
 * `buildDecisionContext()`, there is no single upstream input whose
 * absence invalidates the whole context; see the file-header note above.
 */
export function buildAutonomousDecisionContext(source: DecisionSource, symbol: string, generatedAt: string, assessment: OracleAssessment | null, cognitive: CognitiveDecisionContext | null, memory: DecisionMemoryResult | null, constraints: readonly ConstraintValidation[] | null): AutonomousDecisionContext {
  const canonical: AutonomousCanonicalSnapshot | null =
    assessment === null
      ? null
      : {
          symbol: assessment.symbol,
          timestamp: assessment.timestamp,
          grade: assessment.grade, // OracleGrade — copied verbatim, never TradeGrade
          side: assessment.side,
          confidence: assessment.confidence,
          riskStatus: assessment.riskStatus,
          invalidation: assessment.invalidation,
        };

  return {
    version: 1,
    generatedAt,
    symbol,
    source,
    canonical,
    cognitive, // reference — already immutable-by-contract (8.0.5); never re-assembled here
    memory, // reference — already immutable-by-contract (8.1.3); never re-retrieved/re-ranked here
    validConstraints: filterValidConstraints(constraints, source),
  };
}
