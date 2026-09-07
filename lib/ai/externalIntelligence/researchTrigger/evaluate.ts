// ---------------------------------------------------------------------------
// ELVOID Intelligence — Research Trigger evaluator (Phase 8.4.2)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PURE and DETERMINISTIC. Zero network calls, zero database access,
//     zero LLM calls, zero `Math.random()`, zero `Date.now()` (the caller
//     supplies `evaluatedAt`; every timestamp on the output is that value
//     copied verbatim). Identical input always produces a deep-equal
//     output — see research-trigger-fixtures.ts fixture 9.
//   - This evaluator NEVER fetches external data and NEVER calls a
//     source-fetch function. The only external-facing thing it touches is
//     `getCapabilityAvailability()` from `../registry.ts`, which itself
//     only reads `process.env` presence (no network) — see that
//     function's own header in registry.ts.
//   - Every `evidence` string is built from the actual input field values
//     that caused a reason to fire — never a source name, never a claim
//     about what an external source "says" (there has been no fetch to
//     say anything). E.g. correct: "confidence=42, grade=B+ (< 55
//     threshold)". Never: "CoinGecko shows weakness".
//   - Thresholds used below are reused from already-established
//     precedents elsewhere in this repository, not invented:
//       - LOW_CONFIDENCE's `< 55` boundary is the same confidence bucket
//         `lib/elvoid/review.ts` and `lib/ai/decisionEvaluation/evaluate.ts`
//         already use ("confidence < 55 on a loss is flagged").
//       - HIGH_IMPACT_EVENT's CRITICAL escalation reuses
//         `MacroEventProximityBucket === "IMMINENT"`, itself defined by
//         `MACRO_PROXIMITY_IMMINENT_HOURS` (6h) in
//         `lib/ai/macroIntelligence/contracts.ts` — not a new number.
//       - Capability mappings for EVIDENCE_CONFLICT/DATA_GAP reuse
//         `grading.ts`'s own `CLUSTERS` grouping (`macro`/`microstructure`
//         sources belong to the "context" cluster, documented there as
//         "derivatives/macro context (funding, basis, DXY)") rather than
//         inventing a new source-to-capability association.
//   - Where an input field is `null`, the corresponding reason simply
//     cannot fire from that signal — this evaluator never treats missing
//     input as either "assume fine" or "assume broken".
// ---------------------------------------------------------------------------

import type { ResearchTriggerInput, ResearchTriggerResult, ResearchTriggerReason, ResearchPriority, TriggeredReason, CapabilityAvailability, ClassifiedContradiction } from "./contracts";
import type { SourceCapability } from "../contracts";
import { getCapabilityAvailability } from "../registry";

/** Same confidence bucket already established in lib/elvoid/review.ts / lib/ai/decisionEvaluation/evaluate.ts — reused, not reinvented. */
const LOW_CONFIDENCE_THRESHOLD = 55;

const PRIORITY_ORDER: readonly ResearchPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function maxPriority(a: ResearchPriority, b: ResearchPriority): ResearchPriority {
  return PRIORITY_ORDER.indexOf(a) >= PRIORITY_ORDER.indexOf(b) ? a : b;
}

/** Same cluster grouping as grading.ts's own CLUSTERS map — a contradiction's `sources` list is checked against these two "context"-cluster members, never a full reimplementation of CLUSTERS. */
function contradictionTouchesMacro(c: ClassifiedContradiction): boolean {
  return c.sources.includes("macro");
}
function contradictionTouchesMicrostructure(c: ClassifiedContradiction): boolean {
  return c.sources.includes("microstructure");
}

// ---------------------------------------------------------------------------
// Per-reason evaluators. Each returns a TriggeredReason or null. None of
// these fetch anything; each only reads the input it's given.
// ---------------------------------------------------------------------------

function evalLowConfidence(input: ResearchTriggerInput): TriggeredReason | null {
  const a = input.assessment;
  if (!a) return null;
  const fires = a.grade === "NO_TRADE" || a.confidence < LOW_CONFIDENCE_THRESHOLD;
  if (!fires) return null;
  const priority: ResearchPriority = a.grade === "NO_TRADE" ? "HIGH" : "MEDIUM";
  return {
    reason: "LOW_CONFIDENCE",
    priority,
    evidence: `confidence=${a.confidence}, grade=${a.grade} (threshold ${LOW_CONFIDENCE_THRESHOLD})`,
  };
}

