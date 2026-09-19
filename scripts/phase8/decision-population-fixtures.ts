// ---------------------------------------------------------------------------
// Phase 8.6 P1 — Decision Population Observation fixtures (dev-only, not
// part of the app). Pure/offline — hand-built `RuntimeEventRecord`
// fixtures exercised against `observe.ts`'s pure `observeDecisionPopulation()`
// (and its parse/attribution helpers), plus `detectPopulationGap.ts`'s
// pure `detectDecisionPopulationGap()`. Neither has any repository/
// persistence layer of its own in this file's scope — `repository.ts`'s
// one DB-touching function (`fetchDecisionPopulationReport`) is a thin
// wrapper over already-fixture-tested `listRuntimeEvents()` (Phase 8.5)
// and the pure functions this script exercises directly; it is not
// separately re-tested here, matching every prior phase's "the
// repository wrapper needs a live DB, the pure logic underneath it is
// what fixtures cover" convention.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-population-fixtures.ts
// ---------------------------------------------------------------------------

import { observeDecisionPopulation, parseObservedQualificationStatus, parseObservedPreEntryStatus, parseObservedSide, attributeDecisionPath } from "@/lib/ai/decisionPopulation/observe";
import type { DecisionPopulationReport } from "@/lib/ai/decisionPopulation/contracts";
import type { RuntimeEventRecord, RuntimeEventComponent, RuntimeEventStatus } from "@/lib/ai/runtimeEvents/repository";
import { detectDecisionPopulationGap, REJECT_DOMINANCE_SHARE_THRESHOLD } from "@/lib/ai/cognitiveGap/detectPopulationGap";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";

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

function decisionEvent(overrides: {
  symbol?: string;
  decision?: "EXECUTE" | "WAIT" | "REJECT";
  rawDecision?: "EXECUTE" | "WAIT" | "REJECT";
  side?: "LONG" | "SHORT" | null;
  dedupApplied?: boolean;
  qualificationStatus?: string;
  preEntryStatus?: string;
  /** True omits the `qualificationStatus` key from `metadata` entirely (distinct from passing an explicit value) — exercises `parseObservedQualificationStatus(undefined)`'s real "key absent" path rather than a builder-supplied default. */
  omitQualificationStatus?: boolean;
  /** Same idea as `omitQualificationStatus`, for `preEntryStatus`. */
  omitPreEntryStatus?: boolean;
  startedAt?: string;
  metadataOverride?: Record<string, unknown> | null;
} = {}): RuntimeEventRecord {
  const decision = overrides.decision ?? "WAIT";
  let metadata: Record<string, unknown> | null;
  if (overrides.metadataOverride !== undefined) {
    metadata = overrides.metadataOverride;
  } else {
    metadata = {
      decision,
      rawDecision: overrides.rawDecision ?? decision,
      side: overrides.side === undefined ? "LONG" : overrides.side,
      dedupApplied: overrides.dedupApplied ?? false,
    };
    if (!overrides.omitQualificationStatus) {
      metadata.qualificationStatus = overrides.qualificationStatus ?? (decision === "EXECUTE" ? "QUALIFIED" : "CAUTION");
    }
    if (!overrides.omitPreEntryStatus) {
      metadata.preEntryStatus = overrides.preEntryStatus ?? (decision === "EXECUTE" ? "VALID" : "CAUTION");
    }
  }

  return {
    id: nextId("evt"),
    cycleId: nextId("cycle"),
    symbol: overrides.symbol ?? "BTCUSDT",
    component: "DECISION" as RuntimeEventComponent,
    operation: "decideAutonomous",
    status: (decision === "EXECUTE" ? "SUCCESS" : decision === "REJECT" ? "REJECT" : "WAIT") as RuntimeEventStatus,
    startedAt: overrides.startedAt ?? "2026-02-01T00:00:00.000Z",
    completedAt: overrides.startedAt ?? "2026-02-01T00:00:00.000Z",
    durationMs: 5,
    sequence: idCounter,
    message: null,
    metadata,
    createdAt: overrides.startedAt ?? "2026-02-01T00:00:00.000Z",
  };
}

function nOf(count: number, build: (i: number) => RuntimeEventRecord): RuntimeEventRecord[] {
  return Array.from({ length: count }, (_, i) => build(i));
}

