import type { CoinMarket } from "@/lib/types";
import { getKlines } from "@/lib/binance";
import { rsi } from "@/lib/elvoid/indicators";
import { isRelevantAsset } from "@/lib/asset-filters";

/**
 * Market-wide RSI heatmap data — real klines from Binance Futures (public
 * endpoint, no API key needed — see lib/binance.ts), real RSI-14 computed
 * with lib/elvoid/indicators.ts's rsi(). There is no manual token list: the
 * universe is the top N most relevant CoinGecko markets by cap, the same
 * isRelevantAsset() filter the rest of the dashboard already uses. A symbol
 * without a Binance USDT-M perp pair simply fails its own getKlines() call
 * and is dropped from the result — never faked with a placeholder value.
 */

export const RSI_HEATMAP_UNIVERSE_LIMIT = 60;
export const RSI_HEATMAP_DEFAULT_INTERVAL = "1h";
// ~4 days of 1h candles (or the equivalent span at other intervals) — well
// past the 15 candles rsi(period=14) needs, so the latest reading is a
// settled EMA-smoothed value rather than one still warming up.
const KLINES_LOOKBACK = 100;

export interface RsiHeatmapEntry {
  symbol: string;
  rsi: number;
  price?: number;
  change24h?: number;
}

export interface RsiHeatmapData {
  interval: string;
  entries: RsiHeatmapEntry[];
  /** Bare tickers behind `entries`, in the same universe — carried along so
   *  the client can ask for a different interval on the same universe
   *  without redoing the CoinGecko selection below. */
  symbols: string[];
  avgRsi?: number;
  /** False only if every single symbol's klines call failed (e.g. Binance
   *  unreachable) — the UI shows an explicit "data unavailable" state
   *  rather than an empty-looking chart. */
  connected: boolean;
}

async function rsiForSymbol(symbol: string, interval: string): Promise<number | undefined> {
  try {
    const candles = await getKlines(symbol, interval, KLINES_LOOKBACK);
    if (candles.length < 15) return undefined;
    const series = rsi(candles.map((c) => c.close), 14);
    const last = series[series.length - 1];
    return Number.isFinite(last) ? last : undefined;
  } catch {
    // No Binance USDT-M pair for this symbol, or a transient fetch error —
    // drop it rather than fabricate a reading.
    return undefined;
  }
}

function pickUniverse(markets: CoinMarket[], limit: number): CoinMarket[] {
  return markets
    .filter(isRelevantAsset)
    .filter((m) => m.market_cap > 0)
    .sort((a, b) => b.market_cap - a.market_cap)
    .slice(0, limit);
}

function summarize(entries: RsiHeatmapEntry[], interval: string, symbols: string[]): RsiHeatmapData {
  const avgRsi = entries.length ? entries.reduce((s, e) => s + e.rsi, 0) / entries.length : undefined;
  return { interval, entries, symbols, avgRsi, connected: entries.length > 0 };
}

/** Initial server-side load: picks the universe from CoinGecko markets already fetched for the page. */
export async function getRsiHeatmapData(
  markets: CoinMarket[],
  interval: string = RSI_HEATMAP_DEFAULT_INTERVAL
): Promise<RsiHeatmapData> {
  const universe = pickUniverse(markets, RSI_HEATMAP_UNIVERSE_LIMIT);
  const symbols = universe.map((m) => m.symbol.toUpperCase());

  const results = await Promise.all(
    universe.map(async (m): Promise<RsiHeatmapEntry | undefined> => {
      const value = await rsiForSymbol(m.symbol, interval);
      if (value === undefined) return undefined;
      return {
        symbol: m.symbol.toUpperCase(),
        rsi: value,
        price: m.current_price,
        change24h: m.price_change_percentage_24h_in_currency,
      };
    })
  );

  const entries = results.filter((e): e is RsiHeatmapEntry => e !== undefined);
  return summarize(entries, interval, symbols);
}

/** Client-side timeframe switch: re-scans an already-chosen universe at a different interval. */
export async function getRsiHeatmapForSymbols(symbols: string[], interval: string): Promise<RsiHeatmapData> {
  const results = await Promise.all(
    symbols.map(async (symbol): Promise<RsiHeatmapEntry | undefined> => {
      const value = await rsiForSymbol(symbol, interval);
      if (value === undefined) return undefined;
      return { symbol: symbol.toUpperCase(), rsi: value };
    })
  );
  const entries = results.filter((e): e is RsiHeatmapEntry => e !== undefined);
  return summarize(entries, interval, symbols);
}
