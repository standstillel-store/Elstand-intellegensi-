import { getDataSupabase } from "@/lib/supabaseData";
import { WHALE_CHAIN } from "./config";
import type { WalletHolding } from "../types";

const WALLETS_TABLE = "whale_wallets";
const BALANCES_TABLE = "wallet_balances";

export interface WhaleWalletRow {
  address: string;
  chain: string;
  label: string | null;
  category: string | null;
  equityUsd: number | null;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Called by the indexer for every from/to address it persists a transfer
 * for — marks the wallet as "seen" (first_seen only set on insert,
 * last_seen bumped every time). Cheap upsert, no equity computation here
 * (that's the separate, on-demand walletEquity.ts refresh, not something
 * every indexed transfer should trigger).
 */
export async function touchWallet(address: string, chain: string = WHALE_CHAIN): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  const addr = address.toLowerCase();
  try {
    const { data: existing } = await supabase.from(WALLETS_TABLE).select("address").eq("chain", chain).eq("address", addr).maybeSingle();
    if (existing) {
      await supabase.from(WALLETS_TABLE).update({ last_seen: new Date().toISOString() }).eq("chain", chain).eq("address", addr);
    } else {
      await supabase.from(WALLETS_TABLE).insert({ chain, address: addr, first_seen: new Date().toISOString(), last_seen: new Date().toISOString() });
    }
  } catch (err) {
    console.error("[Whale] touchWallet:", err instanceof Error ? err.message : err);
  }
}

export async function getWallet(address: string, chain: string = WHALE_CHAIN): Promise<WhaleWalletRow | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(WALLETS_TABLE).select("*").eq("chain", chain).eq("address", address.toLowerCase()).maybeSingle();
    if (error || !data) return null;
    return {
      address: data.address,
      chain: data.chain,
      label: data.label,
      category: data.category,
      equityUsd: data.equity_usd == null ? null : Number(data.equity_usd),
      firstSeen: data.first_seen,
      lastSeen: data.last_seen,
    };
  } catch (err) {
    console.error("[Whale] getWallet:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setWalletEquity(address: string, equityUsd: number, chain: string = WHALE_CHAIN): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  try {
    await supabase.from(WALLETS_TABLE).update({ equity_usd: equityUsd, updated_at: new Date().toISOString() }).eq("chain", chain).eq("address", address.toLowerCase());
  } catch (err) {
    console.error("[Whale] setWalletEquity:", err instanceof Error ? err.message : err);
  }
}

export async function upsertWalletBalances(address: string, holdings: WalletHolding[], chain: string = WHALE_CHAIN): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase || holdings.length === 0) return;
  const rows = holdings.map((h) => ({
    chain,
    wallet_address: address.toLowerCase(),
    token_address: h.tokenAddress,
    token_symbol: h.tokenSymbol,
    balance: h.balance,
    price_usd: h.priceUsd,
    value_usd: h.valueUsd,
    updated_at: new Date().toISOString(),
  }));
  try {
    await supabase.from(BALANCES_TABLE).upsert(rows, { onConflict: "chain,wallet_address,token_address" });
  } catch (err) {
    console.error("[Whale] upsertWalletBalances:", err instanceof Error ? err.message : err);
  }
}

export async function getWalletBalances(address: string, chain: string = WHALE_CHAIN): Promise<WalletHolding[]> {
  const supabase = getDataSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(BALANCES_TABLE)
      .select("token_address, token_symbol, balance, price_usd, value_usd")
      .eq("chain", chain)
      .eq("wallet_address", address.toLowerCase())
      .order("value_usd", { ascending: false, nullsFirst: false });
    if (error || !data) return [];
    return data.map((r) => ({
      tokenAddress: r.token_address,
      tokenSymbol: r.token_symbol,
      balance: Number(r.balance),
      priceUsd: r.price_usd == null ? null : Number(r.price_usd),
      valueUsd: r.value_usd == null ? null : Number(r.value_usd),
    }));
  } catch (err) {
    console.error("[Whale] getWalletBalances:", err instanceof Error ? err.message : err);
    return [];
  }
}
