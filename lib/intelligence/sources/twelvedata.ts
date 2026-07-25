// Shared TwelveData fetcher — USD (DXY) and Gold (XAU/USD) both read from
// TwelveData's /time_series endpoint with the same shape, so the request +
// parsing logic lives here once. See usd.ts for the full honesty notes on
// plan/symbol coverage; the same caveats apply to any symbol used here.

const TWELVEDATA_BASE = "https://api.twelvedata.com/time_series";

export interface MarketSeriesReading {
  value: number;
  changePct?: number;
  /** Oldest → newest, for a sparkline. Empty if the plan/endpoint didn't return history. */
  series: number[];
  asOf: string;
}

export async function fetchTwelveDataSeries(symbol: string, points = 25): Promise<MarketSeriesReading | undefined> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return undefined;
  try {
    const url = `${TWELVEDATA_BASE}?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=${points}&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      console.error(`[twelvedata] ${symbol}: HTTP ${res.status} ${res.statusText}`);
      return undefined;
    }
    const json = (await res.json()) as { values?: { datetime: string; close: string }[]; status?: string; message?: string };
    if (json.status === "error" || !json.values?.length) {
      console.error(`[twelvedata] ${symbol}: ${json.message ?? "no values in response — check plan/symbol coverage"}`);
      return undefined;
    }

    const latestDatetime = json.values[0].datetime; // TwelveData returns newest-first
    const closes = [...json.values]
      .reverse()
      .map((v) => Number(v.close))
      .filter((n) => isFinite(n));
    if (!closes.length) return undefined;

    const latest = closes[closes.length - 1];
    const first = closes[0];
    const changePct = first ? ((latest - first) / first) * 100 : undefined;
    return { value: latest, changePct, series: closes, asOf: latestDatetime };
  } catch (err) {
    console.error(`[twelvedata] ${symbol}: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}
