import { getSupabase } from "@/lib/supabase";
import { currentWeekStartUtc } from "./weekCycle";
import type { CandleFootprint, FootprintCell } from "@/lib/elvoid/footprint";

const RETENTION_DAYS = 7;
const TABLE = "market_history";

interface MarketHistoryRow {
  candle_time: string;
  price_buckets: FootprintCell[];
  delta: number | null;
  total_volume: number;
}

/**
 * Best-effort persistence of freshly-computed candle footprints. Never
 * throws — a Supabase hiccup should never break a response that already has
 * real data in hand, same "everything degrades gracefully" rule every other
 * getSupabase() caller in this codebase follows.
 */
export async function persistFootprintCandles(symbol: string, interval: string, footprintMap: Map<number, CandleFootprint>): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || footprintMap.size === 0) return;
  const weekStart = currentWeekStartUtc().toISOString();
  const rows = Array.from(footprintMap.values()).map((fp) => ({
    symbol,
    interval,
    kind: "footprint" as const,
    candle_time: new Date(fp.candleTime).toISOString(),
    price_buckets: fp.cells,
    delta: fp.delta,
    total_volume: fp.totalVolume,
    week_start: weekStart,
  }));
  try {
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "symbol,interval,kind,candle_time" });
    if (error) console.error("[ElVoid AI] persistFootprintCandles:", error.message);
  } catch (err) {
    console.error("[ElVoid AI] persistFootprintCandles:", err instanceof Error ? err.message : err);
  }
}

/**
 * Reads stored footprint rows for candles the caller doesn't already have
 * live coverage for — extends historical Footprint coverage past Binance's
 * live 1000-trade window using only real, previously-collected data. Empty
 * map (never throws) if Supabase isn't configured, nothing was requested, or
 * the query fails.
 */
export async function loadStoredFootprintCandles(symbol: string, interval: string, candleTimesMs: number[]): Promise<Map<number, CandleFootprint>> {
  const result = new Map<number, CandleFootprint>();
  const supabase = getSupabase();
  if (!supabase || candleTimesMs.length === 0) return result;
  try {
    const isoTimes = candleTimesMs.map((t) => new Date(t).toISOString());
    const { data, error } = await supabase
      .from(TABLE)
      .select("candle_time, price_buckets, delta, total_volume")
      .eq("symbol", symbol)
      .eq("interval", interval)
      .eq("kind", "footprint")
      .in("candle_time", isoTimes);
    if (error || !data) {
      if (error) console.error("[ElVoid AI] loadStoredFootprintCandles:", error.message);
      return result;
    }
    for (const row of data as MarketHistoryRow[]) {
      const t = new Date(row.candle_time).getTime();
      const cells = row.price_buckets ?? [];
      let poc: FootprintCell | null = null;
      for (const c of cells) {
        const total = c.buyVolume + c.sellVolume;
        if (!poc || total > poc.buyVolume + poc.sellVolume) poc = c;
      }
      result.set(t, { candleTime: t, cells, poc, delta: row.delta ?? 0, totalVolume: row.total_volume });
    }
  } catch (err) {
    console.error("[ElVoid AI] loadStoredFootprintCandles:", err instanceof Error ? err.message : err);
  }
  return result;
}

/**
 * Deletes market_history rows older than the 7-day retention window,
 * regardless of `kind` — one shared table, one shared cleanup. Server-side
 * only (see app/api/market-history/cleanup); never call this from the
 * browser.
 */
export async function cleanupExpiredMarketHistory(): Promise<{ configured: boolean; deleted: number }> {
  const supabase = getSupabase();
  if (!supabase) return { configured: false, deleted: 0 };
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase.from(TABLE).delete({ count: "exact" }).lt("created_at", cutoff);
  if (error) {
    console.error("[ElVoid AI] cleanupExpiredMarketHistory:", error.message);
    return { configured: true, deleted: 0 };
  }
  return { configured: true, deleted: count ?? 0 };
}
