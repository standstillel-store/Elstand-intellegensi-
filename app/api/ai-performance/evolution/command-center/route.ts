import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { listAutonomousIntelligenceSnapshots } from "@/lib/ai/autonomousSnapshot/repository";
import { isLearningSupabaseConfigured } from "@/lib/ai/learning/db";
import { gatherSymbolEvolution, EVOLUTION_SOURCE } from "@/lib/ai/evolutionApproval/derive";
import { listEvolutionProposals } from "@/lib/ai/evolutionProposal/repository";
import { listEvolutionCandidates } from "@/lib/ai/evolutionCandidate/repository";
import { getApprovalView } from "@/lib/ai/evolutionApproval/repository";
import { getChangeArtifactByRecordHash } from "@/lib/ai/evolutionArtifact/repository";
import { buildEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";
import { diagnoseTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import { deriveCandidateView, pickLeadCandidate } from "@/lib/ai/evolutionCommandCenter/deriveStage";
import type { EvolutionCandidateView, EvolutionCommandCenterView } from "@/lib/ai/evolutionCommandCenter/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/evolution/command-center   (added 2026-10-02)
//
// READ-ONLY aggregation for the Evolution Command Center UI. This route adds
// NO new lifecycle logic: every field it returns comes straight from calling
// the SAME functions app/api/ai-performance/cognitive/route.ts and
// app/api/ai-performance/approvals/request/route.ts already call
// (gatherSymbolEvolution, getApprovalView, buildEvolutionValidationRecord) —
// plus two additional READ-ONLY lookups neither of those routes currently
// does: listEvolutionProposals/listEvolutionCandidates (was the
// computed-in-memory proposal/candidate ALSO actually persisted as a row?)
// and getChangeArtifactByRecordHash (has the artifact step already run for
// this approval?). Nothing here writes anything, requests anything, or
// decides anything — see lib/ai/evolutionCommandCenter/deriveStage.ts's own
// header for how the 11-stage ladder is computed from these real objects.
// Membership-gated exactly like /cognitive.
// ---------------------------------------------------------------------------

export async function GET() {
  const hasOracleMembership = await hasActiveMembership();
  if (!hasOracleMembership) {
    return NextResponse.json({ learningDbConfigured: isLearningSupabaseConfigured(), telegramConfigured: false, lastCycleAt: null, leadCandidate: null, otherCandidates: [], symbolsObserved: 0 } satisfies EvolutionCommandCenterView);
  }

  const snapshots = await listAutonomousIntelligenceSnapshots("ELVOID_PRO_ORACLE");
  const symbols = Array.from(new Set(snapshots.map((s) => s.symbol)));
  const lastCycleAt = snapshots.reduce<string | null>((latest, s) => (latest === null || s.updatedAt > latest ? s.updatedAt : latest), null);
  const telegramConfigured = diagnoseTelegramConfig({ TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, TELEGRAM_APPROVER_ID: process.env.TELEGRAM_APPROVER_ID, TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET }).length === 0;

  const derivedPerSymbol = symbols.length > 0 ? await Promise.all(symbols.map((symbol) => gatherSymbolEvolution(symbol))) : [];

  const candidates: EvolutionCandidateView[] = [];
  for (const entry of derivedPerSymbol) {
    if (entry.candidates.length === 0 || entry.evolutionNeed === null) continue; // candidates is only ever non-empty when evolutionNeed derived successfully — guard satisfies the type, not just the runtime invariant
    // One read of each persisted list per symbol (not per candidate) — same
    // shape listEvolutionProposals/listEvolutionCandidates already return,
    // matched back to the in-memory candidate by its deterministic id.
    const [persistedProposals, persistedCandidates] = await Promise.all([listEvolutionProposals(EVOLUTION_SOURCE, entry.symbol), listEvolutionCandidates(EVOLUTION_SOURCE, entry.symbol)]);

    for (const { proposal, candidate, validation } of entry.candidates) {
      const proposalCreatedAt = persistedProposals?.find((p) => p.proposalId === proposal.proposalId)?.createdAt ?? null;
      const candidateCreatedAt = persistedCandidates?.find((c) => c.candidateId === candidate.candidateId)?.createdAt ?? null;
      const recordHash = buildEvolutionValidationRecord(proposal, candidate)?.recordHash ?? null;
      const approval = await getApprovalView({ validationResult: validation.result, recordHash });
      const artifact = recordHash && approval.status !== "INELIGIBLE" ? await getChangeArtifactByRecordHash(recordHash) : null;

      candidates.push(
        deriveCandidateView({
          symbol: entry.symbol,
          need: entry.evolutionNeed.need,
          consideredGaps: entry.evolutionNeed.consideredGaps,
          proposal,
          proposalCreatedAt,
          candidate,
          candidateCreatedAt,
          validation,
          approval,
          artifact,
        })
      );
    }
  }

  const leadCandidate = pickLeadCandidate(candidates);
  const otherCandidates = candidates.filter((c) => c !== leadCandidate).sort((a, b) => b.stagesReached - a.stagesReached);

  return NextResponse.json({
    learningDbConfigured: isLearningSupabaseConfigured(),
    telegramConfigured,
    lastCycleAt,
    leadCandidate,
    otherCandidates,
    symbolsObserved: symbols.length,
  } satisfies EvolutionCommandCenterView);
}
