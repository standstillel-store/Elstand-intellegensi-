// ---------------------------------------------------------------------------
// ELVOID Intelligence — News & Economic Event Impact Engine (Phase 8.2.4)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This is a DOWNSTREAM, PURE ANALYSIS LAYER over two already-produced
//     upstream shapes — Phase 8.2.3's `MacroIntelligenceContext` (economic
//     calendar, already classified) and the app's existing `NewsItem[]`
//     (`lib/types.ts`, the same shape `lib/binance/newsGate.ts` and
//     `lib/newsapi.ts` already produce). No new fetch, no new provider, no
//     new external API is introduced anywhere in this phase.
//   - This module never imports from, and never writes to,
//     `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`,
//     `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`,
//     the Phase 8.2.0 autonomous-context module, `lib/ai/decisionQualification/*`,
//     or `lib/ai/decisionTrace/*`. It does not touch Oracle grading,
//     confidence, side, grade, entry/SL/TP, and it never decides
//     EXECUTE/WAIT/REJECT, and it never executes a paper trade — see
//     `analyze.ts`'s own header for the same boundary restated at the
//     function level. It is advisory context only, for a later,
//     separately-approved Phase 8.2.5 (Pre-Entry Market Validation) to read.
//   - `MacroIntelligenceContext` (imported, type-only, from
//     `../macroIntelligence/contracts`) is reused verbatim as the sole
//     economic-event input — this phase does NOT re-read `EconomicEvent[]`
//     or re-derive proximity/availability/regime classification a second
//     time. Phase 8.2.3 already did that honestly and deterministically;
//     re-deriving it here would be a second, drifting copy of validated
//     logic, which this phase's own rules forbid. `ImpactRisk` is declared
//     as a direct alias of Phase 8.2.3's `MacroEventRiskLevel` for the same
//     reason — not a second, competing risk enum.
//   - `NewsItem` (imported, type-only, from `@/lib/types`) is the sole
//     news-side input — the same shape `getNews()`/`buildNewsWindow()`
//     already populate. This phase treats it as read-only, immutable
//     input; it never fetches news itself.
//   - HONESTY RULE — `NewsItem.sentiment` (optional, upstream): this field
//     is produced by `lib/newsapi.ts`'s `classifySentiment()`, a plain
//     keyword/regex match against the headline (`surge`/`pump`/`bullish`
//     -> positive, `hack`/`scam`/`crash` -> negative). That is a headline
//     keyword tag, not a verified market-reaction signal — it carries no
//     magnitude, no confirmation, and no relationship to actual price
//     behavior. Using it to populate a directional market call would
//     fabricate causality the classifier cannot honestly support — the
//     exact fabrication this phase's task boundary forbids. This module
//     therefore only ever uses `sentiment` for one honest, non-directional
//     purpose: detecting that BOTH positive- and negative-tagged headlines
//     exist in the same recent window (`conflictingImpact`) — an
//     existence/conflict signal about the news set itself, never a
//     directional claim about the market. See `impactDirection`'s own doc
//     comment below and `analyze.ts`'s header for the full rule.
//   - Output is closed enums / plain numbers / booleans / one small nested
//     pass-through object only — no free-text/reason/explanation/
//     narrative field anywhere in this file, matching every other
//     8.1.x/8.2.x contracts module's "closed enums, booleans, timestamps
//     only" convention. No causal claim has a field to be attached to,
//     even by accident.
//   - `impactDirection` is declared as a closed 2-member type but is
//     ALWAYS `null` in this phase — see the HONESTY RULE above. Declared
//     now (not a bare `null` literal type) so a future, separately-
//     approved phase that gains access to a verified market-reaction
//     signal can populate it without a breaking schema change — the same
//     forward-compatible-but-unpopulated convention Phase 8.2.3 already
//     established for `directionalBias`.
//   - Pure data shape only — no logic lives in this file. See `analyze.ts`
//     for the pure, deterministic analyzer function.
//   - UNWIRED: nothing in the app imports from `lib/ai/eventImpact/*` yet.
//     No route, no cron, no UI, no execution call-site — matching the
//     task's own explicit "no route/cron/UI wiring" instruction, and every
//     other 8.2.x phase's "infrastructure only, unwired" convention. This
//     phase's output shape is intentionally built to be a compatible
//     future input for Phase 8.2.5 (Pre-Entry Market Validation), which is
//     NOT implemented here.
// ---------------------------------------------------------------------------

