// ---------------------------------------------------------------------------
// Phase 8.3 x 8.4 — Autonomous Intelligence Integration fixtures (dev-only,
// not part of the app). Pure/offline — no real network call (the one live
// fetch path, `getFundingSnapshot`, is always dependency-injected here with
// an explicit synthetic funding snapshot; production code never overrides
// it). Exercises the REAL `assembleExternalIntelligenceSignal()`,
// `validatePreEntry()`, and `decideAutonomous()` functions end-to-end —
// nothing here is a hand-simulated stand-in for the pipeline.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/external-intelligence-gate-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { assembleExternalIntelligenceSignal } from "@/lib/ai/wiring/externalIntelligenceGate";
import { validatePreEntry } from "@/lib/ai/preEntryValidation/validate";
import { decideAutonomous } from "@/lib/ai/autonomousDecision/decide";
import type { AutonomousCanonicalSnapshot, AutonomousDecisionContext, AutonomousQualificationResult, MacroIntelligenceContext, MarketImpactContext } from "@/lib/ai/autonomousDecision/contracts";
import type { OracleAssessment } from "@/lib/ai/oracle/gradingTypes";
import type { FundingInfo } from "@/lib/types";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const ASOF = "2026-09-07T12:00:00.000Z";

// ---------------------------------------------------------------------------
// Fixture builders — mirror scripts/phase8/autonomous-decision-fixtures.ts's
// own established builder pattern, so this integration test exercises the
// exact same shapes those regression fixtures already validate.
// ---------------------------------------------------------------------------

function assessment(overrides: Partial<Pick<OracleAssessment, "confidence" | "grade" | "riskStatus" | "dataQuality">> = {}): Pick<OracleAssessment, "confidence" | "grade" | "riskStatus" | "dataQuality"> {
  return { confidence: 82, grade: "A", riskStatus: "valid", dataQuality: [{ source: "market_structure", quality: "real" }], ...overrides };
}

function canonical(overrides: Partial<AutonomousCanonicalSnapshot> = {}): AutonomousCanonicalSnapshot {
  return { symbol: "BTCUSDT", timestamp: ASOF, grade: "A", side: "LONG", confidence: 78, riskStatus: "valid", invalidation: "close below 41,200", ...overrides };
}

function decisionContext(overrides: Partial<AutonomousDecisionContext> = {}): AutonomousDecisionContext {
  return { version: 1, generatedAt: ASOF, symbol: "BTCUSDT", source: "ELVOID_PRO_ORACLE", canonical: canonical(), cognitive: null, memory: null, validConstraints: [], ...overrides };
}

function qualification(overrides: Partial<AutonomousQualificationResult> = {}): AutonomousQualificationResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    generatedAt: ASOF,
    status: "QUALIFIED",
    signals: { sourceEligible: true, canonicalAssessmentPresent: true, gradeQualifies: true, riskValid: true, negativeMemorySignalPresent: false, cautionConstraintPresent: false },
    ...overrides,
  };
}

function macro(overrides: Partial<MacroIntelligenceContext> = {}): MacroIntelligenceContext {
  return { version: 1, generatedAt: ASOF, dataAvailability: "AVAILABLE", usableEventCount: 3, totalEventCount: 3, macroRegime: "EVENT_LIGHT", eventRisk: "LOW", eventProximity: "DISTANT", upcomingHighImpactEvent: null, directionalBias: null, ...overrides };
}

function eventImpact(overrides: Partial<MarketImpactContext> = {}): MarketImpactContext {
  return {
    version: 1,
    generatedAt: ASOF,
    eventState: "NONE",
    macroAvailability: "AVAILABLE",
    newsAvailability: "AVAILABLE",
    highImpactPresent: false,
    upcomingHighImpactEvent: null,
    totalNewsCount: 4,
    usableNewsCount: 4,
    recentNewsCount: 1,
    impactRisk: "LOW",
    impactDirection: null,
    conflictingImpact: false,
    uncertainty: { macroDataMissing: false, newsDataMissing: false, directionUnsupported: true },
    ...overrides,
  };
}

function fundingSnapshot(overrides: readonly FundingInfo[] = [{ symbol: "BTCUSDT", lastFundingRate: 0.0004, markPrice: 60000 }]): () => Promise<readonly FundingInfo[]> {
  return async () => overrides;
}

const NEVER_CALL_FUNDING = async (): Promise<readonly FundingInfo[]> => {
  throw new Error("this fixture asserts getFundingSnapshot is never called for this scenario");
};

const THROWING_FUNDING = async (): Promise<readonly FundingInfo[]> => {
  throw new Error("simulated network failure");
};

