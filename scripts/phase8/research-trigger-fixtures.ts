// ---------------------------------------------------------------------------
// Phase 8.4.2 — Research Trigger fixtures (dev-only, not part of the app).
// Pure/offline — no network, no LLM, no database, no mocks that bypass
// real logic. Covers required cases A-J from the task brief.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/research-trigger-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { evaluateResearchTrigger } from "@/lib/ai/externalIntelligence/researchTrigger";
import type { ResearchTriggerInput } from "@/lib/ai/externalIntelligence/researchTrigger/contracts";
import { getCapabilityAvailability, getSourcesByCapability } from "@/lib/ai/externalIntelligence/registry";
import type { SourceCapability } from "@/lib/ai/externalIntelligence/contracts";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Baseline input — everything clean/high-quality/null. Individual fixtures
// override only the fields relevant to what they're testing.
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<ResearchTriggerInput> = {}): ResearchTriggerInput {
  return {
    symbol: "BTCUSDT",
    evaluatedAt: "2026-09-05T10:00:00.000Z",
    assessment: {
      confidence: 82,
      grade: "A",
      riskStatus: "valid",
      dataQuality: [
        { source: "market_structure", quality: "real" },
        { source: "orderbook", quality: "real" },
      ],
    },
    contradictions: { hasUnresolvedGenuineContradiction: false, contradictions: [] },
    arbitration: { alignment: "STRONGLY_SUPPORTED" },
    cognitive: { quality: "real" },
    riskIntelligence: { overall: "LOW", contextQuality: "real" },
    marketImpact: {
      highImpactPresent: false,
      eventState: "NONE",
      macroAvailability: "AVAILABLE",
      newsAvailability: "AVAILABLE",
      upcomingHighImpactEvent: null,
    },
    unusualMarketConditionDetected: false,
    unusualMarketConditionDetail: null,
    isAltcoinScreeningCandidate: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. High confidence + aligned evidence -> shouldResearch false
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(baseInput());
  check("A. clean high-confidence input -> shouldResearch=false", result.shouldResearch === false, JSON.stringify(result));
  check("A. no reasons fired", result.reasons.length === 0, JSON.stringify(result.reasons));
  check("A. priority defaults to LOW when nothing fires", result.priority === "LOW", result.priority);
  check("A. no capabilities requested", result.requestedCapabilities.length === 0, JSON.stringify(result.requestedCapabilities));
}

// ---------------------------------------------------------------------------
// B. Low confidence -> shouldResearch true
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({ assessment: { confidence: 42, grade: "B+", riskStatus: "valid", dataQuality: [{ source: "market_structure", quality: "real" }] } })
  );
  check("B. low confidence -> shouldResearch=true", result.shouldResearch === true, JSON.stringify(result));
  check("B. reason is LOW_CONFIDENCE", result.reasons.some((r) => r.reason === "LOW_CONFIDENCE"), JSON.stringify(result.reasons));
  check("B. priority MEDIUM (grade is B+, not NO_TRADE)", result.priority === "MEDIUM", result.priority);
}

{
  // NO_TRADE forces confidence=0 per grading.ts — should escalate to HIGH.
  const result = evaluateResearchTrigger(baseInput({ assessment: { confidence: 0, grade: "NO_TRADE", riskStatus: "unavailable", dataQuality: [] } }));
  check("B2. NO_TRADE grade escalates LOW_CONFIDENCE to HIGH", result.reasons.find((r) => r.reason === "LOW_CONFIDENCE")?.priority === "HIGH", JSON.stringify(result.reasons));
}

// ---------------------------------------------------------------------------
// C. Conflicting evidence -> reason EVIDENCE_CONFLICT
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({
      contradictions: {
        hasUnresolvedGenuineContradiction: true,
        contradictions: [{ description: "structure vs orderflow disagree", sources: ["microstructure"], severity: "MODERATE", genuineness: "GENUINE", origin: "confluence" }],
      },
    })
  );
  check("C. conflicting evidence -> EVIDENCE_CONFLICT fires", result.reasons.some((r) => r.reason === "EVIDENCE_CONFLICT"), JSON.stringify(result.reasons));
  check("C. MODERATE genuine contradiction -> priority HIGH", result.reasons.find((r) => r.reason === "EVIDENCE_CONFLICT")?.priority === "HIGH", JSON.stringify(result.reasons));
  check(
    "C. microstructure-cluster contradiction requests derivatives capabilities",
    ["funding_rate", "open_interest", "long_short_ratio"].every((c) => result.requestedCapabilities.includes(c as SourceCapability)),
    JSON.stringify(result.requestedCapabilities)
  );
}

