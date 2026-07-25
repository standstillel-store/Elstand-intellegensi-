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
