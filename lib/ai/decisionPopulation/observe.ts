// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Population Observation, pure aggregation
// (Phase 8.6 P1)
//
// Pure, deterministic, synchronous functions only. Zero database/network/
// LLM/fetch calls, zero Date.now()/timestamp generation, zero randomness —
// mirrors lib/ai/failurePatterns/detect.ts's and
// lib/ai/selfPerformance/aggregate.ts's own discipline exactly. Takes an
// already-fetched `readonly RuntimeEventRecord[]` (from
// lib/ai/runtimeEvents/repository.ts's listRuntimeEvents()) and derives a
// DecisionPopulationReport for exactly ONE (source, symbol) pair — never
// pools across sources or symbols, never mutates its input.
//
// Every `runtime_events` row this module reads is itself a Phase 8.5
// best-effort, fire-and-forget write (see emit.ts) — a row can be missing
// (Learning DB hiccup during that one cycle) without that meaning anything
// about the cycle itself. This module counts what IS there; it never
// treats a gap in `runtime_events` as evidence of anything.
// ---------------------------------------------------------------------------

import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { RuntimeEventRecord } from "@/lib/ai/runtimeEvents/repository";
import type {
  DecisionSource,
  ObservedDecision,
  ObservedQualificationStatus,
  ObservedPreEntryStatus,
  ObservedSide,
  DecisionPathAttribution,
  ObservedDecisionCounts,
  QualificationStatusCounts,
  PreEntryStatusCounts,
  SideCounts,
  DecisionPathAttributionCounts,
  DecisionPopulationCoverageStatus,
  DecisionPopulationDataQuality,
  DecisionPopulationReport,
} from "./contracts";

const OBSERVED_DECISIONS: readonly ObservedDecision[] = ["EXECUTE", "WAIT", "REJECT"];
const QUALIFICATION_STATUSES: readonly ObservedQualificationStatus[] = ["QUALIFIED", "CAUTION", "CONFLICTED", "INSUFFICIENT_CONTEXT", "UNKNOWN"];
const PRE_ENTRY_STATUSES: readonly ObservedPreEntryStatus[] = ["VALID", "CAUTION", "BLOCKED", "INSUFFICIENT_CONTEXT", "UNKNOWN"];
const SIDES: readonly ObservedSide[] = ["LONG", "SHORT", "UNKNOWN"];
const PATH_ATTRIBUTIONS: readonly DecisionPathAttribution[] = ["EXECUTED", "LEARNING_MEMORY_REJECTION", "MARKET_CONTEXT_REJECTION", "INSUFFICIENT_CONTEXT", "RISK_OR_CONSTRAINT_CAUTION", "MARKET_CONTEXT_CAUTION", "OTHER_OBSERVABLE_PATH", "UNKNOWN"];

/** Every member starts at exactly 0 — never omitted, matching `selfPerformance/aggregate.ts::zeroedCounts()` verbatim (duplicated here rather than imported, since importing a helper from a sibling Phase 8.6.1 module for a one-line generic would be a heavier coupling than the helper itself). */
function zeroedCounts<T extends string>(members: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const member of members) counts[member] = 0;
  return counts;
}

/** `true` only for a plain, non-array JS object — guards every parse function below against `metadata` being `null`, an array, or a primitive. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `metadata.decision` (or `metadata.rawDecision`) validated against the 3-member closed set. `undefined` (not `"UNKNOWN"`) when the raw value itself is not one of the 3 — the caller decides what that means (a row this loosely-typed cannot itself be trusted as a real cycle; see `parseRow()`). */
function parseObservedDecision(value: unknown): ObservedDecision | undefined {
  return typeof value === "string" && (OBSERVED_DECISIONS as readonly string[]).includes(value) ? (value as ObservedDecision) : undefined;
}

/** `metadata.qualificationStatus` validated against `QualificationStatus`'s 4-member closed set (`lib/ai/decisionQualification/contracts.ts`) — `"UNKNOWN"` for anything else, never a fabricated default. */
export function parseObservedQualificationStatus(value: unknown): ObservedQualificationStatus {
  const known: readonly string[] = ["QUALIFIED", "CAUTION", "CONFLICTED", "INSUFFICIENT_CONTEXT"];
  return typeof value === "string" && known.includes(value) ? (value as ObservedQualificationStatus) : "UNKNOWN";
}

