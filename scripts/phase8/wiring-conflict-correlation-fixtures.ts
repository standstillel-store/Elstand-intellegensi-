// ---------------------------------------------------------------------------
// Phase 8.3 x 8.4 — Final Wiring Integration fixtures (dev-only). Pure/
// offline — no network, no LLM, no database. Exercises the ONE real
// wiring built (`correlateExternalConflict`) end-to-end against the REAL
// Phase 8.3.5 `deriveAxisConflictReport()` function (not a hand-rolled
// stand-in), fed a SYNTHETIC `CognitiveTraceRecord` — clearly labeled as
// such, since no live orchestrator cycle ran to produce a real one.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/wiring-conflict-correlation-fixtures.ts
// ---------------------------------------------------------------------------

import { deriveAxisConflictReport } from "@/lib/ai/cognitiveConflict/axisAnalysis";
import { correlateExternalConflict } from "@/lib/ai/wiring/externalConflictCorrelation";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import { normalizeExternalEvidence } from "@/lib/ai/externalIntelligence/evidence/normalize";
import type { RawExternalObservation } from "@/lib/ai/externalIntelligence/evidence/contracts";
import { analyzeCommunityIntelligence } from "@/lib/ai/externalIntelligence/community/analyze";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const ASOF = "2026-09-07T12:00:00.000Z";

// SYNTHETIC — no real orchestrator cycle produced this. Minimal but
// structurally complete CognitiveTraceRecord, built only to exercise the
// REAL deriveAxisConflictReport() function honestly.
function syntheticTrace(overrides: Partial<CognitiveTraceRecord> = {}): CognitiveTraceRecord {
  return {
    id: "synthetic-trace-1",
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    cycleAt: "2026-09-07T11:55:00.000Z",
    input: { interval: "15m", candleCount: 300, currentPrice: 60000, sufficientHistory: true, insufficientReason: null },
    analysis: { dominantSide: "LONG", grade: "A", confidence: 72, riskStatus: "valid", riskPlanPresent: true },
    analysisAt: "2026-09-07T11:55:01.000Z",
    evidence: { liquidityEvidence: "test", structureEvidence: "test", volumeEvidence: "test", mtfAvailable: true, regimeAvailable: true, scenariosAvailable: true, liquidityOrderFlowAvailable: true },
    evidenceAt: "2026-09-07T11:55:01.000Z",
    conflict: { state: "CONSISTENT", reasons: [], contributingFactors: [] },
    conflictAt: "2026-09-07T11:55:01.000Z",
    contradictions: [],
    externalIntelligence: null,
    externalIntelligenceAt: null,
    decision: { decision: "EXECUTE", side: "LONG", dedupApplied: false },
    decisionAt: "2026-09-07T11:55:02.000Z",
    execution: { outcome: "EXECUTED", paperTradeId: "synthetic-signal-1", error: null },
    executionAt: "2026-09-07T11:55:02.000Z",
    createdAt: "2026-09-07T11:55:03.000Z",
    ...overrides,
  };
}

function communityRaw(overrides: Partial<RawExternalObservation> = {}): RawExternalObservation {
  return {
    source: "community_unintegrated",
    capability: "discussion_velocity",
    symbol: "BTCUSDT",
    observedAt: ASOF,
    fetchedAt: ASOF,
    kind: "FACTUAL_OBSERVATION",
    claim: "Mention count rose",
    rawValue: { previous: 100, current: 200 },
    direction: "INCREASING",
    status: "OK",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. No external data supplied -> honest NOT_SUPPLIED, real internal report passed through
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);
  const result = correlateExternalConflict({ symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: null, externalEvidence: [] });

  check("1. internalAxisReport is passed through verbatim (real function output, unmodified)", result.internalAxisReport === internalAxisReport, "reference identity lost — internal report was recomputed or copied");
  check("1. communityStatus is NOT_SUPPLIED when communityContext is null", result.communityStatus === "NOT_SUPPLIED", result.communityStatus);
  check("1. no external conflict fabricated from nothing", result.hasExternalConflict === false && result.externalClaimConflicts.length === 0 && result.externalDirectionConflicts.length === 0, JSON.stringify(result));
  check("1. hasInternalConflict reflects the real axis report (CONSISTENT trace -> mostly NOT_CONFLICTED/UNSUPPORTED, no CONFLICTED axis)", result.hasInternalConflict === internalAxisReport.axes.some((a) => a.status === "CONFLICTED"), "hasInternalConflict mismatched the real axis report");
}

