// ---------------------------------------------------------------------------
// ELVOID Intelligence — 8.3 x 8.4 Wiring: External Intelligence Gate
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - THIS IS THE ONE LIVE, RUNTIME SOCKET AUDIT FOUND. `lib/ai/autonomousRuntime/orchestrator.ts`
//     computes `assessment`, `contradictions`, `arbitration`, `cognitiveObservation`,
//     `riskIntelligence` (Phase 7/8.0.x) and `eventImpact` (Phase 8.2.4)
//     BEFORE calling `validatePreEntry()` (Phase 8.2.5) — every one of
//     those is a real, already-computed, in-memory value at that point in
//     a live cycle. This function assembles Phase 8.4.2's Research
//     Trigger evaluation from those REAL values (never fabricated), and
//     `PreEntryValidationInput` now carries its result as one additional,
//     optional-by-null field (see `lib/ai/preEntryValidation/contracts.ts`'s
//     own additive-field note) — the ONLY change made to the live decision
//     pipeline to wire Phase 8.4 in.
//   - NEVER CHANGES ORACLE OR AUTONOMOUS-DECISION AUTHORITY. This module
//     never touches `grade`/`confidence`/`side`/`riskStatus`/`entry`/
//     `stopLoss`/`takeProfit`/`QualificationStatus`, never calls
//     `gradeConfluence`/`buildOracleRiskPlan`/`qualifyAutonomousDecision`/
//     `decideAutonomous`, and produces no EXECUTE/WAIT/REJECT of its own.
//     Its ONLY effect on the live pipeline is a `CAUTION`-tier signal fed
//     into `PreEntryValidationSignals` (see that file's `selectValidationStatus()`)
//     — CAUTION is advisory, never BLOCKED, matching the Authority
//     Boundary's own "menyebabkan CAUTION/WAIT bila evidence
//     insufficient/conflicted" (never a harder gate than the qualification-
//     conflict/elevated-event-risk cases that already existed).
//   - ONE REAL, LIVE FETCH PATH — NOT A NEW PROVIDER. `lib/binance.ts`'s
//     already-existing `getFundingSnapshot()` (used elsewhere by
//     `lib/derivatives.ts`/`lib/scoring.ts`) is the ONLY external call
//     this module makes, and only when Research Trigger requested a
//     derivatives capability (`funding_rate`/`open_interest`/
//     `long_short_ratio`) AND the symbol is on Binance's own existing
//     `DERIVATIVES_WATCHLIST` — a real, pre-existing, curated symbol
//     list, never expanded or duplicated here. Every OTHER requested
//     capability (crypto_news, general_news, economic_release,
//     whale_transfer, exchange_flow, dex_pool_activity, spot_price, every
//     community capability) is intentionally NOT fetched by this module —
//     see the final wiring report for why building six more live-fetch
//     paths was judged out of "minimal invasive wiring" scope. For those,
//     `evidenceSatisfied` honestly comes back `false` whenever research
//     was needed and nothing was actually obtained — never silently
//     treated as satisfied just because a registry entry theoretically
//     could serve it.
//   - NO FABRICATION ON FAILURE. The one live fetch is wrapped in
//     try/catch; a failure (network error, symbol not on the watchlist,
//     rate limit) degrades to "no evidence obtained" — exactly the same
//     shape as "capability not fetched at all" — never a fallback/
//     estimated/synthetic observation.
//   - COMMUNITY IS ALWAYS EMPTY, HONESTLY. `analyzeCommunityIntelligence()`
//     (Phase 8.4.4) is called with an empty evidence array every time,
//     because — per that phase's own audit, reconfirmed here — no real
//     community/social provider exists anywhere in this repository. This
//     is not a placeholder call; it is the honest, correct input for a
//     capability with zero real access today.
//   - TESTABLE WITHOUT NETWORK, PRODUCTION UNCHANGED. `deps.fetchFundingSnapshot`
//     defaults to the real `getFundingSnapshot` and is NEVER overridden by
//     any production call site (`lib/ai/autonomousRuntime/orchestrator.ts`
//     never passes a second argument) — only
//     `scripts/phase8/external-intelligence-gate-fixtures.ts` supplies an
//     explicit, clearly-labeled synthetic funding snapshot, matching this
//     phase's own rule: "Fixture boleh memakai explicit test data.
//     Production runtime tidak boleh."
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { MarketImpactContext } from "@/lib/ai/eventImpact/contracts";
import type { FundingInfo } from "@/lib/types";
import { DERIVATIVES_WATCHLIST, getFundingSnapshot, toFuturesPair } from "@/lib/binance";
import { evaluateResearchTrigger } from "@/lib/ai/externalIntelligence/researchTrigger/evaluate";
import type { ResearchTriggerInput } from "@/lib/ai/externalIntelligence/researchTrigger/contracts";
import { normalizeExternalEvidence } from "@/lib/ai/externalIntelligence/evidence/normalize";
import type { NormalizedExternalEvidence, RawExternalObservation } from "@/lib/ai/externalIntelligence/evidence/contracts";
import { analyzeCommunityIntelligence } from "@/lib/ai/externalIntelligence/community/analyze";
import type { SourceCapability } from "@/lib/ai/externalIntelligence/contracts";
import { findExternalDirectionConflicts } from "./externalConflictCorrelation";

/** Real capabilities this module knows how to actually fetch for, via the one live path described in this file's header. */
const DERIVATIVES_CAPABILITIES: readonly SourceCapability[] = ["funding_rate", "open_interest", "long_short_ratio"];