// ===========================================================================
// 1. attributeDecisionPath — direct unit coverage of every branch
// ===========================================================================
check("1a. EXECUTE -> EXECUTED regardless of statuses", attributeDecisionPath("EXECUTE", "CONFLICTED", "BLOCKED") === "EXECUTED", "mismatch");
check("1b. REJECT + CONFLICTED -> LEARNING_MEMORY_REJECTION", attributeDecisionPath("REJECT", "CONFLICTED", "VALID") === "LEARNING_MEMORY_REJECTION", "mismatch");
check("1c. REJECT + not CONFLICTED + BLOCKED -> MARKET_CONTEXT_REJECTION", attributeDecisionPath("REJECT", "QUALIFIED", "BLOCKED") === "MARKET_CONTEXT_REJECTION", "mismatch");
check("1d. REJECT + neither -> OTHER_OBSERVABLE_PATH (decide.ts makes this unreachable in production, reported honestly here)", attributeDecisionPath("REJECT", "QUALIFIED", "VALID") === "OTHER_OBSERVABLE_PATH", "mismatch");
check("1e. WAIT + INSUFFICIENT_CONTEXT (qualification) -> INSUFFICIENT_CONTEXT", attributeDecisionPath("WAIT", "INSUFFICIENT_CONTEXT", "VALID") === "INSUFFICIENT_CONTEXT", "mismatch");
check("1f. WAIT + INSUFFICIENT_CONTEXT (preEntry) -> INSUFFICIENT_CONTEXT", attributeDecisionPath("WAIT", "QUALIFIED", "INSUFFICIENT_CONTEXT") === "INSUFFICIENT_CONTEXT", "mismatch");
check("1g. WAIT + qualification CAUTION -> RISK_OR_CONSTRAINT_CAUTION", attributeDecisionPath("WAIT", "CAUTION", "VALID") === "RISK_OR_CONSTRAINT_CAUTION", "mismatch");
check("1h. WAIT + qualification QUALIFIED + preEntry CAUTION -> MARKET_CONTEXT_CAUTION", attributeDecisionPath("WAIT", "QUALIFIED", "CAUTION") === "MARKET_CONTEXT_CAUTION", "mismatch");
check("1i. either status UNKNOWN -> UNKNOWN, never guessed", attributeDecisionPath("REJECT", "UNKNOWN", "BLOCKED") === "UNKNOWN" && attributeDecisionPath("WAIT", "CAUTION", "UNKNOWN") === "UNKNOWN", "mismatch");

// ===========================================================================
// 2. parse* — malformed/missing values resolve to UNKNOWN, never a fabricated default
// ===========================================================================
check("2a. parseObservedQualificationStatus: valid value passes through", parseObservedQualificationStatus("CONFLICTED") === "CONFLICTED", "mismatch");
check("2b. parseObservedQualificationStatus: unknown string -> UNKNOWN", parseObservedQualificationStatus("SOMETHING_ELSE") === "UNKNOWN", "mismatch");
check("2c. parseObservedQualificationStatus: undefined -> UNKNOWN", parseObservedQualificationStatus(undefined) === "UNKNOWN", "mismatch");
check("2d. parseObservedQualificationStatus: number -> UNKNOWN (wrong type)", parseObservedQualificationStatus(42) === "UNKNOWN", "mismatch");
check("2e. parseObservedPreEntryStatus: valid value passes through", parseObservedPreEntryStatus("BLOCKED") === "BLOCKED", "mismatch");
check("2f. parseObservedPreEntryStatus: malformed -> UNKNOWN", parseObservedPreEntryStatus({}) === "UNKNOWN", "mismatch");
check("2g. parseObservedSide: LONG/SHORT pass through", parseObservedSide("LONG") === "LONG" && parseObservedSide("SHORT") === "SHORT", "mismatch");
check("2h. parseObservedSide: null (real, persisted 'no side yet') -> UNKNOWN", parseObservedSide(null) === "UNKNOWN", "mismatch");

// ===========================================================================
// 3. observeDecisionPopulation — population-level cases (task's minimum matrix)
// ===========================================================================

// --- 3a. all EXECUTE ---
{
  const events = nOf(MIN_OCCURRENCE_COUNT, () => decisionEvent({ decision: "EXECUTE" }));
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3a. all EXECUTE -> decisionCounts.EXECUTE === total, REJECT/WAIT === 0", report.decisionCounts.EXECUTE === MIN_OCCURRENCE_COUNT && report.decisionCounts.WAIT === 0 && report.decisionCounts.REJECT === 0, JSON.stringify(report.decisionCounts));
}

