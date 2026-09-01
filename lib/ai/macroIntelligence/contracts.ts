// ---------------------------------------------------------------------------
// ELVOID Intelligence — Macro Intelligence Integration (Phase 8.2.3)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a DOWNSTREAM, PURE ANALYSIS LAYER that transforms an already-
//     fetched economic calendar (`EconomicEvent[]`, `lib/types.ts` — the
//     exact same shared type `lib/intelligence/macroEvents.ts` already
//     consumes; no new shape invented, no new external API added) into a
//     single structured, deterministic `MacroIntelligenceContext`.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`,
//     or any decision-lifecycle/autonomous-execution/qualification path
//     (`lib/ai/decisionQualification/*`, the Phase 8.2.0 autonomous-context module,
//     `lib/ai/decisionTrace/*`). It does not touch Oracle grading,
//     confidence, side, grade, entry/SL/TP, and it never decides
//     EXECUTE/WAIT/REJECT — see `analyze.ts`'s own header for the same
//     boundary restated at the function level. It is advisory context
//     only, for a later, separately-approved phase to read.
//   - `EconomicEvent` (imported, type-only, from `@/lib/types`) is the sole
//     upstream data shape — the same one `lib/intelligence/macroEvents.ts`
//     and `lib/macro.ts` already populate from the app's existing,
//     already-approved economic-calendar feed. No new fetch, no new
//     provider, no new external API is introduced anywhere in this phase.
//   - Every timestamp in the output is either `input.asOf` copied verbatim
//     (`generatedAt`) or an `EconomicEvent.date` string copied verbatim
//     (`upcomingHighImpactEvent.date`) — never a `Date.now()` read inside
//     any pure function in this phase. The caller supplies "now" as
//     `MacroIntelligenceInput.asOf`; see `analyze.ts`'s header for why.
//   - Output is closed enums / plain numbers / a single narrow nested
//     object only — no free-text/reason/explanation/narrative field
//     anywhere in this file, matching every other 8.1.x/8.2.x contracts
//     module's "closed enums, booleans, timestamps only" convention. No
//     causal claim has a field to be attached to, even by accident.
//   - `directionalBias` is declared as a closed 2-member type but is
//     ALWAYS `null` in this phase — see the field's own doc comment and
//     `analyze.ts`'s header for why: the app's existing economic-calendar
//     feed has no realized "actual" print (see `macroEvents.ts`'s own
//     honesty note — it labels a past event "released", never "beat"/
//     "miss"), so there is no upstream data that explicitly supports a
//     directional call. Missing data is represented honestly (`null`),
//     never fabricated from general/textbook macro knowledge
//     (`lib/intelligence/macroKnowledge.ts` is deliberately never
//     imported into this pure-analysis layer — see `analyze.ts`).
//   - `category` (FOMC/CPI/PPI/NFP/PMI/Interest Rate/GDP/Other) is
//     deliberately NOT reproduced on `MacroUpcomingHighImpactEvent`.
//     `macroEvents.ts`'s own `categorize()` keyword-matcher is a private,
//     unexported helper — reproducing its regex table here would be a
//     second, drifting copy of validated logic that this phase's own
//     rules forbid inventing. `impact`/`date`/`hoursAway`/`proximity` are
//     the closed, deterministic fields this phase actually needs.
//   - Pure data shape only — no logic lives in this file. See `analyze.ts`
//     for the pure, deterministic analyzer function.
//   - UNWIRED: nothing in the app imports from
//     `lib/ai/macroIntelligence/*` yet. No route, no cron, no UI, no
//     execution call-site — see the task's own explicit "no route/cron/UI
//     wiring" instruction for this phase.
// ---------------------------------------------------------------------------

import type { EconomicEvent } from "@/lib/types";

// Re-exported so analyze.ts/fixtures have a single import source for the
// upstream shape they consume — this module does not define its own
// competing calendar-entry type, matching `autonomous/contracts.ts`'s and
// `decisionQualification/contracts.ts`'s own re-export convention.
export type { EconomicEvent };

/**
 * Proximity-bucket thresholds, in hours. `IMMINENT_HOURS` (6) mirrors
 * `lib/intelligence/macroEvents.ts`'s own existing "only imminent events
 * should push the sentiment vote" convention (`getNextHighImpactEvent`'s
 * inlined `hoursAway > 6` cutoff) rather than inventing a new number —
 * this phase names that same threshold instead of silently duplicating
 * the magic number. `NEAR_HOURS`/`UPCOMING_HOURS` are new, narrower
 * buckets this phase introduces for its own finer-grained proximity
 * classification; both are conservative, round values with no claim to
 * be anything other than a first deterministic cut (see CHANGES.md's
 * Limitations section).
 */
export const MACRO_PROXIMITY_IMMINENT_HOURS = 6;
export const MACRO_PROXIMITY_NEAR_HOURS = 24;
export const MACRO_PROXIMITY_UPCOMING_HOURS = 72;

/**
 * Closed proximity classification for a single event's `hoursAway` value
 * (event time minus `input.asOf`, in hours). `PAST` covers any already-
 * elapsed event (`hoursAway < 0`); this phase's own event-risk/regime
 * signals only ever select FUTURE (`hoursAway >= 0`) high-impact events,
 * but the bucket itself is a general-purpose classification of any
 * `hoursAway` value, so `PAST` is a real, reachable member — not dead
 * code. `UNKNOWN` covers an event whose `date` field failed to parse
 * (see `isUsableEvent()` in `analyze.ts`) — never silently coerced into
 * one of the numeric buckets.
 */
export type MacroEventProximityBucket = "IMMINENT" | "NEAR" | "UPCOMING" | "DISTANT" | "PAST" | "UNKNOWN";