/** `metadata.preEntryStatus` validated against `PreEntryValidationStatus`'s 4-member closed set (`lib/ai/preEntryValidation/contracts.ts`) — `"UNKNOWN"` for anything else. */
export function parseObservedPreEntryStatus(value: unknown): ObservedPreEntryStatus {
  const known: readonly string[] = ["VALID", "CAUTION", "BLOCKED", "INSUFFICIENT_CONTEXT"];
  return typeof value === "string" && known.includes(value) ? (value as ObservedPreEntryStatus) : "UNKNOWN";
}

/** `metadata.side` — `"LONG"`/`"SHORT"` pass through; a real, persisted `null` (no directional bias established) and anything unparseable both resolve to `"UNKNOWN"` — see `ObservedSide`'s own doc comment for why the two are not distinguished further. */
export function parseObservedSide(value: unknown): ObservedSide {
  return value === "LONG" || value === "SHORT" ? value : "UNKNOWN";
}

/**
 * See `DecisionPathAttribution`'s own doc comment (contracts.ts) for the
 * full, documented mapping this function implements verbatim — a
 * structural deduction from `lib/ai/autonomousDecision/decide.ts`'s and
 * `lib/ai/preEntryValidation/validate.ts`'s own unchanged branch logic,
 * never an inference from row ordering/sequence. Returns `"UNKNOWN"`
 * whenever either input status is itself `"UNKNOWN"` — attribution is
 * never guessed from a decision alone.
 */
export function attributeDecisionPath(decision: ObservedDecision, qualificationStatus: ObservedQualificationStatus, preEntryStatus: ObservedPreEntryStatus): DecisionPathAttribution {
  if (decision === "EXECUTE") return "EXECUTED";
  if (qualificationStatus === "UNKNOWN" || preEntryStatus === "UNKNOWN") return "UNKNOWN";

  if (decision === "REJECT") {
    if (qualificationStatus === "CONFLICTED") return "LEARNING_MEMORY_REJECTION";
    if (preEntryStatus === "BLOCKED") return "MARKET_CONTEXT_REJECTION";
    return "OTHER_OBSERVABLE_PATH"; // decide.ts's own logic makes this combination unreachable today — reported honestly rather than silently assumed impossible.
  }

  // decision === "WAIT"
  if (qualificationStatus === "INSUFFICIENT_CONTEXT" || preEntryStatus === "INSUFFICIENT_CONTEXT") return "INSUFFICIENT_CONTEXT";
  if (qualificationStatus === "CAUTION") return "RISK_OR_CONSTRAINT_CAUTION";
  if (preEntryStatus === "CAUTION") return "MARKET_CONTEXT_CAUTION";
  return "OTHER_OBSERVABLE_PATH";
}

interface ParsedCycle {
  readonly decision: ObservedDecision;
  readonly qualificationStatus: ObservedQualificationStatus;
  readonly preEntryStatus: ObservedPreEntryStatus;
  readonly side: ObservedSide;
  readonly dedupDowngraded: boolean;
  readonly pathAttribution: DecisionPathAttribution;
  readonly observedAt: string;
}

/**
 * One `RuntimeEventRecord` -> `ParsedCycle`, or `null` if the row cannot
 * be trusted as a cycle at all (non-`DECISION` component, or `metadata`
 * itself is not a plain object, or `metadata.decision` does not parse to
 * one of the 3 real outcomes — a row this malformed is excluded from
 * every count, not zero-filled; see `DecisionPopulationDataQuality.unparseableRowCount`).
 */
