// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Memory (Phase 8.1.3)
//
// ARCHITECTURE / AUTHORITY:
//   - Historical, persistent-learning RETRIEVAL layer only. Reads
//     `decision_experiences` (Phase 8.1.0) + `decision_evaluations` (Phase
//     8.1.1) + `failure_pattern_candidates` (Phase 8.1.2) from the ELVOID
//     Learning Database — the SAME isolated project every prior 8.1.x
//     phase already uses (see lib/ai/learning/db.ts). Introduces no new
//     table, no schema change, no write path anywhere in this module.
//   - Query-time (dynamic) retrieval, never materialized: every call
//     re-reads the current Learning DB population and filters/ranks it
//     fresh. No memory table, no cache, no snapshot — matching Phase
//     8.1.2's own "recompute over the live population" philosophy, one
//     level up (retrieval, not aggregation).
//   - This module does not evaluate, score, detect, or generate anything
//     new. It filters and ranks already-computed, already-validated rows
//     from the three tables above. Every field here is a closed enum, a
//     count, a timestamp, or a re-exported record type from an earlier
//     phase — there is no free-text/narrative/explanation field anywhere,
//     so no causal claim has a field to be attached to, even by accident.
//   - Individual `decision_experiences`/`decision_evaluations` rows and
//     aggregate `failure_pattern_candidates` rows are DIFFERENT KINDS OF
//     EVIDENCE — a single cited data point vs. a many-sample statistic —
//     and are never flattened into one list. `DecisionMemoryResult` keeps
//     three separate arrays for exactly this reason.
//   - Pattern rows are consumed EXACTLY as Phase 8.1.2 persisted them.
//     This module never re-derives, loosens, or re-checks
//     `MIN_OCCURRENCE_COUNT` / the temporal-spread rule / the confidence
//     cap — those live solely in lib/ai/failurePatterns/detect.ts. A
//     pattern either already qualified there or it does not exist in
//     `failure_pattern_candidates` at all; this module has no lower bar
//     to apply.
//
// NOT lib/ai/cognitive/memory.ts (`CognitiveWorkingMemory`):
//   - `CognitiveWorkingMemory` is request-scoped, in-process, immutable,
//     append-only NOTES attached to a single live `CognitiveObservation`
//     — it is created fresh per Oracle assessment and discarded at the
//     end of that request. It is never persisted, never queried across
//     requests, and holds no historical population.
//   - `DecisionMemory` (this module) is the opposite: a READ-ONLY QUERY
//     over the Learning DB's accumulated historical population, called
//     on demand, holding no state of its own between calls (it IS a
//     function, not an object instance carrying notes).
//   - Every exported type in this module is prefixed `DecisionMemory*` —
//     matching lib/ai/failurePatterns/contracts.ts's own `FailurePattern*`
//     precedent for the exact same reason (lib/ai/insights/types.ts's
//     `InsightPattern`/`PatternKind` there vs. `CognitiveWorkingMemory`
//     here) — so the two concepts stay textually and semantically
//     unambiguous. This module never imports from, extends, or
//     re-declares anything from lib/ai/cognitive/memory.ts.
// ---------------------------------------------------------------------------

import type { DecisionSource, DecisionExperienceRecord } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation, EvaluationEvidenceTag } from "@/lib/ai/decisionEvaluation/contracts";
import type { FailurePatternCandidate } from "@/lib/ai/failurePatterns/contracts";
import type { SignalSide } from "@/lib/elvoid/types";

// Re-exported so retrieve.ts/repository.ts (and fixtures) have a single
// import source for the shapes they consume — this module does not define
// its own competing source/experience/evaluation/pattern types, matching
// decisionEvaluation/contracts.ts and failurePatterns/contracts.ts's own
// re-export convention.
export type { DecisionSource, DecisionExperienceRecord, DecisionEvaluation, EvaluationEvidenceTag, FailurePatternCandidate };

/**
 * A query into Decision Memory. `source` is REQUIRED and is never "all
 * sources" — AI_SIGNAL and ELVOID_PRO_ORACLE are never mixed in a single
 * query or its results, the same boundary every prior 8.1.x phase
 * enforces at the schema/grouping level.
 */
export interface DecisionMemoryQuery {
  readonly source: DecisionSource;
  readonly symbol?: string;
  readonly side?: SignalSide;
  /**
   * Closed `EvaluationEvidenceTag` members only — relevance is a plain
   * set-overlap check against `decision_evaluations.evidence`, never a
   * similarity/embedding score. When omitted or empty, evidence overlap
   * does not filter results (every experience matching the other filters
   * is relevant) and all ranked results tie on overlap, falling through
   * to the recency tie-break (see retrieve.ts).
   */
  readonly evidenceTags?: readonly EvaluationEvidenceTag[];
  /** ISO 8601 timestamp. Bounds retrieval to experiences whose `decisionTimestamp >= since`. Omitted means unbounded (still capped by `limit`). */
  readonly since?: string;
  /** Caps the number of individual experiences (and, transitively, evaluations) returned. Never applied to `matchedPatterns` — pattern rows are already a small, pre-aggregated set. */
  readonly limit?: number;
}

/**
 * One `decision_experiences` row joined in-memory with its corresponding
 * `decision_evaluations` row, by `source_signal_id` — the same join
 * convention lib/ai/failurePatterns/repository.ts already established for
 * the same two tables (no SQL foreign key exists between them; see
 * supabase/learning/schema.sql). `evaluation` is `null` whenever no
 * evaluation exists yet for this experience (e.g. the outcome hasn't
 * resolved, or an automatic `INSUFFICIENT_EVIDENCE` result was
 * deliberately never persisted — see decisionLearning/lifecycle.ts) — a
 * valid, expected state, never fabricated.
 */
export interface DecisionMemoryJoinedRow {
  readonly experience: DecisionExperienceRecord;
  readonly evaluation: DecisionEvaluation | null;
}

/**
 * Decision Memory's retrieval output. The three categories are
 * deliberately kept as separate arrays, never flattened into one list:
 *
 *   - `matchedExperiences` / `matchedEvaluations`: individual, cited data
 *     points — one real historical decision each. Joined by
 *     `sourceSignalId` (both types already carry that field); the two
 *     arrays are independently sized because not every experience has a
 *     resolved evaluation yet (see `DecisionMemoryJoinedRow` above).
 *     Ranked primarily by evidence-tag overlap with the query, then by
 *     recency (see retrieve.ts); capped by `query.limit`.
 *
 *   - `matchedPatterns`: aggregate, many-sample statistics from Phase
 *     8.1.2, filtered only by `source` (mandatory) and, if provided,
 *     `evidenceTags` — never re-thresholded, never capped by `limit`.
 *
 * A `FailurePatternCandidate` is never merged into `matchedExperiences`
 * and a `DecisionExperienceRecord` is never merged into `matchedPatterns`
 * — collapsing a many-sample statistic and a single anecdote into one
 * list would let the two look equally authoritative, which they are not.
 */
export interface DecisionMemoryResult {
  readonly matchedExperiences: readonly DecisionExperienceRecord[];
  readonly matchedEvaluations: readonly DecisionEvaluation[];
  readonly matchedPatterns: readonly FailurePatternCandidate[];
}
