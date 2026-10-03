// ---------------------------------------------------------------------------
// Evolution Command Center — pure stage-ladder derivation (2026-10-02).
//
// Takes objects ALREADY produced by the real pipeline (gatherSymbolEvolution,
// the proposal/candidate persistence repositories, getApprovalView,
// getChangeArtifactByRecordHash) and maps them onto the 11 named stages.
// This function computes NOTHING about whether evolution is needed, whether
// a candidate is valid, or whether approval is eligible — all of that is
// decided elsewhere, by the modules that already own it. It only READS those
// decisions and reports, per stage, whether its real precondition holds.
//
// Strict ladder: stage N can only be `reached: true` if stage N-1 is also
// `reached: true`. We walk EVOLUTION_STAGE_ORDER in order and stop at the
// first unmet precondition — this is what makes `progressPercent` a real,
// monotonic fact instead of a vibe.
// ---------------------------------------------------------------------------

import type { EvolutionNeed, CognitiveGap } from "@/lib/ai/evolutionNeed/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionApprovalView } from "@/lib/ai/evolutionApproval/contracts";
import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";
import { EVOLUTION_STAGE_ORDER, type EvolutionCandidateView, type EvolutionStageId, type EvolutionStageStatus, type EvolutionAuditEvent, type EvolutionTerminalOutcome } from "./contracts";

export interface DeriveCandidateViewInput {
  readonly symbol: string;
  readonly need: EvolutionNeed;
  readonly consideredGaps: readonly CognitiveGap[];
  readonly proposal: EvolutionProposalWithoutTimestamp;
  readonly proposalCreatedAt: string | null; // from listEvolutionProposals — null if not (yet) persisted or DB unreachable
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  readonly candidateCreatedAt: string | null; // from listEvolutionCandidates — null if not (yet) persisted or DB unreachable
  readonly validation: EvolutionValidationWithoutTimestamp;
  readonly approval: EvolutionApprovalView;
  readonly artifact: ChangeArtifact | null;
}

function stage(id: EvolutionStageId, reached: boolean, detail: string): EvolutionStageStatus {
  return { id, reached, detail };
}

