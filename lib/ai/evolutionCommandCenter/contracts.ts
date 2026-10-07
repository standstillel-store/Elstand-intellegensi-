// ---------------------------------------------------------------------------
// Evolution Command Center — contracts (2026-10-02).
//
// This module introduces NO new lifecycle logic and NO new persisted state.
// It is a pure, read-only VIEW over state that already exists and is already
// computed by lib/ai/evolutionApproval/derive.ts (gatherSymbolEvolution),
// lib/ai/evolutionProposal/repository.ts, lib/ai/evolutionCandidate/repository.ts,
// lib/ai/evolutionValidation/*, lib/ai/evolutionApproval/repository.ts and
// lib/ai/evolutionArtifact/repository.ts. Every field here is either copied
// straight from one of those real objects or is a pure boolean/derived value
// computed from them — nothing is invented, randomized, or time-based.
//
// The 11 named stages (OBSERVE -> GAP -> EVIDENCE -> PROPOSAL -> PERSIST ->
// CANDIDATE -> VALIDATION -> REGRESSION -> READY -> HUMAN_APPROVAL ->
// CHANGE_ARTIFACT) are a STRICT ladder: `deriveStage.ts` walks them in order
// and stops at the first one whose real precondition isn't met. A stage can
// never show as reached while an earlier one hasn't — that would be exactly
// the "cosmetic progress bar" this was built to replace.
// ---------------------------------------------------------------------------

export const EVOLUTION_STAGE_ORDER = [
  "OBSERVE",
  "GAP",
  "EVIDENCE",
  "PROPOSAL",
  "PERSIST",
  "CANDIDATE",
  "VALIDATION",
  "REGRESSION",
  "READY",
  "HUMAN_APPROVAL",
  "CHANGE_ARTIFACT",
] as const;

export type EvolutionStageId = (typeof EVOLUTION_STAGE_ORDER)[number];

export interface EvolutionStageStatus {
  readonly id: EvolutionStageId;
  /** True only when this stage's real precondition is met AND every earlier stage is also reached. */
  readonly reached: boolean;
  /** One real, already-computed fact this stage's status is based on (for the UI to show its receipts, not just a checkmark). */
  readonly detail: string;
}

/** One real timestamped fact pulled from an actual record — never synthesized. */
export interface EvolutionAuditEvent {
  readonly at: string; // ISO timestamp, straight from the record it came from
  readonly label: string;
}

export type EvolutionTerminalOutcome = "HUMAN_APPROVED" | "HUMAN_REJECTED" | null;

/**
 * The most recent post-deploy LEARNING for this candidate's (symbol, gap
 * category) — what a previously DEPLOYED change taught about this gap
 * (lib/ai/evolutionOutcome). Optional and read-only: it informs the next
 * observation, it never changes a stage, a threshold or a gate.
 */
export interface EvolutionPriorLearning {
  readonly learningKind: string;
  readonly nextEvolutionState: string;
  readonly summary: string;
  readonly commitSha: string;
  readonly recordedAt: string;
}

export interface EvolutionCandidateView {
  readonly symbol: string;
  readonly candidateId: string;
  readonly proposalId: string;
  readonly gapCategory: string | null;
  readonly gapSeverity: string | null;
  readonly gapOccurrenceCount: number | null;
  readonly gapEvaluatedCount: number | null;
  readonly validationResult: string;
  readonly regressionEvaluated: boolean;
  readonly regressionDetected: boolean | null;
  readonly approvalStatus: string;
  readonly recordHash: string | null;
  readonly artifactStatus: string | null;
  readonly terminalOutcome: EvolutionTerminalOutcome;
  readonly stages: readonly EvolutionStageStatus[];
  /** Count of stages with `reached: true`, walked strictly in order (see EVOLUTION_STAGE_ORDER) — the ONLY input to progressPercent. */
  readonly stagesReached: number;
  readonly progressPercent: number;
  readonly currentStage: EvolutionStageId;
  readonly auditTrail: readonly EvolutionAuditEvent[];
  readonly priorLearning?: EvolutionPriorLearning | null;
}

export interface EvolutionCommandCenterView {
  readonly learningDbConfigured: boolean;
  readonly telegramConfigured: boolean;
  readonly lastCycleAt: string | null;
  /** The single most-advanced candidate across all symbols this cycle (same "furthest along wins" principle as EvolutionCharge.tsx) — null when nothing has reached PROPOSAL yet anywhere. */
  readonly leadCandidate: EvolutionCandidateView | null;
  /** Every other candidate currently in flight, most-advanced first, for context (not the headline). */
  readonly otherCandidates: readonly EvolutionCandidateView[];
  readonly symbolsObserved: number;
}
