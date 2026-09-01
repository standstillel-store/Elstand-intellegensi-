// ---------------------------------------------------------------------------
// ELVOID Intelligence — News & Economic Event Impact Engine (Phase 8.2.4)
//
// Pure, deterministic functions only. Zero database/network/LLM/fetch
// calls. Zero `Date.now()` / `Math.random()` anywhere in this file — every
// "now" this module ever computes against is `input.asOf`, supplied by the
// caller. Zero imports from `lib/ai/oracle/*`, `lib/ai/cognitive/*`,
// the Phase 8.2.0 autonomous-context module, `lib/ai/decisionQualification/*`,
// `lib/ai/decisionTrace/*`, `lib/elvoid/*`, or `lib/supabase.ts`. This file
// depends ONLY on the plain `EventImpactInput` it is given (an already-
// computed `MacroIntelligenceContext` plus an already-fetched
// `NewsItem[]`), plus `Date.parse` for interpreting the ISO date strings
// already inside that input — never a live clock read.
//
// THIS IS NOT ORACLE GRADING, QUALIFICATION, OR DECISION LOGIC.
// `analyzeEventImpact()` never touches `grade`/`confidence`/`side`/
// `riskStatus`/entry/stopLoss/takeProfit, never selects EXECUTE/WAIT/
// REJECT, and never executes a paper trade. It answers exactly one
// question — "what does the already-computed macro context, plus the
// already-fetched news set, viewed relative to `asOf`, structurally look
// like" — and nothing else. Its output is advisory context only, for a
// later, separately-approved Phase 8.2.5 (Pre-Entry Market Validation) to
// read.
//
// `NewsItem.sentiment` is a keyword/regex headline tag (see
// `lib/newsapi.ts::classifySentiment()`), not a verified market-reaction
// signal. This file uses it for exactly one honest purpose —
// `conflictingImpact`, an existence/conflict check, never a directional
// claim — and `impactDirection` is unconditionally `null` in every return
// path. See `contracts.ts`'s header for the full honesty rule.
// ---------------------------------------------------------------------------

import { NEWS_RECENT_HOURS } from "./contracts";
import type {
  EventImpactInput,
  EventImpactUncertaintyFlags,
  EventState,
  MarketImpactContext,
  NewsDataAvailability,
  NewsItem,
} from "./contracts";

/**
 * Pure, deterministic — no wall-clock read. `Date.parse` on a fixed input
 * string always yields the same result for the same string; this is
 * string interpretation, not a live clock read.
 */
