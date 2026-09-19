// ---------------------------------------------------------------------------
// Phase 8.6 P2 — Confluence Attribution fixtures (dev-only, not part of the
// app). Pure/offline — hand-built `CognitiveTraceRecord` fixtures exercised
// against derive.ts's pure `deriveConfluenceAttribution()`. The one
// DB-touching function (`repository.ts`'s `fetchConfluenceAttributionReport`)
// is a thin wrapper over already-fixture-tested `listCognitiveTracesBySymbol()`
// (Phase 8.3.2) and this pure function; not separately re-tested here, same
// convention every prior phase in this repository follows.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/confluence-attribution-fixtures.ts
// ---------------------------------------------------------------------------

import { deriveConfluenceAttribution } from "@/lib/ai/confluenceAttribution/derive";
import type { ConfluenceSource, EvidenceDirection, NormalizedEvidence, OracleDataQuality } from "@/lib/ai/confluenceAttribution/contracts";
import type { ClassifiedContradiction } from "@/lib/ai/oracle/contradiction";
import type { AutonomousDecision } from "@/lib/ai/autonomousDecision/contracts";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

function evidenceEntry(source: ConfluenceSource, overrides: Partial<NormalizedEvidence> = {}): NormalizedEvidence {
  return { source, cluster: "structure", direction: (overrides.direction ?? "LONG") as EvidenceDirection, strength: overrides.strength ?? 1, quality: (overrides.quality ?? "real") as OracleDataQuality, timeframe: "1h", evidence: `evidence for ${source}`, invalidation: undefined, timestamp: "2026-02-01T00:00:00.000Z", ...overrides };
}

function contradiction(sources: ConfluenceSource[], overrides: Partial<ClassifiedContradiction> = {}): ClassifiedContradiction {
  return { description: "test contradiction", sources, severity: "MODERATE", genuineness: "GENUINE", origin: "INTERNAL", ...overrides } as ClassifiedContradiction;
}

function traceRow(overrides: {
  symbol?: string;
  decision?: AutonomousDecision | null;
  side?: "LONG" | "SHORT" | null;
  confluenceEvidence?: NormalizedEvidence[] | null | "OMIT";
  contradictions?: ClassifiedContradiction[] | null;
  noAssessment?: boolean;
  cycleAt?: string;
} = {}): CognitiveTraceRecord {
  const noAssessment = overrides.noAssessment ?? false;
  const cycleAt = overrides.cycleAt ?? "2026-02-01T00:00:00.000Z";

  const evidenceStage = noAssessment
    ? null
    : {
        liquidityEvidence: null,
        structureEvidence: null,
        volumeEvidence: null,
        mtfAvailable: true,
        regimeAvailable: true,
        scenariosAvailable: true,
        liquidityOrderFlowAvailable: true,
        confluenceEvidence: overrides.confluenceEvidence === "OMIT" ? null : (overrides.confluenceEvidence ?? null),
      };

  return {
    id: nextId("trace"),
    source: "ELVOID_PRO_ORACLE",
    symbol: overrides.symbol ?? "BTCUSDT",
    cycleAt,
    input: { interval: "15m", candleCount: 500, currentPrice: 50000, sufficientHistory: !noAssessment, insufficientReason: noAssessment ? "insufficient candles" : null },
    analysis: noAssessment ? null : { dominantSide: "LONG", grade: "A", confidence: 0.8, riskStatus: "valid", riskPlanPresent: true },
    analysisAt: noAssessment ? null : cycleAt,
    evidence: evidenceStage,
    evidenceAt: noAssessment ? null : cycleAt,
    conflict: noAssessment ? null : { state: "CONSISTENT", reasons: [], contributingFactors: [] },
    conflictAt: noAssessment ? null : cycleAt,
    contradictions: noAssessment ? null : (overrides.contradictions ?? null),
    externalIntelligence: null,
    externalIntelligenceAt: null,
    decision: noAssessment || overrides.decision === null ? null : { decision: overrides.decision ?? "WAIT", side: overrides.side === undefined ? "LONG" : overrides.side, dedupApplied: false },
    decisionAt: noAssessment ? null : cycleAt,
    execution: null,
    executionAt: null,
    createdAt: cycleAt,
  };
}

function sourceTally(report: ReturnType<typeof deriveConfluenceAttribution>, list: "evidenceSources" | "contradictionSources", source: ConfluenceSource) {
  const tally = report[list].find((t) => t.source === source);
  if (!tally) throw new Error(`source ${source} missing from ${list}`);
  return tally;
}

