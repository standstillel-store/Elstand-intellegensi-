// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Replay Builder (Phase 8.3.7)
//
// PURE FUNCTION. Given an already-fetched `CognitiveTraceRecord` and
// (optionally) an already-fetched `decision_experiences` row / `decision_evaluations`
// row, deterministically reconstructs the replay. No I/O, no clock read,
// no randomness — see repository.ts for the one place that fetches real
// rows and calls this function. Mirrors `lib/ai/cognitiveMap/build.ts`'s
// own "pure builder / I/O lives in the caller" split.
// ---------------------------------------------------------------------------

import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { DecisionExperienceRecord, DecisionExperienceOutcomePatch } from "@/lib/ai/decisionOutcome/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { CognitiveReplayResult, ReplayStage, ReplayUnavailableReason } from "./contracts";

function stage<T>(data: T | null, at: string | null, unavailableReason: ReplayUnavailableReason | null): ReplayStage<T> {
  if (data === null || at === null) {
    return { available: false, data: null, at: null, unavailableReason: unavailableReason ?? "NO_ASSESSMENT_CYCLE" };
  }
  return { available: true, data, at, unavailableReason: null };
}

function unavailable<T>(reason: ReplayUnavailableReason): ReplayStage<T> {
  return { available: false, data: null, at: null, unavailableReason: reason };
}

export interface BuildReplayInput {
  readonly trace: CognitiveTraceRecord;
  /** `undefined` — never fetched (e.g. no paperTradeId this cycle). `null` — fetched, no row found. A `DecisionExperienceRecord` — fetched and found. */
  readonly experience?: DecisionExperienceRecord | null;
  /** Same three-state convention as `experience`. */
  readonly evaluation?: DecisionEvaluation | null;
  /** `false` only when the Learning DB itself was unconfigured for this read — distinguishes "we tried to join and found nothing" from "we could not try at all". */
  readonly learningDbConfigured: boolean;
}

export function buildCognitiveReplay(input: BuildReplayInput): CognitiveReplayResult {
  const { trace } = input;
  const limitations: string[] = ["MEMORY stage is never replayable: lib/ai/decisionMemory is query-time-only and was never persisted per cycle — see this module's contracts.ts header."];

  const inputStage = stage(trace.input, trace.cycleAt, null);
  const analysisStage = stage(trace.analysis, trace.analysisAt, "NO_ASSESSMENT_CYCLE");
  const evidenceStage = stage(trace.evidence, trace.evidenceAt, "NO_ASSESSMENT_CYCLE");
  const conflictStage = stage(trace.conflict, trace.conflictAt, "NO_ASSESSMENT_CYCLE");
  const contradictionsStage = stage(trace.contradictions, trace.conflictAt, "NO_ASSESSMENT_CYCLE");
  const decisionStage = stage(trace.decision, trace.decisionAt, "NO_ASSESSMENT_CYCLE");
  const executionStage = stage(trace.execution, trace.executionAt, "NO_EXECUTION_ATTEMPTED");

  const paperTradeId = trace.execution?.paperTradeId ?? null;
  const wasExecuted = trace.execution?.outcome === "EXECUTED" && paperTradeId !== null;

  let outcomeStage: ReplayStage<DecisionExperienceOutcomePatch>;
  let learningStage: ReplayStage<DecisionEvaluation>;

  if (!wasExecuted) {
    outcomeStage = unavailable(trace.execution === null ? "NO_ASSESSMENT_CYCLE" : "NOT_EXECUTED");
    learningStage = unavailable(trace.execution === null ? "NO_ASSESSMENT_CYCLE" : "NOT_EXECUTED");
  } else if (!input.learningDbConfigured) {
    outcomeStage = unavailable("LEARNING_DB_NOT_CONFIGURED");
    learningStage = unavailable("LEARNING_DB_NOT_CONFIGURED");
    limitations.push("Learning DB was not configured for this read — OUTCOME/LEARNING could not be joined even though this cycle executed a paper trade.");
  } else {
    // Identity isolation: paperTradeId is a globally unique ai_signals.id,
    // so a join on it should always land on a row for THIS trace's own
    // (source, symbol) — but this is never assumed. A mismatch refuses the
    // join outright rather than silently attaching another cycle's/
    // symbol's outcome to this replay.
    const experienceIdentityMismatch = input.experience !== undefined && input.experience !== null && (input.experience.source !== trace.source || input.experience.symbol !== trace.symbol);

    if (experienceIdentityMismatch) {
      outcomeStage = unavailable("IDENTITY_MISMATCH");
      limitations.push(`decision_experiences row for paperTradeId=${paperTradeId} reports (source=${input.experience!.source}, symbol=${input.experience!.symbol}), which disagrees with this trace's own (source=${trace.source}, symbol=${trace.symbol}) — join refused.`);
    } else if (input.experience === undefined || input.experience === null) {
      outcomeStage = unavailable("NO_DECISION_EXPERIENCE_ROW");
    } else if (input.experience.outcome === null) {
      outcomeStage = unavailable("TRADE_NOT_YET_CLOSED");
    } else {
      outcomeStage = stage(input.experience.outcome, input.experience.outcome.outcomeClosedAt, null);
    }

    if (experienceIdentityMismatch) {
      // The experience join was refused, so no experience.evidence exists
      // for evaluate.ts to have run against under this trace's identity —
      // treat LEARNING the same as OUTCOME for this refusal.
      learningStage = unavailable("IDENTITY_MISMATCH");
    } else if (input.evaluation === undefined || input.evaluation === null) {
      learningStage = unavailable("NO_DECISION_EVALUATION_ROW");
    } else if (input.evaluation.sourceSignalId !== paperTradeId) {
      learningStage = unavailable("IDENTITY_MISMATCH");
      limitations.push(`decision_evaluations row's own sourceSignalId (${input.evaluation.sourceSignalId}) disagrees with the requested paperTradeId (${paperTradeId}) — join refused.`);
    } else {
      learningStage = stage(input.evaluation, input.evaluation.evaluatedAt, null);
    }
  }

  return {
    traceId: trace.id,
    source: trace.source,
    symbol: trace.symbol,
    cycleAt: trace.cycleAt,
    input: inputStage,
    analysis: analysisStage,
    evidence: evidenceStage,
    memory: unavailable("MEMORY_NOT_PERSISTED_PER_CYCLE"),
    conflict: conflictStage,
    contradictions: contradictionsStage,
    decision: decisionStage,
    execution: executionStage,
    outcome: outcomeStage,
    learning: learningStage,
    limitations,
  };
}
