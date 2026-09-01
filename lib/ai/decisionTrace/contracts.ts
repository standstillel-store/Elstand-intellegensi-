// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Decision Traceability (Phase 8.2.1)
//
// ARCHITECTURE / AUTHORITY:
//   - Infrastructure only, for FUTURE ELVOID Pro autonomous decisions. This
//     phase introduces no autonomous decision logic, no execution wiring,
//     and no route/cron/UI — it is purely the shape + persistence of a
//     trace record, matching Phase 8.1.0's own "capture only, decide
//     nothing" boundary.
//   - ELVOID Pro only (hard boundary this phase). `TraceSource` is its own
//     single-value literal, NOT the two-member `DecisionSource` union
//     `lib/ai/decisionOutcome/contracts.ts` already defines — this table
//     structurally cannot accept an `AI_SIGNAL` row yet. Widening to
//     AI_SIGNAL is a future, separately-approved phase, never this one.
//     This preserves source isolation the same way every 8.1.x table does,
//     one level stricter (closed to a single value rather than a union).
//   - `traceId` is a NEW, INDEPENDENT identity space — the Learning DB's
//     own `decision_traces.id` (DB-generated, see repository.ts), never
//     derived from, equal to, or dependent on `ai_signals.id`. A trace
//     exists and is fully queryable whether or not a Main DB signal was
//     ever created.
//   - `sourceSignalId` is OPTIONAL and only ever meaningful for
//     `outcome === "EXECUTE"` — a logical reference to the Main DB's
//     `ai_signals.id` (same no-cross-project-FK reasoning
//     `decision_experiences.source_signal_id` already documents in
//     supabase/learning/schema.sql). `WAIT`/`REJECT`/`EXPIRE` traces must
//     be fully self-contained with zero Main DB dependency — enforced
//     structurally by `validateDecisionTraceInput` below AND by a SQL
//     CHECK constraint (belt-and-suspenders, same pattern as every prior
//     8.1.x closed-enum CHECK).
//   - `snapshot` reuses `LearningContextSnapshot` (Phase 8.1.0) verbatim —
//     no new, competing, decision-time snapshot shape is introduced. A
//     trace's snapshot is frozen at persist time and never revised
//     afterward; there is no update path anywhere in this module (see
//     repository.ts — insert-only, no UPDATE function exists).
//   - This module does not evaluate, score, grade, or decide anything. No
//     autonomous EXECUTE/WAIT/REJECT/EXPIRE selection logic lives here —
//     `outcome` is always supplied by the (future, not-yet-built) caller,
//     never computed in this phase.
// ---------------------------------------------------------------------------

import type { SignalSide } from "@/lib/elvoid/types";
import type { LearningContextSnapshot } from "@/lib/ai/decisionOutcome/contracts";

// Re-exported so repository.ts/fixtures have a single import source,
// matching decisionMemory/contracts.ts's own re-export convention.
export type { LearningContextSnapshot };

/**
 * Closed set of terminal decision outcomes this phase traces. Every
 * autonomous decision — including ones that never place a trade — resolves
 * to exactly one of these four. No fifth value, no free-text status.
 */
export type TraceOutcome = "EXECUTE" | "WAIT" | "REJECT" | "EXPIRE";

/**
 * ELVOID Pro only, this phase (hard boundary — see module doc above).
 * Deliberately a single-value literal, not `DecisionSource`.
 */
export type TraceSource = "ELVOID_PRO_ORACLE";

/**
 * The frozen, decision-time fields a trace is written with exactly once.
 * `sourceSignalId` must be `null` for every outcome except `"EXECUTE"` —
 * see `validateDecisionTraceInput`. `side` is nullable because a `WAIT`/
 * `REJECT` can occur before a directional bias is even established.
 * `snapshot` is nullable for the same reason `decision_experiences.
 * learning_context` already is (no Cognitive Layer context available for
 * the originating decision) — a valid, expected state, never fabricated.
 */
export interface DecisionTraceInput {
  readonly source: TraceSource;
  readonly outcome: TraceOutcome;
  readonly symbol: string;
  readonly side: SignalSide | null;
  /** ISO 8601 timestamp — the instant the decision resolved, not the write time. */
  readonly decisionTimestamp: string;
  readonly snapshot: LearningContextSnapshot | null;
  /** = `ai_signals.id`. Only ever non-null when `outcome === "EXECUTE"`. */
  readonly sourceSignalId: string | null;
}

/**
 * A persisted trace. `traceId` and `createdAt` are DB-generated (see
 * repository.ts) — never supplied by the caller, never guessable, never
 * derived from `sourceSignalId`.
 */
export interface DecisionTraceRecord extends DecisionTraceInput {
  readonly traceId: string;
  readonly createdAt: string;
}

export type DecisionTraceValidationResult = { readonly valid: true } | { readonly valid: false; readonly reason: "NON_EXECUTE_MUST_NOT_REFERENCE_SIGNAL" };

/**
 * The one structural invariant this phase enforces before persisting: a
 * `WAIT`/`REJECT`/`EXPIRE` trace must never carry a `sourceSignalId`. Pure,
 * deterministic, no DB/network/randomness — this is a shape check, not
 * autonomous decision logic (it decides nothing about which outcome a
 * decision should have; it only rejects an internally-inconsistent input
 * for an outcome already chosen elsewhere).
 */
export function validateDecisionTraceInput(input: DecisionTraceInput): DecisionTraceValidationResult {
  if (input.outcome !== "EXECUTE" && input.sourceSignalId !== null) {
    return { valid: false, reason: "NON_EXECUTE_MUST_NOT_REFERENCE_SIGNAL" };
  }
  return { valid: true };
}
