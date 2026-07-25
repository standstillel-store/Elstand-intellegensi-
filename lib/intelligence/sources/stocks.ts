import { cached } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Stocks node (Nasdaq / S&P 500 / Dow Jones) for the Global Intelligence Map.
//
// Provider: Finnhub (https://finnhub.io), free tier: 60 calls/min. Needs
// FINNHUB_API_KEY in .env.local — without it this returns `undefined` and
// the Stocks node shows "Waiting for API Connection".
//
// Honesty note (please keep if you extend this file): true index tickers
// (^IXIC, ^GSPC, ^DJI) are gated behind Finnhub's paid indices add-on as of
// this writing. This uses the highly-liquid tracking ETF for each index
// instead — QQQ (Nasdaq-100), SPY (S&P 500), DIA (Dow Jones) — which free-tier
// /quote covers and which track their index closely (not tick-for-tick
// identical, same spirit as the DXY proxy in lib/macro.ts). The UI labels
// these "Nasdaq (QQQ)" etc. so it never overstates precision it doesn't have.
// No historical series on the free tier here (candles are also gated), so
// this node has no sparkline — quote + % change only.
// ---------------------------------------------------------------------------

const FINNHUB_BASE = "https://finnhub.io/api/v1/quote";

export interface StockQuote {
  label: string;
  ticker: string;
  price: number;
  changePct?: number;
}

export interface StocksReading {
  indices: StockQuote[];
  asOf: string;
}

const TRACKED: { label: string; ticker: string }[] = [
  { label: "Nasdaq (QQQ)", ticker: "QQQ" },
  { label: "S&P 500 (SPY)", ticker: "SPY" },
  { label: "Dow Jones (DIA)", ticker: "DIA" },
];

async function fetchQuote(ticker: string, apiKey: string): Promise<StockQuote | undefined> {
  try {
    const res = await fetch(`${FINNHUB_BASE}?symbol=${ticker}&token=${apiKey}`, { next: { revalidate: 30 } });
    if (!res.ok) {
      console.error(`[finnhub] ${ticker}: HTTP ${res.status} ${res.statusText}`);
      return undefined;
    }
    const json = (await res.json()) as { c?: number; dp?: number };
    if (!json.c) {
      console.error(`[finnhub] ${ticker}: no price in response (check symbol/plan)`);
      return undefined;
    }
    return { label: ticker, ticker, price: json.c, changePct: json.dp };
  } catch (err) {
    console.error(`[finnhub] ${ticker}: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function getStocksReading(): Promise<StocksReading | undefined> {
  return cached("intel:stocks", 30_000, async () => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return undefined;

    const results = await Promise.all(TRACKED.map((t) => fetchQuote(t.ticker, apiKey)));
    const indices = TRACKED.map((t, i) => (results[i] ? { ...results[i]!, label: t.label } : undefined)).filter(
      (q): q is StockQuote => Boolean(q)
    );
    if (!indices.length) return undefined;
    return { indices, asOf: new Date().toISOString() };
  });
}
