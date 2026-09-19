// ---------------------------------------------------------------------------
// ELVOID Intelligence — Confluence Attribution, pure aggregation
// (Phase 8.6 P2)
//
// Pure, deterministic, synchronous. Zero database/network/LLM/fetch
// calls, zero Date.now(), zero randomness — same discipline as
// lib/ai/decisionPopulation/observe.ts (Phase 8.6 P1). Takes an
// already-fetched `readonly CognitiveTraceRecord[]` and derives a
// ConfluenceAttributionReport for exactly ONE (source, symbol) pair —
// never pools across symbols, never mutates its input.
//
// Why this phase's derivation never needs INFERRED or UNKNOWN (see
// ConfluenceAttributionStatus's own doc comment, contracts.ts): both
// tallies read a value this codebase already writes as a closed,
// specific TypeScript shape (`NormalizedEvidence[]` /
// `ClassifiedContradiction[]`) into a controlled `jsonb` column — there
// is no free-text/loosely-typed metadata object to defensively parse
// here the way lib/ai/decisionPopulation/observe.ts had to for
// `runtime_events.metadata`. A row either has the array (OBSERVED, one
// entry per factor/contradiction) or has `null` (NOT_RECORDED — predates
// this phase, or a NO_ASSESSMENT cycle). Nothing is deduced from a
// different field, and nothing is guessed from malformed input.
// ---------------------------------------------------------------------------

import type { ConfluenceSource } from "@/lib/ai/oracle/confluenceTypes";
import type { EvidenceDirection, NormalizedEvidence } from "@/lib/ai/oracle/evidence";
import type { OracleDataQuality } from "@/lib/ai/oracle/types";
import type { ClassifiedContradiction } from "@/lib/ai/oracle/contradiction";
import type { AutonomousDecision } from "@/lib/ai/autonomousDecision/contracts";
import type { ObservedDecisionCounts } from "@/lib/ai/decisionPopulation/contracts";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { DecisionSource, ConfluenceAttributionStatus, ConfluenceSourceTally, ConfluenceAttributionReport } from "./contracts";

/** The canonical, exhaustive 8-member vocabulary — audited from `lib/ai/oracle/confluenceTypes.ts` (Phase 2) directly, never redefined. Every tally array below always has exactly these 8 entries, in this order. */
const CONFLUENCE_SOURCES: readonly ConfluenceSource[] = ["market_structure", "smc_ict", "tpo", "footprint", "orderbook", "liquidity", "microstructure", "macro"];
const DIRECTIONS: readonly EvidenceDirection[] = ["LONG", "SHORT", "NEUTRAL"];
const QUALITIES: readonly OracleDataQuality[] = ["real", "proxy", "unavailable"];
const DECISIONS: readonly AutonomousDecision[] = ["EXECUTE", "WAIT", "REJECT"];

function zeroedRecord<T extends string>(members: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const member of members) counts[member] = 0;
  return counts;
}

interface MutableTally {
  occurrenceCount: number;
  directionCounts: Record<EvidenceDirection, number> | null;
  qualityCounts: Record<OracleDataQuality, number> | null;
  decisionCounts: Record<AutonomousDecision, number>;
}

function newTally(withDirectionQuality: boolean): MutableTally {
  return {
    occurrenceCount: 0,
    directionCounts: withDirectionQuality ? zeroedRecord(DIRECTIONS) : null,
    qualityCounts: withDirectionQuality ? zeroedRecord(QUALITIES) : null,
    decisionCounts: zeroedRecord(DECISIONS),
  };
}

function freeze(source: ConfluenceSource, tally: MutableTally): ConfluenceSourceTally {
  return { source, occurrenceCount: tally.occurrenceCount, directionCounts: tally.directionCounts, qualityCounts: tally.qualityCounts, decisionCounts: tally.decisionCounts };
}

/**
 * `evidenceSources` — one pass over every in-scope row's `evidence.confluenceEvidence`
 * (Phase 8.6 P2's new field; `null` on any row that predates it or is a
 * NO_ASSESSMENT cycle — those rows simply contribute nothing here,
 * counted separately in `evidenceRecordedCycles`). A row contributes at
 * most one occurrence per source (a `ConfluenceResult` never has two
 * factors for the same source — see `ConfluenceFactor`'s own contract).
 */
