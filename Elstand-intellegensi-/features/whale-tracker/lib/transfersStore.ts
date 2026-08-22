import { getDataSupabase } from "@/lib/supabaseData";
import { WHALE_CHAIN, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./config";
import { getTokensTrackedCount } from "./tokenMetadataStore";
import type { WhaleTransferRow, TransferFilters, PaginatedTransfers, WhaleSummary } from "../types";

const TABLE = "whale_transfers";

export interface NewWhaleTransfer {
  chain?: string;
  txHash: string;
  logIndex: number; // -1 for native
  blockNumber: number;
  blockTimestamp: string; // ISO
  fromAddress: string;
  toAddress: string;
  isNative: boolean;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenDecimals: number | null;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

/**
 * Idempotent batch insert. Upsert on (chain, tx_hash, log_index) with
 * ignoreDuplicates — same pattern as lib/marketHistory/tickStore.ts's
 * insertTicks. Safe to call with a batch that overlaps a previous
 * (interrupted) run: duplicates are silently skipped, never re-counted or
 * re-persisted, satisfying "Data survives indexer restart without
 * duplication."
 */
export async function insertWhaleTransfers(rows: NewWhaleTransfer[]): Promise<number> {
  const supabase = getDataSupabase();
  if (!supabase || rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    chain: r.chain ?? WHALE_CHAIN,
    tx_hash: r.txHash,
    log_index: r.logIndex,
    block_number: r.blockNumber,
    block_timestamp: r.blockTimestamp,
    from_address: r.fromAddress,
    to_address: r.toAddress,
    is_native: r.isNative,
    token_address: r.tokenAddress,
    token_symbol: r.tokenSymbol,
    token_name: r.tokenName,
    token_decimals: r.tokenDecimals,
    amount: r.amount,
    price_usd: r.priceUsd,
    value_usd: r.valueUsd,
  }));
  try {
    const { error, count } = await supabase.from(TABLE).upsert(payload, { onConflict: "chain,tx_hash,log_index", ignoreDuplicates: true, count: "exact" });
    if (error) {
      console.error("[Whale] insertWhaleTransfers:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[Whale] insertWhaleTransfers:", err instanceof Error ? err.message : err);
    return 0;
  }
}

function rowToTransfer(row: Record<string, unknown>): WhaleTransferRow {
  return {
    id: Number(row.id),
    chain: row.chain as WhaleTransferRow["chain"],
    txHash: row.tx_hash as string,
    logIndex: Number(row.log_index),
    blockNumber: Number(row.block_number),
    blockTimestamp: row.block_timestamp as string,
    fromAddress: row.from_address as string,
    toAddress: row.to_address as string,
    isNative: Boolean(row.is_native),
    tokenAddress: (row.token_address as string) ?? null,
    tokenSymbol: (row.token_symbol as string) ?? null,
    tokenName: (row.token_name as string) ?? null,
    tokenDecimals: row.token_decimals == null ? null : Number(row.token_decimals),
    amount: Number(row.amount),
    priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    valueUsd: row.value_usd == null ? null : Number(row.value_usd),
    createdAt: row.created_at as string,
  };
}

/**
 * Server-side paginated + filtered read — the "All Transfers" table's data
 * source. Pagination via Supabase's `.range()` (a real SQL LIMIT/OFFSET
 * under the hood, not "fetch everything then slice in JS"), count via
 * `{ count: "exact" }` on the same query rather than a second full scan.
 */
export async function getWhaleTransfers(
  filters: TransferFilters,
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
  chain: string = WHALE_CHAIN
): Promise<PaginatedTransfers> {
  const supabase = getDataSupabase();
  const safePage = Math.max(1, page);
  const safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
  if (!supabase) return { rows: [], page: safePage, pageSize: safeSize, total: 0 };

  let query = supabase.from(TABLE).select("*", { count: "exact" }).eq("chain", chain);

  if (filters.minUsd != null) query = query.gte("value_usd", filters.minUsd);
  if (filters.tokenSymbol) query = query.eq("token_symbol", filters.tokenSymbol.toUpperCase());
  if (filters.fromAddress) query = query.eq("from_address", filters.fromAddress.toLowerCase());
  if (filters.toAddress) query = query.eq("to_address", filters.toAddress.toLowerCase());
  if (filters.address) {
    const addr = filters.address.toLowerCase();
    query = query.or(`from_address.eq.${addr},to_address.eq.${addr}`);
  }
  if (filters.sinceIso) query = query.gte("block_timestamp", filters.sinceIso);
  if (filters.untilIso) query = query.lte("block_timestamp", filters.untilIso);

  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  try {
    const { data, error, count } = await query.order("block_timestamp", { ascending: false }).range(from, to);
    if (error || !data) return { rows: [], page: safePage, pageSize: safeSize, total: 0 };
    return { rows: data.map(rowToTransfer), page: safePage, pageSize: safeSize, total: count ?? data.length };
  } catch (err) {
    console.error("[Whale] getWhaleTransfers:", err instanceof Error ? err.message : err);
    return { rows: [], page: safePage, pageSize: safeSize, total: 0 };
  }
}

/** Backs the summary cards row — one RPC round trip (whale_summary_24h, defined in supabase/whale-tracker-schema.sql) plus one cheap count for tokens tracked. Never derived by pulling transfer rows into Node. */
export async function getWhaleSummary(chain: string = WHALE_CHAIN): Promise<WhaleSummary> {
  const supabase = getDataSupabase();
  const empty: WhaleSummary = { totalTransfers: 0, volume24hUsd: 0, largestTransferUsd: 0, activeWallets24h: 0, tokensTracked: 0, asOf: new Date().toISOString() };
  if (!supabase) return empty;
  try {
    const [{ data, error }, tokensTracked] = await Promise.all([supabase.rpc("whale_summary_24h", { p_chain: chain }), getTokensTrackedCount(chain)]);
    if (error || !data || data.length === 0) return { ...empty, tokensTracked };
    const row = data[0] as { total_transfers: number; volume_24h_usd: number; largest_transfer_24h_usd: number; active_wallets_24h: number };
    return {
      totalTransfers: Number(row.total_transfers),
      volume24hUsd: Number(row.volume_24h_usd),
      largestTransferUsd: Number(row.largest_transfer_24h_usd),
      activeWallets24h: Number(row.active_wallets_24h),
      tokensTracked,
      asOf: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[Whale] getWhaleSummary:", err instanceof Error ? err.message : err);
    return empty;
  }
}

/** Recent transfers involving a specific address, most-recent-first, capped — used by Wallet Detail (not the full paginated table). */
export async function getRecentTransfersForAddress(address: string, limit = 25, chain: string = WHALE_CHAIN): Promise<WhaleTransferRow[]> {
  const supabase = getDataSupabase();
  if (!supabase) return [];
  const addr = address.toLowerCase();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("chain", chain)
      .or(`from_address.eq.${addr},to_address.eq.${addr}`)
      .order("block_timestamp", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(rowToTransfer);
  } catch (err) {
    console.error("[Whale] getRecentTransfersForAddress:", err instanceof Error ? err.message : err);
    return [];
  }
}
