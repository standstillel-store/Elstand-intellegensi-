// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — normalization helpers.
//
// Two responsibilities:
//   1. Deterministic id builders for EconomicRelease / EconomicObservation,
//      keyed by (indicatorId, country, period) — never a loose title
//      string, never scheduledAt alone (a release can be rescheduled
//      without changing its identity; see architecture correction §3/§6).
//   2. deriveChangeSeries() — turns a raw LEVEL time series (Alpha
//      Vantage's CPI/NFP/Retail Sales/Durables/GDP functions all return
//      levels, not % changes — see canonicalIndicators.ts's
//      ALPHA_VANTAGE_FUNCTION_MAP header) into the MoM/YoY/absolute-diff
//      series markets actually quote. Pure math over already-fetched data
//      — no network, no DB.
// ---------------------------------------------------------------------------

import type { CanonicalIndicatorId, DerivationKind } from "./canonicalIndicators";
import type { EconomicDataSource, EconomicObservation } from "./types";

export function buildReleaseId(source: EconomicDataSource, indicatorId: CanonicalIndicatorId, country: string, periodOrDate: string): string {
  return `${source}:${indicatorId}:${country}:${periodOrDate}`;
}

export function buildObservationId(source: EconomicDataSource, indicatorId: CanonicalIndicatorId, country: string, observationPeriod: string): string {
  return `${source}:${indicatorId}:${country}:${observationPeriod}`;
}

export interface RawSeriesPoint {
  /** ISO date or period label, as the provider returns it. */
  date: string;
  value: number;
}

/**
 * A raw LEVEL series (oldest → newest expected by the caller — Alpha
 * Vantage returns newest-first, so callers must reverse before calling
 * this) derived into MoM/YoY % change or an absolute month-over-month
 * diff, per `derivation`. Returns one derived point per input point that
 * has a valid prior-period comparator (so the output is always <= input
 * length, and the first `lag` points are dropped rather than
 * fabricated with a partial comparison).
 *
 * `lag` is the number of periods back to compare against — 1 for MoM
 * (monthly cadence) or QoQ (quarterly cadence, same "1 period back"
 * meaning at whatever cadence the series is), 12 for YoY on a monthly
 * series, 4 for YoY on a quarterly series (GDP). Callers pass the
 * correct lag for the series' actual cadence — this function does not
 * infer cadence from the date strings.
 */
export function deriveChangeSeries(sortedOldestFirst: RawSeriesPoint[], derivation: DerivationKind, lag: number): RawSeriesPoint[] {
  if (derivation === "NONE") return sortedOldestFirst;
  const out: RawSeriesPoint[] = [];
  for (let i = lag; i < sortedOldestFirst.length; i++) {
    const curr = sortedOldestFirst[i];
    const prior = sortedOldestFirst[i - lag];
    if (!Number.isFinite(curr.value) || !Number.isFinite(prior.value)) continue;
    if (derivation === "DIFF_ABSOLUTE_MOM") {
      out.push({ date: curr.date, value: curr.value - prior.value });
    } else {
      // PCT_CHANGE_MOM / PCT_CHANGE_YOY — same formula, `lag` is what distinguishes them.
      if (prior.value === 0) continue; // avoid div-by-zero rather than emitting Infinity
      out.push({ date: curr.date, value: ((curr.value - prior.value) / Math.abs(prior.value)) * 100 });
    }
  }
  return out;
}

/** Monthly `YYYY-MM-DD` (as Alpha Vantage returns) → `YYYY-MM` period label, matching ForexFactoryProvider's inferReleasePeriod() convention so releases and observations for the same indicator/month share a period label. */
export function toMonthlyPeriod(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Quarterly `YYYY-MM-DD` → `YYYY-Q#` period label. */
export function toQuarterlyPeriod(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  const month = Number(monthStr);
  const quarter = Number.isFinite(month) ? Math.ceil(month / 3) : undefined;
  return quarter ? `${yearStr}-Q${quarter}` : dateStr.slice(0, 7);
}

export function toObservation(
  source: EconomicDataSource,
  indicatorId: CanonicalIndicatorId,
  country: string,
  point: RawSeriesPoint,
  observationPeriod: string,
  unit?: string
): EconomicObservation {
  return {
    id: buildObservationId(source, indicatorId, country, observationPeriod),
    source,
    indicatorId,
    country,
    observationPeriod,
    value: String(point.value),
    unit,
    publishedAt: point.date,
  };
}
