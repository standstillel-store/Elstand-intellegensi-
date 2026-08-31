import { cached } from "./cache";

// ---------------------------------------------------------------------------
// OKX public market data — funding rate only, for cross-exchange comparison
// on ELSTAND PREMIUM's Futures Microstructure panel. No API key needed
// (OKX's /api/v5/public/* endpoints require zero auth). Kept intentionally
// minimal — this file exists solely to add a second real funding-rate
// source alongside Binance (see lib/bybit.ts for the third); it doesn't
// duplicate order-book/order-flow, which stay Binance-only by design.
// ---------------------------------------------------------------------------

const BASE = "https://www.okx.com";

export interface FundingRatePoint {
  time: number;
  fundingRate: number;
}

/** instId format is `${BASE}-USDT-SWAP`, e.g. "BTC-USDT-SWAP". */
function toInstId(symbol: string): string {
  return `${symbol.toUpperCase()}-USDT-SWAP`;
}

/**
 * Historical funding-rate settlements from OKX's public
 * /api/v5/public/funding-rate-history endpoint. Real exchange data, no
 * fallback/interpolation — a failed or malformed response returns undefined
 * and the caller must show "unavailable", never fabricate a rate.
 */
export async function getOkxFundingRateHistory(symbol: string, limit = 100): Promise<FundingRatePoint[] | undefined> {
  const instId = toInstId(symbol);
  const capped = Math.min(100, Math.max(1, limit)); // OKX caps at 100 per page
  return cached(`okx:funding-hist:${instId}:${capped}`, 5 * 60_000, async () => {
    try {
      const res = await fetch(`${BASE}/api/v5/public/funding-rate-history?instId=${instId}&limit=${capped}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as { code?: string; data?: Array<{ fundingTime: string; realizedRate: string }> };
      if (json.code !== "0" || !json.data) return undefined;
      return json.data.map((r) => ({ time: Number(r.fundingTime), fundingRate: parseFloat(r.realizedRate) })).reverse(); // OKX returns newest-first
    } catch {
      return undefined;
    }
  });
}

/** Latest funding rate only — /api/v5/public/funding-rate (also public). */
export async function getOkxCurrentFundingRate(symbol: string): Promise<number | undefined> {
  const instId = toInstId(symbol);
  return cached(`okx:funding-current:${instId}`, 60_000, async () => {
    try {
      const res = await fetch(`${BASE}/api/v5/public/funding-rate?instId=${instId}`, { next: { revalidate: 60 } });
      if (!res.ok) return undefined;
      const json = (await res.json()) as { code?: string; data?: Array<{ fundingRate: string }> };
      if (json.code !== "0" || !json.data?.[0]) return undefined;
      return parseFloat(json.data[0].fundingRate);
    } catch {
      return undefined;
    }
  });
}
