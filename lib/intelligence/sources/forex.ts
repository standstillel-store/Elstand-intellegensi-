import { cached } from "@/lib/cache";
import { fetchTwelveDataSeries, type MarketSeriesReading } from "./twelvedata";

// ---------------------------------------------------------------------------
// Individual FX pairs (EUR, GBP, JPY, CNY vs USD) for the Global Intelligence
// Map's Forex drill-down. Added alongside the existing DXY-based USD node
// (usd.ts) — same provider, same fetcher, just four more symbols, so this is
// a thin wrapper rather than a new integration.
//
// Provider: TwelveData (https://twelvedata.com), same free tier / same
// TWELVEDATA_API_KEY as usd.ts and gold.ts. Without a key, or if a specific
// pair isn't reachable on your plan, that pair's function returns
// `undefined` and its node shows "Waiting for API Connection" — no FRED
// fallback here (unlike DXY), because there's no free daily-resolution FX
// proxy already wired into this app for EUR/GBP/JPY/CNY specifically.
// ---------------------------------------------------------------------------

export type { MarketSeriesReading };

const PAIRS = {
  eur: "EUR/USD",
  gbp: "GBP/USD",
  jpy: "USD/JPY",
  cny: "USD/CNY",
} as const;

export type ForexPairKey = keyof typeof PAIRS;

async function getPair(key: ForexPairKey): Promise<MarketSeriesReading | undefined> {
  return cached(`intel:fx:${key}`, 30_000, () => fetchTwelveDataSeries(PAIRS[key]));
}

export function getEurReading() {
  return getPair("eur");
}
export function getGbpReading() {
  return getPair("gbp");
}
export function getJpyReading() {
  return getPair("jpy");
}
export function getCnyReading() {
  return getPair("cny");
}
