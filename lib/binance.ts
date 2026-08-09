import { cached } from "./cache";
import type { FundingInfo, OrderBookSnapshot } from "./types";
import type { Candle } from "./elvoid/types";

const BASE = "https://fapi.binance.com";

// There's no free bulk open-interest endpoint, so we track OI for a curated
// watchlist of the symbols most relevant to a pump/rugpull dashboard. Add or
// remove symbols here freely.
const WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "PEPEUSDT",
  "WIFUSDT",
  "ARBUSDT",
  "OPUSDT",
  "TONUSDT",
];

export async function getFundingSnapshot(): Promise<FundingInfo[]> {
  return cached("bn:funding", 45_000, async () => {
    const res = await fetch(`${BASE}/fapi/v1/premiumIndex`, { next: { revalidate: 45 } });
    if (!res.ok) throw new Error(`Binance premiumIndex failed: ${res.status}`);
    const all = (await res.json()) as Array<{
      symbol: string;
      lastFundingRate: string;
      markPrice: string;
    }>;
    const wanted = new Set(WATCHLIST);
    const filtered = all.filter((r) => wanted.has(r.symbol));

    const withOi = await Promise.all(
      filtered.map(async (r) => {
        let openInterest: number | undefined;
        try {
          const oiRes = await fetch(`${BASE}/fapi/v1/openInterest?symbol=${r.symbol}`, {
            next: { revalidate: 45 },
          });
          if (oiRes.ok) {
            const oi = await oiRes.json();
            openInterest = parseFloat(oi.openInterest);
          }
        } catch {
          // OI is a nice-to-have; funding rate alone is still useful.
        }
        const markPrice = parseFloat(r.markPrice);
        const info: FundingInfo = {
          symbol: r.symbol,
          lastFundingRate: parseFloat(r.lastFundingRate),
          markPrice,
          openInterest,
          openInterestValue: openInterest ? openInterest * markPrice : undefined,
        };
        return info;
      })
    );
    return withOi;
  });
}

/**
 * Public order-book depth snapshot — Binance Futures' /depth endpoint is
 * public market data, no API key needed. Refreshed every 10s (cached, like
 * everything else in this file) rather than a live WebSocket stream: a real
 * snapshot every 10s is honest, live data for a landing page card without
 * holding a socket open for anonymous visitors — the true tick-by-tick
 * stream is what the actual terminal is for.
 */
export async function getOrderBookDepth(symbol: string, limit = 20): Promise<OrderBookSnapshot> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:depth:${pair}:${limit}`, 10_000, async () => {
    const res = await fetch(`${BASE}/fapi/v1/depth?symbol=${pair}&limit=${limit}`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`Binance depth failed for ${pair}: ${res.status}`);
    const json = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };
    return {
      symbol: pair,
      bids: json.bids.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
      asks: json.asks.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
    };
  });
}

/**
 * Recent open-interest history — Binance Futures' public
 * /futures/data/openInterestHist endpoint — used to derive a real OI change
 * (e.g. "OI up 4% over the last hour") instead of only ever showing one
 * current snapshot.
 */
export interface OpenInterestPoint {
  time: number;
  openInterest: number;
  openInterestValue: number;
}

export async function getOpenInterestHistory(
  symbol: string,
  period: "5m" | "15m" | "1h" | "4h" = "1h",
  limit = 2
): Promise<OpenInterestPoint[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:oi-hist:${pair}:${period}:${limit}`, 60_000, async () => {
    const res = await fetch(`${BASE}/futures/data/openInterestHist?symbol=${pair}&period=${period}&limit=${limit}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Binance openInterestHist failed for ${pair}: ${res.status}`);
    const raw = (await res.json()) as Array<{
      timestamp: number;
      sumOpenInterest: string;
      sumOpenInterestValue: string;
    }>;
    return raw.map((r) => ({
      time: r.timestamp,
      openInterest: parseFloat(r.sumOpenInterest),
      openInterestValue: parseFloat(r.sumOpenInterestValue),
    }));
  });
}

/**
 * OHLCV candles for ElVoid AI's scanning engine (support/resistance,
 * liquidity sweeps, market structure, etc. — see lib/elvoid/scanners.ts).
 * Uses the same public Binance Futures klines endpoint as the funding feed
 * above, so a coin's price history and its funding/OI context always come
 * from the same market. `symbol` is the bare ticker (e.g. "BTC") — the
 * "USDT" pair suffix is added here.
 */
export async function getKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:klines:${pair}:${interval}:${limit}`, 60_000, async () => {
    const res = await fetch(`${BASE}/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=${limit}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Binance klines failed for ${pair}: ${res.status}`);
    const raw = (await res.json()) as Array<
      [number, string, string, string, string, string, number, string, number, string, string, string]
    >;
    return raw.map(
      (k): Candle => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      })
    );
  });
}
