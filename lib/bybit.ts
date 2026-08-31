import { cached } from "./cache";

// ---------------------------------------------------------------------------
// Bybit public market data — funding rate only, same purpose as lib/okx.ts:
// a real, free, no-key third source for the cross-exchange funding
// comparison on Futures Microstructure Intelligence. Order book / order
// flow stay Binance-only by design.
// ---------------------------------------------------------------------------

const BASE = "https://api.bybit.com";

export interface FundingRatePoint {
  time: number;
  fundingRate: number;
}

function toSymbol(symbol: string): string {
  return `${symbol.toUpperCase()}USDT`;
}

/**
 * Historical funding-rate settlements from Bybit's public
 * /v5/market/funding/history endpoint (category=linear). Real exchange
 * data — a failed or malformed response returns undefined, never a
 * fabricated rate.
 */
export async function getBybitFundingRateHistory(symbol: string, limit = 200): Promise<FundingRatePoint[] | undefined> {
  const sym = toSymbol(symbol);
  const capped = Math.min(200, Math.max(1, limit)); // Bybit caps at 200 per page
  return cached(`bybit:funding-hist:${sym}:${capped}`, 5 * 60_000, async () => {
    try {
      const res = await fetch(`${BASE}/v5/market/funding/history?category=linear&symbol=${sym}&limit=${capped}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as {
        retCode?: number;
        result?: { list?: Array<{ fundingRateTimestamp: string; fundingRate: string }> };
      };
      if (json.retCode !== 0 || !json.result?.list) return undefined;
      return json.result.list
        .map((r) => ({ time: Number(r.fundingRateTimestamp), fundingRate: parseFloat(r.fundingRate) }))
        .reverse(); // Bybit returns newest-first
    } catch {
      return undefined;
    }
  });
}

/** Latest funding rate only, taken from the most recent history entry — Bybit's ticker endpoint bundles this in with a lot of unrelated fields, so reusing the history call (already cached) is simpler and just as real. */
export async function getBybitCurrentFundingRate(symbol: string): Promise<number | undefined> {
  const history = await getBybitFundingRateHistory(symbol, 1);
  return history?.[history.length - 1]?.fundingRate;
}
