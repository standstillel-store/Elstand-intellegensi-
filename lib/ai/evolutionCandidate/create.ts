// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Candidate creation, pure (Phase 8.6.5 B1
// + B6)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. Split from replay.ts's DB-touching orchestration
// (repository.ts) so the scope check can run — and short-circuit before
// any replay computation — without needing the historical population at
// all, matching Phase 8.6.5 B6's "if scope is unclear, VALIDATION_BLOCKED"
// instruction: an out-of-scope proposal never reaches replay.ts.
// ---------------------------------------------------------------------------

import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { CandidateScopeCheck, CandidateStatus, ReplayComparison, EvolutionCandidateWithoutTimestamp } from "./contracts";

/**
 * Fixed, defensive keyword list — checked against `hypothesis` +
 * `proposedChange` ONLY, never `validationRequirements` (every real
 * evolutionProposal template safely mentions "qualification/arbitration"
 * there as a human-review reminder — scanning that field would false-
 * positive on the module's own safety language). Every one of 8.6.4's 6
 * real templates already stays clear of every keyword below by
 * construction; this check exists to verify that explicitly rather than
 * assume it holds forever.
 */
const FORBIDDEN_SCOPE_KEYWORDS: readonly string[] = ["risk", "execution", "authentication", "wallet", "payment", "credential", "database security", "api key"];

const CANDIDATE_SYSTEM_VERSION = "phase-8.6.5";

export function checkCandidateScope(hypothesis: string, proposedChange: string): CandidateScopeCheck {
  const haystack = `${hypothesis} ${proposedChange}`.toLowerCase();
  const violatingKeywords = FORBIDDEN_SCOPE_KEYWORDS.filter((keyword) => haystack.includes(keyword));
  return { withinScope: violatingKeywords.length === 0, domainsChecked: FORBIDDEN_SCOPE_KEYWORDS, violatingKeywords };
}

export function candidateIdFor(proposal: EvolutionProposalWithoutTimestamp): string {
  return `candidate:${proposal.proposalId}`;
}

/**
 * Combines an already-computed scope check and (if scope allowed it to
 * run) replay comparison into the final candidate shape + status.
 *   - Out-of-scope -> VALIDATION_BLOCKED, `replay` forced to `null` even
 *     if one was somehow passed in (defense in depth: an out-of-scope
 *     candidate's replay is never trusted, never surfaced).
 *   - In-scope, replay present, both slices have sufficient coverage ->
 *     REPLAY_PASSED.
 *   - In-scope, replay present, either slice has insufficient coverage ->
 *     REPLAY_FAILED.
 *   - In-scope, `replay === null` (Learning DB unconfigured — the caller
 *     never reached replay.ts) -> REPLAY_FAILED, not CANDIDATE_CREATED;
 *     see contracts.ts's header for why CANDIDATE_CREATED/REPLAYING are
 *     never a final status in this synchronous implementation.
 */
export function finalizeCandidate(proposal: EvolutionProposalWithoutTimestamp, scope: CandidateScopeCheck, replay: ReplayComparison | null): EvolutionCandidateWithoutTimestamp {
  const candidateId = candidateIdFor(proposal);

  let status: CandidateStatus;
  let finalReplay: ReplayComparison | null;

  if (!scope.withinScope) {
    status = "VALIDATION_BLOCKED";
    finalReplay = null;
  } else if (replay === null) {
    status = "REPLAY_FAILED";
    finalReplay = null;
  } else {
    const sufficientData = replay.baseline.coverage.status !== "INSUFFICIENT_DATA" && replay.candidate.coverage.status !== "INSUFFICIENT_DATA";
    status = sufficientData ? "REPLAY_PASSED" : "REPLAY_FAILED";
    finalReplay = replay;
  }

  return {
    candidateId,
    proposalId: proposal.proposalId,
    source: proposal.source,
    symbol: proposal.symbol,
    gapCategory: proposal.gapCategory,
    gapSeverity: proposal.gapSeverity,
    hypothesis: proposal.hypothesis,
    proposedChange: proposal.proposedChange,
    baselineVersion: proposal.currentSystemVersion,
    candidateVersion: `${CANDIDATE_SYSTEM_VERSION}:${candidateId}`,
    scope,
    status,
    replay: finalReplay,
  };
}