function tallyEvidenceSources(rows: readonly CognitiveTraceRecord[]): { tallies: Map<ConfluenceSource, MutableTally>; recordedCycles: number } {
  const tallies = new Map<ConfluenceSource, MutableTally>(CONFLUENCE_SOURCES.map((s) => [s, newTally(true)]));
  let recordedCycles = 0;

  for (const row of rows) {
    const evidenceEntries: readonly NormalizedEvidence[] | null | undefined = row.evidence?.confluenceEvidence;
    if (!evidenceEntries) continue;
    recordedCycles++;
    const decision = row.decision?.decision ?? null;

    for (const entry of evidenceEntries) {
      const tally = tallies.get(entry.source);
      if (!tally) continue; // defensive only — entry.source is already typed ConfluenceSource, this never actually skips real data
      tally.occurrenceCount++;
      if (tally.directionCounts) tally.directionCounts[entry.direction]++;
      if (tally.qualityCounts) tally.qualityCounts[entry.quality]++;
      if (decision !== null) tally.decisionCounts[decision]++;
    }
  }

  return { tallies, recordedCycles };
}

/**
 * `contradictionSources` — one pass over every in-scope row's
 * `contradictions` (existing since Phase 8.3.5, real historical data
 * available immediately, unlike `evidenceSources` above). A single
 * `ClassifiedContradiction` can name 2+ sources (it is the disagreement
 * BETWEEN them) — every named source gets one occurrence for that
 * contradiction, since each genuinely was a party to it.
 */
function tallyContradictionSources(rows: readonly CognitiveTraceRecord[]): { tallies: Map<ConfluenceSource, MutableTally>; recordedCycles: number } {
  const tallies = new Map<ConfluenceSource, MutableTally>(CONFLUENCE_SOURCES.map((s) => [s, newTally(false)]));
  let recordedCycles = 0;

  for (const row of rows) {
    const contradictions: readonly ClassifiedContradiction[] | null = row.contradictions;
    if (contradictions === null) continue;
    recordedCycles++;
    const decision = row.decision?.decision ?? null;

    for (const contradiction of contradictions) {
      for (const source of contradiction.sources) {
        const tally = tallies.get(source);
        if (!tally) continue; // defensive only, same reasoning as tallyEvidenceSources
        tally.occurrenceCount++;
        if (decision !== null) tally.decisionCounts[decision]++;
      }
    }
  }

  return { tallies, recordedCycles };
}

function statusFor(recordedCycles: number): ConfluenceAttributionStatus {
  return recordedCycles > 0 ? "OBSERVED" : "NOT_RECORDED";
}

/**
 * Derives a `ConfluenceAttributionReport` for exactly one (source,
 * symbol) pair from an already-fetched `traces` array (the caller —
 * `repository.ts` — is expected to have already queried by symbol; this
 * function also filters defensively by `row.symbol === symbol` itself,
 * matching every prior 8.6.x module's "never trust a caller's
 * pre-filtering alone" precedent).
 */
export function deriveConfluenceAttribution(source: DecisionSource, symbol: string, traces: readonly CognitiveTraceRecord[], learningDbConfigured: boolean): ConfluenceAttributionReport {
  const scoped = traces.filter((row) => row.symbol === symbol);
  const rawTraceCount = scoped.length;

  const inScope = scoped.filter((row) => row.evidence !== null);
  const cyclesInScope = inScope.length;

  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  for (const row of inScope) {
    if (windowStart === null || row.cycleAt < windowStart) windowStart = row.cycleAt;
    if (windowEnd === null || row.cycleAt > windowEnd) windowEnd = row.cycleAt;
  }

  const { tallies: evidenceTallies, recordedCycles: evidenceRecordedCycles } = tallyEvidenceSources(inScope);
  const { tallies: contradictionTallies, recordedCycles: contradictionRecordedCycles } = tallyContradictionSources(inScope);

  return {
    source,
    symbol,
    windowStart,
    windowEnd,
    evidenceRecordedCycles,
    evidenceStatus: statusFor(evidenceRecordedCycles),
    evidenceSources: CONFLUENCE_SOURCES.map((s) => freeze(s, evidenceTallies.get(s)!)),
    contradictionRecordedCycles,
    contradictionStatus: statusFor(contradictionRecordedCycles),
    contradictionSources: CONFLUENCE_SOURCES.map((s) => freeze(s, contradictionTallies.get(s)!)),
    dataQuality: { learningDbConfigured, rawTraceCount, cyclesInScope },
  };
}
