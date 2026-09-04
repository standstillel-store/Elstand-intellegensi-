// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — domain types.
//
// Two deliberately separate domains (per architecture correction §3):
//   - EconomicRelease  — a scheduled MARKET EVENT (actual/forecast/previous
//     as of a specific release). This is what a trader reacts to.
//   - EconomicObservation — a raw HISTORICAL time-series value for an
//     indicator/period. This is what trend/momentum analysis reads from.
// They are never merged into one table or one type, even though they often
// describe the same underlying indicator — see repository.ts for how both
// get queried together without collapsing the distinction.
//
// Raw provider values are kept as `string | null` throughout this file.
// Numeric parsing is centralized in interpret.ts's parseNumericValue() —
// see that file's header for why (ranges, %, K/M suffixes, unit variety
// across providers).
// ---------------------------------------------------------------------------

import type { CanonicalIndicatorId } from "./canonicalIndicators";

export type EconomicDataSource = "forexfactory" | "alphavantage";

export type ReleaseStatus = "upcoming" | "released" | "pending";

export interface EconomicRelease {
  /** Deterministic: `${source}:${indicatorId}:${country}:${releasePeriod ?? scheduledAt}` — see normalize.ts::buildReleaseId(). */
  id: string;
  source: EconomicDataSource;

  indicatorId: CanonicalIndicatorId;
  /** Raw provider title, kept for display/debugging — never used as an identity key. */
  rawTitle: string;

  country: string;
  currency?: string;
  impact: "low" | "medium" | "high";

  scheduledAt: string; // ISO
  /** The period this release reports on, e.g. "2026-08". Optional — not every provider/event supplies it (a rescheduled or ad-hoc event may not). */
  releasePeriod?: string;

  actual: string | null;
  forecast: string | null;
  previous: string | null;
  revisedPrevious: string | null;

  status: ReleaseStatus;
}

export interface EconomicObservation {
  /** Deterministic: `${source}:${indicatorId}:${country}:${observationPeriod}` — see normalize.ts::buildObservationId(). */
  id: string;
  source: EconomicDataSource;

  indicatorId: CanonicalIndicatorId;
  country: string;

  /** The period this observation reports on, e.g. "2026-08" (monthly) or "2026-Q2" (quarterly). */
  observationPeriod: string;
  /** Raw published value (may be a level, a rate, or a derived % change — see canonicalIndicators.ts's ALPHA_VANTAGE_FUNCTION_MAP for which). */
  value: string;
  unit?: string;

  publishedAt?: string; // ISO, when the provider states it
}

/** A single fetch's outcome — never throws; the caller always gets a structured result, even on total failure. */
export interface ProviderResult<T> {
  ok: boolean;
  data: T[];
  /** Present only when ok === false — human-readable, logged, never shown raw to end users. */
  error?: string;
}

export interface EconomicDataProvider {
  readonly id: EconomicDataSource;
  fetchReleases?(): Promise<ProviderResult<EconomicRelease>>;
  fetchObservations?(): Promise<ProviderResult<EconomicObservation>>;
}

/**
 * How much of the actual/forecast/previous triad is present for a release
 * (or how much history exists for an observation trend). This is a DATA
 * COMPLETENESS measure — never a market-prediction confidence. See
 * interpret.ts's header for the same distinction restated at the point
 * where it's computed.
 */
export type DataCompleteness = "HIGH" | "MEDIUM" | "LIMITED" | "UNAVAILABLE";
