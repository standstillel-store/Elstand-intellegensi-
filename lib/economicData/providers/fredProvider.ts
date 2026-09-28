// ---------------------------------------------------------------------------
// FredProvider — historical macro OBSERVATION source, added 2026-09-28 as a
// second, preferred provider alongside Alpha Vantage so ELVOID's Economic
// Intelligence pipeline no longer depends on Alpha Vantage alone.
//
// Reuses the same FRED_API_KEY / FRED_BASE convention already established in
// lib/macro.ts (which separately covers FED_FUNDS_RATE/TREASURY_YIELD_10Y
// for a different consumer — live single-value dashboard cards — and is
// left untouched by this file).
//
// Deliberately conservative scope: only indicators with one unambiguous,
// long-established FRED series id are covered here. Left out on purpose,
// to avoid silently shipping a subtly-wrong number that would still look
// like a plausible reading rather than an obvious error:
//   - PPI (headline/core) — BLS PPI methodology moved from a commodity
//     basis to a Final-Demand basis in 2014; more than one FRED series can
//     plausibly be called "the" headline PPI. Left to Alpha Vantage only.
//   - Real GDP QoQ/YoY — GDPC1 is already expressed at a seasonally
//     adjusted ANNUAL rate; the market-quoted "GDP grew X% annualized"
//     figure needs compounding a quarterly change ((q_t/q_t-1)^4 - 1), not
//     a plain percent-change between quarters. Left to Alpha Vantage's
//     existing, unmodified-by-this-file derivation.
//   - Core Retail Sales — "core" has more than one common market
//     definition (ex-autos vs ex-autos-and-gas). Not picked here.
//
// FRED's `units` query param does the MoM/YoY/absolute-change math
// server-side (pch = % change from previous period, pc1 = % change from a
// year ago, chg = absolute change from previous period, lin = raw level) —
// so, unlike alphaVantageProvider.ts, this file never needs
// normalize.ts::deriveChangeSeries(); FRED's own calculation is used as-is.
// ---------------------------------------------------------------------------

import { cached } from "@/lib/cache";
import type { CanonicalIndicatorId } from "../canonicalIndicators";
import { toObservation } from "../normalize";
import type { EconomicObservation } from "../types";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const COUNTRY = "US"; // every target below is a US series
const HISTORY_POINTS = 36; // ~3 years of monthly history per series

type FredUnits = "lin" | "pch" | "pc1" | "chg";

interface FredSeriesTarget {
  indicatorId: CanonicalIndicatorId;
  seriesId: string;
  units: FredUnits;
}

/** One entry per canonical indicator FRED backs here — see file header for what's deliberately excluded and why. */
const FRED_SERIES_TARGETS: readonly FredSeriesTarget[] = [
  { indicatorId: "CPI_HEADLINE_MOM", seriesId: "CPIAUCSL", units: "pch" },
  { indicatorId: "CPI_HEADLINE_YOY", seriesId: "CPIAUCSL", units: "pc1" },
  { indicatorId: "CORE_CPI_MOM", seriesId: "CPILFESL", units: "pch" },
  { indicatorId: "CORE_CPI_YOY", seriesId: "CPILFESL", units: "pc1" },
  { indicatorId: "UNEMPLOYMENT_RATE", seriesId: "UNRATE", units: "lin" },
  { indicatorId: "NFP", seriesId: "PAYEMS", units: "chg" },
  { indicatorId: "RETAIL_SALES_HEADLINE", seriesId: "RSAFS", units: "pch" },
  { indicatorId: "DURABLE_GOODS_ORDERS", seriesId: "DGORDER", units: "pch" },
];

interface FredRawObservation {
  date: string;
  value: string; // FRED uses the literal string "." for a period with no published value yet
}

type SeriesOutcome =
  | { status: "ok"; points: { date: string; value: number }[] }
  | { status: "empty" }
  | { status: "error"; message: string };