function evalLowConfidenceCapabilities(): SourceCapability[] {
  return ["funding_rate", "open_interest", "crypto_news"];
}

function evalEvidenceConflict(input: ResearchTriggerInput): TriggeredReason | null {
  const genuineFromContradictions = input.contradictions?.hasUnresolvedGenuineContradiction === true;
  const conflictedArbitration = input.arbitration?.alignment === "CONFLICTED";
  if (!genuineFromContradictions && !conflictedArbitration) return null;

  const items = input.contradictions?.contradictions ?? [];
  const genuineItems = items.filter((c) => c.genuineness === "GENUINE");
  const hasHigh = genuineItems.some((c) => c.severity === "HIGH");
  const hasModerate = genuineItems.some((c) => c.severity === "MODERATE");

  let priority: ResearchPriority;
  if (hasHigh) priority = "CRITICAL";
  else if (hasModerate || conflictedArbitration) priority = "HIGH";
  else priority = "MEDIUM";

  const evidenceParts: string[] = [];
  if (genuineFromContradictions) evidenceParts.push(`${genuineItems.length} genuine contradiction(s) unresolved`);
  if (conflictedArbitration) evidenceParts.push("arbitration.alignment=CONFLICTED");
  return {
    reason: "EVIDENCE_CONFLICT",
    priority,
    evidence: evidenceParts.join("; ") || "evidence conflict flagged with no further detail supplied",
  };
}

function evalEvidenceConflictCapabilities(input: ResearchTriggerInput): SourceCapability[] {
  const items = input.contradictions?.contradictions ?? [];
  const caps: SourceCapability[] = [];
  if (items.some(contradictionTouchesMicrostructure)) {
    caps.push("funding_rate", "open_interest", "long_short_ratio");
  }
  if (items.some(contradictionTouchesMacro)) {
    caps.push("economic_release", "general_news");
  }
  return caps;
}

function evalDataGap(input: ResearchTriggerInput): TriggeredReason | null {
  const noAssessment = input.assessment === null;
  const unavailableDataQuality = input.assessment?.dataQuality.filter((d) => d.quality === "unavailable") ?? [];
  const cognitiveUnavailable = input.cognitive?.quality === "unavailable";
  const riskInsufficient = input.riskIntelligence?.contextQuality === "insufficient";
  const macroMissing = input.marketImpact !== null && input.marketImpact.macroAvailability !== "AVAILABLE";
  const newsMissing = input.marketImpact !== null && input.marketImpact.newsAvailability !== "AVAILABLE";

  const fires = noAssessment || unavailableDataQuality.length > 0 || cognitiveUnavailable || riskInsufficient || macroMissing || newsMissing;
  if (!fires) return null;

  let priority: ResearchPriority;
  if (noAssessment) priority = "HIGH";
  else if (unavailableDataQuality.length >= 2 || cognitiveUnavailable) priority = "MEDIUM";
  else priority = "LOW";

  const evidenceParts: string[] = [];
  if (noAssessment) evidenceParts.push("no OracleAssessment supplied for this symbol/moment");
  if (unavailableDataQuality.length > 0) evidenceParts.push(`${unavailableDataQuality.length} dataQuality source(s) unavailable (${unavailableDataQuality.map((d) => d.source).join(", ")})`);
  if (cognitiveUnavailable) evidenceParts.push("cognitive.quality=unavailable");
  if (riskInsufficient) evidenceParts.push("riskIntelligence.contextQuality=insufficient");
  if (macroMissing) evidenceParts.push(`marketImpact.macroAvailability=${input.marketImpact!.macroAvailability}`);
  if (newsMissing) evidenceParts.push(`marketImpact.newsAvailability=${input.marketImpact!.newsAvailability}`);

  return { reason: "DATA_GAP", priority, evidence: evidenceParts.join("; ") };
}

function evalDataGapCapabilities(input: ResearchTriggerInput): SourceCapability[] {
  const caps: SourceCapability[] = [];
  if (input.marketImpact !== null && input.marketImpact.macroAvailability !== "AVAILABLE") caps.push("economic_release");
  if (input.marketImpact !== null && input.marketImpact.newsAvailability !== "AVAILABLE") caps.push("crypto_news", "general_news");
  const unavailable = input.assessment?.dataQuality.filter((d) => d.quality === "unavailable") ?? [];
  if (unavailable.some((d) => d.source === "microstructure")) caps.push("funding_rate", "open_interest");
  if (unavailable.some((d) => d.source === "macro")) caps.push("economic_release", "general_news");
  return caps;
}

