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

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
}

/** 24hr rolling stats for the ELVOID PRO Market Header (price/high/low/volume). Real Binance Futures data, Spot fallback — same pattern as getOrderBookDepth. */
export async function get24hTicker(symbol: string): Promise<Ticker24h & { source: "futures" | "spot" }> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:24h:${pair}`, 15_000, async () => {
    async function parse(json: {
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      quoteVolume: string;
    }) {
      return {
        symbol: pair,
        lastPrice: parseFloat(json.lastPrice),
        priceChangePercent: parseFloat(json.priceChangePercent),
        highPrice: parseFloat(json.highPrice),
        lowPrice: parseFloat(json.lowPrice),
        quoteVolume: parseFloat(json.quoteVolume),
      };
    }
    try {
      const res = await fetch(`${BASE}/fapi/v1/ticker/24hr?symbol=${pair}`, { next: { revalidate: 15 } });
      if (!res.ok) throw new Error(`Binance Futures 24hr ticker failed for ${pair}: ${res.status}`);
      return { ...(await parse(await res.json())), source: "futures" as const };
    } catch (futuresErr) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, { next: { revalidate: 15 } });
        if (!res.ok) throw new Error(`Binance Spot 24hr ticker failed for ${pair}: ${res.status}`);
        return { ...(await parse(await res.json())), source: "spot" as const };
      } catch (spotErr) {
        throw futuresErr instanceof Error && spotErr instanceof Error
          ? new Error(`${futuresErr.message}; ${spotErr.message}`)
          : futuresErr;
      }
    }
  });
}

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
/**
 * Real order-book depth with an automatic fallback: Binance Futures first
 * (fapi.binance.com — matches the rest of this file's funding/OI data), and
 * if that fails — most commonly a regional block on the hosting provider's
 * egress IP, not an app bug — falls back to Binance SPOT depth
 * (api.binance.com/api/v3/depth), a different domain/product with its own
 * access rules. Both are real exchange order books; this never falls back
 * to anything synthesized from candles — OHLCV candles simply don't contain
 * bid/ask depth, so a "depth from candles" fallback would have to be
 * invented data, which this app doesn't do. The response is tagged with
 * which source actually answered so the UI can be honest about it.
 */
export interface RecentTrade {
  price: number;
  qty: number;
  /** true = taker sold into the bid (aggressive sell), false = taker bought the ask (aggressive buy). */
  isSell: boolean;
  time: number; // ms epoch, real trade timestamp from Binance
}

/**
 * Recent executed trades — real tick-level data from Binance Futures'
 * public aggTrades endpoint (no key required). Powers Footprint/Delta/
 * Imbalance modes: each trade already carries Binance's own taker-side
 * classification (isBuyerMaker), so bid/ask attribution here is genuine,
 * not inferred or simulated.
 */
export async function getRecentTrades(symbol: string, limit = 1000): Promise<RecentTrade[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:trades:${pair}:${limit}`, 5_000, async () => {
    const res = await fetch(`${BASE}/fapi/v1/aggTrades?symbol=${pair}&limit=${Math.min(1000, limit)}`, {
      next: { revalidate: 5 },
    });
    if (!res.ok) throw new Error(`Binance aggTrades failed for ${pair}: ${res.status}`);
    const raw = (await res.json()) as Array<{ p: string; q: string; m: boolean; T: number }>;
    return raw.map((t) => ({ price: parseFloat(t.p), qty: parseFloat(t.q), isSell: t.m, time: t.T }));
  });
}

export async function getOrderBookDepth(symbol: string, limit = 20): Promise<OrderBookSnapshot & { source: "futures" | "spot" }> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:depth:${pair}:${limit}`, 10_000, async () => {
    try {
      const res = await fetch(`${BASE}/fapi/v1/depth?symbol=${pair}&limit=${limit}`, { next: { revalidate: 10 } });
      if (!res.ok) throw new Error(`Binance Futures depth failed for ${pair}: ${res.status}`);
      const json = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };
      return {
        symbol: pair,
        source: "futures" as const,
        bids: json.bids.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
        asks: json.asks.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
      };
    } catch (futuresErr) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=${Math.min(limit, 100)}`, { next: { revalidate: 10 } });
        if (!res.ok) throw new Error(`Binance Spot depth failed for ${pair}: ${res.status}`);
        const json = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };
        return {
          symbol: pair,
          source: "spot" as const,
          bids: json.bids.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
          asks: json.asks.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })),
        };
      } catch (spotErr) {
        throw futuresErr instanceof Error && spotErr instanceof Error
          ? new Error(`Both Futures and Spot depth failed for ${pair}: ${futuresErr.message} / ${spotErr.message}`)
          : futuresErr;
      }
    }
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
 * Global long/short account ratio — Binance Futures' public
 * /futures/data/globalLongShortAccountRatio endpoint. Returns the most
 * recent ratio (longAccount / shortAccount) for a symbol, real exchange
 * data, no key required.
 */
