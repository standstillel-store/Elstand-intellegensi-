// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Proposal Engine, persistence-aware
// adapters (Phase 8.6.4 Part B)
//
// Persistence-aware adapters ONLY — no drafting logic lives here (that's
// entirely in propose.ts's pure `draftEvolutionProposals()`). Writes
// `evolution_proposals` to the SAME isolated ELVOID Learning Database
// project every other 8.1.x/8.6.x table lives in
// (lib/ai/learning/db.ts) — never Main Supabase.
//
// Recompute-and-upsert on `proposal_id` (unique), mirroring
// lib/ai/failurePatterns/repository.ts's own
// `persistFailurePatternCandidates()` exactly: an existing row for the
// same deterministic identity is safely overwritten with the
// freshly-drafted proposal (evidence/hypothesis/severity refreshed),
// never merged, never duplicated. `proposalVersion` stays `1` in this
// phase — see contracts.ts's header for why genuine version history is
// out of scope for 8.6.4.
//
// NOTE (explicit, matching every prior Phase 8 repository's own
// disclosure): nothing in the trading lifecycle calls
// `persistEvolutionProposals()` automatically yet — no cron, no
// per-trade trigger. It is callable directly today (and from the AI
// Performance route, read-path only) and ready for a future,
// separately-approved automatic trigger.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { DecisionSource, EvolutionProposal, EvolutionProposalWithoutTimestamp } from "./contracts";

export type PersistEvolutionProposalsResult = { persisted: true; count: number } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Full recompute-and-upsert on `proposal_id` — see this file's header.
 * `proposals.length === 0` (nothing warranted) is a valid, successful
 * result, never an error — matching every prior Phase 8 persist function.
 */
export async function persistEvolutionProposals(proposals: readonly EvolutionProposalWithoutTimestamp[]): Promise<PersistEvolutionProposalsResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };
  if (proposals.length === 0) return { persisted: true, count: 0 };

  const rows = proposals.map((proposal) => ({
    proposal_id: proposal.proposalId,
    proposal_version: proposal.proposalVersion,
    source: proposal.source,
    symbol: proposal.symbol,
    current_system_version: proposal.currentSystemVersion,
    gap_category: proposal.gapCategory,
    gap_severity: proposal.gapSeverity,
    evidence: proposal.evidence,
    hypothesis: proposal.hypothesis,
    proposed_change: proposal.proposedChange,
    expected_effect: proposal.expectedEffect,
    validation_requirements: proposal.validationRequirements,
    status: proposal.status,
  }));

  const { error } = await learningDb.from("evolution_proposals").upsert(rows, { onConflict: "proposal_id" });

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, count: rows.length };
}

/**
 * Read-only listing for one (source, symbol) pair, most recent first.
 * Returns `null` only when the Learning DB is not configured; an empty
 * array (never `null`) when the table has no matching rows.
 */
export async function listEvolutionProposals(source: DecisionSource, symbol: string): Promise<readonly EvolutionProposal[] | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("evolution_proposals").select("*").eq("source", source).eq("symbol", symbol).order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map(
    (row): EvolutionProposal => ({
      proposalId: row.proposal_id,
      proposalVersion: row.proposal_version,
      source: row.source,
      symbol: row.symbol,
      currentSystemVersion: row.current_system_version,
      gapCategory: row.gap_category,
      gapSeverity: row.gap_severity,
      evidence: row.evidence,
      hypothesis: row.hypothesis,
      proposedChange: row.proposed_change,
      expectedEffect: row.expected_effect,
      validationRequirements: row.validation_requirements,
      status: row.status,
      createdAt: row.created_at,
    })
  );
}