function evalHighImpactEvent(input: ResearchTriggerInput): TriggeredReason | null {
  const mi = input.marketImpact;
  if (!mi || !mi.highImpactPresent) return null;
  const imminent = mi.upcomingHighImpactEvent?.proximity === "IMMINENT";
  const priority: ResearchPriority = imminent ? "CRITICAL" : "HIGH";
  const evidence = mi.upcomingHighImpactEvent
    ? `upcoming high-impact event "${mi.upcomingHighImpactEvent.title}" in ${mi.upcomingHighImpactEvent.hoursAway.toFixed(1)}h (proximity=${mi.upcomingHighImpactEvent.proximity})`
    : "marketImpact.highImpactPresent=true";
  return { reason: "HIGH_IMPACT_EVENT", priority, evidence };
}

function evalHighImpactEventCapabilities(): SourceCapability[] {
  return ["economic_release", "crypto_news", "general_news"];
}

function evalUnusualMarketCondition(input: ResearchTriggerInput): TriggeredReason | null {
  if (input.unusualMarketConditionDetected !== true) return null;
  return {
    reason: "UNUSUAL_MARKET_CONDITION",
    priority: "MEDIUM",
    evidence: input.unusualMarketConditionDetail ?? "caller flagged unusual market condition; no further detail supplied",
  };
}

function evalUnusualMarketConditionCapabilities(): SourceCapability[] {
  return ["spot_price", "dex_pool_activity", "exchange_flow", "whale_transfer"];
}

function evalAltcoinScreening(input: ResearchTriggerInput): TriggeredReason | null {
  if (input.isAltcoinScreeningCandidate !== true) return null;
  return {
    reason: "ALTCOIN_SCREENING",
    priority: "LOW",
    evidence: "caller flagged symbol as an altcoin screening candidate",
  };
}

function evalAltcoinScreeningCapabilities(): SourceCapability[] {
  return ["dex_pool_activity", "whale_transfer", "exchange_flow", "sentiment_divergence"];
}

// ---------------------------------------------------------------------------
// Fixed evaluation order — determines both the order reasons/capabilities
// are appended in, and is itself part of the determinism contract (same
// input -> same output, including array order).
// ---------------------------------------------------------------------------

const REASON_EVALUATION_ORDER: ReadonlyArray<{
  evaluate: (input: ResearchTriggerInput) => TriggeredReason | null;
  capabilities: (input: ResearchTriggerInput) => SourceCapability[];
}> = [
  { evaluate: evalLowConfidence, capabilities: evalLowConfidenceCapabilities },
  { evaluate: evalEvidenceConflict, capabilities: evalEvidenceConflictCapabilities },
  { evaluate: evalDataGap, capabilities: evalDataGapCapabilities },
  { evaluate: evalHighImpactEvent, capabilities: evalHighImpactEventCapabilities },
  { evaluate: evalUnusualMarketCondition, capabilities: evalUnusualMarketConditionCapabilities },
  { evaluate: evalAltcoinScreening, capabilities: evalAltcoinScreeningCapabilities },
];

/**
 * The single exported entry point. Pure, synchronous, deterministic.
 * See this file's header for the full boundary/threshold justification.
 */
export function evaluateResearchTrigger(input: ResearchTriggerInput): ResearchTriggerResult {
  const reasons: TriggeredReason[] = [];
  const capabilitySet = new Set<SourceCapability>();

  for (const { evaluate, capabilities } of REASON_EVALUATION_ORDER) {
    const triggered = evaluate(input);
    if (!triggered) continue;
    reasons.push(triggered);
    for (const cap of capabilities(input)) capabilitySet.add(cap);
  }

  const requestedCapabilities = Array.from(capabilitySet);
  const capabilityAvailability: CapabilityAvailability[] = requestedCapabilities.map((capability) => ({
    capability,
    availability: getCapabilityAvailability(capability),
  }));

  const priority = reasons.reduce<ResearchPriority>((acc, r) => maxPriority(acc, r.priority), "LOW");

  return {
    version: 1,
    symbol: input.symbol,
    triggeredAt: input.evaluatedAt,
    shouldResearch: reasons.length > 0,
    priority,
    reasons,
    requestedCapabilities,
    capabilityAvailability,
  };
}