export async function getLongShortRatio(symbol: string, period: "5m" | "15m" | "1h" | "4h" = "1h"): Promise<number | undefined> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:ls-ratio:${pair}:${period}`, 60_000, async () => {
    try {
      const res = await fetch(`${BASE}/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=${period}&limit=1`, {
        next: { revalidate: 60 },
      });
      if (!res.ok) return undefined;
      const raw = (await res.json()) as Array<{ longShortRatio: string }>;
      return raw[0] ? parseFloat(raw[0].longShortRatio) : undefined;
    } catch {
      return undefined;
    }
  });
}

/** The same curated Binance Futures watchlist used by getFundingSnapshot — derivatives
 * metrics (funding/OI/L-S) are only ever real for these symbols; anything outside this
 * list must show N/A rather than a fabricated number. */
export const DERIVATIVES_WATCHLIST = WATCHLIST;

/**
 * OHLCV candles for ElVoid AI's scanning engine (support/resistance,
 * liquidity sweeps, market structure, etc. — see lib/elvoid/scanners.ts).
 * Uses the same public Binance Futures klines endpoint as the funding feed
 * above, so a coin's price history and its funding/OI context always come
 * from the same market. `symbol` is the bare ticker (e.g. "BTC") — the
 * "USDT" pair suffix is added here.
 */
/**
 * Cumulative Volume Delta — real, derived from each kline's taker buy/sell
 * split (Binance returns takerBuyBaseVolume per candle; sell volume is the
 * remainder). delta = takerBuy - takerSell, cvd = running sum of delta.
 * This is genuine exchange data, not a simulation — the standard way CVD
 * is computed without a raw trade-tick feed.
 */
export async function getCvdSeries(symbol: string, interval: string, limit = 100): Promise<{ time: number; delta: number; cvd: number }[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  return cached(`bn:cvd:${pair}:${interval}:${limit}`, 60_000, async () => {
    const res = await fetch(`${BASE}/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=${limit}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Binance klines failed for ${pair}: ${res.status}`);
    const raw = (await res.json()) as Array<
      [number, string, string, string, string, string, number, string, number, string, string, string]
    >;
    let running = 0;
    return raw.map((k) => {
      const volume = parseFloat(k[5]);
      const takerBuy = parseFloat(k[9]);
      const takerSell = volume - takerBuy;
      const delta = takerBuy - takerSell;
      running += delta;
      return { time: k[0], delta, cvd: running };
    });
  });
}

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

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/**
 * Extended history — paginates real Binance klines backwards (via
 * `endTime`) since a single request caps at 1500 candles. Used when the
 * chart needs ~1 month of history on lower timeframes (e.g. 5m needs
 * ~8640 candles to cover 30 days, well past the single-request cap).
 * Capped at 6 requests (9000 candles) to keep load times reasonable.
 */
export async function getKlinesRange(symbol: string, interval: string, days: number): Promise<Candle[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const intervalMs = INTERVAL_MS[interval] ?? 300_000;
  const wantedCount = Math.min(9000, Math.ceil((days * 86_400_000) / intervalMs));
  return cached(`bn:klines-range:${pair}:${interval}:${days}`, 120_000, async () => {
    let all: Candle[] = [];
    let endTime: number | undefined;
    for (let i = 0; i < 6 && all.length < wantedCount; i++) {
      const url = new URL(`${BASE}/fapi/v1/klines`);
      url.searchParams.set("symbol", pair);
      url.searchParams.set("interval", interval);
      url.searchParams.set("limit", "1500");
      if (endTime) url.searchParams.set("endTime", String(endTime));
      const res = await fetch(url.toString(), { next: { revalidate: 120 } });
      if (!res.ok) throw new Error(`Binance klines failed for ${pair}: ${res.status}`);
      const raw = (await res.json()) as Array<
        [number, string, string, string, string, string, number, string, number, string, string, string]
      >;
      if (raw.length === 0) break;
      const batch = raw.map(
        (k): Candle => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        })
      );
      all = [...batch, ...all];
      endTime = batch[0].time - 1;
      if (batch.length < 1500) break; // hit the start of available history
    }
    return all.slice(-wantedCount);
  });
}