// ---------------------------------------------------------------------------
// 1. Trigger -> context flow (Research Trigger genuinely evaluated from real cycle data)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "UNLISTEDCOIN", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: NEVER_CALL_FUNDING }
  );
  check("1. low confidence -> shouldResearch=true (real Research Trigger evaluation)", signal.shouldResearch === true, JSON.stringify(signal));
  check("1. requestedCapabilities is non-empty, real Phase 8.4.2 output", signal.requestedCapabilities.length > 0, JSON.stringify(signal.requestedCapabilities));
}

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment(), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: NEVER_CALL_FUNDING }
  );
  check("1b. clean high-confidence input -> shouldResearch=false, no fetch attempted", signal.shouldResearch === false && signal.evidenceSatisfied === true, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 2. Available capability digunakan (real fetch path, watchlisted symbol)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: fundingSnapshot([{ symbol: "BTCUSDT", lastFundingRate: 0.0004, markPrice: 60000 }]) }
  );
  check("2. requestedCapabilities includes funding_rate (LOW_CONFIDENCE default mapping)", signal.requestedCapabilities.includes("funding_rate"), JSON.stringify(signal.requestedCapabilities));
  check("2. real funding data obtained -> evidenceSatisfied=true", signal.evidenceSatisfied === true, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 3. Unavailable capability tidak difabrikasi (symbol not on watchlist)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "NOTONWATCHLISTUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: NEVER_CALL_FUNDING }
  );
  check("3. off-watchlist symbol -> no fetch attempted (proven by NEVER_CALL_FUNDING not throwing)", signal.shouldResearch === true, JSON.stringify(signal));
  check("3. off-watchlist symbol -> evidenceSatisfied honestly false, nothing fabricated", signal.evidenceSatisfied === false, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 4. Evidence normalization masuk context (a "successful" fetch with no matching row still yields no fabricated satisfaction)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: fundingSnapshot([{ symbol: "ETHUSDT", lastFundingRate: 0.0002, markPrice: 3000 }]) } // real call succeeds, but no row for BTCUSDT
  );
  check("4. fetch succeeds but has no row for this symbol -> evidenceSatisfied=false (real normalization/lookup happened, not a blind 'fetch OK' shortcut)", signal.evidenceSatisfied === false, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 5. Internal vs external contradiction stay provenance-separated
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    {
      symbol: "BTCUSDT",
      asOf: ASOF,
      assessment: assessment(),
      contradictions: null,
      arbitration: {
        canonicalSide: "LONG",
        canonicalGrade: "A",
        alignment: "CONFLICTED",
        reasons: ["synthetic test arbitration"],
        hasUnresolvedGenuineContradiction: false,
        regimeCompatibility: "UNAVAILABLE",
        mtfCompatibility: "UNAVAILABLE",
        hasAlternativeScenario: false,
        alternativeIsActiveOpposition: false,
        caveat: null,
      },
      cognitiveObservation: null,
      riskIntelligence: null,
      marketImpact: eventImpact(),
    },
    { fetchFundingSnapshot: fundingSnapshot([{ symbol: "BTCUSDT", lastFundingRate: 0.0004, markPrice: 60000 }]) }
  );
  check("5. internal arbitration=CONFLICTED triggers research (shouldResearch=true)", signal.shouldResearch === true, JSON.stringify(signal));
  check(
    "5. hasConflict (EXTERNAL evidence conflict) stays false — internal Oracle contradiction never leaks into the external-conflict flag",
    signal.hasConflict === false,
    JSON.stringify(signal)
  );
}

// ---------------------------------------------------------------------------
// 6. Conflict/insufficiency causes conservative qualification via the REAL call path
// ---------------------------------------------------------------------------

{
  const preEntry = validatePreEntry({
    decisionContext: decisionContext(),
    qualification: qualification(),
    macro: macro(),
    eventImpact: eventImpact(),
    externalIntelligence: { shouldResearch: true, hasConflict: false, evidenceSatisfied: false, requestedCapabilities: ["funding_rate"] },
  });
  check("6. externalEvidenceInsufficient -> real validatePreEntry() returns CAUTION", preEntry.status === "CAUTION", JSON.stringify(preEntry));

  const decision = decideAutonomous({ decisionContext: decisionContext(), qualification: qualification(), macro: macro(), eventImpact: eventImpact(), preEntry });
  check("6b. CAUTION from external evidence cascades through the REAL, unmodified decideAutonomous() -> WAIT", decision.decision === "WAIT", JSON.stringify(decision));
}