// --- 3b. all WAIT ---
{
  const events = nOf(MIN_OCCURRENCE_COUNT, () => decisionEvent({ decision: "WAIT" }));
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3b. all WAIT -> decisionCounts.WAIT === total", report.decisionCounts.WAIT === MIN_OCCURRENCE_COUNT && report.decisionCounts.EXECUTE === 0 && report.decisionCounts.REJECT === 0, JSON.stringify(report.decisionCounts));
}

// --- 3c. all REJECT ---
{
  const events = nOf(MIN_OCCURRENCE_COUNT, () => decisionEvent({ decision: "REJECT", qualificationStatus: "CONFLICTED" }));
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3c. all REJECT -> decisionCounts.REJECT === total, all LEARNING_MEMORY_REJECTION", report.decisionCounts.REJECT === MIN_OCCURRENCE_COUNT && report.decisionPathAttribution.LEARNING_MEMORY_REJECTION === MIN_OCCURRENCE_COUNT, JSON.stringify(report.decisionPathAttribution));
}

// --- 3d. mixed population ---
{
  const events = [
    ...nOf(3, () => decisionEvent({ decision: "EXECUTE" })),
    ...nOf(4, () => decisionEvent({ decision: "WAIT" })),
    ...nOf(5, () => decisionEvent({ decision: "REJECT", qualificationStatus: "CONFLICTED" })),
  ];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3d. mixed population -> totalCycles === sum, each count matches", report.totalCycles === 12 && report.decisionCounts.EXECUTE === 3 && report.decisionCounts.WAIT === 4 && report.decisionCounts.REJECT === 5, JSON.stringify(report));
}