function parseRow(row: RuntimeEventRecord): ParsedCycle | null {
  if (row.component !== "DECISION") return null;
  const metadata = row.metadata;
  if (!isPlainObject(metadata)) return null;

  const decision = parseObservedDecision(metadata.decision);
  if (decision === undefined) return null;

  const qualificationStatus = parseObservedQualificationStatus(metadata.qualificationStatus);
  const preEntryStatus = parseObservedPreEntryStatus(metadata.preEntryStatus);
  const side = parseObservedSide(metadata.side);
  // dedupApplied is already a real boolean the orchestrator itself computed
  // (Step 6, orchestrator.ts) — read verbatim, never re-derived from
  // decision/rawDecision here.
  const dedupDowngraded = metadata.dedupApplied === true;

  return {
    decision,
    qualificationStatus,
    preEntryStatus,
    side,
    dedupDowngraded,
    pathAttribution: attributeDecisionPath(decision, qualificationStatus, preEntryStatus),
    observedAt: row.startedAt,
  };
}

/**
 * Derives a `DecisionPopulationReport` for exactly one (source, symbol)
 * pair from an already-fetched, already-symbol-scoped `events` array
 * (the caller — `repository.ts` — is expected to have already queried
 * `{symbol, components: ["DECISION"]}`; this function also filters
 * defensively by `component === "DECISION"` itself inside `parseRow()`,
 * matching `selfPerformance`/`cognitiveGap`'s own `isInScope()`
 * precedent of never trusting a caller's pre-filtering alone).
 *
 * `evaluatedExperienceCount` is passed straight through into
 * `dataQuality` — see that field's own doc comment (contracts.ts) — and
 * is never computed here.
 */
export function observeDecisionPopulation(source: DecisionSource, symbol: string, events: readonly RuntimeEventRecord[], learningDbConfigured: boolean, evaluatedExperienceCount: number | null): DecisionPopulationReport {
  const scoped = events.filter((row) => row.symbol === symbol);
  const rawEventCount = scoped.length;

  const parsed: ParsedCycle[] = [];
  let unparseableRowCount = 0;
  for (const row of scoped) {
    const cycle = parseRow(row);
    if (cycle === null) unparseableRowCount++;
    else parsed.push(cycle);
  }

  const decisionCounts: Record<ObservedDecision, number> = zeroedCounts(OBSERVED_DECISIONS);
  const qualificationDistribution: Record<ObservedQualificationStatus, number> = zeroedCounts(QUALIFICATION_STATUSES);
  const preEntryDistribution: Record<ObservedPreEntryStatus, number> = zeroedCounts(PRE_ENTRY_STATUSES);
  const sideDistribution: Record<ObservedSide, number> = zeroedCounts(SIDES);
  const decisionPathAttribution: Record<DecisionPathAttribution, number> = zeroedCounts(PATH_ATTRIBUTIONS);
  let dedupDowngradedCount = 0;
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let unknownStatusCount = 0;

  for (const cycle of parsed) {
    decisionCounts[cycle.decision]++;
    qualificationDistribution[cycle.qualificationStatus]++;
    preEntryDistribution[cycle.preEntryStatus]++;
    sideDistribution[cycle.side]++;
    decisionPathAttribution[cycle.pathAttribution]++;
    if (cycle.dedupDowngraded) dedupDowngradedCount++;
    if (cycle.qualificationStatus === "UNKNOWN" || cycle.preEntryStatus === "UNKNOWN") unknownStatusCount++;
    if (windowStart === null || cycle.observedAt < windowStart) windowStart = cycle.observedAt;
    if (windowEnd === null || cycle.observedAt > windowEnd) windowEnd = cycle.observedAt;
  }

  const totalCycles = parsed.length;
  const observationCoverage: DecisionPopulationCoverageStatus = totalCycles < MIN_OCCURRENCE_COUNT ? "INSUFFICIENT_DATA" : unknownStatusCount > 0 ? "PARTIAL" : "COMPLETE";

  const dataQuality: DecisionPopulationDataQuality = {
    learningDbConfigured,
    rawEventCount,
    parsedCycleCount: totalCycles,
    unparseableRowCount,
    evaluatedExperienceCount,
  };

  return {
    source,
    symbol,
    windowStart,
    windowEnd,
    totalCycles,
    decisionCounts,
    qualificationDistribution,
    preEntryDistribution,
    sideDistribution,
    decisionPathAttribution,
    dedupDowngradedCount,
    observationCoverage,
    dataQuality,
  };
}
