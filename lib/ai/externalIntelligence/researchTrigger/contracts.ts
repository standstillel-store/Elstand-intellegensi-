// ---------------------------------------------------------------------------
// ELVOID Intelligence — Research Trigger contracts (Phase 8.4.2)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This module is a DECISION LAYER ONLY: "does this symbol's current
//     internal state justify asking for external evidence, and which
//     capabilities would be relevant?". It is NOT a browser agent, NOT an
//     LLM, and NEVER fetches anything — see evaluate.ts's header for the
//     zero-network guarantee.
//   - Every input field here is a narrow, read-only `Pick<...>` of an
//     ALREADY-COMPUTED upstream type (OracleAssessment, ContradictionReport,
//     DecisionArbitration, CognitiveObservation, RiskIntelligence,
//     MarketImpactContext) — this module invents no new upstream data
//     shape and recomputes nothing that any of those modules already
//     compute. Every field is optional/nullable because the caller may
//     not have all of them available for a given moment; a `null` field
//     simply means "that check cannot fire", never "assume the worst" or
//     "assume the best".
//   - `requestedCapabilities` on the output is always drawn from the REAL
//     `SourceCapability` union declared in `../contracts.ts` (Phase
//     8.4.1's Source Registry) — never a parallel, hardcoded capability
//     name and never a literal source name (e.g. never "CoinGecko"). This
//     module does not decide WHICH source serves a capability, and it
//     does not claim a capability's data was actually fetched — it only
//     names what would help and, via `capabilityAvailability`, whether
//     the registry currently has anything real behind that capability.
//   - This module never says "X source says Y". It only ever says
//     "external evidence for capability Y is needed because of reason Z"
//     — see evaluate.ts's own header for the same rule restated at the
//     point it matters most (evidence strings).
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { ClassifiedContradiction, ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { MarketImpactContext } from "@/lib/ai/eventImpact/contracts";
import type { SourceAvailability, SourceCapability } from "../contracts";

/** Closed set — matches the roadmap's own six minimum trigger conditions, nothing added beyond them. */
export type ResearchTriggerReason = "LOW_CONFIDENCE" | "EVIDENCE_CONFLICT" | "DATA_GAP" | "HIGH_IMPACT_EVENT" | "UNUSUAL_MARKET_CONDITION" | "ALTCOIN_SCREENING";

/** Closed, ordered priority scale. Escalation rule (see evaluate.ts::overallPriority): CRITICAL > HIGH > MEDIUM > LOW, computed as the MAX across every reason that actually fired — never summed, never boosted by reason count alone. */
export type ResearchPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * One fired reason, with its own priority contribution and a factual,
 * traceable evidence string. `evidence` is always built from the actual
 * input field values that caused this reason to fire (confidence numbers,
 * enum values, counts) — never a free-form narrative, never an invented
 * explanation, matching the rest of this codebase's `gradeReason`/
 * `evidence` string convention (grading.ts, arbitration.ts) of being
 * template-built from real fields.
 */
export interface TriggeredReason {
  readonly reason: ResearchTriggerReason;
  readonly priority: ResearchPriority;
  readonly evidence: string;
}

/** Per-capability real-time availability rollup — see registry.ts::getCapabilityAvailability(). Read-only reporting; this module never fetches to verify it further. */
export interface CapabilityAvailability {
  readonly capability: SourceCapability;
  readonly availability: SourceAvailability;
}

/**
 * The pure evaluator's single input type. `evaluatedAt` is the
 * caller-supplied "now" anchor — REQUIRED, and never read from
 * `Date.now()` inside evaluate.ts, matching every Phase 8.2.x analyzer's
 * own `asOf`-anchor convention (macroIntelligence, eventImpact).
 *
 * Every context field below is `X | null`. `null` means "not supplied /
 * not computed for this moment" — a real, expected state (matching
 * `AutonomousDecisionContext.canonical`'s own `| null` convention), never
 * coerced into a false positive OR a false negative.
 */
export interface ResearchTriggerInput {
  readonly symbol: string;
  /** ISO-8601 instant. Copied verbatim onto the output's `triggeredAt`. */
  readonly evaluatedAt: string;

  /** Canonical Oracle read for LOW_CONFIDENCE and part of DATA_GAP. `null` when no assessment exists yet for this symbol/moment — itself treated as a DATA_GAP condition (see evaluate.ts). */
  readonly assessment: Readonly<Pick<OracleAssessment, "confidence" | "grade" | "riskStatus" | "dataQuality">> | null;

  /** Phase 7.6 contradiction report, reused verbatim — drives EVIDENCE_CONFLICT together with `arbitration`. */
  readonly contradictions: Readonly<Pick<ContradictionReport, "hasUnresolvedGenuineContradiction" | "contradictions">> | null;

  /** Phase 7.7 decision arbitration, reused verbatim — `alignment === "CONFLICTED"` is a second, independent EVIDENCE_CONFLICT signal alongside `contradictions`. */
  readonly arbitration: Readonly<Pick<DecisionArbitration, "alignment">> | null;

  /** Phase 8.0.1 cognitive observation, reused verbatim — its aggregate `quality` contributes to DATA_GAP. */
  readonly cognitive: Readonly<Pick<CognitiveObservation, "quality">> | null;

  /** Phase 7.8 risk intelligence, reused verbatim — `contextQuality === "insufficient"` contributes to DATA_GAP. */
  readonly riskIntelligence: Readonly<Pick<RiskIntelligence, "overall" | "contextQuality">> | null;

  /** Phase 8.2.4 market impact context, reused verbatim — drives HIGH_IMPACT_EVENT and part of DATA_GAP (macro/news availability). */
  readonly marketImpact: Readonly<Pick<MarketImpactContext, "highImpactPresent" | "eventState" | "macroAvailability" | "newsAvailability" | "upcomingHighImpactEvent">> | null;

  /**
   * Caller-supplied flag for market behavior that doesn't fit the
   * available internal evidence (e.g. a volume/turnover anomaly detected
   * by an upstream module such as `lib/scoring.ts`'s pump-candidate
   * heuristics). This module does not compute anomaly detection itself
   * — see this file's own header on never recomputing an upstream
   * concern — it only reasons about the flag it's given. `null` = not
   * evaluated for this symbol/moment (distinct from `false` = evaluated
   * and nothing unusual found).
   */
  readonly unusualMarketConditionDetected: boolean | null;
  /** Optional factual detail from the caller for the evidence string. Never invented by this module when absent. */
  readonly unusualMarketConditionDetail: string | null;

  /**
   * Caller-supplied flag that this symbol was surfaced as an altcoin
   * screening candidate (e.g. by the Altcoin Screener's own scoring —
   * Phase 8.4.5 territory, not recomputed here). `null` = not evaluated.
   */
  readonly isAltcoinScreeningCandidate: boolean | null;
}

/**
 * The pure evaluator's single output type. Deterministic: identical input
 * always produces an identical (deep-equal) result — see evaluate.ts's
 * header and fixture 9 in research-trigger-fixtures.ts.
 */
export interface ResearchTriggerResult {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  readonly symbol: string;
  /** = `input.evaluatedAt`, copied verbatim — never a fresh wall-clock read. */
  readonly triggeredAt: string;
  readonly shouldResearch: boolean;
  /** MAX across every fired reason's own priority; "LOW" when `reasons` is empty (no research needed is not itself urgent). */
  readonly priority: ResearchPriority;
  readonly reasons: readonly TriggeredReason[];
  /** Deduplicated union of every fired reason's relevant capabilities, in the fixed reason-evaluation order (see evaluate.ts::REASON_EVALUATION_ORDER) — never a source name. */
  readonly requestedCapabilities: readonly SourceCapability[];
  /** One entry per `requestedCapabilities`, in the same order — real-time rollup from the Source Registry, never fabricated. */
  readonly capabilityAvailability: readonly CapabilityAvailability[];
}

export type { ClassifiedContradiction };
