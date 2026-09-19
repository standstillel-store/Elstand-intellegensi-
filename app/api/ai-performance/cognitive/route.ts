import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { listAutonomousIntelligenceSnapshots } from "@/lib/ai/autonomousSnapshot/repository";
import { getConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { listCognitiveTracesBySymbol } from "@/lib/ai/cognitiveTrace/repository";
import { queryDecisionMemory } from "@/lib/ai/decisionMemory/repository";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import { getStatistics } from "@/lib/elvoid/paperTrader";
import { buildCognitiveMap } from "@/lib/ai/cognitiveMap/build";
import { deriveAxisConflictReport } from "@/lib/ai/cognitiveConflict/axisAnalysis";
import { buildLearningLoopChains } from "@/lib/ai/learningLoop/traceChain";
import { classifyNovelty } from "@/lib/ai/noveltyDetection/classify";
import { getSelfPerformanceReport } from "@/lib/ai/selfPerformance/repository";
import type { SelfPerformanceReport } from "@/lib/ai/selfPerformance/contracts";
import { isLearningSupabaseConfigured } from "@/lib/ai/learning/db";
import { fetchDecisionPopulationReport } from "@/lib/ai/decisionPopulation/repository";
import type { DecisionPopulationReport } from "@/lib/ai/decisionPopulation/contracts";
import { buildCognitiveGapReport } from "@/lib/ai/cognitiveGap/repository";
import type { CognitiveGapReport } from "@/lib/ai/cognitiveGap/contracts";
import { deriveReasoningGapObservations } from "@/lib/ai/reasoningGap/derive";
import { evaluateEvolutionNeed } from "@/lib/ai/evolutionNeed/evaluate";
import { buildSelfEvaluationSummary } from "@/lib/ai/selfEvaluation/build";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import { buildEvolutionCandidate } from "@/lib/ai/evolutionCandidate/repository";
import { validateEvolutionCandidate } from "@/lib/ai/evolutionValidation/validate";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/cognitive
//
// Phase 8.3.1-B/D — READ-ONLY runtime telemetry for the ELVOID Cognitive
// Visualization (AI Performance page). This route calls NOTHING that
// triggers a fresh Oracle cycle, a paper trade, or a learning recompute —
// it only reads tables that other, already-scheduled processes already
// wrote to (`autonomous_intelligence_snapshot` via the autonomous runtime,
// `constraint_validations` via the learning validation job, `ai_statistics`
// via the paper trader). A page load here can never itself cause a trade,
// matching the same guarantee documented on
// app/api/elvoid-pro/autonomous/{snapshots,status}/route.ts.
//
// Phase 8.3.3 addition: also reads `cognitive_trace` (8.3.2, one row per
// symbol, most recent only) — purely for evidence-grounded dynamic edge
// classification in buildCognitiveMap().
//
// Phase 8.3.4/8.3.5/8.3.6 addition: also calls `queryDecisionMemory()`
// (8.1.3 — a real DB read, but the SAME read the autonomous runtime already
// performs live every cycle; calling it here does not trigger a cycle, an
// Oracle assessment, or a decision) per symbol, then composes three
// read-only, presentation-only views over already-fetched data:
// `memory` (feeds the new "memory" cognitiveMap node), `axisConflicts`
// (lib/ai/cognitiveConflict/axisAnalysis.ts), and `learningLoop`
// (lib/ai/learningLoop/traceChain.ts). None of the three compute a new
// score, trigger a cycle, or write anything.
//
// Phase 8.6.1 addition: also composes `novelty` (Part 4 — a pure
// classifyNovelty() derivation over the SAME `memoryBySymbol` already
// fetched above, zero new memory read) and `selfPerformance` (Part 1+2 —
// one new getSelfPerformanceReport() read-only call per symbol, itself
// reusing decisionMemory's existing getDecisionMemoryJoinedExperiences()
// join; see lib/ai/selfPerformance/repository.ts's own header). Neither
// is read by qualification/arbitration/execution/risk anywhere — both
// are observational additions to this same telemetry route only.
// `learningDbConfigured` is surfaced alongside `novelty` so a NOVEL
// classification can be told apart from "Learning DB isn't configured at
// all" — see lib/ai/noveltyDetection/contracts.ts's own documented
// limitation for why that distinction cannot be made inside
// classifyNovelty() itself today.
//
// Phase 8.6.2-8.6.4 addition: also composes `cognitiveGaps` (8.6.2 —
// familiarity + 0-or-more deterministic, evidence-gated gaps per symbol)
// and `evolution` (8.6.3/8.6.4 — reasoning-gap framing, the
// EVOLUTION_WARRANTED/MONITOR/etc. gate, the OBSERVED/INFERRED/UNKNOWN
// self-evaluation summary, and any DRAFT proposals). All four are pure
// derivations over data already fetched on this route except one new
// per-symbol read (the same decision_experiences x decision_evaluations
// join selfPerformance already performs — see
// lib/ai/cognitiveGap/repository.ts). Proposals are computed for display
// only; this route never calls persistEvolutionProposals() — see
// lib/ai/evolutionProposal/repository.ts's own header. None of this is
// read by qualification/arbitration/execution/risk anywhere.
//
// Phase 8.6 P1 addition: also composes `decisionPopulation` — one new
// fetchDecisionPopulationReport() read per symbol
// (lib/ai/decisionPopulation/repository.ts, reading `runtime_events`,
// Phase 8.5 — NOT a re-derivation of `decision_experiences`/
// `decision_evaluations`; that population and this one are reported
// side by side, deliberately never merged, since one answers "what did
// the system decide, including WAIT/REJECT" and the other answers "of
// what executed, how did it turn out" — see
// lib/ai/decisionPopulation/contracts.ts's header for the full
// reasoning). `evaluatedExperienceCount` on each report is threaded
// through, read-only, from the SAME `selfPerformanceBySymbol` already
// computed for `cognitiveGaps`/`evolution` below — never re-queried.
// `decisionPopulation[i].report` also feeds `buildCognitiveGapReport()`
// as a 5th, optional argument, which may add a `REJECT_DOMINANCE_GAP` to
// that symbol's own new `populationGaps` field (kept separate from the
// existing `gaps` field — `reasoningGap`/`evolutionNeed` below still
// read `gaps` only, exactly as before P1). Same
// qualification/arbitration/execution/risk isolation as every field
// above: nothing on this route is read by any of them.
//
// ELVOID PRO Oracle telemetry (snapshots + validations + memory + trace)
// is membership-gated, same as the existing autonomous routes — but paper
// trader statistics are NOT gated (see lib/elvoid/paperTrader.ts), so a
// non-member still sees an honest Execution/Learning picture instead of an
// empty page.
// ---------------------------------------------------------------------------

export async function GET() {
  const hasOracleMembership = await hasActiveMembership();

  const [snapshots, stats] = await Promise.all([hasOracleMembership ? listAutonomousIntelligenceSnapshots("ELVOID_PRO_ORACLE") : Promise.resolve([]), getStatistics()]);

  const symbols = Array.from(new Set(snapshots.map((s) => s.symbol)));
  const validationLists = hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map((symbol) => getConstraintValidations("ELVOID_PRO_ORACLE", symbol))) : [];
  const validations = validationLists.flatMap((list) => list ?? []);

  // Phase 8.3.3 — most-recent trace per symbol only (limit 1); the same
  // membership gate as snapshots/validations, since cognitive_trace is
  // ELVOID_PRO_ORACLE-only data (see lib/ai/cognitiveTrace/contracts.ts).
  const traceLists = hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map((symbol) => listCognitiveTracesBySymbol(symbol, 1))) : [];
  const traces = traceLists.flatMap((list) => list ?? []);
  const latestTraceBySymbol = new Map(symbols.map((symbol) => [symbol, traces.find((t) => t.symbol === symbol) ?? null]));

  // Phase 8.3.4 — one live queryDecisionMemory() per symbol, same call the
  // autonomous runtime already makes every cycle (Step 3). ELVOID_PRO_ORACLE
  // only, same gate as everything else on this route.
  const memoryEntries: [string, DecisionMemoryResult][] =
    hasOracleMembership && symbols.length > 0 ? await Promise.all(symbols.map(async (symbol): Promise<[string, DecisionMemoryResult]> => [symbol, await queryDecisionMemory({ source: "ELVOID_PRO_ORACLE", symbol })])) : [];
  const memoryBySymbol = new Map(memoryEntries);

  const snapshot = buildCognitiveMap({
    now: new Date().toISOString(),
    hasOracleMembership,
    snapshots,
    validations,
    stats,
    traces,
    memory: memoryBySymbol,
  });

  // Phase 8.3.5 — pure derivation over the trace + memory already fetched
  // above. One report per tracked symbol.
  const axisConflicts = symbols.map((symbol) => deriveAxisConflictReport(symbol, latestTraceBySymbol.get(symbol) ?? null, memoryBySymbol.get(symbol) ?? null));

  // Phase 8.3.6 — pure composition over `validations` + `memoryBySymbol`
  // already fetched above, joined by symbol so each validation's memory
  // evidence comes from its own symbol's query result (never cross-symbol).
  const learningLoop = validations.flatMap((v) => buildLearningLoopChains([v], memoryBySymbol.get(v.symbol) ?? null));

  // Phase 8.6.1 Part 4 — pure classifyNovelty() over memoryBySymbol
  // already fetched above (zero new memory read). One assessment per
  // tracked symbol, ELVOID_PRO_ORACLE only, same gate as everything else
  // on this route (memoryBySymbol is already empty when !hasOracleMembership).
  const novelty = symbols.map((symbol) => classifyNovelty("ELVOID_PRO_ORACLE", symbol, memoryBySymbol.get(symbol) ?? null));

  // Phase 8.6.1 Part 1+2 — one getSelfPerformanceReport() read per symbol
  // (reuses decisionMemory's existing joined-experiences read internally;
  // see lib/ai/selfPerformance/repository.ts). Same membership gate and
  // same Promise.all-per-symbol idiom as memoryEntries/validationLists
  // above. `report` is `null` only when the Learning DB itself is not
  // configured — never fabricated, never defaulted to a fake zeroed report.
  const selfPerformanceEntries: [string, SelfPerformanceReport | null][] =
    hasOracleMembership && symbols.length > 0
      ? await Promise.all(symbols.map(async (symbol): Promise<[string, SelfPerformanceReport | null]> => [symbol, await getSelfPerformanceReport("ELVOID_PRO_ORACLE", symbol)]))
      : [];
  const selfPerformance = selfPerformanceEntries.map(([symbol, report]) => ({ symbol, report }));

  // Phase 8.6 P1 — one fetchDecisionPopulationReport() read per symbol.
  // Genuinely NEW data (`runtime_events`, Phase 8.5) — not a re-derivation
  // of anything `selfPerformance` above already fetched; see
  // lib/ai/decisionPopulation/contracts.ts's header for why
  // `cognitive_trace`/`decision_experiences` were not reused instead.
  // `evaluatedExperienceCount` is threaded through from the SAME
  // `selfPerformanceBySymbol` computed just below, per
  // `DecisionPopulationDataQuality`'s own "never re-computed" rule — this
  // is why `selfPerformanceBySymbol` is built before this block rather
  // than after, one line earlier than Phase 8.6.2 originally needed it.
  const selfPerformanceBySymbol = new Map(selfPerformance.map(({ symbol, report }) => [symbol, report]));
  const decisionPopulationEntries: [string, DecisionPopulationReport | null][] =
    hasOracleMembership && symbols.length > 0
      ? await Promise.all(
          symbols.map(async (symbol): Promise<[string, DecisionPopulationReport | null]> => [
            symbol,
            await fetchDecisionPopulationReport("ELVOID_PRO_ORACLE", symbol, { evaluatedExperienceCount: selfPerformanceBySymbol.get(symbol)?.coverage.evaluatedExperienceCount ?? null }),
          ])
        )
      : [];
  const decisionPopulation = decisionPopulationEntries.map(([symbol, report]) => ({ symbol, report }));
  const decisionPopulationBySymbol = new Map(decisionPopulationEntries);

  // Phase 8.6.2 — one buildCognitiveGapReport() call per symbol, reusing
  // memoryBySymbol + validationLists already fetched above. The only NEW
  // read is the same getDecisionMemoryJoinedExperiences() join
  // selfPerformance already performs (see
  // lib/ai/cognitiveGap/repository.ts's own header) — no second memory
  // system, no new query shape.
  const validationsBySymbol = new Map(symbols.map((symbol, i) => [symbol, validationLists[i] ?? []]));

  const cognitiveGapEntries: [string, CognitiveGapReport | null][] =
    hasOracleMembership && symbols.length > 0
      ? await Promise.all(
          symbols.map(async (symbol): Promise<[string, CognitiveGapReport | null]> => [
            symbol,
            await buildCognitiveGapReport("ELVOID_PRO_ORACLE", symbol, memoryBySymbol.get(symbol) ?? null, validationsBySymbol.get(symbol) ?? [], decisionPopulationBySymbol.get(symbol) ?? null),
          ])
        )
      : [];
  const cognitiveGaps = cognitiveGapEntries.map(([symbol, report]) => ({ symbol, report }));

  // Phase 8.6.3/8.6.4 — pure derivations over the gap report +
  // selfPerformance coverage already computed above. Zero new reads.
  // Proposals are COMPUTED ONLY, never persisted from this GET route —
  // see lib/ai/evolutionProposal/repository.ts's own header for why
  // `persistEvolutionProposals()` is deliberately left uncalled here,
  // matching every prior Phase 8 "callable but not automatically wired
  // yet" recompute function.
  //
  // Phase 8.6.5/8.6.6 — for each drafted proposal, buildEvolutionCandidate()
  // (one new read per candidate: the same getDecisionMemoryJoinedExperiences()
  // join every other Phase 8.6 module already reuses) then
  // validateEvolutionCandidate() (pure, zero reads). Candidates/validations
  // are COMPUTED ONLY here too — see lib/ai/evolutionCandidate/repository.ts's
  // and lib/ai/evolutionValidation/repository.ts's own headers for why
  // persistEvolutionCandidate()/persistEvolutionValidation() are never
  // called from this GET route.
  const evolution = await Promise.all(
    cognitiveGapEntries.map(async ([symbol, gapReport]) => {
      const performanceReport = selfPerformanceBySymbol.get(symbol) ?? null;
      if (gapReport === null || performanceReport === null) {
        return { symbol, reasoningGaps: [], evolutionNeed: null, selfEvaluation: null, proposals: [], candidates: [] };
      }
      const hasValidConstraint = (validationsBySymbol.get(symbol) ?? []).some((v) => v.status === "VALID");
      const reasoningGaps = deriveReasoningGapObservations(gapReport.gaps);
      const evolutionNeed = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", symbol, performanceReport.coverage, gapReport.gaps, hasValidConstraint);
      const selfEvaluation = buildSelfEvaluationSummary("ELVOID_PRO_ORACLE", symbol, performanceReport.performance, performanceReport.coverage, gapReport.familiarityEvidence, gapReport.gaps, reasoningGaps, evolutionNeed);
      const proposals = draftEvolutionProposals(evolutionNeed);

      const candidateEntries = await Promise.all(
        proposals.map(async (proposal) => {
          const candidate = await buildEvolutionCandidate(proposal);
          if (candidate === null) return null;
          const validation = validateEvolutionCandidate(candidate);
          return { candidate, validation };
        })
      );
      const candidates = candidateEntries.filter((entry) => entry !== null);

      return { symbol, reasoningGaps, evolutionNeed, selfEvaluation, proposals, candidates };
    })
  );

  return NextResponse.json({ ...snapshot, axisConflicts, learningLoop, novelty, selfPerformance, learningDbConfigured: isLearningSupabaseConfigured(), decisionPopulation, cognitiveGaps, evolution });
}
