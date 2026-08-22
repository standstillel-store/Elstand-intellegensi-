import { cached } from "@/lib/cache";
import { fetchTwelveDataSeries, type MarketSeriesReading } from "./twelvedata";
import { getDxyProxy } from "@/lib/macro";

// ---------------------------------------------------------------------------
// USD strength (DXY) for the Global Intelligence Map's USD node.
//
// Provider: TwelveData (https://twelvedata.com), free tier: 8 requests/min,
// 800/day. Needs TWELVEDATA_API_KEY in .env.local — without it this returns
// `undefined` and the map shows "Waiting for API Connection" on the USD
// node, same graceful-degrade rule as lib/macro.ts.
//
// Honesty note: index-symbol coverage (DXY) depends on your TwelveData plan
// — verify at https://twelvedata.com/symbolsearch?s=DXY before relying on
// this in production. If TwelveData's DXY symbol isn't reachable on your
// plan (or the request fails for any other reason), this automatically
// falls back to lib/macro.ts's FRED-based getDxyProxy() (DTWEXBGS, free, no
// plan restriction, ~daily resolution) — same broad-dollar-index signal,
// lower resolution, but real data instead of "Waiting for API Connection".
// ---------------------------------------------------------------------------

const USD_SYMBOL = "DXY";

export type { MarketSeriesReading };

export async function getUsdReading(): Promise<MarketSeriesReading | undefined> {
  const primary = await cached("intel:usd", 30_000, () => fetchTwelveDataSeries(USD_SYMBOL));
  if (primary) return primary;

  const fallback = await getDxyProxy();
  if (!fallback) return undefined;
  console.warn("[usd] TwelveData unavailable — serving FRED DTWEXBGS fallback instead");
  return { value: fallback.value, changePct: fallback.changePct, series: [], asOf: fallback.asOf };
}
