// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Replay (Phase 8.3.7)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - READ-ONLY RECONSTRUCTION, NOT A NEW RECORD. Every field below is
//     either (a) a verbatim copy of an already-persisted `CognitiveTrace`
//     row (Phase 8.3.2 — INPUT/ANALYSIS/EVIDENCE/CONFLICT/DECISION/
//     EXECUTION, one row per real cycle attempt), or (b) a verbatim copy
//     of a `decision_experiences`/`decision_evaluations` row (Phase
//     8.1.0/8.1.1) joined at READ TIME by `execution.paperTradeId` —
//     which IS `decision_experiences.source_signal_id` (see
//     `lib/ai/autonomousLearning/contracts.ts`'s own doc comment on that
//     identity; both name the same real `ai_signals.id`). This module
//     computes nothing, grades nothing, decides nothing, and writes
//     nothing — it has no repository write function anywhere in this
//     tree.
//   - MEMORY IS NOT A REPLAYABLE STAGE. `lib/ai/decisionMemory` is
//     documented as query-time-only retrieval, never materialized per
//     cycle (see `lib/ai/cognitiveMap/build.ts`'s own "memory" node
//     comment: "there is no lastUpdated timestamp to read off a stored
//     row"). `cognitive_trace` (8.3.2) never persisted a memory snapshot
//     either. Consequently a past cycle's actual memory input CANNOT be
//     reconstructed — re-querying `queryDecisionMemory()` now would
//     return the CURRENT population, not what existed at `cycleAt`, which
//     would be a fabricated historical claim. Every `CognitiveReplayResult`
//     therefore reports `memory: { available: false, data: null, at:
//     null, unavailableReason: "MEMORY_NOT_PERSISTED_PER_CYCLE" }`
//     unconditionally — never guessed, never backfilled from a live
//     query.
//   - NO SYNTHETIC TIMELINE. A stage is `available: true` only when the
//     underlying real row/column is non-null. `at` is always a verbatim
//     ISO timestamp copied from the source record — never `Date.now()`,
//     never derived from another stage's timestamp.
// ---------------------------------------------------------------------------

import type { CognitiveTraceRecord, CognitiveTraceInputStage, CognitiveTraceAnalysisStage, CognitiveTraceEvidenceStage, CognitiveTraceConflictStage, CognitiveTraceDecisionStage, CognitiveTraceExecutionStage, CognitiveTraceSource } from "@/lib/ai/cognitiveTrace/contracts";
import type { ClassifiedContradiction } from "@/lib/ai/oracle/contradiction";
import type { DecisionExperienceOutcomePatch } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

export type { CognitiveTraceRecord };

/**
 * Closed set of honest reasons a stage could not be reconstructed. Every
 * member names a real, checkable condition — never a generic "unknown".
 * Deliberately does NOT include a "trace not found" member: that case has
 * no `CognitiveReplayResult` to attach a reason to at all —
 * `replayCognitiveCycle()` returns `null` for it instead, the same
 * not-found convention every repository.ts in this tree already uses (see
 * `getCognitiveTraceById()`).
 */
export type ReplayUnavailableReason =
  | "NO_ASSESSMENT_CYCLE" // this trace row is a NO_ASSESSMENT cycle — the stage's own trace column is null
  | "MEMORY_NOT_PERSISTED_PER_CYCLE" // see module header — always the reason for the memory stage
  | "NO_EXECUTION_ATTEMPTED" // decision !== present, or execution stage itself is null (NO_ASSESSMENT cycle)
  | "NOT_EXECUTED" // execution.outcome !== "EXECUTED" — no paperTradeId was ever produced this cycle (WAIT/REJECT/SKIPPED_*/failed)
  | "LEARNING_DB_NOT_CONFIGURED" // Learning DB env unset — same degrade-gracefully convention as every repository.ts in this tree
  | "NO_DECISION_EXPERIENCE_ROW" // paperTradeId present but no decision_experiences row found for it (should not occur per architecture — never assumed, only reported when actually observed)
  | "TRADE_NOT_YET_CLOSED" // decision_experiences row found, outcome_result still null — the paper trade has not closed
  | "NO_DECISION_EVALUATION_ROW" // decision_evaluations row not yet persisted for this signal — evaluateAndPersistDecision() has no automatic trigger yet (see lib/ai/decisionEvaluation/repository.ts's own header)
  | "IDENTITY_MISMATCH"; // the joined decision_experiences row's own (source, symbol) disagrees with this trace's (source, symbol) for the same paperTradeId — should never occur (paperTradeId is a globally unique ai_signals.id), never trusted blindly; the join is refused rather than silently presented as this cycle's outcome

/** One reconstructed stage. `data`/`at` are non-null exactly when `available` is `true`; `unavailableReason` is non-null exactly when `available` is `false`. */
export interface ReplayStage<T> {
  readonly available: boolean;
  readonly data: T | null;
  /** ISO 8601, verbatim from the source record. `null` iff `available` is `false`. */
  readonly at: string | null;
  readonly unavailableReason: ReplayUnavailableReason | null;
}

export interface CognitiveReplayResult {
  readonly traceId: string;
  readonly source: CognitiveTraceSource;
  readonly symbol: string;
  /** ISO 8601 — the real cycle's own start instant, verbatim from `CognitiveTraceRecord.cycleAt`. */
  readonly cycleAt: string;

  readonly input: ReplayStage<CognitiveTraceInputStage>;
  readonly analysis: ReplayStage<CognitiveTraceAnalysisStage>;
  readonly evidence: ReplayStage<CognitiveTraceEvidenceStage>;
  /** Always unavailable — see module header. Included as a first-class stage (never silently dropped) so a reader sees explicitly that this pipeline position was asked for and honestly could not be filled. */
  readonly memory: ReplayStage<never>;
  readonly conflict: ReplayStage<CognitiveTraceConflictStage>;
  /** Phase 8.3.5 data, carried alongside `conflict` — same `conflictAt` timestamp, same null-together rule. */
  readonly contradictions: ReplayStage<readonly ClassifiedContradiction[]>;
  readonly decision: ReplayStage<CognitiveTraceDecisionStage>;
  readonly execution: ReplayStage<CognitiveTraceExecutionStage>;
  /** Joined at read time from `decision_experiences` by `execution.paperTradeId`. */
  readonly outcome: ReplayStage<DecisionExperienceOutcomePatch>;
  /** Joined at read time from `decision_evaluations` by `execution.paperTradeId`. */
  readonly learning: ReplayStage<DecisionEvaluation>;

  /** Honest reporting of anything this specific replay could not reconstruct, in prose — never silently dropped. Always includes the memory-stage limitation. */
  readonly limitations: readonly string[];
}

/** Lightweight index entry for `listReplayableCycles()` — enough to pick a cycle to replay in full, without eagerly joining OUTCOME/LEARNING for every row in a list. */
export interface ReplayableCycleSummary {
  readonly traceId: string;
  readonly symbol: string;
  readonly cycleAt: string;
  /** `true` iff the trace row reached the DECISION stage (i.e. `decision !== null`) — a cheap, verbatim signal of how far this cycle got, never a claim about OUTCOME/LEARNING availability. */
  readonly reachedDecision: boolean;
  /** `true` iff `execution.outcome === "EXECUTED"` — the only cycles for which OUTCOME/LEARNING could ever be joined. */
  readonly hasPaperTrade: boolean;
}