export function deriveCandidateView(input: DeriveCandidateViewInput): EvolutionCandidateView {
  const { symbol, need, consideredGaps, proposal, proposalCreatedAt, candidate, candidateCreatedAt, validation, approval, artifact } = input;

  const stages: EvolutionStageStatus[] = [];
  let ok = true; // carries the ladder forward — false the moment one precondition fails

  // 1. OBSERVE — evaluation coverage was sufficient enough for the gate to
  // even inspect gaps (INSUFFICIENT_EVIDENCE means coverage itself was
  // insufficient — see evolutionNeed/contracts.ts's own doc comment).
  ok &&= need !== "INSUFFICIENT_EVIDENCE";
  stages.push(stage("OBSERVE", ok, ok ? "Evaluation coverage sufficient to inspect gaps" : "Evaluation coverage insufficient — gaps not inspected"));

  // 2. GAP — at least one CognitiveGap was actually considered.
  ok &&= consideredGaps.length > 0;
  stages.push(stage("GAP", ok, ok ? `${consideredGaps.length} gap categor${consideredGaps.length === 1 ? "y" : "ies"} considered` : "No gap met the occurrence threshold"));

  // 3. EVIDENCE — this candidate's own proposal carries real occurrence evidence.
  const evidence = proposal.evidence;
  ok &&= evidence.occurrenceCount > 0;
  stages.push(stage("EVIDENCE", ok, ok ? `${evidence.occurrenceCount}/${evidence.evaluatedCount} evaluated decisions (${proposal.gapCategory}, ${proposal.gapSeverity})` : "No occurrence evidence on this proposal"));

  // 4. PROPOSAL — the gate actually warranted drafting a proposal.
  ok &&= need === "EVOLUTION_WARRANTED";
  stages.push(stage("PROPOSAL", ok, ok ? `Drafted: ${proposal.proposalId}` : `Need assessed as ${need} — not warranted`));

  // 5. PERSIST — the proposal is actually a row in evolution_proposals (not just computed in memory this request).
  const persisted = proposalCreatedAt !== null;
  ok &&= persisted;
  stages.push(stage("PERSIST", ok, persisted ? `Persisted ${proposalCreatedAt}` : "Not yet persisted to evolution_proposals"));

  // 6. CANDIDATE — a candidate was built AND it too is a persisted row (evolution_candidates).
  const candidatePersisted = candidateCreatedAt !== null;
  ok &&= candidatePersisted;
  stages.push(stage("CANDIDATE", ok, candidatePersisted ? `${candidate.candidateId} persisted ${candidateCreatedAt}` : "Candidate not yet persisted to evolution_candidates"));

  // 7. VALIDATION — the (deterministic, replay-based) validator returned VALID.
  ok &&= validation.result === "VALID";
  stages.push(stage("VALIDATION", ok, `Result: ${validation.result}`));

  // 8. REGRESSION — the regression axis was actually evaluated AND came back clean.
  const regOk = validation.regressionCheck.evaluated && !validation.regressionCheck.regressionDetected;
  ok &&= regOk;
  stages.push(stage("REGRESSION", ok, validation.regressionCheck.evaluated ? (validation.regressionCheck.regressionDetected ? `Regression detected: ${validation.regressionCheck.newlyActiveGapCategories.join(", ") || "see reasons"}` : "No detected regression") : "Regression axis not evaluated"));

  // 9. READY (100%) — the immutable validation record is appended and the
  // approval view reports the candidate is genuinely eligible and waiting.
  ok &&= approval.status === "AWAITING_HUMAN_APPROVAL" && approval.recordPersisted === true;
  stages.push(stage("READY", ok, ok ? `Record ${approval.recordHash?.slice(0, 12)}… awaiting a human` : `Approval view: ${approval.status}${approval.failure ? ` (${approval.failure})` : ""}`));

  // 10. HUMAN_APPROVAL — a human actually pressed Approve on Telegram.
  const humanApproved = approval.status === "HUMAN_APPROVED";
  ok &&= humanApproved;
  stages.push(stage("HUMAN_APPROVAL", ok, approval.status === "HUMAN_REJECTED" ? "Human rejected — pipeline stops here, by design" : humanApproved ? `Approved ${approval.decidedAt ?? ""}` : "Awaiting a human decision"));

  // 11. CHANGE_ARTIFACT — the artifact generation step actually produced a record for this approval.
  ok &&= artifact !== null;
  stages.push(stage("CHANGE_ARTIFACT", ok, artifact ? `${artifact.artifactId} generated ${artifact.generatedAt}` : "No change artifact generated yet"));

  const stagesReached = stages.filter((s) => s.reached).length;
  const currentStage = stages[Math.max(0, stagesReached - 1)]?.id ?? "OBSERVE";
  const terminalOutcome: EvolutionTerminalOutcome = approval.status === "HUMAN_APPROVED" ? "HUMAN_APPROVED" : approval.status === "HUMAN_REJECTED" ? "HUMAN_REJECTED" : null;

  const auditTrail: EvolutionAuditEvent[] = [];
  if (proposalCreatedAt) auditTrail.push({ at: proposalCreatedAt, label: `Proposal ${proposal.proposalId} persisted` });
  if (candidateCreatedAt) auditTrail.push({ at: candidateCreatedAt, label: `Candidate ${candidate.candidateId} persisted` });
  if (approval.decidedAt) auditTrail.push({ at: approval.decidedAt, label: approval.status === "HUMAN_APPROVED" ? "Human approved on Telegram" : approval.status === "HUMAN_REJECTED" ? "Human rejected on Telegram" : "Approval decided" });
  if (artifact) auditTrail.push({ at: artifact.generatedAt, label: `Change artifact ${artifact.artifactId} generated` });
  auditTrail.sort((a, b) => a.at.localeCompare(b.at));

  return {
    symbol,
    candidateId: candidate.candidateId,
    proposalId: proposal.proposalId,
    gapCategory: proposal.gapCategory,
    gapSeverity: proposal.gapSeverity,
    gapOccurrenceCount: evidence.occurrenceCount,
    gapEvaluatedCount: evidence.evaluatedCount,
    validationResult: validation.result,
    regressionEvaluated: validation.regressionCheck.evaluated,
    regressionDetected: validation.regressionCheck.evaluated ? validation.regressionCheck.regressionDetected : null,
    approvalStatus: approval.status,
    recordHash: approval.recordHash,
    artifactStatus: artifact ? "GENERATED" : null,
    terminalOutcome,
    stages,
    stagesReached,
    progressPercent: Math.round((stagesReached / EVOLUTION_STAGE_ORDER.length) * 100),
    currentStage,
    auditTrail,
  };
}

/** Picks the furthest-along candidate — same "most advanced wins" rule EvolutionCharge.tsx already uses, just applied over the richer 11-stage count instead of a gate-pass ratio. */
export function pickLeadCandidate(candidates: readonly EvolutionCandidateView[]): EvolutionCandidateView | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.stagesReached - a.stagesReached)[0] ?? null;
}