{
  // Arbitration-only conflict, no per-item contradiction detail supplied.
  const result = evaluateResearchTrigger(baseInput({ arbitration: { alignment: "CONFLICTED" } }));
  check("C2. arbitration CONFLICTED alone fires EVIDENCE_CONFLICT", result.reasons.some((r) => r.reason === "EVIDENCE_CONFLICT"), JSON.stringify(result.reasons));
  check("C2. arbitration-only conflict -> priority HIGH", result.reasons.find((r) => r.reason === "EVIDENCE_CONFLICT")?.priority === "HIGH", JSON.stringify(result.reasons));
  check(
    "C2. no cluster detail available -> no capabilities fabricated for this reason",
    result.requestedCapabilities.length === 0,
    JSON.stringify(result.requestedCapabilities)
  );
}

// ---------------------------------------------------------------------------
// D. Missing critical data -> DATA_GAP
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({
      assessment: {
        confidence: 82,
        grade: "A",
        riskStatus: "valid",
        dataQuality: [
          { source: "macro", quality: "unavailable" },
          { source: "microstructure", quality: "unavailable" },
        ],
      },
    })
  );
  check("D. two unavailable dataQuality sources -> DATA_GAP fires", result.reasons.some((r) => r.reason === "DATA_GAP"), JSON.stringify(result.reasons));
  check("D. priority MEDIUM (>=2 unavailable sources)", result.reasons.find((r) => r.reason === "DATA_GAP")?.priority === "MEDIUM", JSON.stringify(result.reasons));
  check(
    "D. requests economic_release/general_news (macro gap) and funding_rate/open_interest (microstructure gap)",
    ["economic_release", "general_news", "funding_rate", "open_interest"].every((c) => result.requestedCapabilities.includes(c as SourceCapability)),
    JSON.stringify(result.requestedCapabilities)
  );
}

{
  // Total absence of an assessment is itself the most severe data gap.
  const result = evaluateResearchTrigger(baseInput({ assessment: null }));
  check("D2. assessment=null -> DATA_GAP fires at HIGH", result.reasons.find((r) => r.reason === "DATA_GAP")?.priority === "HIGH", JSON.stringify(result.reasons));
}

// ---------------------------------------------------------------------------
// E. High-impact macro event -> HIGH_IMPACT_EVENT
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({
      marketImpact: {
        highImpactPresent: true,
        eventState: "UPCOMING",
        macroAvailability: "AVAILABLE",
        newsAvailability: "AVAILABLE",
        upcomingHighImpactEvent: { title: "FOMC Rate Decision", date: "2026-09-05T13:00:00.000Z", impact: "high", hoursAway: 3, proximity: "IMMINENT" },
      },
    })
  );
  check("E. highImpactPresent=true -> HIGH_IMPACT_EVENT fires", result.reasons.some((r) => r.reason === "HIGH_IMPACT_EVENT"), JSON.stringify(result.reasons));
  check("E. IMMINENT proximity escalates to CRITICAL", result.reasons.find((r) => r.reason === "HIGH_IMPACT_EVENT")?.priority === "CRITICAL", JSON.stringify(result.reasons));
  check(
    "E. requests economic_release + crypto_news + general_news",
    ["economic_release", "crypto_news", "general_news"].every((c) => result.requestedCapabilities.includes(c as SourceCapability)),
    JSON.stringify(result.requestedCapabilities)
  );
}

{
  // Non-imminent high-impact event -> HIGH, not CRITICAL.
  const result = evaluateResearchTrigger(
    baseInput({
      marketImpact: {
        highImpactPresent: true,
        eventState: "UPCOMING",
        macroAvailability: "AVAILABLE",
        newsAvailability: "AVAILABLE",
        upcomingHighImpactEvent: { title: "CPI Release", date: "2026-09-08T13:00:00.000Z", impact: "high", hoursAway: 72, proximity: "UPCOMING" },
      },
    })
  );
  check("E2. non-imminent high-impact event -> priority HIGH (not CRITICAL)", result.reasons.find((r) => r.reason === "HIGH_IMPACT_EVENT")?.priority === "HIGH", JSON.stringify(result.reasons));
}