// ---------------------------------------------------------------------------
// 2. External claim conflict (Community Intelligence) surfaces, symbol-isolated
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);

  const claimARaw = normalizeExternalEvidence(communityRaw({ capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Listing expected next week", direction: undefined, rawValue: undefined }), ASOF);
  const claimBRaw = normalizeExternalEvidence(communityRaw({ capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Team denies any listing talks", direction: undefined, rawValue: undefined }), ASOF);
  const otherSymbolClaimRaw = normalizeExternalEvidence(communityRaw({ capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Different coin listing rumor", symbol: "ETHUSDT", direction: undefined, rawValue: undefined }), ASOF);
  // Relabel `source` post-normalization to simulate two distinct community sources — the
  // only real registry entry today is the single `community_unintegrated` placeholder (see
  // Phase 8.4.1/8.4.4 audit), so distinctness for THIS test is asserted the same way the
  // Phase 8.4.4 fixtures already established, never by feeding an unregistered id into
  // normalizeExternalEvidence() itself (which would honestly mark it malformed/UNKNOWN).
  const claimA: typeof claimARaw = { ...claimARaw, source: "community_unintegrated#a" };
  const claimB: typeof claimBRaw = { ...claimBRaw, source: "community_unintegrated#b" };
  const otherSymbolClaim: typeof otherSymbolClaimRaw = { ...otherSymbolClaimRaw, source: "community_unintegrated#c" };

  const community = analyzeCommunityIntelligence([claimA, claimB, otherSymbolClaim], "BTCUSDT", ASOF);
  const result = correlateExternalConflict({ symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: community, externalEvidence: [] });

  check("2. a real CommunityClaimConflict surfaces in the correlation", result.externalClaimConflicts.length === 1, JSON.stringify(result.externalClaimConflicts));
  check("2. hasExternalConflict is true", result.hasExternalConflict === true, String(result.hasExternalConflict));
  check("2. communityStatus reflects the real community context's own status", result.communityStatus === community.status, `${result.communityStatus} vs ${community.status}`);
}

// ---------------------------------------------------------------------------
// 3. Opposing evidence direction conflict detected, same capability+symbol
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);

  const up = normalizeExternalEvidence(communityRaw({ direction: "INCREASING", rawValue: { previous: 100, current: 300 } }), ASOF);
  const down = normalizeExternalEvidence(communityRaw({ direction: "DECREASING", rawValue: { previous: 300, current: 100 } }), ASOF);

  const result = correlateExternalConflict({ symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: null, externalEvidence: [up, down] });

  check("3. opposing INCREASING/DECREASING direction pair detected", result.externalDirectionConflicts.length === 1, JSON.stringify(result.externalDirectionConflicts));
  check("3. detected pair references the two real evidence ids", JSON.stringify(result.externalDirectionConflicts[0]?.evidenceIds.slice().sort()) === JSON.stringify([up.id, down.id].sort()), JSON.stringify(result.externalDirectionConflicts));
  check("3. hasExternalConflict is true from direction conflict alone", result.hasExternalConflict === true, String(result.hasExternalConflict));
}

// ---------------------------------------------------------------------------
// 4. No conflict fabricated from agreeing/insufficient/malformed/other-symbol evidence
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);

  const agreeing1 = normalizeExternalEvidence(communityRaw({ direction: "INCREASING", rawValue: { previous: 1, current: 2 } }), ASOF);
  const agreeing2 = normalizeExternalEvidence(communityRaw({ direction: "INCREASING", rawValue: { previous: 1, current: 2 } }), ASOF);
  const unavailable = normalizeExternalEvidence(communityRaw({ direction: "DECREASING", rawValue: { previous: 2, current: 1 }, status: "UNAVAILABLE", claim: "" }), ASOF);
  const otherSymbolOpposite = normalizeExternalEvidence(communityRaw({ direction: "DECREASING", rawValue: { previous: 2, current: 1 }, symbol: "ETHUSDT" }), ASOF);

  const result = correlateExternalConflict({ symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: null, externalEvidence: [agreeing1, agreeing2, unavailable, otherSymbolOpposite] });

  check("4. same-direction pair never flagged as conflict", result.externalDirectionConflicts.length === 0, JSON.stringify(result.externalDirectionConflicts));
  check("4. UNAVAILABLE evidence excluded from conflict detection (would have opposed agreeing1/2 otherwise)", result.hasExternalConflict === false, JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// 5. Symbol isolation preserved
// ---------------------------------------------------------------------------

{
  const traceEth = syntheticTrace({ symbol: "ETHUSDT" });
  const internalAxisReportEth = deriveAxisConflictReport("ETHUSDT", traceEth, null);
  const up = normalizeExternalEvidence(communityRaw({ symbol: "BTCUSDT", direction: "INCREASING", rawValue: 1 }), ASOF);
  const down = normalizeExternalEvidence(communityRaw({ symbol: "BTCUSDT", direction: "DECREASING", rawValue: 1 }), ASOF);

  const result = correlateExternalConflict({ symbol: "ETHUSDT", asOf: ASOF, internalAxisReport: internalAxisReportEth, communityContext: null, externalEvidence: [up, down] });
  check("5. BTCUSDT evidence never leaks into an ETHUSDT correlation", result.externalDirectionConflicts.length === 0, JSON.stringify(result.externalDirectionConflicts));
  check("5. output symbol matches the requested symbol, not the evidence's symbol", result.symbol === "ETHUSDT", result.symbol);
}

// ---------------------------------------------------------------------------
// 6. Deterministic rerun
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);
  const up = normalizeExternalEvidence(communityRaw({ direction: "INCREASING", rawValue: 1 }), ASOF);
  const down = normalizeExternalEvidence(communityRaw({ direction: "DECREASING", rawValue: 1 }), ASOF);
  const community = analyzeCommunityIntelligence([up, down], "BTCUSDT", ASOF);

  const params = { symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: community, externalEvidence: [up, down] };
  const r1 = correlateExternalConflict(params);
  const r2 = correlateExternalConflict(JSON.parse(JSON.stringify(params)));
  check("6. identical input -> deep-equal output", JSON.stringify(r1) === JSON.stringify(r2), "outputs differed on identical input");
}

// ---------------------------------------------------------------------------
// 7. No new decision authority accidentally created
// ---------------------------------------------------------------------------

{
  const trace = syntheticTrace();
  const internalAxisReport = deriveAxisConflictReport("BTCUSDT", trace, null);
  const result = correlateExternalConflict({ symbol: "BTCUSDT", asOf: ASOF, internalAxisReport, communityContext: null, externalEvidence: [] });

  function deepKeys(obj: unknown, prefix = ""): string[] {
    if (obj === null || typeof obj !== "object") return [];
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      keys.push(prefix + k);
      keys.push(...deepKeys(v, prefix + k + "."));
    }
    return keys;
  }
  const forbidden = ["decision", "execute", "buy", "sell", "signal", "score"];
  const keys = deepKeys(result).map((k) => k.toLowerCase());
  // "internalAxisReport" legitimately nests real 8.3 fields (e.g. axis names) — only flag keys OUTSIDE that verbatim passthrough subtree.
  const ownKeys = Object.keys(result).filter((k) => k !== "internalAxisReport");
  const ownDeepKeys = ownKeys.flatMap((k) => [k, ...deepKeys((result as unknown as Record<string, unknown>)[k], k + ".")]).map((k) => k.toLowerCase());
  const leaked = forbidden.filter((f) => ownDeepKeys.some((k) => k.includes(f)));
  check("7. no BUY/SELL/EXECUTE/score/decision-shaped field introduced by this correlator itself", leaked.length === 0, `leaked: ${leaked.join(", ")} in ${JSON.stringify(ownKeys)}`);
}

console.log(failures === 0 ? `\nAll Phase 8.3x8.4 wiring integration fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