// ===========================================================================
// 1. one observed source (evidence-based)
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: [evidenceEntry("liquidity")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("1a. evidenceStatus OBSERVED with one recorded cycle", report.evidenceStatus === "OBSERVED" && report.evidenceRecordedCycles === 1, JSON.stringify(report));
  check("1b. liquidity occurrenceCount 1, every other source 0", sourceTally(report, "evidenceSources", "liquidity").occurrenceCount === 1 && sourceTally(report, "evidenceSources", "macro").occurrenceCount === 0, JSON.stringify(report.evidenceSources));
  check("1c. all 8 ConfluenceSource entries always present", report.evidenceSources.length === 8, `got ${report.evidenceSources.length}`);
}

// ===========================================================================
// 2. multiple observed sources
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: [evidenceEntry("liquidity"), evidenceEntry("market_structure"), evidenceEntry("macro")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check(
    "2. three sources each occurrenceCount 1, rest 0",
    sourceTally(report, "evidenceSources", "liquidity").occurrenceCount === 1 && sourceTally(report, "evidenceSources", "market_structure").occurrenceCount === 1 && sourceTally(report, "evidenceSources", "macro").occurrenceCount === 1 && sourceTally(report, "evidenceSources", "tpo").occurrenceCount === 0,
    JSON.stringify(report.evidenceSources),
  );
}

// ===========================================================================
// 3. no source recorded (null confluenceEvidence, predates P2 / NO_ASSESSMENT)
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: null }), traceRow({ noAssessment: true })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("3a. evidenceStatus NOT_RECORDED, zero recorded cycles", report.evidenceStatus === "NOT_RECORDED" && report.evidenceRecordedCycles === 0, JSON.stringify(report));
  check("3b. every source occurrenceCount 0, never fabricated", report.evidenceSources.every((t) => t.occurrenceCount === 0), JSON.stringify(report.evidenceSources));
  check("3c. NO_ASSESSMENT cycle excluded from cyclesInScope entirely", report.dataQuality.cyclesInScope === 1 && report.dataQuality.rawTraceCount === 2, JSON.stringify(report.dataQuality));
}

// ===========================================================================
// 4/5. "UNKNOWN source" / "mixed observed/unknown" — this phase's closed
// vocabulary (contracts.ts) documents why deriveConfluenceAttribution()
// never itself returns UNKNOWN: everything it reads is a controlled,
// already-typed jsonb array, not free-text metadata to defensively
// parse the way lib/ai/decisionPopulation had to. The equivalent real
// case here is "recorded vs not recorded" per cycle, exercised as mixed
// recorded/not-recorded below instead.
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: [evidenceEntry("liquidity")] }), traceRow({ confluenceEvidence: null }), traceRow({ noAssessment: true })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("4/5. mixed recorded/not-recorded -> status OBSERVED (>=1 real), recordedCycles reflects only the real one", report.evidenceStatus === "OBSERVED" && report.evidenceRecordedCycles === 1 && report.dataQuality.cyclesInScope === 2, JSON.stringify(report));
}

