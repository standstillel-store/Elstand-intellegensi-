// Phase 9 — explicit fail-closed wrapper for analyzeEventImpact(). A throw
// becomes an UNAVAILABLE MarketImpactContext (pre-entry => CAUTION, never
// VALID/EXECUTE), not a silent null / NO_ASSESSMENT.

import type { EventImpactInput, MarketImpactContext } from "@/lib/ai/eventImpact/contracts";
import { analyzeEventImpact } from "@/lib/ai/eventImpact/analyze";

export function buildUnavailableEventImpact(asOf: string, reason: string): MarketImpactContext & { readonly failureReason: string } {
  return {
    version: 1,
    generatedAt: asOf,
    eventState: "UNKNOWN",
    macroAvailability: "UNAVAILABLE",
    newsAvailability: "UNAVAILABLE",
    highImpactPresent: false,
    upcomingHighImpactEvent: null,
    totalNewsCount: 0,
    usableNewsCount: 0,
    recentNewsCount: 0,
    impactRisk: "UNKNOWN",
    impactDirection: null,
    conflictingImpact: false,
    uncertainty: { macroDataMissing: true, newsDataMissing: true, directionUnsupported: true },
    failureReason: reason,
  };
}

export function safeAnalyzeEventImpact(input: EventImpactInput): MarketImpactContext {
  try {
    return analyzeEventImpact(input);
  } catch (err) {
    return buildUnavailableEventImpact(input.asOf, `analyzeEventImpact threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