async function fetchSeries(seriesId: string, units: FredUnits): Promise<SeriesOutcome> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return { status: "error", message: "FRED_API_KEY not configured" };

  // lib/cache.ts's convention: return `undefined` for a failed call so the
  // cache only holds it ~10s instead of the full 6h success TTL — a
  // transient FRED outage must not stay locked in for hours on a warm
  // instance. Successful ("ok") and legitimately-empty results are cached.
  let failure: string | null = null;
  const outcome = await cached<SeriesOutcome | undefined>(`fred:${seriesId}:${units}`, 6 * 3_600_000, async () => {
    try {
      const url = `${FRED_BASE}?series_id=${seriesId}&units=${units}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${HISTORY_POINTS}`;
      const res = await fetch(url, { next: { revalidate: 6 * 3600 } });
      if (!res.ok) {
        failure = `HTTP ${res.status} ${res.statusText}`;
        return undefined;
      }

      const json = (await res.json()) as { observations?: FredRawObservation[]; error_message?: string };
      if (json.error_message) {
        failure = json.error_message;
        return undefined;
      }

      const points = (json.observations ?? [])
        .filter((o) => o.value !== ".") // FRED's own "not available for this period" marker — never coerced to 0
        .map((o) => ({ date: o.date, value: Number(o.value) }))
        .filter((p) => Number.isFinite(p.value))
        .reverse(); // requested desc (newest-first); observations are kept oldest-first, same convention as alphaVantageProvider.ts

      return points.length ? ({ status: "ok", points } as const) : ({ status: "empty" } as const);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
      return undefined;
    }
  });
  return outcome ?? { status: "error", message: failure ?? "previous FRED fetch failed (retrying shortly)" };
}

/** `YYYY-MM-DD` → `YYYY-MM` period label — same convention as normalize.ts::toMonthlyPeriod(), inlined so this file doesn't import a helper named after Alpha Vantage's framing. */
function toPeriod(date: string): string {
  return date.slice(0, 7);
}

export interface FredIngestResult {
  ok: boolean;
  data: EconomicObservation[];
  /** Canonical indicator ids FRED actually returned data for this run. ingest.ts uses this so Alpha Vantage doesn't also write these same indicators this run (deterministic per-run precedence, not a permanent source lock — see ingest.ts). */
  coveredIndicatorIds: CanonicalIndicatorId[];
  succeededSeries: string[];
  failedSeries: { series: string; reason: string }[];
}

/**
 * Sequential fetch across every FRED_SERIES_TARGETS entry — mirrors
 * alphaVantageProvider.ts's sequential-fetch convention (never more than
 * one in-flight request from this provider at a time) even though FRED's
 * rate limit (120 req/min per key) is far less strict than Alpha Vantage's
 * free tier; no reason to introduce a second concurrency pattern for no
 * benefit.
 */
export async function fetchFredObservationsDetailed(): Promise<FredIngestResult> {
  const data: EconomicObservation[] = [];
  const coveredIndicatorIds: CanonicalIndicatorId[] = [];
  const succeededSeries: string[] = [];
  const failedSeries: { series: string; reason: string }[] = [];

  for (const target of FRED_SERIES_TARGETS) {
    const key = `${target.seriesId}:${target.units}`;
    const outcome = await fetchSeries(target.seriesId, target.units);
    if (outcome.status === "ok") {
      for (const point of outcome.points) {
        data.push(
          toObservation("fred", target.indicatorId, COUNTRY, point, toPeriod(point.date), target.units === "lin" ? "PERCENT" : undefined)
        );
      }
      coveredIndicatorIds.push(target.indicatorId);
      succeededSeries.push(key);
    } else if (outcome.status === "empty") {
      // Legitimately no usable points this run — not a failure, but this
      // indicator is not "covered" either, so ingest.ts still lets Alpha
      // Vantage attempt it this run (precedence is per-run, never a
      // permanent lock on FRED even when FRED has nothing).
      succeededSeries.push(key);
    } else {
      failedSeries.push({ series: key, reason: outcome.message });
      console.error(`[economicData:fred] ${key}: ${outcome.message}`);
    }
  }

  return { ok: failedSeries.length === 0, data, coveredIndicatorIds, succeededSeries, failedSeries };
}
