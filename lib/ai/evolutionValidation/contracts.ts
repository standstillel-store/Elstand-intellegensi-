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
//   - PHASE 8.6.6b (audit-driven, additive):
//       * `VALID` now requires every ENGINEERING VALIDATION GATE in
//         gates.ts (minimum eligible samples per window, a real and
//         sufficiently large reduction in the raw target gap rate, no newly
//         active gap category, a regression check that actually ran, no
//         detected regression). The gates are engineering thresholds for an
//         observational replay — NOT statistical significance and NOT
//         evidence that the proposed change caused anything. `VALID` means
//         only "every gate was met on the observational evidence
//         available". It does NOT mean the change is demonstrated, that
//         profit rose, that a counterfactual was shown, that anything is
//         safe for production, or that anything may be promoted.
//       * `RegressionCheck.evaluated` separates "no regression found" from
//         "regression was not evaluated".
//       * The stored-row type narrows `result` to `PersistedValidationResult`
//         (the four values the legacy table's CHECK constraint accepts);
//         `NOT_APPLICABLE` lives only in the append-only record
//         (record.ts / repository.ts).
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp, CandidateStatus, GapCategory, ReplayComparison, ValidationMode, MissingCounterfactualInput } from "@/lib/ai/evolutionCandidate/contracts";

export type { DecisionSource, CandidateStatus, GapCategory, ReplayComparison, ValidationMode, MissingCounterfactualInput };

export type ValidationResult = "VALID" | "INVALID" | "INSUFFICIENT_EVIDENCE" | "INCONCLUSIVE" | "NOT_APPLICABLE";

/** The four values the legacy `evolution_validations.result` CHECK constraint accepts. */
export type PersistedValidationResult = Exclude<ValidationResult, "NOT_APPLICABLE">;

/** The fixed engineering thresholds behind `VALID` — see gates.ts. Recorded on every validation so a record states which thresholds it was judged against. `null` only on a legacy row that predates gates. */
export interface ValidationGateThresholds {
  readonly minEligibleSamplesPerWindow: number;
  readonly minAbsoluteReductionPercentagePoints: number;
  readonly minRelativeReductionPercent: number;
}

export type ValidationGateName =
  | "MIN_ELIGIBLE_SAMPLES_BOTH_WINDOWS"
  | "TARGET_RATE_DECREASED"
  | "MIN_ABSOLUTE_REDUCTION"
  | "MIN_RELATIVE_REDUCTION"
  | "NO_NEWLY_ACTIVE_GAP_CATEGORIES"
  | "REGRESSION_CHECK_EVALUATED"
  | "NO_DETECTED_REGRESSION";

export interface ValidationGateOutcome {
  readonly gate: ValidationGateName;
  readonly passed: boolean;
  /** Plain, deterministic, count-based description of what was observed for this gate — never a causal claim. */
  readonly observed: string;
}

export interface RegressionCheck {
  /** Phase 8.6.6b. `true` only when a replay ran and its regression identity (which other categories were active) was recorded. `false` means the regression axis was NOT evaluated — `regressionDetected: false` then says nothing about regression. */
  readonly evaluated: boolean;
  readonly regressionDetected: boolean;
  /** Phase 8.6.6b. Categories active in the newer window but not the older one, sorted alphabetically; empty when none or when not evaluated (see `evaluated`). */
  readonly newlyActiveGapCategories: readonly GapCategory[];
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
  /** Phase 8.6.6b — the thresholds `VALID` was judged against; `null` only when reading a legacy row. */
  readonly gateThresholds: ValidationGateThresholds | null;
  /** Phase 8.6.6b — every gate, in the fixed order of `ValidationGateName`, when a replay was evaluated; empty when no replay was evaluated (blocked, not applicable, insufficient data) or when reading a legacy row. */
  readonly gates: readonly ValidationGateOutcome[];
  /** Plain, deterministic, count-based statements only — never LLM-generated, never a causal claim. */
  readonly evidence: readonly string[];
  readonly limitations: readonly string[];
}

export interface EvolutionValidation extends EvolutionValidationWithoutTimestamp {
  /** Narrowed: the legacy table can never return `NOT_APPLICABLE`. */
  readonly result: PersistedValidationResult;
  readonly validatedAt: string;
}

// ---------------------------------------------------------------------------
// Append-only validation record (Phase 8.6.6b)
//
// The immutable, self-pinning unit a future approval step must reference.
// `recordHash` is the sha256 of the canonical serialization of `snapshot`
// (see record.ts): any change to the proposal text, the replay evidence, the
// validation result, the thresholds or the gates produces a different hash.
// The record carries the WHOLE snapshot — proposal, candidate (with its
// replay windows and sample accounting) and validation (with gates and
// thresholds) — so what was reviewed can be shown exactly as it was, later.
//
// REQUIREMENT FOR PHASE 8.6.7 (not implemented here): an approval MUST store
// the `recordHash` of the record it approves, and MUST NOT reference a
// proposal, candidate or validation by id alone — ids are stable while the
// content behind them is not. `VALID` in a record means only that every
// validation gate was met on observational evidence; it is not, by itself,
// grounds to approve anything.
//
// The record table (evolution_validation_records) is append-only: UPDATE,
// DELETE and TRUNCATE are rejected by a database trigger, and the only write
// path (recordRepository.ts) is a plain insert.
// ---------------------------------------------------------------------------

export interface EvolutionValidationRecordSnapshot {
  readonly proposal: EvolutionProposalWithoutTimestamp;
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  readonly validation: EvolutionValidationWithoutTimestamp;
}

export interface EvolutionValidationRecordWithoutTimestamp {
  /** Lowercase hex sha256 of the canonical serialization of `snapshot` — see record.ts. UNIQUE in the table. */
  readonly recordHash: string;
  readonly recordSchemaVersion: 1;
  /** The columns below are copies of values inside `snapshot`, kept as columns so the table can be queried and constrained; `verifyEvolutionValidationRecord()` checks they agree with the snapshot. */
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly result: ValidationResult;
  readonly validationMode: ValidationMode;
  readonly counterfactualAvailable: false;
  readonly snapshot: EvolutionValidationRecordSnapshot;
}

export interface EvolutionValidationRecord extends EvolutionValidationRecordWithoutTimestamp {
  /** Database `now()` at insert — deliberately excluded from `recordHash`. */
  readonly recordedAt: string;
}