/**
 * The signal `PreEntryValidationInput.externalIntelligence` carries.
 * `shouldResearch: false` means Research Trigger found no reason to ask
 * for external corroboration this cycle — `evidenceSatisfied` is
 * trivially `true` in that case (nothing was needed, so nothing is
 * missing). When `shouldResearch: true`, `evidenceSatisfied` reflects
 * whether this module actually obtained real, `AVAILABLE` evidence for
 * at least one requested capability — `false` covers both "genuinely
 * unavailable" and "available per the registry but not fetched by this
 * module" identically, because from the qualification pipeline's
 * perspective both mean the same real thing: the corroboration Research
 * Trigger determined was needed is not in hand.
 */
export interface ExternalIntelligenceSignal {
  readonly shouldResearch: boolean;
  readonly hasConflict: boolean;
  readonly evidenceSatisfied: boolean;
  /** Verbatim from the Research Trigger result — for traceability/debugging only, never re-interpreted. */
  readonly requestedCapabilities: readonly SourceCapability[];
}

async function gatherRealEvidence(
  symbol: string,
  asOf: string,
  requestedCapabilities: readonly SourceCapability[],
  fetchFundingSnapshot: () => Promise<readonly FundingInfo[]>
): Promise<NormalizedExternalEvidence[]> {
  const evidence: NormalizedExternalEvidence[] = [];
  const needsDerivatives = requestedCapabilities.some((c) => DERIVATIVES_CAPABILITIES.includes(c));
  const pair = toFuturesPair(symbol);
  if (!needsDerivatives || !DERIVATIVES_WATCHLIST.includes(pair)) return evidence;

  try {
    const snapshot = await fetchFundingSnapshot();
    const own = snapshot.find((f) => f.symbol === pair);
    if (!own) return evidence; // symbol genuinely absent from this cycle's snapshot — honest, not an error
    const raw: RawExternalObservation = {
      source: "binance_derivatives",
      capability: "funding_rate",
      symbol,
      observedAt: asOf,
      fetchedAt: asOf,
      kind: "FACTUAL_OBSERVATION",
      claim: `${symbol} funding rate = ${(own.lastFundingRate * 100).toFixed(4)}%`,
      rawValue: own.lastFundingRate,
      direction: own.lastFundingRate > 0 ? "POSITIVE" : own.lastFundingRate < 0 ? "NEGATIVE" : "FLAT",
      status: "OK",
      reference: { note: "lib/binance.ts::getFundingSnapshot() — live Binance futures premiumIndex, existing function reused as-is" },
    };
    evidence.push(normalizeExternalEvidence(raw, asOf));
  } catch {
    // Honest degrade on fetch failure — never fabricate a fallback observation.
  }
  return evidence;
}

/**
 * The single exported entry point. Async only because of the one real
 * fetch path described above — never throws (every failure mode degrades
 * to an honest "no evidence obtained" rather than rejecting), so the
 * orchestrator's own `.catch(() => null)` at the call site is
 * defense-in-depth, not the only safety net.
 */
export async function assembleExternalIntelligenceSignal(
  params: {
    readonly symbol: string;
    readonly asOf: string;
    readonly assessment: Pick<OracleAssessment, "confidence" | "grade" | "riskStatus" | "dataQuality">;
    readonly contradictions: ContradictionReport | null;
    readonly arbitration: DecisionArbitration | null;
    readonly cognitiveObservation: CognitiveObservation | null;
    readonly riskIntelligence: RiskIntelligence | null;
    readonly marketImpact: MarketImpactContext | null;
  },
  deps: { readonly fetchFundingSnapshot: () => Promise<readonly FundingInfo[]> } = { fetchFundingSnapshot: getFundingSnapshot }
): Promise<ExternalIntelligenceSignal> {
  const { symbol, asOf, assessment, contradictions, arbitration, cognitiveObservation, riskIntelligence, marketImpact } = params;

  const triggerInput: ResearchTriggerInput = {
    symbol,
    evaluatedAt: asOf,
    assessment,
    contradictions: contradictions ? { hasUnresolvedGenuineContradiction: contradictions.hasUnresolvedGenuineContradiction, contradictions: contradictions.contradictions } : null,
    arbitration: arbitration ? { alignment: arbitration.alignment } : null,
    cognitive: cognitiveObservation ? { quality: cognitiveObservation.quality } : null,
    riskIntelligence: riskIntelligence ? { overall: riskIntelligence.overall, contextQuality: riskIntelligence.contextQuality } : null,
    marketImpact: marketImpact ? { highImpactPresent: marketImpact.highImpactPresent, eventState: marketImpact.eventState, macroAvailability: marketImpact.macroAvailability, newsAvailability: marketImpact.newsAvailability, upcomingHighImpactEvent: marketImpact.upcomingHighImpactEvent } : null,
    unusualMarketConditionDetected: null,
    unusualMarketConditionDetail: null,
    isAltcoinScreeningCandidate: null,
  };

  const trigger = evaluateResearchTrigger(triggerInput);

  if (!trigger.shouldResearch) {
    return { shouldResearch: false, hasConflict: false, evidenceSatisfied: true, requestedCapabilities: [] };
  }

  const evidence = await gatherRealEvidence(symbol, asOf, trigger.requestedCapabilities, deps.fetchFundingSnapshot);
  const evidenceSatisfied = evidence.some((e) => e.availability === "AVAILABLE");

  // Always empty — no real community/social provider exists (Phase 8.4.4 audit). Honest input, not a placeholder.
  const community = analyzeCommunityIntelligence([], symbol, asOf);
  const hasConflict = findExternalDirectionConflicts(evidence, symbol).length > 0 || community.claimConflicts.some((c) => c.symbol === symbol);

  return { shouldResearch: true, hasConflict, evidenceSatisfied, requestedCapabilities: trigger.requestedCapabilities };
}