function parseTimeMs(dateIso: string): number | null {
  const ms = Date.parse(dateIso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A news entry is usable when its `publishedAt` parses to a finite
 * instant and its `title` is a non-empty string. Anything else (missing/
 * malformed timestamp, blank title) is honestly excluded rather than
 * coerced into a guess — see `contracts.ts`'s `NewsDataAvailability` doc
 * comment. `sentiment` is never required for usability — it is optional
 * upstream and this module only ever reads it opportunistically.
 */
function isUsableNewsItem(item: NewsItem): boolean {
  return parseTimeMs(item.publishedAt) !== null && item.title.trim().length > 0;
}

/** Returns a fresh array of only the usable entries — never mutates `news` or its entries. */
function filterUsableNews(news: readonly NewsItem[]): NewsItem[] {
  return news.filter(isUsableNewsItem);
}

function computeNewsAvailability(totalCount: number, usableCount: number): NewsDataAvailability {
  if (totalCount === 0) return "UNAVAILABLE";
  if (usableCount === 0) return "UNAVAILABLE";
  if (usableCount < totalCount) return "PARTIAL";
  return "AVAILABLE";
}

/**
 * `(asOfMs - itemTimeMs) / 1 hour` — "how long ago", so a positive value
 * means the item is in the past relative to `asOf`. Pure arithmetic over
 * two already-parsed instants — no wall-clock read.
 */
function hoursAgo(itemTimeMs: number, asOfMs: number): number {
  return (asOfMs - itemTimeMs) / 3_600_000;
}

/**
 * Usable news items whose `publishedAt` falls within `[0, NEWS_RECENT_HOURS]`
 * hours before `asOfMs` — inclusive on the boundary, matching Phase
 * 8.2.3's own "at-boundary counts as within" proximity convention. A
 * future-dated item relative to `asOf` (`hoursAgo < 0`, a malformed but
 * still-parseable timestamp) is deliberately excluded rather than counted
 * as "recent".
 */
function filterRecentNews(usableNews: readonly NewsItem[], asOfMs: number): NewsItem[] {
  return usableNews.filter((item) => {
    const itemMs = parseTimeMs(item.publishedAt)!; // safe: usableNews already passed isUsableNewsItem()
    const ago = hoursAgo(itemMs, asOfMs);
    return ago >= 0 && ago <= NEWS_RECENT_HOURS;
  });
}

/**
 * `true` only when the recent-news window contains at least one item
 * explicitly tagged `sentiment: "positive"` AND at least one explicitly
 * tagged `sentiment: "negative"`. An item with `sentiment` absent or
 * `"neutral"` contributes to neither side. This is an existence/conflict
 * check about the news set itself — see `contracts.ts`'s
 * `conflictingImpact` doc comment for why it is never treated as a
 * directional claim.
 */
function computeConflictingImpact(recentNews: readonly NewsItem[]): boolean {
  const hasPositive = recentNews.some((item) => item.sentiment === "positive");
  const hasNegative = recentNews.some((item) => item.sentiment === "negative");
  return hasPositive && hasNegative;
}

function computeEventState(
  macroAvailability: MarketImpactContext["macroAvailability"],
  newsAvailability: NewsDataAvailability,
  highImpactPresent: boolean,
  recentNewsCount: number
): EventState {
  if (macroAvailability === "UNAVAILABLE" && newsAvailability === "UNAVAILABLE") return "UNKNOWN";
  if (highImpactPresent) return "UPCOMING";
  if (recentNewsCount > 0) return "RECENT";
  return "NONE";
}

/**
 * Pure, deterministic, synchronous. The same `input` always produces a
 * byte-identical `MarketImpactContext`. Never mutates `input` or anything
 * nested inside it (`input.macro` and `input.news` and its entries are
 * only ever read). Holds no state across calls.
 *
 * `generatedAt` is `input.asOf`, copied verbatim — never a fresh
 * `Date.now()` read. `impactRisk`/`macroAvailability`/
 * `upcomingHighImpactEvent` are copied verbatim from `input.macro` — this
 * phase never re-derives Phase 8.2.3's own classification. `impactDirection`
 * is always `null` in this phase — see this file's header and
 * `contracts.ts`'s header for why.
 */
export function analyzeEventImpact(input: EventImpactInput): MarketImpactContext {
  const asOfMs = parseTimeMs(input.asOf);

  const totalNewsCount = input.news.length;
  const usableNews = asOfMs !== null ? filterUsableNews(input.news) : [];
  const usableNewsCount = usableNews.length;
  const newsAvailability = computeNewsAvailability(totalNewsCount, usableNewsCount);

  const recentNews = asOfMs !== null && newsAvailability !== "UNAVAILABLE" ? filterRecentNews(usableNews, asOfMs) : [];
  const recentNewsCount = recentNews.length;

  const macroAvailability = input.macro.dataAvailability;
  const highImpactPresent = input.macro.upcomingHighImpactEvent !== null;

  const eventState = computeEventState(macroAvailability, newsAvailability, highImpactPresent, recentNewsCount);

  const conflictingImpact = computeConflictingImpact(recentNews);

  const uncertainty: EventImpactUncertaintyFlags = {
    macroDataMissing: macroAvailability !== "AVAILABLE",
    newsDataMissing: newsAvailability !== "AVAILABLE",
    directionUnsupported: true,
  };

  return {
    version: 1,
    generatedAt: input.asOf,
    eventState,
    macroAvailability,
    newsAvailability,
    highImpactPresent,
    upcomingHighImpactEvent: input.macro.upcomingHighImpactEvent,
    totalNewsCount,
    usableNewsCount,
    recentNewsCount,
    impactRisk: input.macro.eventRisk,
    impactDirection: null,
    conflictingImpact,
    uncertainty,
  };
}
