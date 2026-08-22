import { cached } from "@/lib/cache";
import { fetchTwelveDataSeries, type MarketSeriesReading } from "./twelvedata";

// ---------------------------------------------------------------------------
// Gold (XAU/USD) for the Global Intelligence Map's Gold node. Same provider
// and honesty notes as usd.ts — see that file for details. Commodity pairs
// like XAU/USD are covered on TwelveData's free tier as of this writing,
// but always verify at https://twelvedata.com/symbolsearch?s=XAU before
// relying on it in production; plans/coverage change over time.
// ---------------------------------------------------------------------------

const GOLD_SYMBOL = "XAU/USD";

export async function getGoldReading(): Promise<MarketSeriesReading | undefined> {
  return cached("intel:gold", 30_000, () => fetchTwelveDataSeries(GOLD_SYMBOL));
}