/**
 * Closed availability classification for the input calendar as a whole.
 *   - `UNAVAILABLE` — `calendar.length === 0`, OR every entry failed the
 *     usability check (unparseable `date`, or a non-closed-enum `impact`
 *     value) — no macro data can be honestly derived from this input.
 *   - `PARTIAL` — at least one usable entry exists, but at least one
 *     entry was excluded as unusable (missing/invalid timestamp or
 *     malformed impact) — the derived signals below are honest, but
 *     narrower than the full calendar the caller supplied.
 *   - `AVAILABLE` — every supplied entry was usable.
 */
export type MacroDataAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

/**
 * Closed classification of upcoming high-impact-event DENSITY within the
 * `MACRO_PROXIMITY_UPCOMING_HOURS` window — deliberately a calendar-
 * density read, not a risk-sentiment/regime call (this app's existing
 * calendar feed has no realized-outcome data to base a sentiment call on
 * — see `directionalBias`'s doc comment above). `UNKNOWN` when
 * `dataAvailability === "UNAVAILABLE"`.
 */
export type MacroRegime = "EVENT_HEAVY" | "EVENT_LIGHT" | "QUIET" | "UNKNOWN";

/**
 * Closed event-risk classification, derived solely from the nearest
 * usable, FUTURE, high-impact event's proximity bucket (see
 * `eventProximity`/`upcomingHighImpactEvent` below) — never from any
 * realized-outcome/surprise data (none exists upstream).
 *   - `UNKNOWN` — `dataAvailability === "UNAVAILABLE"`; risk cannot be
 *     honestly assessed without data.
 *   - `NONE` — data is usable, but no future high-impact event exists at
 *     all.
 *   - `ELEVATED` / `MODERATE` / `LOW` — the nearest future high-impact
 *     event's proximity bucket is `IMMINENT`/`NEAR`, `UPCOMING`, or
 *     `DISTANT` respectively.
 */
export type MacroEventRiskLevel = "ELEVATED" | "MODERATE" | "LOW" | "NONE" | "UNKNOWN";

/**
 * Closed, reserved directional-bias type. See this file's header and
 * `analyze.ts`'s header for why `analyze.ts` never actually returns
 * either member in this phase — declared now so a future, separately-
 * approved phase that gains access to realized actual-vs-forecast data
 * can populate this field without a breaking schema change.
 */
export type MacroDirectionalBias = "RISK_ON" | "RISK_OFF";

/**
 * A small, flat, narrow copy of the single nearest usable FUTURE
 * high-impact `EconomicEvent` — never the full raw event object, never a
 * live reference. `title`/`date` are copied verbatim from the source
 * `EconomicEvent`; `hoursAway`/`proximity` are freshly computed relative
 * to `input.asOf`, deterministically, with no wall-clock read.
 */
export interface MacroUpcomingHighImpactEvent {
  readonly title: string;
  /** Verbatim ISO string, copied from the source `EconomicEvent.date`. */
  readonly date: string;
  /** Always `"high"` by construction — this field only ever holds a high-impact event. */
  readonly impact: "high";
  /** `(event time - input.asOf) / 1 hour`, always `>= 0` by construction — only future events are ever selected here. */
  readonly hoursAway: number;
  readonly proximity: MacroEventProximityBucket;
}

/**
 * The pure analyzer's single input type. `asOf` is the caller-supplied
 * "now" anchor — REQUIRED, and never read from `Date.now()` inside
 * `analyze.ts`; see that file's header. `calendar` is the same
 * `EconomicEvent[]` shape `lib/intelligence/macroEvents.ts` already
 * consumes — reused verbatim, not re-fetched, not re-shaped.
 */
export interface MacroIntelligenceInput {
  /** ISO-8601 instant. The single time anchor every proximity/risk/regime computation in this phase is relative to. */
  readonly asOf: string;
  /** The already-fetched economic calendar. Read-only; never mutated by `analyze.ts`. */
  readonly calendar: readonly EconomicEvent[];
}

/**
 * The pure analyzer's single output type — a structured, deterministic,
 * immutable-by-contract snapshot for a later, separately-approved phase
 * to consume. Introduces no new external data; every field is either a
 * closed enum, a plain count, or the one narrow nested event object
 * above. There is no EXECUTE/WAIT/REJECT field, no confidence/grade/
 * side/entry/SL/TP field, and no free-text field anywhere in this type,
 * by design.
 */
export interface MacroIntelligenceContext {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  /** = `input.asOf`, copied verbatim — the instant this context is anchored to, never a fresh wall-clock read. */
  readonly generatedAt: string;
  readonly dataAvailability: MacroDataAvailability;
  /** Count of `calendar` entries that passed the usability check (see `analyze.ts::isUsableEvent()`). Always `<= totalEventCount`. */
  readonly usableEventCount: number;
  /** `calendar.length`, verbatim — the honest denominator `usableEventCount` is measured against. */
  readonly totalEventCount: number;
  readonly macroRegime: MacroRegime;
  readonly eventRisk: MacroEventRiskLevel;
  /** = `upcomingHighImpactEvent?.proximity ?? "UNKNOWN"` — exposed at the top level for convenient consumption without a null-check on the nested object. */
  readonly eventProximity: MacroEventProximityBucket;
  /** The single nearest usable, FUTURE, high-impact event, or `null` when none exists (or `dataAvailability === "UNAVAILABLE"`) — never fabricated. */
  readonly upcomingHighImpactEvent: MacroUpcomingHighImpactEvent | null;
  /**
   * ALWAYS `null` in this phase — see this file's header. Declared as a
   * closed `MacroDirectionalBias | null` (not a bare `null` literal type)
   * so a future phase can populate it once upstream data explicitly
   * supports a directional call, without a breaking schema change.
   */
  readonly directionalBias: MacroDirectionalBias | null;
}