{
  const preEntry = validatePreEntry({
    decisionContext: decisionContext(),
    qualification: qualification(),
    macro: macro(),
    eventImpact: eventImpact(),
    externalIntelligence: { shouldResearch: true, hasConflict: true, evidenceSatisfied: true, requestedCapabilities: ["funding_rate"] },
  });
  check("6c. externalEvidenceConflicted -> real validatePreEntry() returns CAUTION", preEntry.status === "CAUTION", JSON.stringify(preEntry));
}

{
  // Would otherwise be VALID -> EXECUTE; confirm a clean external signal does NOT introduce caution.
  const preEntry = validatePreEntry({
    decisionContext: decisionContext(),
    qualification: qualification(),
    macro: macro(),
    eventImpact: eventImpact(),
    externalIntelligence: { shouldResearch: false, hasConflict: false, evidenceSatisfied: true, requestedCapabilities: [] },
  });
  check("6d. shouldResearch=false -> VALID (external signal never forces caution when nothing was needed)", preEntry.status === "VALID", JSON.stringify(preEntry));
  const decision = decideAutonomous({ decisionContext: decisionContext(), qualification: qualification(), macro: macro(), eventImpact: eventImpact(), preEntry });
  check("6e. clean pipeline -> EXECUTE (external wiring never blocks a genuinely clean cycle)", decision.decision === "EXECUTE", JSON.stringify(decision));
}

// ---------------------------------------------------------------------------
// 7 & 8. External evidence never changes Oracle confidence/grade
// ---------------------------------------------------------------------------

{
  const a1 = assessment({ confidence: 55, grade: "B+" });
  const a2 = assessment({ confidence: 55, grade: "B+" });
  await assembleExternalIntelligenceSignal({ symbol: "BTCUSDT", asOf: ASOF, assessment: a1, contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() }, { fetchFundingSnapshot: fundingSnapshot() });
  check("7. assessment object is never mutated by the gate call (confidence unchanged)", a1.confidence === a2.confidence && a1.confidence === 55, JSON.stringify(a1));
  check("8. assessment object is never mutated by the gate call (grade unchanged)", a1.grade === a2.grade && a1.grade === "B+", JSON.stringify(a1));
  const keys = Object.keys(a1);
  check("7b/8b. gate call adds no confidence/grade-shaped field onto the assessment object itself", JSON.stringify(keys.sort()) === JSON.stringify(["confidence", "dataQuality", "grade", "riskStatus"].sort()), JSON.stringify(keys));
}

// ---------------------------------------------------------------------------
// 9. External evidence never produces EXECUTE authority of its own
// ---------------------------------------------------------------------------

{
  function deepKeysAndValues(obj: unknown, prefix = ""): string[] {
    if (obj === null || typeof obj !== "object") return typeof obj === "string" ? [`${prefix}=${obj}`] : [];
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out.push(...deepKeysAndValues(v, prefix + k + "."));
    }
    return out;
  }
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: fundingSnapshot() }
  );
  const entries = deepKeysAndValues(signal);
  const forbidden = ["EXECUTE", "BUY", "SELL", "REJECT"];
  const leaked = entries.filter((e) => forbidden.some((f) => e.toUpperCase().includes(f)));
  check("9. ExternalIntelligenceSignal never contains an EXECUTE/BUY/SELL/REJECT-shaped value", leaked.length === 0, JSON.stringify(leaked));
  check("9b. ExternalIntelligenceSignal has exactly its four declared fields — no decision field snuck in", JSON.stringify(Object.keys(signal).sort()) === JSON.stringify(["evidenceSatisfied", "hasConflict", "requestedCapabilities", "shouldResearch"].sort()), JSON.stringify(Object.keys(signal)));
}

// ---------------------------------------------------------------------------
// 10. Symbol isolation
// ---------------------------------------------------------------------------

{
  const btcSignal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: fundingSnapshot([{ symbol: "ETHUSDT", lastFundingRate: 0.01, markPrice: 3000 }]) } // only ETHUSDT data present
  );
  check("10. BTCUSDT gate call never treats another symbol's (ETHUSDT) funding data as its own evidence", btcSignal.evidenceSatisfied === false, JSON.stringify(btcSignal));
}

// ---------------------------------------------------------------------------
// 11. Deterministic rerun
// ---------------------------------------------------------------------------

{
  const params = { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() };
  const deps = { fetchFundingSnapshot: fundingSnapshot([{ symbol: "BTCUSDT", lastFundingRate: 0.0004, markPrice: 60000 }]) };
  const r1 = await assembleExternalIntelligenceSignal(JSON.parse(JSON.stringify(params)), deps);
  const r2 = await assembleExternalIntelligenceSignal(JSON.parse(JSON.stringify(params)), deps);
  check("11. identical input -> deep-equal output across two calls", JSON.stringify(r1) === JSON.stringify(r2), `${JSON.stringify(r1)} vs ${JSON.stringify(r2)}`);
}

