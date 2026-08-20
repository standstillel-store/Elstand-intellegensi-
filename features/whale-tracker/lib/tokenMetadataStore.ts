import { getDataSupabase } from "@/lib/supabaseData";
import { WHALE_CHAIN } from "./config";
import type { TokenMetadataRow } from "../types";

const TABLE = "token_metadata";

function rowToMetadata(row: Record<string, unknown>): TokenMetadataRow {
  return {
    chain: row.chain as TokenMetadataRow["chain"],
    tokenAddress: row.token_address as string,
    symbol: (row.symbol as string) ?? null,
    name: (row.name as string) ?? null,
    decimals: row.decimals == null ? null : Number(row.decimals),
    priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    priceUpdatedAt: (row.price_updated_at as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
  };
}

/** Reads cached metadata for a set of token addresses in one query (never N+1 per transfer). */
export async function getTokenMetadataBatch(tokenAddresses: string[], chain: string = WHALE_CHAIN): Promise<Map<string, TokenMetadataRow>> {
  const out = new Map<string, TokenMetadataRow>();
  const supabase = getDataSupabase();
  if (!supabase || tokenAddresses.length === 0) return out;
  try {
    const { data, error } = await supabase.from(TABLE).select("*").eq("chain", chain).in("token_address", tokenAddresses);
    if (error || !data) return out;
    for (const row of data) out.set((row.token_address as string).toLowerCase(), rowToMetadata(row));
    return out;
  } catch (err) {
    console.error("[Whale] getTokenMetadataBatch:", err instanceof Error ? err.message : err);
    return out;
  }
}

/** Upserts resolved on-chain metadata (symbol/name/decimals) for a token — called once per unseen token, never on every transfer of it. */
export async function upsertTokenMetadata(
  tokenAddress: string,
  fields: { symbol?: string | null; name?: string | null; decimals?: number | null },
  chain: string = WHALE_CHAIN
): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  try {
    await supabase.from(TABLE).upsert(
      { chain, token_address: tokenAddress.toLowerCase(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: "chain,token_address" }
    );
  } catch (err) {
    console.error("[Whale] upsertTokenMetadata:", err instanceof Error ? err.message : err);
  }
}

/** Upserts the price-cache portion (Phase 6 — separate from metadata upsert so the indexer's "new token seen" path and the price refresher's "re-price every N seconds" path don't stomp on each other's `updated_at`). */
export async function upsertTokenPrice(tokenAddress: string, priceUsd: number | null, chain: string = WHALE_CHAIN): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from(TABLE)
      .update({ price_usd: priceUsd, price_updated_at: new Date().toISOString() })
      .eq("chain", chain)
      .eq("token_address", tokenAddress.toLowerCase());
  } catch (err) {
    console.error("[Whale] upsertTokenPrice:", err instanceof Error ? err.message : err);
  }
}

export async function getTokensTrackedCount(chain: string = WHALE_CHAIN): Promise<number> {
  const supabase = getDataSupabase();
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("chain", chain);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
