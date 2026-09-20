// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Candidate, persistence-aware adapters
// (Phase 8.6.5)
//
// Orchestration + persistence ONLY — zero scope-check/finalization logic
// here (create.ts) and zero replay-comparison logic here (replay.ts).
// Reuses lib/ai/decisionMemory/repository.ts's existing
// getDecisionMemoryJoinedExperiences() as its sole historical-data
// source — no second memory system, no new query shape for reading
// history. Writes to the SAME isolated ELVOID Learning Database every
// other 8.1.x/8.6.x table lives in.
//
// buildEvolutionCandidate() short-circuits BEFORE any database read when
// scope is blocked (Phase 8.6.5 B6) — an out-of-scope proposal never
// even reaches getDecisionMemoryJoinedExperiences().
//
// NOTE (matching every prior Phase 8 repository's own disclosure):
// nothing in the trading lifecycle calls persistEvolutionCandidate()
// automatically — no cron, no per-trade trigger. Callable directly and
// from the read-only AI Performance route (compute-only there — see
// this file's own note on the route not persisting from a GET request).
// ---------------------------------------------------------------------------

import { getDecisionMemoryJoinedExperiences } from "@/lib/ai/decisionMemory/repository";
import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import { checkCandidateScope, finalizeCandidate } from "./create";
import { buildReplayComparison, normalizePersistedReplay } from "./replay";
import { replayApplicabilityFor, isPopulationPossiblyTruncated } from "./semantics";
import type { DecisionSource, EvolutionCandidate, EvolutionCandidateWithoutTimestamp } from "./contracts";

/**
 * Builds a full candidate for one proposal. Returns `null` only when the
 * Learning DB is not configured AND scope allowed replay to be
 * attempted (matching every other repository.ts's "null = not
 * configured" convention). An out-of-scope proposal always returns a
 * `VALIDATION_BLOCKED` candidate — scope is a pure, in-memory check, so
 * it never depends on the Learning DB being configured at all. The same
 * holds for a gap category the executed-only replay cannot measure
 * (Phase 8.6.5b, see semantics.ts): it is finalized as not applicable
 * before any historical read, never forced through replay.
 */
export async function buildEvolutionCandidate(proposal: EvolutionProposalWithoutTimestamp): Promise<EvolutionCandidateWithoutTimestamp | null> {
  const scope = checkCandidateScope(proposal.hypothesis, proposal.proposedChange);
  if (!scope.withinScope) {
    return finalizeCandidate(proposal, scope, null);
  }

  if (!replayApplicabilityFor(proposal.gapCategory).applicable) {
    return finalizeCandidate(proposal, scope, null);
  }

  const rows = await getDecisionMemoryJoinedExperiences();
  if (rows === null) return null;

  // Phase 8.6.6b: the read has no limit/count/order, so a population at the
  // hosted default row cap may have been silently cut. Fail closed rather
  // than replay a possibly partial set (see semantics.ts).
  if (isPopulationPossiblyTruncated(rows.length)) {
    return finalizeCandidate(proposal, scope, null, "POPULATION_POSSIBLY_TRUNCATED");
  }

  const replay = buildReplayComparison(proposal.source, proposal.symbol, proposal.gapCategory, rows);
  return finalizeCandidate(proposal, scope, replay);
}

export type PersistEvolutionCandidateResult = { persisted: true } | { persisted: false; reason: "not_configured" | "error" | "not_persistable"; error?: string };

/**
 * Recompute-and-upsert on `candidate_id` (unique) — the same deterministic-
 * identity convention as evolutionProposal's own `persistEvolutionProposals()`.
 * Re-running candidate creation for the same proposal updates (never
 * duplicates) the existing row.
 */
export async function persistEvolutionCandidate(candidate: EvolutionCandidateWithoutTimestamp): Promise<PersistEvolutionCandidateResult> {
  // Phase 8.6.5b: a candidate whose gap category the replay cannot measure
  // is computed and surfaced but NOT persisted — the stored schema's
  // gap_category constraint does not list REJECT_DOMINANCE_GAP and this
  // phase adds no schema change. Refusing here is explicit and auditable;
  // the alternative is an opaque database constraint error.
  if (!candidate.replayApplicability.applicable) {
    return { persisted: false, reason: "not_persistable", error: "Candidate is not applicable to executed-only replay; the stored schema does not include its gap category." };
  }

  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const row = {
    candidate_id: candidate.candidateId,
    proposal_id: candidate.proposalId,
    source: candidate.source,
    symbol: candidate.symbol,
    gap_category: candidate.gapCategory,
    gap_severity: candidate.gapSeverity,
    hypothesis: candidate.hypothesis,
    proposed_change: candidate.proposedChange,
    baseline_version: candidate.baselineVersion,
    candidate_version: candidate.candidateVersion,
    scope: candidate.scope,
    status: candidate.status,
    replay: candidate.replay,
  };

  const { error } = await learningDb.from("evolution_candidates").upsert(row, { onConflict: "candidate_id" });
  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true };
}

/** Read-only listing for one (source, symbol) pair, most recent first. `null` only when the Learning DB is not configured. */
export async function listEvolutionCandidates(source: DecisionSource, symbol: string): Promise<readonly EvolutionCandidate[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("evolution_candidates").select("*").eq("source", source).eq("symbol", symbol).order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map(
    (row): EvolutionCandidate => ({
      candidateId: row.candidate_id,
      proposalId: row.proposal_id,
      source: row.source,
      symbol: row.symbol,
      gapCategory: row.gap_category,
      gapSeverity: row.gap_severity,
      hypothesis: row.hypothesis,
      proposedChange: row.proposed_change,
      baselineVersion: row.baseline_version,
      candidateVersion: row.candidate_version,
      scope: row.scope,
      // Not a stored column: deterministic from gap_category alone.
      replayApplicability: replayApplicabilityFor(row.gap_category),
      // Not a stored column (Phase 8.6.6b) — see contracts.ts. The append-only record carries it.
      replayLimitation: null,
      status: row.status,
      replay: normalizePersistedReplay(row.replay),
      createdAt: row.created_at,
    })
  );
}
