import type { CoinMarket } from "./types";

// ---------------------------------------------------------------------------
// Shared "is this asset actually worth surfacing" filters. Used by the
// scoring engine (High Momentum Watchlist, Risk Assessment) and by the
// derived market-insights helpers, so the same coin is never excluded in one
// place and shown in another.
// ---------------------------------------------------------------------------

/** Major stablecoins — never meaningful "momentum" or "decline" candidates. */
export const STABLE_SYMBOLS = new Set([
  "usdt", "usdc", "dai", "fdusd", "tusd", "usde", "usds", "pyusd",
  "usdd", "frax", "usdp", "gusd", "lusd", "crvusd",
]);

/**
 * Wrapped tokens and liquid-staking derivatives mirror an underlying asset's
 * price rather than trading on independent momentum of their own — not
 * meaningful watchlist or decline candidates in their own right. The name
 * check catches most CoinGecko listings ("Wrapped Bitcoin", "Wrapped
 * eETH", ...); the symbol list covers common ones whose display name
 * doesn't literally say "wrapped".
 */
export const WRAPPED_DENYLIST = new Set([
  "wbtc", "weth", "wbnb", "wsteth", "steth", "cbeth", "reth",
  "weeth", "ezeth", "wbeth", "jitosol", "bnsol", "msol", "wavax", "wmatic",
]);

/** Below this, a listing is thin enough that moves are mostly noise. */
export const MIN_RELEVANT_VOLUME_USD = 200_000;

export function isStableOrWrapped(market: Pick<CoinMarket, "symbol" | "name">): boolean {
  const sym = market.symbol.toLowerCase();
  if (STABLE_SYMBOLS.has(sym)) return true;
  if (WRAPPED_DENYLIST.has(sym)) return true;
  if (market.name.toLowerCase().includes("wrapped")) return true;
  return false;
}

export function isLiquidEnough(market: Pick<CoinMarket, "total_volume">): boolean {
  return market.total_volume >= MIN_RELEVANT_VOLUME_USD;
}

/** Combined pass for "is this a relevant, independently-moving asset". */
export function isRelevantAsset(market: Pick<CoinMarket, "symbol" | "name" | "total_volume">): boolean {
  return !isStableOrWrapped(market) && isLiquidEnough(market);
}
