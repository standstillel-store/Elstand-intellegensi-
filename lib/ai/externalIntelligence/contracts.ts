// ---------------------------------------------------------------------------
// ELVOID Intelligence — External Source Registry contracts (Phase 8.4.1)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This registry describes WHERE external evidence CAN come from. It
//     does not fetch anything, does not score anything, and does not
//     decide BUY/SELL/EXECUTE/WAIT/REJECT. Every non-community entry in
//     registry.ts maps to a data-fetching function that ACTUALLY EXISTS
//     in this repository as of this phase (see registry.ts's own audit
//     header) — this file was produced by auditing lib/binance.ts,
//     lib/bybit.ts, lib/okx.ts, lib/coingecko.ts, lib/geckoterminal.ts,
//     lib/alternativeme.ts, lib/alchemy.ts, lib/intelligence/sources/*.ts,
//     lib/economicData/*, lib/economiccalendar.ts, and lib/macro.ts, not
//     by imagining a target architecture.
//   - `reliability` is a STRUCTURAL/PROVENANCE description (who publishes
//     the number, how directly) — never a correctness or trust score. No
//     ReliabilityTier member below claims a source is "always right"; see
//     each entry's own `note` for the honest caveat that already existed
//     in that source's original file comment.
//   - `rateLimit` states only limits the provider itself documents. Where
//     this app deliberately avoids assuming an undocumented quota (see
//     lib/economicData/providers/alphaVantageProvider.ts's own
//     "Correction 2" note), this registry says so explicitly rather than
//     inventing a number.
//   - `availability` is never a static flag baked into an entry. It is
//     computed at call time by registry.ts::checkAvailability() from real,
//     checkable state (an env var being set) — see that function's own
//     header for exactly what it does and does not verify.
//   - Community-category sources are deliberately NOT wired to any real
//     API in this codebase today (audit confirmed: no Twitter/X, Reddit,
//     Telegram, or Discord client exists anywhere in the repo, and no
//     env var for one is referenced). They are registered here only as a
//     single honestly-labeled placeholder (per roadmap 8.4.1 requiring
//     the registry to "mencakup ... community") so Phase 8.4.4 has a slot
//     to fill in with real integrations later — nothing about community
//     access is simulated, assumed, or partially faked in the meantime.
// ---------------------------------------------------------------------------

/** Broad domain a source belongs to. Closed — matches the roadmap's own
 *  four categories, nothing invented beyond them. */
export type SourceCategory = "market" | "derivatives" | "macro" | "community";

/**
 * What kind of evidence a source can produce. Closed. Every member that
 * appears on a "market" | "derivatives" | "macro" entry in registry.ts is
 * backed by a real fetch function that already exists in this repo — this
 * type is not a wishlist. The six "community" members exist only so the
 * single community placeholder entry can honestly declare the shape of
 * what Phase 8.4.4 will eventually cover; none of them appear on any
 * entry with real access today.
 */
export type SourceCapability =
  | "spot_price"
  | "dex_pool_activity"
  | "funding_rate"
  | "open_interest"
  | "long_short_ratio"
  | "exchange_flow"
  | "whale_transfer"
  | "fear_greed_index"
  | "crypto_news"
  | "general_news"
  | "economic_release"
  | "economic_observation"
  | "fx_rate"
  | "commodity_price"
  | "equity_index_proxy"
  // Community — declared, not yet backed by any real integration.
  | "narrative_emergence"
  | "discussion_velocity"
  | "sentiment_divergence"
  | "catalyst_announcement"
  | "ecosystem_activity"
  | "manipulation_risk";

/** Shape of the data a source returns, independent of its subject matter. */
export type SourceDataType = "REALTIME_QUOTE" | "TIME_SERIES" | "EVENT_FEED" | "AGGREGATE_FLOW" | "SCHEDULED_RELEASE" | "SOCIAL_SIGNAL" | "NOT_INTEGRATED";

/**
 * Provenance tier — describes HOW DIRECT a number's origin is, never
 * whether it is correct. A PAID_DATA_VENDOR figure and a FREE_THIRD_PARTY
 * figure can both be wrong; this only records the distance between the
 * number and its primary origin so a later evidence-weighting phase has
 * an honest starting fact, not a hardcoded verdict.
 */
export type ReliabilityTier =
  | "EXCHANGE_PRIMARY" // the venue's own API describing its own market (Binance funding on Binance)
  | "ONCHAIN_DIRECT" // read directly off-chain state via an RPC/indexing provider (Alchemy)
  | "MULTI_EXCHANGE_AGGREGATE" // aggregates across venues (CoinGecko, GeckoTerminal)
  | "PAID_DATA_VENDOR" // subscription analytics vendor with its own methodology (CryptoQuant)
  | "FREE_THIRD_PARTY_API" // free-tier third-party API, not the primary venue (Finnhub, TwelveData, Alpha Vantage, FRED, NewsAPI/GNews, CryptoPanic)
  | "UNOFFICIAL_PUBLIC_FEED" // no auth, no SLA, can change or vanish (ForexFactory JSON feed)
  | "UNVERIFIED_COMMUNITY"; // social/community platforms — placeholder tier only, not backed by any live entry yet

export type AccessMethod = "REST_PUBLIC" | "REST_KEYED" | "RPC_ONCHAIN" | "UNOFFICIAL_FEED" | "NOT_INTEGRATED";

export interface RateLimitInfo {
  /** True only when the provider PUBLISHES a fixed quota this registry is quoting. */
  documented: boolean;
  /** Factual: either the provider's own stated limit, or an explicit statement that none is assumed and why. */
  note: string;
}

export interface FreshnessInfo {
  /** The actual in-process TTL this app applies today via lib/cache.ts's cached(), in ms. Null when the source isn't cached (not integrated). */
  cacheTtlMs: number | null;
  note: string;
}

/**
 * Closed result of a real-time availability check — never a source's own
 * static field. See registry.ts::checkAvailability().
 */
export type SourceAvailability = "AVAILABLE" | "UNAVAILABLE_NO_KEY" | "UNAVAILABLE_NOT_INTEGRATED";

export interface ExternalSourceDefinition {
  /** Stable id, e.g. "binance_derivatives". Never reused for a different source. */
  readonly source: string;
  readonly label: string;
  readonly category: SourceCategory;
  /** What this source can produce. Non-empty; every member must be real for non-community entries. */
  readonly capability: readonly SourceCapability[];
  readonly dataType: SourceDataType;
  readonly reliability: { readonly tier: ReliabilityTier; readonly note: string };
  readonly freshness: FreshnessInfo;
  readonly accessMethod: AccessMethod;
  readonly rateLimit: RateLimitInfo;
  /** Real file(s) in this repo backing the source. "NOT_IMPLEMENTED" only for the community placeholder. */
  readonly modulePath: string;
  /** Env var(s) gating this source. Empty array = no key required (public endpoint). */
  readonly requiredEnvVars: readonly string[];
}
