// ---------------------------------------------------------------------------
// ELVOID Intelligence — Versioned Learning Validation, pure verdict
// (Phase 8.6.6)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. Takes an already-built `EvolutionCandidate`
// (8.6.5 — including its `null` replay for blocked/failed candidates)
// and derives exactly one `ValidationResult`.
//
// DECISION TABLE (in order — first match wins) — Phase 8.6.6b:
//   1. candidate.status === "VALIDATION_BLOCKED" -> INVALID. An
//      out-of-scope candidate is never merely "inconclusive" — it is
//      rejected outright, before any evidence is even considered.
//   1b. (Phase 8.6.5b) candidate.replayApplicability.applicable === false
//      -> NOT_APPLICABLE. The gap category cannot be measured by the
//      executed-only replay population, so no evidence about the
//      proposal exists to be weighed either way. Checked after (1) so an
//      unsafe proposal is still INVALID, and before everything below so a
//      not-applicable category can never read as insufficient,
//      inconclusive, or valid.
//   2. candidate.status === "REPLAY_FAILED" (includes candidate.replay
//      === null, and a replay skipped because the historical read may have
//      been truncated) -> INSUFFICIENT_EVIDENCE.
//   2b. The replay's regression identity was not recorded (a row persisted
//      before 8.6.6b) -> INSUFFICIENT_EVIDENCE; nothing is reconstructed.
//   3. A regression was detected — MORE other gap categories active in the
//      newer window (count) OR any newly active category (identity) ->
//      INVALID. Checked regardless of what happened to the targeted metric,
//      and before the sample-size gate: a regression signal is surfaced,
//      never hidden behind "not enough samples".
//   4. Either window has fewer than the minimum eligible samples ->
//      INSUFFICIENT_EVIDENCE.
//   5. Every validation gate (gates.ts) passed -> VALID.
//   6. Otherwise -> INCONCLUSIVE: enough samples and no regression, but the
//      raw target gap rate did not fall by the required margin. Not
//      evidence for the proposal, not evidence against it.
//
// WHAT VALID MEANS (Phase 8.6.6b): "the proposal met every validation gate on
// the observational evidence available". The gates are ENGINEERING
// thresholds, not statistical significance. VALID does NOT mean the change
// is demonstrated, that profit rose, that a counterfactual was shown, that
// anything is safe for production, or that anything may be promoted.
//
// VALIDATION MODE (Phase 8.6.5b): every result, whatever its `result`
// value, is `OBSERVATIONAL_SPLIT_HISTORY` with `counterfactualAvailable:
// false` and the fixed `missingCounterfactualInputs` list — see
// lib/ai/evolutionCandidate/semantics.ts.
// ---------------------------------------------------------------------------

import { COUNTERFACTUAL_AVAILABLE, COUNTERFACTUAL_MISSING_INPUTS, VALIDATION_MODE } from "@/lib/ai/evolutionCandidate/semantics";
import type { EvolutionCandidateWithoutTimestamp, ReplaySlice } from "@/lib/ai/evolutionCandidate/contracts";
import { VALIDATION_GATE_THRESHOLDS, evaluateValidationGates, allGatesPassed } from "./gates";
import type { RegressionCheck, InvariantChecks, ValidationResult, ValidationGateOutcome, EvolutionValidationWithoutTimestamp } from "./contracts";

const STANDARD_LIMITATIONS: readonly string[] = [
  "This is a split-history replication check over already-recorded outcomes, not execution of modified logic — see lib/ai/evolutionCandidate/replay.ts's own header.",
  "PATTERN_GAP within each replay slice excludes failure_pattern_candidates/constraint_validations (all-time aggregates with no per-window granularity) — see replay.ts.",
  "Regression is checked on one axis only (which other gap categories are active in each window) — this is the only axis measurable without executing modified logic.",
  "Validation mode is OBSERVATIONAL_SPLIT_HISTORY: an older window is compared with a newer window of recorded outcomes. No candidate logic was applied to either window, so this result does not show what the proposed change would do.",
  "This is not counterfactual validation. The inputs a counterfactual replay would need are listed in missingCounterfactualInputs.",
  "VALID means every validation gate was met on the observational evidence available. The gates are engineering thresholds (see gateThresholds), not statistical significance.",
  "VALID does not demonstrate an effect of the proposed change, does not indicate any profit outcome, is not counterfactual evidence, does not indicate production safety, and does not authorize promotion.",
];

const NOT_EVALUATED: RegressionCheck = { evaluated: false, regressionDetected: false, newlyActiveGapCategories: [], otherActiveGapCountDelta: 0, reasons: [] };

function describeWindow(label: string, slice: ReplaySlice): string {
  const raw = slice.targetRawOccurrenceCount;
  const rate = slice.targetRawGapRate;
  if (raw == null || rate == null) return `${label} window: ${slice.performance.totalEvaluated} evaluated decision(s), raw target gap occurrence count not recorded.`;
  return `${label} window: ${slice.performance.totalEvaluated} evaluated decision(s), ${raw} carrying the target gap's evidence, raw target gap rate ${rate.toFixed(3)}.`;
}