// --- 3e. missing decision stage (metadata present, "decision" key absent) -> row excluded entirely, never zero-filled or fabricated ---
{
  const events = [decisionEvent({ metadataOverride: { qualificationStatus: "CONFLICTED", preEntryStatus: "BLOCKED" } }), decisionEvent({ decision: "WAIT" })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3e. row with no metadata.decision -> excluded (unparseableRowCount 1, totalCycles 1)", report.dataQuality.unparseableRowCount === 1 && report.totalCycles === 1 && report.dataQuality.rawEventCount === 2, JSON.stringify(report.dataQuality));
}

// --- 3f. missing qualification (decision present, qualificationStatus key absent from metadata) -> counted as UNKNOWN, row still counted ---
{
  const events = [decisionEvent({ decision: "REJECT", omitQualificationStatus: true, preEntryStatus: "BLOCKED" })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3f. missing qualificationStatus -> UNKNOWN, cycle still counted, path UNKNOWN", report.qualificationDistribution.UNKNOWN === 1 && report.totalCycles === 1 && report.decisionPathAttribution.UNKNOWN === 1, JSON.stringify(report));
}

// --- 3g. missing pre-entry ---
{
  const events = [decisionEvent({ decision: "WAIT", qualificationStatus: "QUALIFIED", omitPreEntryStatus: true })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3g. missing preEntryStatus -> UNKNOWN, cycle still counted", report.preEntryDistribution.UNKNOWN === 1 && report.totalCycles === 1, JSON.stringify(report));
}

// --- 3h. unknown reason (both statuses parse, combination unmapped) ---
{
  const events = [decisionEvent({ decision: "REJECT", qualificationStatus: "QUALIFIED", preEntryStatus: "VALID" })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3h. REJECT with no matching rule -> OTHER_OBSERVABLE_PATH, not silently dropped", report.decisionPathAttribution.OTHER_OBSERVABLE_PATH === 1, JSON.stringify(report.decisionPathAttribution));
}

// --- 3i. symbol isolation ---
{
  const events = [...nOf(3, () => decisionEvent({ symbol: "BTCUSDT", decision: "REJECT", qualificationStatus: "CONFLICTED" })), ...nOf(5, () => decisionEvent({ symbol: "ETHUSDT", decision: "REJECT", qualificationStatus: "CONFLICTED" }))];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3i. symbol isolation -> only BTCUSDT rows counted, ETHUSDT excluded even though pre-fetched together", report.totalCycles === 3 && report.dataQuality.rawEventCount === 3, JSON.stringify(report.dataQuality));
}

// --- 3j. side breakdown ("side isolation" — side is a within-report breakdown dimension, not a second scope filter; see contracts.ts) ---
{
  const events = [...nOf(2, () => decisionEvent({ side: "LONG" })), ...nOf(3, () => decisionEvent({ side: "SHORT" })), decisionEvent({ side: null })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3j. side breakdown -> LONG 2, SHORT 3, UNKNOWN 1 (null side)", report.sideDistribution.LONG === 2 && report.sideDistribution.SHORT === 3 && report.sideDistribution.UNKNOWN === 1, JSON.stringify(report.sideDistribution));
}

// --- 3k. empty dataset ---
{
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", [], true, null);
  check("3k. empty dataset -> totalCycles 0, observationCoverage INSUFFICIENT_DATA, no throw", report.totalCycles === 0 && report.observationCoverage === "INSUFFICIENT_DATA" && report.windowStart === null && report.windowEnd === null, JSON.stringify(report));
}

// --- 3l. partial observation (enough volume, some rows UNKNOWN) ---
{
  const events = [...nOf(MIN_OCCURRENCE_COUNT, () => decisionEvent({ decision: "WAIT" })), decisionEvent({ decision: "REJECT", omitQualificationStatus: true, preEntryStatus: "BLOCKED" })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check(`3l. ${MIN_OCCURRENCE_COUNT + 1} parsed cycles, 1 with UNKNOWN status -> PARTIAL`, report.observationCoverage === "PARTIAL", `got ${report.observationCoverage}`);
}

// --- 3m. below MIN_OCCURRENCE_COUNT -> INSUFFICIENT_DATA even with clean data ---
{
  const events = nOf(MIN_OCCURRENCE_COUNT - 1, () => decisionEvent({ decision: "WAIT" }));
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check(`3m. ${MIN_OCCURRENCE_COUNT - 1} clean cycles (below MIN_OCCURRENCE_COUNT) -> INSUFFICIENT_DATA`, report.observationCoverage === "INSUFFICIENT_DATA", `got ${report.observationCoverage}`);
}

// --- 3n. full clean coverage -> COMPLETE ---
{
  const events = nOf(MIN_OCCURRENCE_COUNT, () => decisionEvent({ decision: "WAIT" }));
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check(`3n. ${MIN_OCCURRENCE_COUNT} clean cycles, zero UNKNOWN -> COMPLETE`, report.observationCoverage === "COMPLETE", `got ${report.observationCoverage}`);
}

// --- 3o. dedup downgrade counted ---
{
  const events = [decisionEvent({ decision: "WAIT", rawDecision: "EXECUTE", dedupApplied: true }), decisionEvent({ decision: "WAIT", dedupApplied: false })];
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3o. dedupDowngradedCount counts only dedupApplied:true rows", report.dedupDowngradedCount === 1 && report.decisionCounts.WAIT === 2, JSON.stringify(report));
}

// --- 3p. evaluatedExperienceCount is threaded through verbatim, never computed here ---
{
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", [], true, 17);
  check("3p. evaluatedExperienceCount passed through unchanged", report.dataQuality.evaluatedExperienceCount === 17, `got ${report.dataQuality.evaluatedExperienceCount}`);
}

// --- 3q. learningDbConfigured passed through ---
{
  const report = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", [], false, null);
  check("3q. learningDbConfigured:false passed through into dataQuality", report.dataQuality.learningDbConfigured === false, "mismatch");
}

// --- 3r. determinism + input immutability ---
{
  const events = [...nOf(3, () => decisionEvent({ decision: "REJECT", qualificationStatus: "CONFLICTED" })), ...nOf(2, () => decisionEvent({ decision: "WAIT" }))];
  const beforeSnapshot = JSON.parse(JSON.stringify(events));
  const a = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  const b = observeDecisionPopulation("ELVOID_PRO_ORACLE", "BTCUSDT", events, true, null);
  check("3r-i. same input -> byte-identical report across two calls", JSON.stringify(a) === JSON.stringify(b), "mismatch");
  check("3r-ii. input events array never mutated", JSON.stringify(events) === JSON.stringify(beforeSnapshot), "events mutated");
}

// ===========================================================================
// 4. detectDecisionPopulationGap — REJECT_DOMINANCE_GAP gate
// ===========================================================================

function populationReport(overrides: Partial<DecisionPopulationReport>): DecisionPopulationReport {
  const base: DecisionPopulationReport = {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    windowStart: "2026-01-25T00:00:00.000Z",
    windowEnd: "2026-02-01T00:00:00.000Z",
    totalCycles: 0,
    decisionCounts: { EXECUTE: 0, WAIT: 0, REJECT: 0 },
    qualificationDistribution: { QUALIFIED: 0, CAUTION: 0, CONFLICTED: 0, INSUFFICIENT_CONTEXT: 0, UNKNOWN: 0 },
    preEntryDistribution: { VALID: 0, CAUTION: 0, BLOCKED: 0, INSUFFICIENT_CONTEXT: 0, UNKNOWN: 0 },
    sideDistribution: { LONG: 0, SHORT: 0, UNKNOWN: 0 },
    decisionPathAttribution: { EXECUTED: 0, LEARNING_MEMORY_REJECTION: 0, MARKET_CONTEXT_REJECTION: 0, INSUFFICIENT_CONTEXT: 0, RISK_OR_CONSTRAINT_CAUTION: 0, MARKET_CONTEXT_CAUTION: 0, OTHER_OBSERVABLE_PATH: 0, UNKNOWN: 0 },
    dedupDowngradedCount: 0,
    observationCoverage: "COMPLETE",
    dataQuality: { learningDbConfigured: true, rawEventCount: 0, parsedCycleCount: 0, unparseableRowCount: 0, evaluatedExperienceCount: null },
  };
  return { ...base, ...overrides };
}

check("4a. null report -> []", detectDecisionPopulationGap(null).length === 0, "mismatch");
check(
  "4b. INSUFFICIENT_DATA coverage -> [] even with a high reject count",
  detectDecisionPopulationGap(populationReport({ observationCoverage: "INSUFFICIENT_DATA", totalCycles: 20, decisionCounts: { EXECUTE: 0, WAIT: 0, REJECT: 20 } })).length === 0,
  "mismatch",
);
check(
  `4c. reject count below MIN_OCCURRENCE_COUNT (${MIN_OCCURRENCE_COUNT}) even at 100% share -> []`,
  detectDecisionPopulationGap(populationReport({ totalCycles: MIN_OCCURRENCE_COUNT - 1, decisionCounts: { EXECUTE: 0, WAIT: 0, REJECT: MIN_OCCURRENCE_COUNT - 1 } })).length === 0,
  "mismatch",
);
check(
  `4d. reject share exactly at threshold (${REJECT_DOMINANCE_SHARE_THRESHOLD}) -> [] (strictly-greater gate)`,
  detectDecisionPopulationGap(populationReport({ totalCycles: 20, decisionCounts: { EXECUTE: 10, WAIT: 0, REJECT: 10 } })).length === 0,
  "mismatch",
);
{
  const gaps = detectDecisionPopulationGap(populationReport({ totalCycles: 20, decisionCounts: { EXECUTE: 3, WAIT: 6, REJECT: 11 } }));
  check("4e. reject share just above threshold + count >= MIN_OCCURRENCE_COUNT -> one REJECT_DOMINANCE_GAP", gaps.length === 1 && gaps[0]?.category === "REJECT_DOMINANCE_GAP", JSON.stringify(gaps));
  check("4f. severity MEDIUM below the high-severity share/count bars", gaps[0]?.severity === "MEDIUM", `got ${gaps[0]?.severity}`);
}
{
  const gaps = detectDecisionPopulationGap(populationReport({ totalCycles: 100, decisionCounts: { EXECUTE: 0, WAIT: 2, REJECT: 98 } }));
  check("4g. overwhelming reject share -> severity HIGH", gaps[0]?.severity === "HIGH", `got ${gaps[0]?.severity}`);
}
{
  const gaps = detectDecisionPopulationGap(
    populationReport({
      totalCycles: 12,
      decisionCounts: { EXECUTE: 0, WAIT: 0, REJECT: 10 },
      decisionPathAttribution: { EXECUTED: 0, LEARNING_MEMORY_REJECTION: 7, MARKET_CONTEXT_REJECTION: 3, INSUFFICIENT_CONTEXT: 0, RISK_OR_CONSTRAINT_CAUTION: 0, MARKET_CONTEXT_CAUTION: 0, OTHER_OBSERVABLE_PATH: 0, UNKNOWN: 0 },
    }),
  );
  check("4h. reasons cite the real attribution split (evidence-based, not a generic message)", gaps[0]?.reasons.some((r) => r.includes("7") && r.includes("LEARNING_MEMORY_REJECTION")) === true, JSON.stringify(gaps[0]?.reasons));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