import type { NewsItem } from "@/lib/types";
import type { MacroDataAvailability, MacroEventRiskLevel, MacroIntelligenceContext, MacroUpcomingHighImpactEvent } from "../macroIntelligence/contracts";

// Re-exported so analyze.ts/fixtures have a single import source for the
// upstream shapes they consume — this module does not define its own
// competing news/macro-event type, matching `macroIntelligence/contracts.ts`'s
// own re-export convention.
export type { NewsItem, MacroDataAvailability, MacroIntelligenceContext, MacroUpcomingHighImpactEvent };

/**
 * How far back (in hours) a `NewsItem.publishedAt` counts as "recent" for
 * this phase's `recentNewsCount`/`conflictingImpact`/`eventState`
 * ("RECENT") signals. Mirrors `lib/binance/newsGate.ts`'s own existing
 * 6-hour sentiment-sample window (`now - 6 * 3600_000`) rather than
 * inventing a new number — this phase names that same existing convention
 * instead of silently duplicating the magic number.
 */
export const NEWS_RECENT_HOURS = 6;

/**
 * Closed availability classification for the input news set as a whole,
 * mirroring Phase 8.2.3's `MacroDataAvailability` 3-state pattern:
 *   - `UNAVAILABLE` — `news.length === 0`, OR every entry failed the
 *     usability check (unparseable `publishedAt`, or a blank `title`), OR
 *     `input.asOf` itself failed to parse (recency cannot be honestly
 *     computed against an invalid anchor) — no news-side signal can be
 *     honestly derived from this input.
 *   - `PARTIAL` — at least one usable entry exists, but at least one
 *     entry was excluded as unusable — the derived signals below are
 *     honest, but narrower than the full news set the caller supplied.
 *   - `AVAILABLE` — every supplied entry was usable.
 */
export type NewsDataAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

/**
 * Closed, combined event-timing state across both upstream sources:
 *   - `UNKNOWN` — both `macro.dataAvailability === "UNAVAILABLE"` AND
 *     `newsAvailability === "UNAVAILABLE"` — neither source can honestly
 *     say anything about event timing.
 *   - `UPCOMING` — `macro.upcomingHighImpactEvent !== null` (a known,
 *     future, high-impact economic event exists). Takes precedence over
 *     `RECENT` when both are true — a forward-looking high-impact release
 *     is the more actionable timing fact for a downstream pre-entry
 *     consumer.
 *   - `RECENT` — no upcoming high-impact economic event, but at least one
 *     usable news item falls within `NEWS_RECENT_HOURS` of `asOf`.
 *   - `NONE` — at least one source is available, but neither an upcoming
 *     high-impact economic event nor any recent news item exists.
 */
export type EventState = "UPCOMING" | "RECENT" | "NONE" | "UNKNOWN";

/**
 * Closed impact-risk classification. A direct alias of Phase 8.2.3's
 * `MacroEventRiskLevel` — this phase never re-grades or re-derives a
 * competing risk level; `analyze.ts` copies `macro.eventRisk` verbatim
 * (see this file's header for why). News alone can never elevate this
 * value: `NewsItem` carries no severity/importance field upstream (unlike
 * `EconomicEvent.impact`), so there is no honest basis for the news side
 * to contribute to a *risk level* — only to `conflictingImpact` (an
 * existence signal, not a severity grade).
 */
export type ImpactRisk = MacroEventRiskLevel;

/**
 * Closed, reserved directional-impact type. See this file's header for why
 * `analyze.ts` never actually returns either member in this phase —
 * declared now so a future, separately-approved phase that gains access to
 * a verified (non-keyword-heuristic) market-reaction signal can populate
 * this field without a breaking schema change.
 */
export type ImpactDirection = "RISK_ON" | "RISK_OFF";

/**
 * Closed, boolean-only uncertainty record — no free-text field, matching
 * every other 8.1.x/8.2.x phase's "closed enums, booleans, timestamps
 * only" convention.
 */
