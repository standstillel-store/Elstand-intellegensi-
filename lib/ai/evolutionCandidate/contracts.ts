// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Candidate + Replay Engine (Phase 8.6.5)
//
// ARCHITECTURE / AUTHORITY:
//   - FORENSIC AUDIT FINDING (read before anything else in this module):
//     lib/ai/cognitiveReplay (Phase 8.3.7) is NOT a "run different logic
//     against history" engine — its own header is explicit that it is a
//     "READ-ONLY RECONSTRUCTION" of a single past cycle already recorded,
//     never a simulation. There is no execution engine anywhere in this
//     repository that can run a hypothetical modified decision rule
//     against historical inputs, and building one would mean writing and
//     executing real candidate code — explicitly forbidden ("no automatic
//     code generation followed by execution"). An `EvolutionCandidate`
//     therefore is NOT a counterfactual re-execution. It is a
//     split-history REPLICATION CHECK: the same already-existing, already
//     pure 8.6.1/8.6.2 functions (`computeEvaluationCoverage`,
//     `aggregatePerformance`, `detectCognitiveGaps`) are run twice —
//     once on the OLDER half and once on the NEWER half of the exact
//     same historical (source, symbol) population the proposal's gap
//     was originally detected from — asking one honest question: does
//     the evidence for this gap still hold up, or was it a one-off in an
//     older window? See replay.ts's header for the full reasoning and
//     its explicit limitation.
//   - `EvolutionCandidate` NEVER contains executable code, a diff, or a
//     patch — only the SAME structured proposal fields (`hypothesis`,
//     `proposedChange`) carried through, plus the replay comparison.
//   - Status is closed to the 4 values below — `REPLAYING` is included
//     for fidelity to the Phase 8.6.5 brief's own vocabulary but is
//     never actually produced or persisted by this synchronous
//     implementation (replay/scope-check/validation all complete within
//     one function call — there is no long-running job to be "in
//     progress" for). `APPROVED`/`ACTIVE`/`DEPLOYED` do not exist here,
//     by design, matching evolutionProposal/contracts.ts's own rule.
//   - `candidateId` is a deterministic composite (`candidate:<proposalId>`),
//     never a random UUID or a mutable sequential counter — the SAME
//     proposal always identifies the SAME candidate, matching
//     evolutionProposal's own `proposalId` discipline.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { GapCategory, GapSeverity } from "@/lib/ai/cognitiveGap/contracts";
import type { EvaluationCoverageReport, SelfPerformanceAggregate } from "@/lib/ai/selfPerformance/contracts";

export type { DecisionSource, GapCategory, GapSeverity, EvaluationCoverageReport, SelfPerformanceAggregate };

/** See this file's header — `REPLAYING` is never actually reachable in this synchronous implementation. */
export type CandidateStatus = "CANDIDATE_CREATED" | "REPLAYING" | "REPLAY_PASSED" | "REPLAY_FAILED" | "VALIDATION_BLOCKED";

/** The outcome of the defensive scope check (Phase 8.6.5 B6) — whether `hypothesis`/`proposedChange` text (never `validationRequirements`, which always safely mentions qualification/arbitration as a human-review reminder — see propose.ts) stays clear of forbidden domains. Every real 8.6.4 template already stays in scope by construction; this check exists to catch it explicitly rather than assume it. */
export interface CandidateScopeCheck {
  readonly withinScope: boolean;
  /** The forbidden-domain keywords actually checked for — always the same fixed list, never inferred. */
  readonly domainsChecked: readonly string[];
  /** Populated only when `withinScope` is `false`. */
  readonly violatingKeywords: readonly string[];
}

/** One half of the historical population used for replay — see replay.ts. */
export interface ReplaySlice {
  readonly windowLabel: "BASELINE" | "CANDIDATE";
  /** Verbatim `decisionTimestamp` bounds of the experiences in this slice — never fabricated, `null` when the slice is empty. */
  readonly decisionTimestampFrom: string | null;
  readonly decisionTimestampTo: string | null;
  readonly coverage: EvaluationCoverageReport;
  readonly performance: SelfPerformanceAggregate;
  /** How many decisions in this slice carry the proposal's own targeted `GapCategory`'s evidence — the same counting rule detectCognitiveGaps already uses, applied to this slice alone. */
  readonly targetGapOccurrenceCount: number;
  /** `targetGapOccurrenceCount / performance.totalEvaluated`, 0 when totalEvaluated is 0 — never NaN. */
  readonly targetGapRate: number;
  /** Count of OTHER (non-targeted) gap categories active in this slice alone — the input to the regression check in evolutionValidation. */
  readonly otherActiveGapCount: number;
}

export interface ReplayComparison {
  readonly baseline: ReplaySlice;
  readonly candidate: ReplaySlice;
  /** candidate.targetGapRate - baseline.targetGapRate. Negative means the targeted gap's rate fell in the more recent window — the only "improvement direction" this module ever reports, and never claimed as proof the proposal's hypothesis was correct. */
  readonly targetGapRateDelta: number;
  /** candidate.otherActiveGapCount - baseline.otherActiveGapCount. Positive means MORE other gap categories became active in the more recent window — the regression signal evolutionValidation checks. */
  readonly otherActiveGapCountDelta: number;
}

export interface EvolutionCandidateWithoutTimestamp {
  readonly candidateId: string;
  readonly proposalId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  readonly gapSeverity: GapSeverity;
  readonly hypothesis: string;
  readonly proposedChange: string;
  /** Reuses evolutionProposal's own "static marker for which implementation phase produced this" convention (see evolutionProposal/contracts.ts) — never a package/build version. */
  readonly baselineVersion: string;
  readonly candidateVersion: string;
  readonly scope: CandidateScopeCheck;
  readonly status: CandidateStatus;
  /** `null` exactly when `status` is `CANDIDATE_CREATED` or `VALIDATION_BLOCKED` — replay never ran (or was blocked before running). */
  readonly replay: ReplayComparison | null;
}

export interface EvolutionCandidate extends EvolutionCandidateWithoutTimestamp {
  readonly createdAt: string;
}
