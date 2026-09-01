// ---------------------------------------------------------------------------
// ELVOID Intelligence — Macro Intelligence Integration (Phase 8.2.3)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` / `Math.random()` anywhere in this file — every
// "now" this module ever computes against is `input.asOf`, supplied by the
// caller. Zero imports from `lib/ai/oracle/*`, `lib/ai/cognitive/*`,
// the Phase 8.2.0 autonomous-context module, `lib/ai/decisionQualification/*`,
// `lib/ai/decisionTrace/*`, `lib/elvoid/*`, or `lib/supabase.ts`. This file
// depends ONLY on the plain `MacroIntelligenceInput` it is given, plus
// `Date.parse` for interpreting the ISO date strings already inside that
// input — never a live clock read.
//
// THIS IS NOT ORACLE GRADING, QUALIFICATION, OR DECISION LOGIC.
// `analyzeMacroIntelligence()` never touches `grade`/`confidence`/`side`/
// `riskStatus`/entry/stopLoss/takeProfit, never selects EXECUTE/WAIT/
// REJECT, and never executes a paper trade. It answers exactly one
// question — "what does the already-fetched economic calendar, viewed
// relative to `asOf`, structurally look like" — and nothing else. Its
// output is advisory context only, for a later, separately-approved phase
// to read.
//
// `lib/intelligence/macroKnowledge.ts` (general textbook cause->effect
// pairings) is deliberately never imported here. That module is UI-facing
// "why it matters" copy, not live market-reaction data, and using it to
// populate `directionalBias` would fabricate a directional call this
// phase's own upstream data does not support — see `contracts.ts`'s
// header for the full honesty rule this file follows.
// ---------------------------------------------------------------------------

import {
  MACRO_PROXIMITY_IMMINENT_HOURS,
  MACRO_PROXIMITY_NEAR_HOURS,
  MACRO_PROXIMITY_UPCOMING_HOURS,
} from "./contracts";
import type {
  EconomicEvent,
  MacroDataAvailability,
  MacroEventProximityBucket,
  MacroEventRiskLevel,
  MacroIntelligenceContext,
  MacroIntelligenceInput,
  MacroRegime,
  MacroUpcomingHighImpactEvent,
} from "./contracts";

const CLOSED_IMPACT_VALUES: ReadonlySet<EconomicEvent["impact"]> = new Set(["high", "medium", "low"]);

/**
 * Pure, deterministic — no wall-clock read. `Date.parse` on a fixed input
 * string always yields the same result for the same string; this is
 * string interpretation, not a live clock read.
 */