export interface EventImpactUncertaintyFlags {
  /** `true` whenever `macro.dataAvailability !== "AVAILABLE"` (includes both `PARTIAL` and `UNAVAILABLE`). */
  readonly macroDataMissing: boolean;
  /** `true` whenever `newsAvailability !== "AVAILABLE"` (includes both `PARTIAL` and `UNAVAILABLE`). */
  readonly newsDataMissing: boolean;
  /**
   * ALWAYS `true` in this phase — no upstream data source available here
   * (a keyword-heuristic `NewsItem.sentiment` tag; a calendar with no
   * realized actual-vs-forecast print, per Phase 8.2.3) explicitly
   * supports a directional market call. See `impactDirection`'s doc
   * comment and this file's header.
   */
  readonly directionUnsupported: boolean;
}

/**
 * The pure analyzer's single input type. `asOf` is the caller-supplied
 * "now" anchor — REQUIRED, and never read from `Date.now()` inside
 * `analyze.ts`; see that file's header. `macro` is Phase 8.2.3's own
 * output, reused verbatim as-is (not recomputed). `news` is the same
 * `NewsItem[]` shape the app's existing news feed already produces —
 * reused verbatim, not re-fetched, not re-shaped.
 */
export interface EventImpactInput {
  /** ISO-8601 instant. The single time anchor every news-recency computation in this phase is relative to. */
  readonly asOf: string;
  /** Phase 8.2.3's already-computed output. Read-only; never mutated, never re-derived. */
  readonly macro: MacroIntelligenceContext;
  /** The already-fetched news set. Read-only; never mutated by `analyze.ts`. */
  readonly news: readonly NewsItem[];
}

/**
 * The pure analyzer's single output type — a structured, deterministic,
 * immutable-by-contract snapshot for a later, separately-approved phase
 * (Phase 8.2.5, Pre-Entry Market Validation) to consume. Introduces no new
 * external data; every field is either a closed enum, a plain
 * count/boolean, or the one narrow nested event object re-exposed
 * verbatim from Phase 8.2.3. There is no EXECUTE/WAIT/REJECT field, no
 * confidence/grade/side/entry/SL/TP field, and no free-text field
 * anywhere in this type, by design.
 */
export interface MarketImpactContext {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  /** = `input.asOf`, copied verbatim — the instant this context is anchored to, never a fresh wall-clock read. */
  readonly generatedAt: string;
  readonly eventState: EventState;
  /** = `input.macro.dataAvailability`, copied verbatim — never recomputed. */
  readonly macroAvailability: MacroDataAvailability;
  readonly newsAvailability: NewsDataAvailability;
  /** = `input.macro.upcomingHighImpactEvent !== null` — a known, future, high-impact *economic calendar* event exists. News alone never sets this (see `ImpactRisk`'s doc comment for why). */
  readonly highImpactPresent: boolean;
  /** The single nearest upcoming high-impact economic event, re-exposed verbatim from `input.macro.upcomingHighImpactEvent` — never re-derived, never a live reference to a mutable object. */
  readonly upcomingHighImpactEvent: MacroUpcomingHighImpactEvent | null;
  /** `news.length`, verbatim — the honest denominator `usableNewsCount` is measured against. */
  readonly totalNewsCount: number;
  /** Count of `news` entries that passed the usability check (see `analyze.ts::isUsableNewsItem()`). Always `<= totalNewsCount`. */
  readonly usableNewsCount: number;
  /** Count of usable news entries whose `publishedAt` falls within `[0, NEWS_RECENT_HOURS]` hours before `asOf`. `0` whenever `asOf` itself fails to parse. */
  readonly recentNewsCount: number;
  /** = `input.macro.eventRisk`, copied verbatim — see `ImpactRisk`'s doc comment for why this phase never re-grades it. */
  readonly impactRisk: ImpactRisk;
  /**
   * ALWAYS `null` in this phase — see this file's header (HONESTY RULE)
   * and `impactDirection`'s type doc comment for why.
   */
  readonly impactDirection: ImpactDirection | null;
  /** `true` when at least one recent (within `NEWS_RECENT_HOURS`) usable news item is tagged `sentiment: "positive"` AND at least one is tagged `sentiment: "negative"` — an existence/conflict signal about the news set, never a directional claim. */
  readonly conflictingImpact: boolean;
  readonly uncertainty: EventImpactUncertaintyFlags;
}
