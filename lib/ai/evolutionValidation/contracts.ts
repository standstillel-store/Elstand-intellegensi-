// ---------------------------------------------------------------------------
// ELVOID Intelligence — Versioned Learning Validation + Regression Guard
// (Phase 8.6.6)
//
// ARCHITECTURE / AUTHORITY:
//   - Consumes an already-built `EvolutionCandidate` (8.6.5) — this
//     module performs no database read of its own for candidate data and
//     runs no replay computation itself (that already happened in
//     lib/ai/evolutionCandidate/replay.ts). It answers exactly one
//     question: "is this candidate valid enough to hand to a human?" —
//     never "should this be applied".
//   - `result` is closed to the 4 values the Phase 8.6.6 brief itself
//     specifies: `VALID | INVALID | INSUFFICIENT_EVIDENCE | INCONCLUSIVE`
//     (Phase 8.6.5b added a fifth, `NOT_APPLICABLE` — see below).
//     `VALID` here means only "the replicated evidence for this gap
//     weakened between the baseline and candidate windows, and no other
//     gap category became active" — never "this change is correct" and
//     never "apply this". See validate.ts's header for the full mapping.
//   - Regression is checked on ONE axis only, because it is the only
//     axis this repository can honestly measure without executing
//     anything: whether MORE gap categories (other than the one the
//     proposal targets) became active in the candidate window than in
//     the baseline window. A numeric improvement on the targeted metric
//     alongside a regression on this axis is always `INVALID`, never
//     `VALID` — "improvement yang naik tetapi merusak yang lain harus
//     REGRESSION_DETECTED", per the Phase 8.6.6 brief.
//   - `invariantChecks` for qualification/arbitration/risk/execution are
//     always `true` — not because they were empirically re-tested (they
//     were never invoked at all, by construction: nothing in
//     lib/ai/evolutionCandidate or lib/ai/evolutionValidation imports
//     from those modules), but because "never touched" is itself the
//     regression guard for a module that never executes anything. See
//     this candidate's static-scan fixtures for the actual proof; this
//     field surfaces that proof's conclusion for observability, it does
//     not re-derive it.
//   - Never claims "AI improved itself" — see the required UI vocabulary
//     in components/ai-performance/SelfPerformancePanel.tsx's own header.
//   - PHASE 8.6.5b HARDENING (additive — no existing value was renamed or
//     removed): every result now states what kind of evidence it is.
//       * `validationMode` is always `OBSERVATIONAL_SPLIT_HISTORY` — an
//         older window compared with a newer window of already-recorded
//         outcomes. No candidate logic was applied to either window, so a
//         result never shows what the proposed change would do, and
//         `VALID` never means "the change works".
//       * `counterfactualAvailable` is always `false`, and
//         `missingCounterfactualInputs` lists — from
//         lib/ai/evolutionCandidate/semantics.ts — what a true
//         counterfactual replay would need and this repository lacks.
//       * `NOT_APPLICABLE` is a fifth result value: the gap category
//         cannot be meaningfully measured by the executed-only replay
//         population (currently `REJECT_DOMINANCE_GAP`). It is a verdict
//         about the METHOD, not about the proposal.
//       * The `evolution_validations.result` CHECK constraint lists only
//         the original four values and this phase adds no schema change,
//         so a `NOT_APPLICABLE` result is computed and surfaced but not
//         persisted — see repository.ts.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { CandidateStatus, ReplayComparison, ValidationMode, MissingCounterfactualInput } from "@/lib/ai/evolutionCandidate/contracts";

export type { DecisionSource, CandidateStatus, ReplayComparison, ValidationMode, MissingCounterfactualInput };

export type ValidationResult = "VALID" | "INVALID" | "INSUFFICIENT_EVIDENCE" | "INCONCLUSIVE" | "NOT_APPLICABLE";

export interface RegressionCheck {
  readonly regressionDetected: boolean;
  /** Carried verbatim from `ReplayComparison.otherActiveGapCountDelta` — positive means regression. `0` when no replay ran (VALIDATION_BLOCKED/REPLAY_FAILED candidates). */
  readonly otherActiveGapCountDelta: number;
  readonly reasons: readonly string[];
}

/** See this file's header for why qualification/arbitration/risk/execution are always `true` here. Source/symbol isolation ARE empirically checked against the candidate's own replay data when replay ran. */
export interface InvariantChecks {
  readonly qualificationUntouched: boolean;
  readonly arbitrationUntouched: boolean;
  readonly riskUntouched: boolean;
  readonly executionUntouched: boolean;
  readonly sourceIsolationPreserved: boolean;
  readonly symbolIsolationPreserved: boolean;
}

export interface EvolutionValidationWithoutTimestamp {
  readonly candidateId: string;
  readonly proposalId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly candidateStatus: CandidateStatus;
  readonly baselineReference: string;
  readonly candidateReference: string;
  /** Plain-text description of the historical population/window actually used — never a fabricated dataset name. */
  readonly replayDatasetReference: string;
  /** `null` exactly when no replay ran (VALIDATION_BLOCKED / REPLAY_FAILED) — never a fabricated empty comparison. */
  readonly metricsObserved: ReplayComparison | null;
  readonly regressionCheck: RegressionCheck;
  readonly invariantChecks: InvariantChecks;
  readonly result: ValidationResult;
  /** Phase 8.6.5b — always `OBSERVATIONAL_SPLIT_HISTORY`. */
  readonly validationMode: ValidationMode;
  /** Phase 8.6.5b — always `false`; typed as the literal so it cannot be set to `true` without editing this contract. */
  readonly counterfactualAvailable: false;
  /** Phase 8.6.5b — fixed list from evolutionCandidate/semantics.ts; the same on every result. */
  readonly missingCounterfactualInputs: readonly MissingCounterfactualInput[];
  /** Plain, deterministic, count-based statements only — never LLM-generated, never a causal claim. */
  readonly evidence: readonly string[];
  readonly limitations: readonly string[];
}

export interface EvolutionValidation extends EvolutionValidationWithoutTimestamp {
  readonly validatedAt: string;
}