// ---------------------------------------------------------------------------
// F. Multiple reasons -> priority escalation
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({
      assessment: { confidence: 40, grade: "B+", riskStatus: "valid", dataQuality: [{ source: "market_structure", quality: "real" }] }, // LOW_CONFIDENCE -> MEDIUM
      contradictions: {
        hasUnresolvedGenuineContradiction: true,
        contradictions: [{ description: "severe conflict", sources: ["microstructure"], severity: "HIGH", genuineness: "GENUINE", origin: "confluence" }],
      }, // EVIDENCE_CONFLICT -> CRITICAL
      marketImpact: {
        highImpactPresent: true,
        eventState: "UPCOMING",
        macroAvailability: "AVAILABLE",
        newsAvailability: "AVAILABLE",
        upcomingHighImpactEvent: { title: "CPI Release", date: "2026-09-08T13:00:00.000Z", impact: "high", hoursAway: 72, proximity: "UPCOMING" },
      }, // HIGH_IMPACT_EVENT -> HIGH
    })
  );
  check("F. three reasons fired", result.reasons.length === 3, JSON.stringify(result.reasons));
  check(
    "F. overall priority = MAX(MEDIUM, CRITICAL, HIGH) = CRITICAL",
    result.priority === "CRITICAL",
    `got ${result.priority}: ${JSON.stringify(result.reasons)}`
  );
}

// ---------------------------------------------------------------------------
// G. Capability request only capability that's registered
// ---------------------------------------------------------------------------

{
  const result = evaluateResearchTrigger(
    baseInput({
      assessment: { confidence: 20, grade: "B+", riskStatus: "valid", dataQuality: [] },
      isAltcoinScreeningCandidate: true,
      unusualMarketConditionDetected: true,
      unusualMarketConditionDetail: "turnover spike",
    })
  );
  check(
    "G. every requested capability resolves to at least one registered source",
    result.requestedCapabilities.every((c) => getSourcesByCapability(c).length > 0),
    JSON.stringify(result.requestedCapabilities)
  );
  check("G. no requested capability is an empty/unknown string", result.requestedCapabilities.every((c) => typeof c === "string" && c.length > 0), JSON.stringify(result.requestedCapabilities));
}

// ---------------------------------------------------------------------------
// H. No network request in evaluator (static source scan)
// ---------------------------------------------------------------------------

{
  const src = readFileSync(new URL("../../lib/ai/externalIntelligence/researchTrigger/evaluate.ts", import.meta.url), "utf8");
  const forbidden = ["fetch(", "XMLHttpRequest", "axios", "http.get", "https.get", "node-fetch"];
  const found = forbidden.filter((token) => src.includes(token));
  check("H. evaluate.ts contains no network-call tokens", found.length === 0, `found: ${found.join(", ")}`);
}

// ---------------------------------------------------------------------------
// I. Deterministic: input same -> output same
// ---------------------------------------------------------------------------

{
  const input = baseInput({
    assessment: { confidence: 45, grade: "B+", riskStatus: "valid", dataQuality: [{ source: "macro", quality: "unavailable" }] },
    isAltcoinScreeningCandidate: true,
  });
  const r1 = evaluateResearchTrigger(input);
  const r2 = evaluateResearchTrigger(JSON.parse(JSON.stringify(input))); // fresh, deep-cloned copy
  check("I. identical input -> deep-equal output", JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} !== ${JSON.stringify(r2)}`);
}

// ---------------------------------------------------------------------------
// J. Unknown/unavailable source capability -> not considered available
// ---------------------------------------------------------------------------

{
  check(
    "J. community-only capability (sentiment_divergence) reports UNAVAILABLE_NOT_INTEGRATED",
    getCapabilityAvailability("sentiment_divergence") === "UNAVAILABLE_NOT_INTEGRATED",
    getCapabilityAvailability("sentiment_divergence")
  );
}

{
  const saved = process.env.CRYPTOQUANT_API_KEY;
  delete process.env.CRYPTOQUANT_API_KEY;
  try {
    check(
      "J2. keyed-only capability (exchange_flow) without its key reports UNAVAILABLE_NO_KEY, not AVAILABLE",
      getCapabilityAvailability("exchange_flow") === "UNAVAILABLE_NO_KEY",
      getCapabilityAvailability("exchange_flow")
    );
  } finally {
    if (saved === undefined) delete process.env.CRYPTOQUANT_API_KEY;
    else process.env.CRYPTOQUANT_API_KEY = saved;
  }
}

{
  const result = evaluateResearchTrigger(baseInput({ isAltcoinScreeningCandidate: true }));
  const entry = result.capabilityAvailability.find((c) => c.capability === "sentiment_divergence");
  check(
    "J3. ResearchTriggerResult never marks an unintegrated capability as AVAILABLE",
    entry !== undefined && entry.availability !== "AVAILABLE",
    JSON.stringify(entry)
  );
}

console.log(failures === 0 ? `\nAll Phase 8.4.2 research trigger fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