// ===========================================================================
// 6/7/8. EXECUTE / WAIT / REJECT + source — decisionCounts breakdown
// ===========================================================================
{
  const rows = [traceRow({ decision: "EXECUTE", confluenceEvidence: [evidenceEntry("orderbook")] }), traceRow({ decision: "WAIT", confluenceEvidence: [evidenceEntry("orderbook")] }), traceRow({ decision: "REJECT", confluenceEvidence: [evidenceEntry("orderbook")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  const t = sourceTally(report, "evidenceSources", "orderbook");
  check("6/7/8. orderbook decisionCounts EXECUTE 1, WAIT 1, REJECT 1", t.decisionCounts.EXECUTE === 1 && t.decisionCounts.WAIT === 1 && t.decisionCounts.REJECT === 1, JSON.stringify(t));
  check("descriptive-only: decisionCounts never claims causation (structural check — plain counts, not a causal-language field)", typeof t.decisionCounts.REJECT === "number" && Object.keys(t).every((k) => !k.toLowerCase().includes("caus")), JSON.stringify(t));
}

// ===========================================================================
// 9. multiple symbols — isolation
// ===========================================================================
{
  const rows = [traceRow({ symbol: "BTCUSDT", confluenceEvidence: [evidenceEntry("liquidity")] }), traceRow({ symbol: "ETHUSDT", confluenceEvidence: [evidenceEntry("liquidity"), evidenceEntry("macro")] })];
  const btc = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("9. BTCUSDT report only reflects BTCUSDT rows, ETHUSDT rows excluded", btc.dataQuality.rawTraceCount === 1 && sourceTally(btc, "evidenceSources", "macro").occurrenceCount === 0, JSON.stringify(btc.dataQuality));
}

// ===========================================================================
// 10. multiple sides — side is available on the raw row (decision.side) but
// intentionally not broken out as its own tally dimension in this phase
// (see contracts.ts's header); this case confirms mixed sides in the
// input never corrupts or crashes the aggregation.
// ===========================================================================
{
  const rows = [traceRow({ side: "LONG", confluenceEvidence: [evidenceEntry("liquidity")] }), traceRow({ side: "SHORT", confluenceEvidence: [evidenceEntry("liquidity")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("10. mixed LONG/SHORT rows aggregate cleanly, no crash, correct total", sourceTally(report, "evidenceSources", "liquidity").occurrenceCount === 2, JSON.stringify(report.evidenceSources));
}

// ===========================================================================
// 11. source isolation (decision source, not confluence source) — a row from
// a different DecisionSource must not silently appear (defensive; the real
// isolation boundary is the caller only ever querying "ELVOID_PRO_ORACLE",
// same as every other 8.1.x/8.3.x/8.6.x module — this checks the pure
// function does not itself fabricate cross-source pooling).
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: [evidenceEntry("liquidity")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("11. report.source is exactly what the caller asked for, not re-derived from the rows", report.source === "ELVOID_PRO_ORACLE", `got ${report.source}`);
}

// ===========================================================================
// 12. no fabricated attribution — a source with zero real occurrences must
// report occurrenceCount 0, not be omitted, not get a non-zero guess.
// ===========================================================================
{
  const rows = [traceRow({ confluenceEvidence: [evidenceEntry("liquidity")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  const smc = sourceTally(report, "evidenceSources", "smc_ict");
  check("12. smc_ict (never observed in this fixture) -> occurrenceCount 0, present in the array, decisionCounts all 0", smc.occurrenceCount === 0 && smc.decisionCounts.EXECUTE === 0 && smc.decisionCounts.WAIT === 0 && smc.decisionCounts.REJECT === 0, JSON.stringify(smc));
}

// ===========================================================================
// 13/14. determinism + immutability
// ===========================================================================
{
  const rows = [traceRow({ decision: "REJECT", confluenceEvidence: [evidenceEntry("liquidity"), evidenceEntry("macro")], contradictions: [contradiction(["liquidity", "macro"])] })];
  const beforeSnapshot = JSON.parse(JSON.stringify(rows));
  const a = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  const b = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("13. same input -> byte-identical report across two calls", JSON.stringify(a) === JSON.stringify(b), "mismatch");
  check("14. input rows array never mutated", JSON.stringify(rows) === JSON.stringify(beforeSnapshot), "rows mutated");
}

// ===========================================================================
// 15. backward compatibility with P0/P1 contracts — ObservedDecisionCounts
// reuse (Phase 8.6 P1) type-checks and behaves identically in shape here.
// ===========================================================================
{
  const rows = [traceRow({ decision: "EXECUTE", confluenceEvidence: [evidenceEntry("tpo")] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  const decisionCounts = sourceTally(report, "evidenceSources", "tpo").decisionCounts;
  check("15. decisionCounts has exactly the P1 ObservedDecisionCounts shape (EXECUTE/WAIT/REJECT, all present)", Object.keys(decisionCounts).sort().join(",") === "EXECUTE,REJECT,WAIT", `got ${Object.keys(decisionCounts).sort().join(",")}`);
}

// ===========================================================================
// 16. contradiction-based tally — real historical-data path (no P2 instrumentation needed)
// ===========================================================================
{
  const rows = [traceRow({ decision: "WAIT", contradictions: [contradiction(["liquidity", "market_structure"]), contradiction(["macro", "market_structure"])] })];
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", rows, true);
  check("16a. contradictionStatus OBSERVED, recordedCycles 1", report.contradictionStatus === "OBSERVED" && report.contradictionRecordedCycles === 1, JSON.stringify(report));
  check("16b. market_structure occurs in both contradictions -> occurrenceCount 2", sourceTally(report, "contradictionSources", "market_structure").occurrenceCount === 2, JSON.stringify(sourceTally(report, "contradictionSources", "market_structure")));
  check("16c. liquidity and macro each occur once", sourceTally(report, "contradictionSources", "liquidity").occurrenceCount === 1 && sourceTally(report, "contradictionSources", "macro").occurrenceCount === 1, JSON.stringify(report.contradictionSources));
  check("16d. contradiction tallies have null direction/quality (no such dimension for this provenance)", sourceTally(report, "contradictionSources", "market_structure").directionCounts === null && sourceTally(report, "contradictionSources", "market_structure").qualityCounts === null, JSON.stringify(sourceTally(report, "contradictionSources", "market_structure")));
}

// ===========================================================================
// 17. empty dataset
// ===========================================================================
{
  const report = deriveConfluenceAttribution("ELVOID_PRO_ORACLE", "BTCUSDT", [], true);
  check("17. empty dataset -> zero everywhere, no throw", report.dataQuality.rawTraceCount === 0 && report.dataQuality.cyclesInScope === 0 && report.evidenceStatus === "NOT_RECORDED" && report.contradictionStatus === "NOT_RECORDED" && report.windowStart === null, JSON.stringify(report));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
