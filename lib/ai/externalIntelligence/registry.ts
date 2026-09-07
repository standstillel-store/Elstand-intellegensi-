// ---------------------------------------------------------------------------
// ELVOID Intelligence — External Source Registry (Phase 8.4.1)
//
// Result of a repository audit (see contracts.ts's header for the file
// list inspected). Every entry's `modulePath`, `requiredEnvVars`, and
// `freshness.cacheTtlMs` were read directly out of the named files, not
// assumed — grep for the quoted cache key (e.g. "bn:funding") in the
// module path to re-verify any entry.
//
// If a module described here is deleted, renamed, or its cache TTL/env
// var changes, this entry must be updated in the same change — this file
// is never allowed to drift into describing sources that no longer work
// the way it says they do (same rule cognitiveMap/registry.ts states for
// its own module list).
// ---------------------------------------------------------------------------

import type { ExternalSourceDefinition, SourceAvailability, SourceCapability, SourceCategory } from "./contracts";

export const EXTERNAL_SOURCE_REGISTRY: readonly ExternalSourceDefinition[] = [
  // --- market ---------------------------------------------------------
  {
    source: "binance_spot",
    label: "Binance Spot Market Data",
    category: "market",
    capability: ["spot_price"],
    dataType: "TIME_SERIES",
    reliability: { tier: "EXCHANGE_PRIMARY", note: "Binance's own public REST API for its own order book/kline data." },
    freshness: { cacheTtlMs: 60_000, note: "getKlines() cached 60s per symbol+interval (lib/cache.ts key bn:klines:*)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "No fixed per-key quota assumed; Binance's public market-data endpoints are unauthenticated and IP-rate-limited by Binance, not by this app." },
    modulePath: "lib/binance.ts (getKlines, get24hTicker)",
    requiredEnvVars: [],
  },
  {
    source: "coingecko_markets",
    label: "CoinGecko Market Aggregates",
    category: "market",
    capability: ["spot_price"],
    dataType: "REALTIME_QUOTE",
    reliability: { tier: "MULTI_EXCHANGE_AGGREGATE", note: "Aggregates price/market-cap across many venues; not any single exchange's own tape." },
    freshness: { cacheTtlMs: 60_000, note: "getTopMarkets() cached 60s (lib/cache.ts key cg:markets:*)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "Public free-tier endpoint, no key in this app; CoinGecko's own anonymous rate limit applies, not a quota this app tracks." },
    modulePath: "lib/coingecko.ts (getTopMarkets, getGlobal)",
    requiredEnvVars: [],
  },
  {
    source: "geckoterminal_dex_pools",
    label: "GeckoTerminal DEX Pool Activity",
    category: "market",
    capability: ["dex_pool_activity"],
    dataType: "TIME_SERIES",
    reliability: { tier: "MULTI_EXCHANGE_AGGREGATE", note: "Aggregates on-chain DEX pool data across eth/bsc/solana/base/arbitrum (see lib/geckoterminal.ts NETWORKS list)." },
    freshness: { cacheTtlMs: 60_000, note: "getTrendingPools()/getNewPools() cached 60s (lib/cache.ts keys gt:trending, gt:new)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "Public free-tier endpoint, no key required." },
    modulePath: "lib/geckoterminal.ts (getTrendingPools, getNewPools)",
    requiredEnvVars: [],
  },
  {
    source: "alternativeme_fear_greed",
    label: "Alternative.me Fear & Greed Index",
    category: "market",
    capability: ["fear_greed_index"],
    dataType: "TIME_SERIES",
    reliability: { tier: "FREE_THIRD_PARTY_API", note: "Third-party composite index, not derived from any single exchange's raw data by this app." },
    freshness: { cacheTtlMs: 300_000, note: "getFearGreed() cached 5min (lib/cache.ts key altme:fng)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "No key required, no documented quota." },
    modulePath: "lib/alternativeme.ts (getFearGreed)",
    requiredEnvVars: [],
  },

  // --- derivatives ------------------------------------------------------
  {
    source: "binance_derivatives",
    label: "Binance Futures Derivatives",
    category: "derivatives",
    capability: ["funding_rate", "open_interest", "long_short_ratio"],
    dataType: "TIME_SERIES",
    reliability: { tier: "EXCHANGE_PRIMARY", note: "Binance's own futures API; only DERIVATIVES_WATCHLIST symbols get real data, everything else is honestly reported hasData:false (lib/derivatives.ts)." },
    freshness: { cacheTtlMs: 45_000, note: "getFundingSnapshot() cached 45s; open-interest history cached 60s; long/short ratio cached 60s (lib/cache.ts keys bn:funding, bn:oi-hist:*, bn:ls-ratio:*)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "Public futures endpoints, IP-rate-limited by Binance, not by an app-side key." },
    modulePath: "lib/binance.ts (getFundingSnapshot, getOpenInterestHistory, getLongShortRatio); shaped by lib/derivatives.ts",
    requiredEnvVars: [],
  },
  {
    source: "bybit_funding",
    label: "Bybit Funding Rate",
    category: "derivatives",
    capability: ["funding_rate"],
    dataType: "TIME_SERIES",
    reliability: { tier: "EXCHANGE_PRIMARY", note: "Bybit's own public funding-rate endpoint — third cross-exchange funding source alongside Binance/OKX; order book/order flow stay Binance-only by design." },
    freshness: { cacheTtlMs: 300_000, note: "getFundingHistory() cached 5min (lib/cache.ts key bybit:funding-hist:*)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "No key required." },
    modulePath: "lib/bybit.ts (getFundingHistory)",
    requiredEnvVars: [],
  },
  {
    source: "okx_funding",
    label: "OKX Funding Rate",
    category: "derivatives",
    capability: ["funding_rate"],
    dataType: "TIME_SERIES",
    reliability: { tier: "EXCHANGE_PRIMARY", note: "OKX's own public funding-rate endpoint — second cross-exchange funding source." },
    freshness: { cacheTtlMs: 60_000, note: "getCurrentFunding() cached 60s; getFundingHistory() cached 5min (lib/cache.ts keys okx:funding-current:*, okx:funding-hist:*)." },
    accessMethod: "REST_PUBLIC",
    rateLimit: { documented: false, note: "No key required." },
    modulePath: "lib/okx.ts (getCurrentFunding, getFundingHistory)",
    requiredEnvVars: [],
  },
  {
    source: "alchemy_whale_transfers",
    label: "Alchemy On-Chain Whale Transfers",
    category: "derivatives",
    capability: ["whale_transfer"],
    dataType: "AGGREGATE_FLOW",
    reliability: { tier: "ONCHAIN_DIRECT", note: "Reads real Ethereum mainnet transfer events for a curated ERC-20 watchlist above a $250k USD threshold (lib/alchemy.ts) — ground truth, but watchlist-limited, not full-chain coverage." },
    freshness: { cacheTtlMs: 45_000, note: "getWhaleTransfers() cached 45s (lib/cache.ts key alch:whales)." },
    accessMethod: "RPC_ONCHAIN",
    rateLimit: { documented: false, note: "Governed by the connected Alchemy plan's compute-unit quota; no fixed number assumed here." },
    modulePath: "lib/alchemy.ts (getWhaleTransfers)",
    requiredEnvVars: ["ALCHEMY_API_KEY"],
  },
  {
    source: "cryptoquant_exchange_flow",
    label: "CryptoQuant Exchange Flows",
    category: "derivatives",
    capability: ["exchange_flow"],
    dataType: "TIME_SERIES",
    reliability: {
      tier: "PAID_DATA_VENDOR",
      note: "Requires a Professional/Premium CryptoQuant subscription — a bad/expired/missing token behaves identically (undefined), it will not crash the pipeline (lib/intelligence/sources/cryptoquant.ts).",
    },
    freshness: { cacheTtlMs: 60_000, note: "getExchangeFlow() cached 60s (lib/cache.ts key cq:flow:*)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: false, note: "Tied to subscription tier; not documented as a fixed per-minute/day number in this app." },
    modulePath: "lib/intelligence/sources/cryptoquant.ts (getExchangeFlow)",
    requiredEnvVars: ["CRYPTOQUANT_API_KEY"],
  },

  // --- macro (macro/news) -------------------------------------------------
  {
    source: "forexfactory_calendar",
    label: "ForexFactory Economic Calendar",
    category: "macro",
    capability: ["economic_release"],
    dataType: "SCHEDULED_RELEASE",
    reliability: { tier: "UNOFFICIAL_PUBLIC_FEED", note: "Unofficial, no-auth JSON feed with no SLA — can change or break without notice (lib/economiccalendar.ts). Never populates a realized `actual` print (lib/economicData/providers/forexFactoryProvider.ts)." },
    freshness: { cacheTtlMs: 3_600_000, note: "getEconomicCalendar() cached 1h (lib/cache.ts key ff:calendar)." },
    accessMethod: "UNOFFICIAL_FEED",
    rateLimit: { documented: false, note: "No published quota; unofficial feed." },
    modulePath: "lib/economiccalendar.ts (getEconomicCalendar); lib/economicData/providers/forexFactoryProvider.ts",
    requiredEnvVars: [],
  },
  {
    source: "alphavantage_economic_observations",
    label: "Alpha Vantage Economic Observations",
    category: "macro",
    capability: ["economic_observation"],
    dataType: "TIME_SERIES",
    reliability: { tier: "FREE_THIRD_PARTY_API", note: "Historical indicator time-series, fetched sequentially with first-throttle-stops-the-run handling (Correction 2 in the source file) — never assumes a fixed daily quota." },
    freshness: { cacheTtlMs: 21_600_000, note: "Each function's series cached 6h (lib/cache.ts key av:*)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: false, note: "Deliberately not assumed — see the source file's own 'Correction 2' note on why no '25/day'-style number is hardcoded." },
    modulePath: "lib/economicData/providers/alphaVantageProvider.ts",
    requiredEnvVars: ["ALPHA_VANTAGE_API_KEY"],
  },
  {
    source: "fred_macro_series",
    label: "FRED Macro Series (DXY proxy, M2, yields, Fed funds)",
    category: "macro",
    capability: ["fx_rate"],
    dataType: "TIME_SERIES",
    reliability: {
      tier: "FREE_THIRD_PARTY_API",
      note: "FRED has no literal DXY series — DTWEXBGS (Fed Broad USD Index) is used as a documented substitute, labeled 'DXY (Broad USD Index)' in the UI rather than overstating precision (lib/macro.ts).",
    },
    freshness: { cacheTtlMs: 21_600_000, note: "DXY/US10Y/Fed funds cached 6h, M2 cached 12h, US debt cached 6h (lib/cache.ts keys macro:dxy, macro:m2, macro:us10y, macro:fedfunds, macro:usdebt)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: false, note: "No fixed quota assumed." },
    modulePath: "lib/macro.ts (getDxyProxy, getM2, getUs10y, getFedFundsRate, getUsDebt)",
    requiredEnvVars: ["FRED_API_KEY"],
  },
  {
    source: "cryptopanic_news",
    label: "CryptoPanic Crypto News",
    category: "macro",
    capability: ["crypto_news"],
    dataType: "EVENT_FEED",
    reliability: { tier: "FREE_THIRD_PARTY_API", note: "Crypto-specific news aggregator; sentiment is derived from community vote counts on CryptoPanic itself, not from this app's own NLP (lib/intelligence/sources/cryptoNews.ts)." },
    freshness: { cacheTtlMs: 60_000, note: "getCryptoPanicNews() cached 60s (lib/cache.ts key intel:cryptoNews)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: false, note: "Tied to CryptoPanic's free-tier plan; no fixed number hardcoded here." },
    modulePath: "lib/intelligence/sources/cryptoNews.ts (getCryptoPanicNews)",
    requiredEnvVars: ["CRYPTOPANIC_API_KEY"],
  },
  {
    source: "general_news_feed",
    label: "General Crypto/Macro News (NewsAPI + GNews fallback)",
    category: "macro",
    capability: ["general_news"],
    dataType: "EVENT_FEED",
    reliability: { tier: "FREE_THIRD_PARTY_API", note: "Two providers tried in order (NewsAPI, then GNews) — NewsAPI's free tier rejects deployed-server origins per its own policy, which is why GNews exists as the deployed fallback (lib/newsapi.ts)." },
    freshness: { cacheTtlMs: 120_000, note: "Combined feed cached 120s (lib/cache.ts key newsapi:crypto)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: true, note: "NewsAPI.org free tier: 100 requests/day (headlines only, localhost-origin only). GNews.io free tier: 100 requests/day, no localhost restriction." },
    modulePath: "lib/newsapi.ts",
    requiredEnvVars: ["NEWSAPI_KEY", "GNEWS_API_KEY"],
  },
  {
    source: "twelvedata_fx_commodity",
    label: "TwelveData FX/Commodity/USD Series",
    category: "macro",
    capability: ["fx_rate", "commodity_price"],
    dataType: "TIME_SERIES",
    reliability: { tier: "FREE_THIRD_PARTY_API", note: "Shared TwelveData fetcher for DXY proxy, 4 FX pairs, and XAU/USD; symbol/plan coverage can change over time (lib/intelligence/sources/{usd,forex,gold,twelvedata}.ts)." },
    freshness: { cacheTtlMs: 30_000, note: "usd/forex/gold readings each cached 30s (lib/cache.ts keys intel:usd, intel:fx:*, intel:gold)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: true, note: "TwelveData free tier: 8 requests/min, 800/day (stated in lib/intelligence/sources/usd.ts)." },
    modulePath: "lib/intelligence/sources/twelvedata.ts, usd.ts, forex.ts, gold.ts",
    requiredEnvVars: ["TWELVEDATA_API_KEY"],
  },
  {
    source: "finnhub_equity_proxy",
    label: "Finnhub Equity Index Proxy (Nasdaq/S&P 500/Dow ETFs)",
    category: "macro",
    capability: ["equity_index_proxy"],
    dataType: "REALTIME_QUOTE",
    reliability: {
      tier: "FREE_THIRD_PARTY_API",
      note: "True index tickers are gated behind Finnhub's paid indices add-on, so this uses highly-liquid tracking ETFs as a documented proxy, not the literal index (lib/intelligence/sources/stocks.ts).",
    },
    freshness: { cacheTtlMs: 30_000, note: "Stocks node cached 30s (lib/cache.ts key intel:stocks)." },
    accessMethod: "REST_KEYED",
    rateLimit: { documented: true, note: "Finnhub free tier: 60 calls/min (stated in lib/intelligence/sources/stocks.ts)." },
    modulePath: "lib/intelligence/sources/stocks.ts",
    requiredEnvVars: ["FINNHUB_API_KEY"],
  },

  // --- community ----------------------------------------------------------
  {
    source: "community_unintegrated",
    label: "Community Intelligence (not yet integrated)",
    category: "community",
    capability: ["narrative_emergence", "discussion_velocity", "sentiment_divergence", "catalyst_announcement", "ecosystem_activity", "manipulation_risk"],
    dataType: "NOT_INTEGRATED",
    reliability: { tier: "UNVERIFIED_COMMUNITY", note: "Placeholder only. No Twitter/X, Reddit, Telegram, or Discord client exists anywhere in this repository as of this audit — nothing reads or simulates community activity today." },
    freshness: { cacheTtlMs: null, note: "Not cached — there is no fetch to cache." },
    accessMethod: "NOT_INTEGRATED",
    rateLimit: { documented: false, note: "N/A — no provider is connected." },
    modulePath: "NOT_IMPLEMENTED — reserved for Phase 8.4.4",
    requiredEnvVars: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Lookups — pure, read-only. No fetching, no side effects.
// ---------------------------------------------------------------------------

export function getSourceById(source: string): ExternalSourceDefinition | undefined {
  return EXTERNAL_SOURCE_REGISTRY.find((s) => s.source === source);
}

export function getSourcesByCategory(category: SourceCategory): readonly ExternalSourceDefinition[] {
  return EXTERNAL_SOURCE_REGISTRY.filter((s) => s.category === category);
}

export function getSourcesByCapability(capability: SourceCapability): readonly ExternalSourceDefinition[] {
  return EXTERNAL_SOURCE_REGISTRY.filter((s) => s.capability.includes(capability));
}

/**
 * The ONLY function in this module that reads real runtime state
 * (process.env). Pure with respect to its input at any given instant, but
 * its result can change between calls if env config changes (e.g. a key
 * is added mid-process) — callers that need a snapshot for a single
 * decision should call this once and reuse the result, not call it
 * per-field.
 *
 * A source with `accessMethod === "NOT_INTEGRATED"` always reports
 * UNAVAILABLE_NOT_INTEGRATED regardless of env vars — there is no code
 * path that could make it available.
 *
 * This never verifies the key is VALID or that the network is reachable
 * — only that required configuration is present. A present-but-wrong key
 * still reports AVAILABLE here; the actual fetch (Phase 8.4.2+) is what
 * discovers an invalid key, exactly like every existing source function
 * in this app already does (undefined on 401/403, never a crash).
 */
export function checkAvailability(def: ExternalSourceDefinition): SourceAvailability {
  if (def.accessMethod === "NOT_INTEGRATED") return "UNAVAILABLE_NOT_INTEGRATED";
  const missing = def.requiredEnvVars.length > 0 && !def.requiredEnvVars.some((v) => Boolean(process.env[v]));
  if (missing) return "UNAVAILABLE_NO_KEY";
  return "AVAILABLE";
}

export function listAvailableSources(): readonly ExternalSourceDefinition[] {
  return EXTERNAL_SOURCE_REGISTRY.filter((s) => checkAvailability(s) === "AVAILABLE");
}

export function listAvailableSourcesByCapability(capability: SourceCapability): readonly ExternalSourceDefinition[] {
  return getSourcesByCapability(capability).filter((s) => checkAvailability(s) === "AVAILABLE");
}

/**
 * Capability-level rollup of checkAvailability() — added for Phase 8.4.2
 * (Research Trigger), which needs to say whether a REQUESTED capability
 * currently has anything real behind it, without picking a specific
 * source itself (source selection stays a later-phase concern).
 *
 *   - No registered source declares this capability at all -> UNAVAILABLE_NOT_INTEGRATED
 *     (matches the community placeholder's own six capabilities today).
 *   - At least one registered source is AVAILABLE right now -> AVAILABLE.
 *   - Sources exist but none is currently available, and at least one of
 *     them fails only for a missing key (not because it's unintegrated)
 *     -> UNAVAILABLE_NO_KEY (the more actionable of the two "not available
 *     yet" reasons — a key can be added; NOT_INTEGRATED cannot).
 */
export function getCapabilityAvailability(capability: SourceCapability): SourceAvailability {
  const sources = getSourcesByCapability(capability);
  if (sources.length === 0) return "UNAVAILABLE_NOT_INTEGRATED";
  if (sources.some((s) => checkAvailability(s) === "AVAILABLE")) return "AVAILABLE";
  if (sources.some((s) => checkAvailability(s) === "UNAVAILABLE_NO_KEY")) return "UNAVAILABLE_NO_KEY";
  return "UNAVAILABLE_NOT_INTEGRATED";
}
