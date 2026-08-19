import { cached } from "./cache";

// ---------------------------------------------------------------------------
// Macro overlays for the Market Overview strip — DXY and M2 aren't crypto
// data, so neither CoinGecko nor Binance carry them. Both read from FRED
// (Federal Reserve Economic Data), which is free but needs a personal
// FRED_API_KEY (register at https://fred.stlouisfed.org/docs/api/api_key.html).
// Without a key, both functions return `undefined` and the cards show a
// "not configured" placeholder — same graceful-degrade rule as everywhere
// else in this app.
//
// Honesty note (important — please keep this comment if you extend this
// file): FRED has no series that is literally the ICE US Dollar Index
// (DXY). `DTWEXBGS` — the Fed's own Trade Weighted U.S. Dollar Index,
// Broad — is the standard free substitute economists use, and it tracks
// DXY closely, but it is not tick-for-tick identical. The UI labels this
// card "DXY (Broad USD Index)" rather than bare "DXY" so it never overstates
// precision it doesn't have.
// ---------------------------------------------------------------------------

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

interface FredObservation {
  date: string;
  value: string;
}

async function fetchLatestFredSeries(seriesId: string): Promise<{ value: number; prevValue?: number; date: string } | undefined> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return undefined;
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=2`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { observations?: FredObservation[] };
    const obs = (json.observations ?? []).filter((o) => o.value !== ".");
    if (!obs.length) return undefined;
    const latest = Number(obs[0].value);
    const prev = obs[1] ? Number(obs[1].value) : undefined;
    if (!isFinite(latest)) return undefined;
    return { value: latest, prevValue: prev, date: obs[0].date };
  } catch {
    return undefined;
  }
}

export interface DxyReading {
  value: number;
  changePct?: number;
  asOf: string;
}

/** Broad trade-weighted USD index (FRED: DTWEXBGS) — DXY proxy, updated ~daily on business days. */
export async function getDxyProxy(): Promise<DxyReading | undefined> {
  return cached("macro:dxy", 6 * 3600_000, async () => {
    const reading = await fetchLatestFredSeries("DTWEXBGS");
    if (!reading) return undefined;
    const changePct = reading.prevValue ? ((reading.value - reading.prevValue) / reading.prevValue) * 100 : undefined;
    return { value: reading.value, changePct, asOf: reading.date };
  });
}

export interface M2Reading {
  valueUsd: number; // billions USD, as published by FRED
  changePct?: number;
  asOf: string;
}

/** US M2 money stock (FRED: M2SL), published monthly — long cache TTL by design. */
export async function getM2Supply(): Promise<M2Reading | undefined> {
  return cached("macro:m2", 12 * 3600_000, async () => {
    const reading = await fetchLatestFredSeries("M2SL");
    if (!reading) return undefined;
    const changePct = reading.prevValue ? ((reading.value - reading.prevValue) / reading.prevValue) * 100 : undefined;
    return { valueUsd: reading.value, changePct, asOf: reading.date };
  });
}

// ---------------------------------------------------------------------------
// ELSTAND PREMIUM additions — US 10Y yield, Fed Funds target range, and US
// National Debt. Same FRED_API_KEY / graceful-degrade rule as everything
// above: no key -> undefined -> the card shows "DATA UNAVAILABLE", never a
// guessed number.
// ---------------------------------------------------------------------------

/** Like fetchLatestFredSeries, but keeps a longer window (newest-first) instead of just the latest 2 points — needed to find the most recent date a slow-moving series (e.g. the Fed's target range) actually changed, not just its latest value. */
async function fetchFredSeriesWindow(seriesId: string, limit: number): Promise<FredObservation[] | undefined> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return undefined;
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { observations?: FredObservation[] };
    const obs = (json.observations ?? []).filter((o) => o.value !== ".");
    return obs.length ? obs : undefined; // newest first
  } catch {
    return undefined;
  }
}

export interface Us10yReading {
  value: number;
  changeBps?: number; // vs previous business day, in basis points
  asOf: string;
}

/** 10-Year Treasury Constant Maturity Rate (FRED: DGS10) — the standard free, primary source for the US 10Y yield (not a proxy, unlike the DXY card above). Updated once per business day. */
export async function getUs10Y(): Promise<Us10yReading | undefined> {
  return cached("macro:us10y", 6 * 3600_000, async () => {
    const reading = await fetchLatestFredSeries("DGS10");
    if (!reading) return undefined;
    const changeBps = reading.prevValue !== undefined ? Math.round((reading.value - reading.prevValue) * 100) : undefined;
    return { value: reading.value, changeBps, asOf: reading.date };
  });
}

export interface FedFundsReading {
  upper: number;
  lower: number;
  asOf: string;
  /** The most recent date the target range itself moved, derived from the real FRED history — this app has no separate "FOMC meeting outcomes" feed, so it only ever claims what the series proves (when the number actually changed), never which meeting caused it. */
  lastChange?: { date: string; bps: number; fromUpper: number; fromLower: number };
}

/** Current Fed Funds target range (FRED: DFEDTARU / DFEDTARL — the FOMC's own published upper/lower bound), the FOMC's primary policy series. */
export async function getFedFundsRate(): Promise<FedFundsReading | undefined> {
  return cached("macro:fedfunds", 6 * 3600_000, async () => {
    const [upperObs, lowerObs] = await Promise.all([
      fetchFredSeriesWindow("DFEDTARU", 400),
      fetchFredSeriesWindow("DFEDTARL", 400),
    ]);
    if (!upperObs || !lowerObs) return undefined;
    const upper = Number(upperObs[0].value);
    const lower = Number(lowerObs[0].value);
    if (!isFinite(upper) || !isFinite(lower)) return undefined;

    let lastChange: FedFundsReading["lastChange"];
    for (let i = 1; i < upperObs.length; i++) {
      const prev = Number(upperObs[i].value);
      if (isFinite(prev) && prev !== upper) {
        lastChange = {
          date: upperObs[i - 1].date,
          bps: Math.round((upper - prev) * 100),
          fromUpper: prev,
          fromLower: Number(lowerObs[i]?.value ?? prev),
        };
        break;
      }
    }

    return { upper, lower, asOf: upperObs[0].date, lastChange };
  });
}

export interface UsDebtReading {
  valueUsd: number;
  /** Real YoY $ change, derived from the same daily series (Treasury doesn't publish a YoY field itself) — undefined if the fetched window doesn't actually reach back ~1 year. */
  changeUsdYoy?: number;
  asOf: string;
}

const FISCAL_DATA_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny";

/**
 * Total US public debt outstanding, "to the penny" — straight from the U.S.
 * Treasury's own Fiscal Data API. Unlike every other source in this file,
 * this needs NO API key (public, unauthenticated, no rate-limit tier) and
 * it's the primary source, not a proxy — Treasury publishes this number
 * itself, daily on business days.
 */
export async function getUsNationalDebt(): Promise<UsDebtReading | undefined> {
  return cached("macro:usdebt", 6 * 3600_000, async () => {
    try {
      const url = `${FISCAL_DATA_BASE}?sort=-record_date&page[size]=400&fields=record_date,tot_pub_debt_out_amt`;
      const res = await fetch(url, { next: { revalidate: 21600 } });
      if (!res.ok) {
        console.error(`[treasury] debt_to_penny HTTP ${res.status} ${res.statusText}`);
        return undefined;
      }
      const json = (await res.json()) as { data?: Array<{ record_date: string; tot_pub_debt_out_amt: string }> };
      const rows = json.data ?? [];
      if (!rows.length) return undefined;

      const latest = rows[0];
      const latestValue = Number(latest.tot_pub_debt_out_amt);
      if (!isFinite(latestValue)) return undefined;

      const latestDate = new Date(latest.record_date).getTime();
      const targetDate = latestDate - 365 * 86_400_000;
      let closest: (typeof rows)[number] | undefined;
      let closestDiff = Infinity;
      for (const row of rows) {
        const diff = Math.abs(new Date(row.record_date).getTime() - targetDate);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = row;
        }
      }
      // Only trust the YoY comparison if the closest row found is within
      // ~45 days of the true 1-year mark — 400 daily rows covers ~13
      // months so this should always hold; the guard just prevents a
      // misleading comparison if the API ever returns a shorter window.
      const changeUsdYoy =
        closest && closestDiff <= 45 * 86_400_000 ? latestValue - Number(closest.tot_pub_debt_out_amt) : undefined;

      return { valueUsd: latestValue, changeUsdYoy, asOf: latest.record_date };
    } catch (err) {
      console.error(`[treasury] ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  });
}
