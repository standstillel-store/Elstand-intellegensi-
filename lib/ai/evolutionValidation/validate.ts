// ---------------------------------------------------------------------------
// ELVOID Intelligence — Versioned Learning Validation, pure verdict
// (Phase 8.6.6)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. Takes an already-built `EvolutionCandidate`
// (8.6.5 — including its `null` replay for blocked/failed candidates)
// and derives exactly one `ValidationResult`.
//
// DECISION TABLE (in order — first match wins):
//   1. candidate.status === "VALIDATION_BLOCKED" -> INVALID. An
//      out-of-scope candidate is never merely "inconclusive" — it is
//      rejected outright, before any evidence is even considered.
//   2. candidate.status === "REPLAY_FAILED" (includes candidate.replay
//      === null) -> INSUFFICIENT_EVIDENCE. Either historical window had
//      too little data to trust.
//   3. candidate.replay.otherActiveGapCountDelta > 0 -> INVALID,
//      regressionDetected: true. MORE gap categories became active in
//      the candidate window than the baseline window — a regression on
//      an axis the proposal was never trying to fix, checked regardless
//      of what happened to the targeted metric.
//   4. candidate.replay.targetGapRateDelta < 0 -> VALID. The targeted
//      gap's rate fell between baseline and candidate windows, and
//      nothing else got worse.
//   5. Otherwise -> INCONCLUSIVE. The targeted gap's rate stayed the
//      same or rose, but nothing else regressed either — not evidence
//      of improvement, not evidence the proposal was wrong.
// ---------------------------------------------------------------------------

import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { RegressionCheck, InvariantChecks, ValidationResult, EvolutionValidationWithoutTimestamp } from "./contracts";

const STANDARD_LIMITATIONS: readonly string[] = [
  "This is a split-history replication check over already-recorded outcomes, not execution of modified logic — see lib/ai/evolutionCandidate/replay.ts's own header.",
  "PATTERN_GAP within each replay slice excludes failure_pattern_candidates/constraint_validations (all-time aggregates with no per-window granularity) — see replay.ts.",
  "Regression is checked on one axis only (other active gap category count) — this is the only axis measurable without executing modified logic.",
];

function buildInvariantChecks(candidate: EvolutionCandidateWithoutTimestamp): InvariantChecks {
  const replay = candidate.replay;
  return {
    // Always true by construction — nothing in lib/ai/evolutionCandidate
    // or lib/ai/evolutionValidation imports from qualification/
    // arbitration/risk/execution; see this phase's static-scan fixtures.
    qualificationUntouched: true,
    arbitrationUntouched: true,
    riskUntouched: true,
    executionUntouched: true,
    sourceIsolationPreserved: replay === null || (replay.baseline.performance.source === candidate.source && replay.candidate.performance.source === candidate.source),
    symbolIsolationPreserved: replay === null || (replay.baseline.performance.symbol === candidate.symbol && replay.candidate.performance.symbol === candidate.symbol),
  };
}

export function validateEvolutionCandidate(candidate: EvolutionCandidateWithoutTimestamp): EvolutionValidationWithoutTimestamp {
  const invariantChecks = buildInvariantChecks(candidate);
  const replayDatasetReference = `source=${candidate.source} symbol=${candidate.symbol}; decision_experiences joined with decision_evaluations, split by decisionTimestamp at the population midpoint`;

  let result: ValidationResult;
  let regressionCheck: RegressionCheck;
  const evidence: string[] = [];

  if (candidate.status === "VALIDATION_BLOCKED") {
    result = "INVALID";
    regressionCheck = { regressionDetected: false, otherActiveGapCountDelta: 0, reasons: [] };
    evidence.push(`Candidate scope check failed on keyword(s): ${candidate.scope.violatingKeywords.join(", ") || "(none recorded)"}.`);
  } else if (candidate.status === "REPLAY_FAILED" || candidate.replay === null) {
    result = "INSUFFICIENT_EVIDENCE";
    regressionCheck = { regressionDetected: false, otherActiveGapCountDelta: 0, reasons: [] };
    evidence.push("Replay could not be completed with sufficient historical evidence in both the baseline and candidate windows.");
  } else {
    const replay = candidate.replay;
    evidence.push(`Baseline window: ${replay.baseline.performance.totalEvaluated} evaluated decision(s), target gap rate ${replay.baseline.targetGapRate.toFixed(3)}.`);
    evidence.push(`Candidate window: ${replay.candidate.performance.totalEvaluated} evaluated decision(s), target gap rate ${replay.candidate.targetGapRate.toFixed(3)}.`);
    evidence.push(`Other active gap categories — baseline: ${replay.baseline.otherActiveGapCount}, candidate: ${replay.candidate.otherActiveGapCount}.`);

    if (replay.otherActiveGapCountDelta > 0) {
      result = "INVALID";
      regressionCheck = {
        regressionDetected: true,
        otherActiveGapCountDelta: replay.otherActiveGapCountDelta,
        reasons: [`${replay.otherActiveGapCountDelta} additional gap categor${replay.otherActiveGapCountDelta === 1 ? "y" : "ies"} became active in the candidate window that were not active in the baseline window.`],
      };
    } else if (replay.targetGapRateDelta < 0) {
      result = "VALID";
      regressionCheck = { regressionDetected: false, otherActiveGapCountDelta: replay.otherActiveGapCountDelta, reasons: [] };
    } else {
      result = "INCONCLUSIVE";
      regressionCheck = {
        regressionDetected: false,
        otherActiveGapCountDelta: replay.otherActiveGapCountDelta,
        reasons: ["Target gap rate did not decrease between the baseline and candidate windows."],
      };
    }
  }

  return {
    candidateId: candidate.candidateId,
    proposalId: candidate.proposalId,
    source: candidate.source,
    symbol: candidate.symbol,
    candidateStatus: candidate.status,
    baselineReference: candidate.baselineVersion,
    candidateReference: candidate.candidateVersion,
    replayDatasetReference,
    metricsObserved: candidate.replay,
    regressionCheck,
    invariantChecks,
    result,
    evidence,
    limitations: STANDARD_LIMITATIONS,
  };
}
