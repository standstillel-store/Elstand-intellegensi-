// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — PRIMARY release builder (Alpha Vantage).
//
// WHY THIS FILE EXISTS (production evidence, 2026-09-29):
//   economic_observations held 2,713 Alpha Vantage rows, but NOTHING read them
//   (getRecentObservations had zero callers). composeMacroContext() read only
//   economic_releases — which holds ForexFactory calendar rows, keyed by
//   currency code ("USD"), while the reader asked for country "US". Result:
//   every Oracle snapshot carried macro_state "UNKNOWN / UNKNOWN".
//
// DATA HIERARCHY (owner decision): Alpha Vantage is the PRIMARY economic
// source. FRED / Finnhub / News / ForexFactory are SUPPORTING — they may
// enrich or confirm, never replace or outrank it. So the runtime economic
// reading is built from Alpha Vantage observations ONLY; a missing / stale /
// non-consecutive primary observation makes that indicator UNAVAILABLE
// (fail-closed) — it is never silently substituted from a supporting source.
//
// Pure: no DB, no network, no clock (callers pass `now`). Fixture-testable.
// ---------------------------------------------------------------------------

import type { CanonicalIndicatorId } from "./canonicalIndicators";
import type { EconomicObservation, EconomicRelease } from "./types";

/** Days after a period ENDS beyond which the latest primary observation is considered stale. Monthly series publish ~2-6 weeks after month end; quarterly GDP ~4-8 weeks after quarter end. Both windows leave room for one delayed release and no more. */
export const MONTHLY_STALE_AFTER_DAYS = 75;
export const QUARTERLY_STALE_AFTER_DAYS = 150;

const QUARTERLY_INDICATORS: ReadonlySet<CanonicalIndicatorId> = new Set(["REAL_GDP_QOQ", "REAL_GDP_YOY"] as CanonicalIndicatorId[]);

export type PrimaryReleaseOutcome =
  | { status: "OK"; release: EconomicRelease }
  | { status: "UNAVAILABLE"; reason: "NO_PRIMARY_OBSERVATION" | "STALE" | "UNPARSEABLE_PERIOD" | "NON_NUMERIC_VALUE"; detail: string };

function parsePeriod(period: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function monthIndex(p: { year: number; month: number }): number {
  return p.year * 12 + (p.month - 1);
}

/** Cadence in months: 3 for quarterly indicators (period label = quarter START month), else 1. */
function cadenceMonths(indicatorId: CanonicalIndicatorId): number {
  return QUARTERLY_INDICATORS.has(indicatorId) ? 3 : 1;
}

/** ms timestamp of the first instant AFTER the observed period ends (UTC). */
function periodEndMs(indicatorId: CanonicalIndicatorId, p: { year: number; month: number }): number {
  const endIdx = monthIndex(p) + cadenceMonths(indicatorId);
  return Date.UTC(Math.floor(endIdx / 12), endIdx % 12, 1);
}

export function isObservationStale(indicatorId: CanonicalIndicatorId, observationPeriod: string, now: Date): boolean {
  const p = parsePeriod(observationPeriod);
  if (!p) return true; // an unreadable period can never be proven fresh -> fail closed
  const limitDays = cadenceMonths(indicatorId) === 3 ? QUARTERLY_STALE_AFTER_DAYS : MONTHLY_STALE_AFTER_DAYS;
  return now.getTime() > periodEndMs(indicatorId, p) + limitDays * 86_400_000;
}

/**
 * Builds the release the interpretation pipeline consumes from PRIMARY
 * (Alpha Vantage) observations, newest first. `forecast` is always null —
 * Alpha Vantage carries no consensus forecast, and one is never invented or
 * borrowed from a supporting source here. `previous` is set only when the
 * prior observation is the immediately preceding period (a gap would make
 * "previous" a lie, so it is left null instead).
 */
export function buildPrimaryRelease(
  indicatorId: CanonicalIndicatorId,
  country: string,
  observationsNewestFirst: readonly EconomicObservation[],
  now: Date
): PrimaryReleaseOutcome {
  const primary = observationsNewestFirst.filter((o) => o.source === "alphavantage" && o.indicatorId === indicatorId && o.country === country);
  const latest = primary[0];
  if (!latest) return { status: "UNAVAILABLE", reason: "NO_PRIMARY_OBSERVATION", detail: `${indicatorId}/${country}: no Alpha Vantage observation stored` };

  const latestPeriod = parsePeriod(latest.observationPeriod);
  if (!latestPeriod) return { status: "UNAVAILABLE", reason: "UNPARSEABLE_PERIOD", detail: `${indicatorId}: period "${latest.observationPeriod}"` };
  if (!Number.isFinite(Number(latest.value)) || latest.value.trim() === "") {
    return { status: "UNAVAILABLE", reason: "NON_NUMERIC_VALUE", detail: `${indicatorId}: value "${latest.value}"` };
  }
  if (isObservationStale(indicatorId, latest.observationPeriod, now)) {
    return { status: "UNAVAILABLE", reason: "STALE", detail: `${indicatorId}: latest primary period ${latest.observationPeriod} is older than the freshness window` };
  }

  const prior = primary[1];
  const priorPeriod = prior ? parsePeriod(prior.observationPeriod) : null;
  const consecutive = priorPeriod !== null && monthIndex(latestPeriod) - monthIndex(priorPeriod) === cadenceMonths(indicatorId);
  const previous = prior && consecutive && Number.isFinite(Number(prior.value)) && prior.value.trim() !== "" ? prior.value : null;

  return {
    status: "OK",
    release: {
      id: `alphavantage:${indicatorId}:${country}:${latest.observationPeriod}`,
      source: "alphavantage",
      indicatorId,
      rawTitle: `${indicatorId} (Alpha Vantage observation)`,
      country,
      impact: "medium", // impact is a calendar concept; Alpha Vantage does not provide one and none is invented
      scheduledAt: latest.publishedAt ?? new Date(Date.UTC(latestPeriod.year, latestPeriod.month - 1, 1)).toISOString(),
      releasePeriod: latest.observationPeriod,
      actual: latest.value,
      forecast: null,
      previous,
      revisedPrevious: null,
      status: "released",
    },
  };
}