// ---------------------------------------------------------------------------
// 12. Stale/unavailable evidence fail-safe (fetch throws -> honest degrade, never a crash)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "BTCUSDT", asOf: ASOF, assessment: assessment({ confidence: 40 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: THROWING_FUNDING }
  );
  check("12. fetch failure never throws out of assembleExternalIntelligenceSignal", true, "unreachable if it threw");
  check("12b. fetch failure degrades to evidenceSatisfied=false — never a fabricated fallback", signal.evidenceSatisfied === false, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 13. No provider -> honest UNAVAILABLE (a non-derivatives capability request is never satisfied by this module)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    {
      symbol: "BTCUSDT",
      asOf: ASOF,
      assessment: assessment(),
      contradictions: null,
      arbitration: null,
      cognitiveObservation: null,
      riskIntelligence: null,
      marketImpact: eventImpact({ highImpactPresent: true, upcomingHighImpactEvent: { title: "FOMC", date: ASOF, impact: "high", hoursAway: 2, proximity: "IMMINENT" } }),
    },
    { fetchFundingSnapshot: NEVER_CALL_FUNDING }
  );
  check("13. HIGH_IMPACT_EVENT requests economic_release/news capabilities, not derivatives", !signal.requestedCapabilities.includes("funding_rate"), JSON.stringify(signal.requestedCapabilities));
  check("13b. no provider exists for those capabilities in this module -> evidenceSatisfied honestly false", signal.evidenceSatisfied === false, JSON.stringify(signal));
}

// ---------------------------------------------------------------------------
// 14. End-to-end autonomous context integration (Research Trigger -> gate -> preEntry -> decision, all real functions)
// ---------------------------------------------------------------------------

{
  const signal = await assembleExternalIntelligenceSignal(
    { symbol: "OFFWATCHLISTUSDT", asOf: ASOF, assessment: assessment({ confidence: 30 }), contradictions: null, arbitration: null, cognitiveObservation: null, riskIntelligence: null, marketImpact: eventImpact() },
    { fetchFundingSnapshot: NEVER_CALL_FUNDING }
  );
  const preEntry = validatePreEntry({ decisionContext: decisionContext({ symbol: "OFFWATCHLISTUSDT" }), qualification: qualification({ symbol: "OFFWATCHLISTUSDT" }), macro: macro(), eventImpact: eventImpact(), externalIntelligence: signal });
  const decision = decideAutonomous({ decisionContext: decisionContext({ symbol: "OFFWATCHLISTUSDT" }), qualification: qualification({ symbol: "OFFWATCHLISTUSDT" }), macro: macro(), eventImpact: eventImpact(), preEntry });

  check("14. full chain: low confidence -> shouldResearch, off-watchlist -> unsatisfied", signal.shouldResearch === true && signal.evidenceSatisfied === false, JSON.stringify(signal));
  check("14b. full chain: unsatisfied evidence -> real preEntry CAUTION", preEntry.status === "CAUTION", JSON.stringify(preEntry));
  check("14c. full chain: CAUTION -> real decideAutonomous WAIT (never EXECUTE on unmet external evidence need)", decision.decision === "WAIT", JSON.stringify(decision));
}

// ---------------------------------------------------------------------------
// 15. Static scan — no random/mock/fake production evidence
// ---------------------------------------------------------------------------

{
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }
  const gateSrc = stripComments(readFileSync(new URL("../../lib/ai/wiring/externalIntelligenceGate.ts", import.meta.url), "utf8"));
  const forbidden = ["Math.random(", "Date.now(", "mock", "fake", "bullish", "bearish"];
  const found = forbidden.filter((token) => gateSrc.toLowerCase().includes(token.toLowerCase()));
  check("15. externalIntelligenceGate.ts production code contains no random/mock/fake/bullish/bearish token", found.length === 0, `found: ${found.join(", ")}`);

  const validateSrc = stripComments(readFileSync(new URL("../../lib/ai/preEntryValidation/validate.ts", import.meta.url), "utf8"));
  const found2 = forbidden.filter((token) => validateSrc.toLowerCase().includes(token.toLowerCase()));
  check("15b. validate.ts (post-wiring) still contains no random/mock/fake/bullish/bearish token", found2.length === 0, `found: ${found2.join(", ")}`);
}

console.log(failures === 0 ? `\nAll Phase 8.3x8.4 Autonomous Intelligence Integration fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
