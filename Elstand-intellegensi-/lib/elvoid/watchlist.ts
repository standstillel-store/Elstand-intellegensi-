import { getSupabase } from "../supabase";

// Curated symbols ElVoid AI scans for Paper Trader signals — the same
// liquid-futures universe lib/binance.ts already tracks for funding/OI, so
// candles, funding context, and whale/news matching always line up for the
// same coin. This is now only the SEED / FALLBACK list: the live,
// user-editable watchlist lives in the `watchlist_items` table (see
// supabase/schema.sql) and is reached through getWatchlist()/getWatchlistCoins()
// below. Same "everything degrades gracefully" rule as the rest of
// lib/elvoid/* (see lib/supabase.ts) — without Supabase configured, or on a
// fresh deploy before the migration is run, Scan Market still works, it
// just always scans this fixed set and add/remove is disabled.
export const ELVOID_WATCHLIST = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "SUI",
  "PEPE",
  "WIF",
  "ARB",
  "OP",
  "TON",
];

export interface WatchlistItem {
  coin: string;
  added_at: string;
}

function fallbackWatchlist(): WatchlistItem[] {
  return ELVOID_WATCHLIST.map((coin) => ({ coin, added_at: new Date(0).toISOString() }));
}

/** The live watchlist — what the AI Signal → Watchlist tab renders. */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  const sb = getSupabase();
  if (!sb) return fallbackWatchlist();

  const { data, error } = await sb.from("watchlist_items").select("coin, added_at").order("added_at", { ascending: true });
  if (error) {
    console.error("[ElVoid AI] getWatchlist error:", error.message);
    return fallbackWatchlist();
  }
  // Empty table (fresh deploy, seed migration not run yet) — fall back
  // instead of showing an empty watchlist and an empty Scan Market.
  if (!data || !data.length) return fallbackWatchlist();
  return data as WatchlistItem[];
}

/** Just the symbols — what scanWatchlist() in service.ts scans. */
export async function getWatchlistCoins(): Promise<string[]> {
  const items = await getWatchlist();
  return items.map((i) => i.coin);
}

export async function addWatchlistCoin(coinRaw: string): Promise<{ ok: boolean; coins?: string[]; error?: string }> {
  const coin = coinRaw.trim().toUpperCase();
  if (!coin) return { ok: false, error: "Sertakan simbol coin, misalnya BTC." };
  if (!/^[A-Z0-9]{1,15}$/.test(coin)) return { ok: false, error: "Simbol coin tidak valid." };

  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase belum dikonfigurasi — watchlist tidak bisa disimpan." };

  const { error } = await sb.from("watchlist_items").insert({ coin });
  // 23505 = unique_violation — coin sudah ada di watchlist, bukan error dari sisi user.
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[ElVoid AI] addWatchlistCoin error:", error.message);
    return { ok: false, error: "Gagal menambahkan coin ke watchlist." };
  }
  return { ok: true, coins: await getWatchlistCoins() };
}

export async function removeWatchlistCoin(coinRaw: string): Promise<{ ok: boolean; coins?: string[]; error?: string }> {
  const coin = coinRaw.trim().toUpperCase();
  if (!coin) return { ok: false, error: "Sertakan simbol coin." };

  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase belum dikonfigurasi — watchlist tidak bisa disimpan." };

  const { error } = await sb.from("watchlist_items").delete().eq("coin", coin);
  if (error) {
    console.error("[ElVoid AI] removeWatchlistCoin error:", error.message);
    return { ok: false, error: "Gagal menghapus coin dari watchlist." };
  }
  return { ok: true, coins: await getWatchlistCoins() };
}