function describeAccounting(label: string, slice: ReplaySlice): string {
  const accounting = slice.sampleAccounting;
  if (accounting == null) return `${label} window sample accounting: not recorded (persisted before Phase 8.6.5b).`;
  const reasons = accounting.exclusionReasons.map((entry) => `${entry.reason}=${entry.count}`).join(", ");
  return `${label} window sample accounting: ${accounting.scopedTotal} scoped, ${accounting.eligible} eligible, ${accounting.excluded} excluded (${reasons}).`;
}

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
  const replayDatasetReference = candidate.replayApplicability.applicable
    ? `source=${candidate.source} symbol=${candidate.symbol}; decision_experiences joined with decision_evaluations, split by decisionTimestamp at the population midpoint`
    : `source=${candidate.source} symbol=${candidate.symbol}; none — replay is not applicable to ${candidate.gapCategory}, so no historical population was read`;

  let result: ValidationResult;
  let regressionCheck: RegressionCheck;
  let gates: readonly ValidationGateOutcome[] = [];
  const evidence: string[] = [];

  if (candidate.status === "VALIDATION_BLOCKED") {
    result = "INVALID";
    regressionCheck = NOT_EVALUATED;
    evidence.push(`Candidate scope check failed on keyword(s): ${candidate.scope.violatingKeywords.join(", ") || "(none recorded)"}.`);
  } else if (!candidate.replayApplicability.applicable) {
    result = "NOT_APPLICABLE";
    regressionCheck = { ...NOT_EVALUATED, reasons: ["Regression axis was not evaluated: replay is not applicable to this gap category."] };
    evidence.push(`Replay is not applicable to ${candidate.gapCategory}: ${candidate.replayApplicability.reason}`);
  } else if (candidate.status === "REPLAY_FAILED" || candidate.replay === null) {
    result = "INSUFFICIENT_EVIDENCE";
    regressionCheck = NOT_EVALUATED;
    evidence.push(
      candidate.replayLimitation === "POPULATION_POSSIBLY_TRUNCATED"
        ? "Replay was not run: the historical population reached the row count at which the database read may have been truncated, and a partial population would corrupt every count."
        : "Replay could not be completed with sufficient historical evidence in both the baseline and candidate windows."
    );
  } else {
    const replay = candidate.replay;
    const baselineOthers = replay.baseline.otherActiveGapCategories;
    const candidateOthers = replay.candidate.otherActiveGapCategories;
    const newlyActive = replay.newlyActiveGapCategories;

    evidence.push(describeWindow("Baseline", replay.baseline));
    evidence.push(describeWindow("Candidate", replay.candidate));
    evidence.push(`Detection-threshold rates (0 below the detection threshold) — baseline: ${replay.baseline.targetGapRate.toFixed(3)}, candidate: ${replay.candidate.targetGapRate.toFixed(3)}.`);
    evidence.push(`Other active gap categories — baseline: ${replay.baseline.otherActiveGapCount}${baselineOthers == null ? "" : ` [${baselineOthers.join(", ")}]`}, candidate: ${replay.candidate.otherActiveGapCount}${candidateOthers == null ? "" : ` [${candidateOthers.join(", ")}]`}.`);
    evidence.push(describeAccounting("Baseline", replay.baseline));
    evidence.push(describeAccounting("Candidate", replay.candidate));

    // Loose equality on purpose: a replay that bypassed normalizePersistedReplay may carry `undefined`, which must read as "not recorded", never throw.
    if (baselineOthers == null || candidateOthers == null || newlyActive == null) {
      result = "INSUFFICIENT_EVIDENCE";
      regressionCheck = NOT_EVALUATED;
      evidence.push("Regression identity (which other gap categories were active) was not recorded for this replay, so it cannot be evaluated; nothing was reconstructed.");
    } else {
      const reasons: string[] = [];
      if (replay.otherActiveGapCountDelta > 0) {
        reasons.push(`${replay.otherActiveGapCountDelta} additional gap categor${replay.otherActiveGapCountDelta === 1 ? "y" : "ies"} became active in the candidate window that were not active in the baseline window.`);
      }
      if (newlyActive.length > 0) {
        reasons.push(`Newly active gap categor${newlyActive.length === 1 ? "y" : "ies"} in the candidate window: ${newlyActive.join(", ")}.`);
      }
      const regressionDetected = reasons.length > 0;
      regressionCheck = { evaluated: true, regressionDetected, newlyActiveGapCategories: newlyActive, otherActiveGapCountDelta: replay.otherActiveGapCountDelta, reasons };

      gates = evaluateValidationGates(replay, regressionCheck);
      const failed = gates.filter((g) => !g.passed).map((g) => g.gate);
      evidence.push(`Validation gates passed: ${gates.length - failed.length} of ${gates.length}${failed.length > 0 ? `; not met: ${failed.join(", ")}` : ""}.`);

      if (regressionDetected) {
        result = "INVALID";
      } else if (gates.find((g) => g.gate === "MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS")?.passed !== true) {
        result = "INSUFFICIENT_EVIDENCE";
      } else if (allGatesPassed(gates)) {
        result = "VALID";
      } else {
        result = "INCONCLUSIVE";
      }
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
    validationMode: VALIDATION_MODE,
    counterfactualAvailable: COUNTERFACTUAL_AVAILABLE,
    missingCounterfactualInputs: COUNTERFACTUAL_MISSING_INPUTS,
    gateThresholds: VALIDATION_GATE_THRESHOLDS,
    gates,
    evidence,
    limitations: STANDARD_LIMITATIONS,
  };
}