function parseEventTimeMs(dateIso: string): number | null {
  const ms = Date.parse(dateIso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A calendar entry is usable when its `date` parses to a finite instant,
 * its `impact` is one of the three closed values, and its `title` is a
 * non-empty string. Anything else (missing timestamp, malformed impact,
 * blank title) is honestly excluded rather than coerced into a guess —
 * see `contracts.ts`'s `MacroDataAvailability` doc comment.
 */
function isUsableEvent(event: EconomicEvent): boolean {
  return parseEventTimeMs(event.date) !== null && CLOSED_IMPACT_VALUES.has(event.impact) && event.title.trim().length > 0;
}

/**
 * `(eventTimeMs - asOfMs) / 1 hour`. Pure arithmetic over two already-
 * parsed instants — no wall-clock read.
 */
function hoursBetween(eventTimeMs: number, asOfMs: number): number {
  return (eventTimeMs - asOfMs) / 3_600_000;
}

/**
 * Closed proximity classification for any `hoursAway` value. Boundaries
 * are inclusive on the nearer bucket (`<=` throughout), matching
 * `learningValidation/validate.ts`'s own "at-boundary counts as within"
 * convention for its freshness-window check.
 */
function classifyProximity(hoursAway: number): MacroEventProximityBucket {
  if (hoursAway < 0) return "PAST";
  if (hoursAway <= MACRO_PROXIMITY_IMMINENT_HOURS) return "IMMINENT";
  if (hoursAway <= MACRO_PROXIMITY_NEAR_HOURS) return "NEAR";
  if (hoursAway <= MACRO_PROXIMITY_UPCOMING_HOURS) return "UPCOMING";
  return "DISTANT";
}

/** Returns a fresh array of only the usable entries — never mutates `calendar` or its entries. */
function filterUsableEvents(calendar: readonly EconomicEvent[]): EconomicEvent[] {
  return calendar.filter(isUsableEvent);
}

function computeDataAvailability(totalCount: number, usableCount: number): MacroDataAvailability {
  if (totalCount === 0) return "UNAVAILABLE";
  if (usableCount === 0) return "UNAVAILABLE";
  if (usableCount < totalCount) return "PARTIAL";
  return "AVAILABLE";
}

/**
 * Deterministic selection of the single nearest usable, FUTURE
 * (`hoursAway >= 0`), high-impact event. Ties (identical `hoursAway`) are
 * broken by ascending `title` — a stable, explicit tiebreak so the result
 * never depends on the input array's original ordering or on any
 * particular JS engine's sort stability guarantees. Returns `null` when
 * no usable future high-impact event exists.
 */
function selectNearestUpcomingHighImpact(usableEvents: readonly EconomicEvent[], asOfMs: number): MacroUpcomingHighImpactEvent | null {
  const candidates = usableEvents
    .filter((e) => e.impact === "high")
    .map((e) => {
      const eventTimeMs = parseEventTimeMs(e.date)!; // safe: usableEvents already passed isUsableEvent()
      return { event: e, hoursAway: hoursBetween(eventTimeMs, asOfMs) };
    })
    .filter((c) => c.hoursAway >= 0)
    .sort((a, b) => a.hoursAway - b.hoursAway || a.event.title.localeCompare(b.event.title));

  const nearest = candidates[0];
  if (!nearest) return null;

  return {
    title: nearest.event.title,
    date: nearest.event.date,
    impact: "high",
    hoursAway: nearest.hoursAway,
    proximity: classifyProximity(nearest.hoursAway),
  };
}

/** Count of usable, FUTURE, high-impact events whose `hoursAway` falls within `[0, windowHours]` — the input `macroRegime`'s density read is based on. */
function countUpcomingHighImpactWithinWindow(usableEvents: readonly EconomicEvent[], asOfMs: number, windowHours: number): number {
  return usableEvents.filter((e) => {
    if (e.impact !== "high") return false;
    const eventTimeMs = parseEventTimeMs(e.date)!; // safe: usableEvents already passed isUsableEvent()
    const hoursAway = hoursBetween(eventTimeMs, asOfMs);
    return hoursAway >= 0 && hoursAway <= windowHours;
  }).length;
}

function computeMacroRegime(dataAvailability: MacroDataAvailability, countInWindow: number): MacroRegime {
  if (dataAvailability === "UNAVAILABLE") return "UNKNOWN";
  if (countInWindow >= 2) return "EVENT_HEAVY";
  if (countInWindow === 1) return "EVENT_LIGHT";
  return "QUIET";
}

function computeEventRisk(dataAvailability: MacroDataAvailability, proximity: MacroEventProximityBucket): MacroEventRiskLevel {
  if (dataAvailability === "UNAVAILABLE") return "UNKNOWN";
  switch (proximity) {
    case "IMMINENT":
    case "NEAR":
      return "ELEVATED";
    case "UPCOMING":
      return "MODERATE";
    case "DISTANT":
      return "LOW";
    case "PAST":
    case "UNKNOWN":
      return "NONE";
  }
}

/**
 * Pure, deterministic, synchronous. The same `input` always produces a
 * byte-identical `MacroIntelligenceContext`. Never mutates `input` or
 * anything nested inside it (`input.calendar` and its entries are only
 * ever read). Holds no state across calls.
 *
 * `generatedAt` is `input.asOf`, copied verbatim — never a fresh
 * `Date.now()` read. `directionalBias` is always `null` in this phase —
 * see `contracts.ts`'s header for why.
 */
export function analyzeMacroIntelligence(input: MacroIntelligenceInput): MacroIntelligenceContext {
  const asOfMs = parseEventTimeMs(input.asOf);
  const totalEventCount = input.calendar.length;
  const usableEvents = asOfMs !== null ? filterUsableEvents(input.calendar) : [];
  const usableEventCount = usableEvents.length;

  const dataAvailability = computeDataAvailability(totalEventCount, usableEventCount);

  const upcomingHighImpactEvent =
    dataAvailability !== "UNAVAILABLE" && asOfMs !== null ? selectNearestUpcomingHighImpact(usableEvents, asOfMs) : null;

  const eventProximity: MacroEventProximityBucket = upcomingHighImpactEvent?.proximity ?? "UNKNOWN";

  const countInWindow =
    dataAvailability !== "UNAVAILABLE" && asOfMs !== null
      ? countUpcomingHighImpactWithinWindow(usableEvents, asOfMs, MACRO_PROXIMITY_UPCOMING_HOURS)
      : 0;

  return {
    version: 1,
    generatedAt: input.asOf,
    dataAvailability,
    usableEventCount,
    totalEventCount,
    macroRegime: computeMacroRegime(dataAvailability, countInWindow),
    eventRisk: computeEventRisk(dataAvailability, eventProximity),
    eventProximity,
    upcomingHighImpactEvent,
    directionalBias: null,
  };
}
