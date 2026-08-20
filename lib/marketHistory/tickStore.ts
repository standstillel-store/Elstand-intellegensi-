import { getDataSupabase } from "@/lib/supabaseData";
import type { AggTradeWithId } from "@/lib/binance";
import { ensureTickStorageBudget } from "./tickStorageGuard";

const TABLE = "bn_trade_ticks";

// Rolling retention window. See the STORAGE WARNING in supabase/schema.sql
// — BTC futures tick volume can genuinely exceed Supabase Free's 500MB cap
// well before 7 days at high volatility. Shorten this (and re-run a cleanup
// pass) if that happens; nothing else in the capture pipeline depends on
// the exact number.
const TICK_RETENTION_DAYS = 7;

/**
 * The pagination cursor for continuous capture: the highest agg_id already
 * stored for this symbol. Returns null if nothing is stored yet (first-ever
 * run), which the caller uses to bootstrap from the live recent-trades
 * window instead of an arbitrary fromId. Never throws — degrades to null on
 * any failure, same as every other store function in this codebase.
 */
export async function getLastStoredAggId(symbol: string): Promise<number | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("agg_id")
      .eq("symbol", symbol)
      .order("agg_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[ElVoid AI] getLastStoredAggId:", error.message);
      return null;
    }
    return data ? Number(data.agg_id) : null;
  } catch (err) {
    console.error("[ElVoid AI] getLastStoredAggId:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Bulk-insert real ticks, deduped on (symbol, agg_id) via upsert with
 * ignoreDuplicates — safe to call with overlapping data (e.g. a retry after
 * a partial failure) without creating duplicate rows. Never throws.
 */
export async function insertTicks(symbol: string, ticks: AggTradeWithId[]): Promise<number> {
  const supabase = getDataSupabase();
  if (!supabase || ticks.length === 0) return 0;
  // Size check before every insert — same pattern as market_history's
  // ensureStorageBudget(). Fires a background full reset if >=250MB;
  // never blocks or skips this insert.
  void ensureTickStorageBudget();
  const rows = ticks.map((t) => ({
    symbol,
    agg_id: t.aggId,
    price: t.price,
    qty: t.qty,
    is_sell: t.isSell,
    trade_time: new Date(t.time).toISOString(),
  }));
  try {
    const { error, count } = await supabase.from(TABLE).upsert(rows, { onConflict: "symbol,agg_id", ignoreDuplicates: true, count: "exact" });
    if (error) {
      console.error("[ElVoid AI] insertTicks:", error.message);
      return 0;
    }
    return count ?? rows.length;
  } catch (err) {
    console.error("[ElVoid AI] insertTicks:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Deletes ticks older than the rolling retention window. Time-based only
 * (trade_time, the real exchange timestamp) — same "purely time-based, not
 * a week-boundary reset" rule market_history's cleanup already follows.
 */
export async function cleanupExpiredTicks(symbol?: string): Promise<{ configured: boolean; deleted: number }> {
  const supabase = getDataSupabase();
  if (!supabase) return { configured: false, deleted: 0 };
  const cutoff = new Date(Date.now() - TICK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    let query = supabase.from(TABLE).delete({ count: "exact" }).lt("trade_time", cutoff);
    if (symbol) query = query.eq("symbol", symbol);
    const { error, count } = await query;
    if (error) {
      console.error("[ElVoid AI] cleanupExpiredTicks:", error.message);
      return { configured: true, deleted: 0 };
    }
    return { configured: true, deleted: count ?? 0 };
  } catch (err) {
    console.error("[ElVoid AI] cleanupExpiredTicks:", err instanceof Error ? err.message : err);
    return { configured: true, deleted: 0 };
  }
}
