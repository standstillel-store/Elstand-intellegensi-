import { getTopMarkets } from "../coingecko";
import { getKlines, getFundingSnapshot } from "../binance";
import { getWhaleTransfers } from "../alchemy";
import { getNews } from "../newsapi";
import { getEconomicCalendar } from "../economiccalendar";
import { generateSignal, type GeneratedSignal } from "./engine";
import { getStrategyCalibration } from "./performance";
import { getWallet } from "./paperTrader";
import { getWatchlistCoins } from "./watchlist";
import { getStablecoinSupply } from "../stablecoins";
import { getFearGreed } from "../alternativeme";
import { getUsdReading } from "../intelligence/sources/usd";
import type { CoinMarket, NewsItem, WhaleTransfer, EconomicEvent, FundingInfo } from "../types";

export interface ScanContext {
  markets: CoinMarket[];
  priceBySymbol: Record<string, number>;
  whales: WhaleTransfer[];
  news: NewsItem[];
  calendar: EconomicEvent[];
  funding: FundingInfo[];
  riskPercent: number;
  calibration: { strategy: string; winRate: number; sampleSize: number }[];
  /** Market-wide 24h change in total stablecoin supply (USD) — a liquidity backdrop, not symbol-specific. */
  stableChange24hUsd?: number;
  /** Fear & Greed index value (0-100), market-wide — powers the new Sentiment confluence scanner. */
  fngValue?: number;
  /** DXY 24h change (%), market-wide — powers the new Macro confluence scanner. */
  dxyChangePct?: number;
}

/** Pulls every live data source ElVoid AI needs, once, so scanning many coins doesn't refetch shared context per-coin. */
export async function buildScanContext(): Promise<ScanContext> {
  const markets = await getTopMarkets(200).catch(() => []);
  const priceBySymbol: Record<string, number> = {};
  for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;

  const [whales, news, calendar, funding, wallet, calibration, stablecoin, fng, usd] = await Promise.all([
    getWhaleTransfers(priceBySymbol).catch(() => []),
    getNews().catch(() => []),
    getEconomicCalendar().catch(() => []),
    getFundingSnapshot().catch(() => []),
    getWallet(),
    getStrategyCalibration().catch(() => []),
    getStablecoinSupply().catch(() => undefined),
    getFearGreed().catch(() => undefined),
    getUsdReading().catch(() => undefined),
  ]);

  return {
    markets,
    priceBySymbol,
    whales,
    news,
    calendar,
    funding,
    riskPercent: wallet?.risk_per_trade ?? 1,
    calibration,
    stableChange24hUsd: stablecoin?.change24hUsd,
    fngValue: fng?.now.value,
    dxyChangePct: usd?.changePct,
  };
}

export async function buildSignalForSymbol(
  symbol: string,
  ctx: ScanContext,
  timeframe: string = "4h"
): Promise<GeneratedSignal | null> {
  const sym = symbol.toUpperCase().trim();
  if (!sym) return null;
  const market = ctx.markets.find((m) => m.symbol.toUpperCase() === sym);
  const currentPrice = market?.current_price ?? ctx.priceBySymbol[sym.toLowerCase()];
  if (!currentPrice) return null;

  const candles = await getKlines(sym, timeframe, 300).catch(() => []);
  if (candles.length < 30) return null;

  const funding = ctx.funding.find((f) => f.symbol.toUpperCase() === `${sym}USDT`);
  const btc = sym === "BTC" ? undefined : ctx.markets.find((m) => m.symbol.toUpperCase() === "BTC");

  return generateSignal({
    symbol: sym,
    name: market?.name,
    currentPrice,
    candles,
    whales: ctx.whales,
    news: ctx.news,
    calendar: ctx.calendar,
    funding,
    riskPercent: ctx.riskPercent,
    calibration: ctx.calibration,
    timeframe,
    change24h: market?.price_change_percentage_24h_in_currency,
    btcChange24h: btc?.price_change_percentage_24h_in_currency,
    btcChange7d: btc?.price_change_percentage_7d_in_currency,
    stableChange24hUsd: ctx.stableChange24hUsd,
    fngValue: ctx.fngValue,
    dxyChangePct: ctx.dxyChangePct,
  });
}

// Stablecoins never make useful "mover" signals (no directional move to
// read) — excluded from the broad-scan sample below.
const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD"]);

/**
 * Picks a rotating sample of volatile/"micin"-style movers from the wider
 * market (outside the fixed watchlist) so "Scan Market" doesn't return the
 * same ~15 coins every time. Ranked by |24h change| (biggest movers first),
 * then a random slice of that pool is taken each call so back-to-back scans
 * surface different names instead of always the same top-N.
 */
function pickBroadMovers(markets: CoinMarket[], exclude: Set<string>, count: number): string[] {
  const candidates = markets
    .filter((m) => !STABLE_SYMBOLS.has(m.symbol.toUpperCase()) && !exclude.has(m.symbol.toUpperCase()))
    .filter((m) => typeof m.price_change_percentage_24h_in_currency === "number")
    .sort((a, b) => Math.abs(b.price_change_percentage_24h_in_currency!) - Math.abs(a.price_change_percentage_24h_in_currency!))
    .slice(0, Math.max(count * 4, 30)); // a wider pool of the most-active movers, then sample from it

  // Fisher-Yates shuffle so each scan call surfaces a different subset of
  // that active pool instead of always the same top-N.
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((m) => m.symbol.toUpperCase());
}

/**
 * Scans the user's watchlist (lib/elvoid/watchlist.ts) PLUS a rotating batch
 * of volatile movers from the wider market, and returns fresh signals sorted
 * by Confidence, highest first. Previously this only ever scanned the fixed
 * watchlist, so "Scan Market" always surfaced the same ~15 coins — this
 * keeps every watchlist coin covered (so WatchlistPanel's "Scan Market di
 * atas scan semua coin di sini" copy stays true) while adding variety on
 * top so smaller/volatile ("micin") coins outside the watchlist show up too.
 * Pass `extraCount: 0` to scan the watchlist only (unchanged old behavior).
 */
export async function scanWatchlist(limit?: number, extraCount = 8): Promise<GeneratedSignal[]> {
  const [ctx, watchlistCoins] = await Promise.all([buildScanContext(), getWatchlistCoins()]);
  const watchlistSet = new Set(watchlistCoins.map((c) => c.toUpperCase()));
  const broad = extraCount > 0 ? pickBroadMovers(ctx.markets, watchlistSet, extraCount) : [];
  const merged = [...watchlistCoins, ...broad];
  const symbols = typeof limit === "number" ? merged.slice(0, limit) : merged;
  const results = await Promise.all(symbols.map((s) => buildSignalForSymbol(s, ctx).catch(() => null)));
  return results.filter((r): r is GeneratedSignal => r !== null).sort((a, b) => b.confidence - a.confidence);
}
