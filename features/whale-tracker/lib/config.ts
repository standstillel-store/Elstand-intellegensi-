// Whale Tracker — chain-agnostic config, BSC values wired for V1.
//
// Every knob is env-overridable so thresholds/budgets change without
// touching source (spec: "Threshold harus dapat diubah dari configuration
// tanpa mengubah source code utama"). Same pattern as ALCHEMY_NETWORK in
// lib/alchemy.ts and the STORAGE_* constants in
// lib/marketHistory/storageGuard.ts — a real default, not a required env
// var that breaks the page if unset.

export const WHALE_CHAIN = "bsc" as const;

/** Native BNB is stored in token_metadata / wallet_balances under this sentinel address (not a real contract). */
export const NATIVE_TOKEN_ADDRESS = "native";

/** USD threshold above which a transfer is persisted as "whale". Spec default: $10,000. */
export const WHALE_USD_THRESHOLD = Number(process.env.WHALE_USD_THRESHOLD_BSC ?? process.env.WHALE_USD_THRESHOLD ?? 10_000);

/** BSC RPC endpoint for the block/log indexer. Public default works for read-only log scans at low volume; set BSC_RPC_URL to a dedicated provider (your existing Alchemy key also serves BSC — see README) for production reliability and rate limits. */
export const BSC_RPC_URL = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org";

/** How many blocks the incremental scanner pulls per invocation — bounded so a single run can never balloon into an unbounded catch-up scan. */
export const BSC_BLOCK_BATCH_SIZE = Number(process.env.BSC_BLOCK_BATCH_SIZE ?? 500);

/** How long a resolved token price is trusted before re-fetching — avoids one external price request per individual transfer. */
export const TOKEN_PRICE_CACHE_MS = Number(process.env.WHALE_PRICE_CACHE_MS ?? 60_000);

/** How long resolved token metadata (symbol/name/decimals) is trusted in-memory before a fresh on-chain read. Metadata almost never changes, so this is long-lived. */
export const TOKEN_METADATA_CACHE_MS = Number(process.env.WHALE_METADATA_CACHE_MS ?? 12 * 60 * 60 * 1000);

/** Default server-side page size for the All Transfers table. */
export const DEFAULT_PAGE_SIZE = Number(process.env.WHALE_PAGE_SIZE ?? 25);
export const MAX_PAGE_SIZE = 100;

/** BscScan base URL for "view on explorer" links (Phase: Address → Address flow). */
export const BSC_EXPLORER_URL = process.env.BSC_EXPLORER_URL ?? "https://bscscan.com";

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export { isAuthorizedCron };
