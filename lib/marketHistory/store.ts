import { getSupabase } from "@/lib/supabase";
import { currentWeekStartUtc } from "./weekCycle";
import { ensureStorageBudget } from "./storageGuard";
import type { CandleFootprint, FootprintCell } from "@/lib/elvoid/footprint";
import type { TpoSession } from "@/lib/elvoid/tpo";

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
  // Storage-guard check (cached in the common case, see storageGuard.ts) —
  // never blocks this write; only opportunistically nudges a cleanup batch
  // when usage is CRITICAL. Runs before the write so a pressure-triggered
  // cleanup and this insert can't race into the same statement.
  await ensureStorageBudget();
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
 * Best-effort persistence of freshly-computed TPO sessions. Same
 * never-throws contract as persistFootprintCandles. The whole TpoSession
 * (rows + poc/tvah/tval/high/low/ibr/poor-high-low/blockCount) is stored
 * verbatim in `price_buckets` — market_history's generic jsonb column isn't
 * just for per-price-level arrays, it holds whatever compact real shape the
 * calling indicator already computed, so nothing needs re-deriving on read.
 * `total_volume` is repurposed here as blockCount (a real, meaningful
 * number for a TPO row); `delta` doesn't apply to TPO and stays null.
 *
 * Deliberately scoped to the CANONICAL view only (default bracket size for
 * the given chart interval, default 1D period) — see
 * defaultBlockSizeForChartInterval in lib/elvoid/tpo.ts. A manually
 * overridden bracket size or period is a different, non-comparable
 * partitioning of the same time range, and market_history's unique key
 * (symbol, interval, kind, candle_time) has no column for that — expanding
 * it wasn't necessary per the brief ("kind='tpo' sudah cukup"), so
 * non-canonical views simply run live-only, never cached, instead of
 * risking one bracket size's session silently overwriting another's.
 */
export async function persistTpoSessions(symbol: string, chartInterval: string, sessions: TpoSession[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || sessions.length === 0) return;
  await ensureStorageBudget();
  const weekStart = currentWeekStartUtc().toISOString();
  const rows = sessions.map((s) => ({
    symbol,
    interval: chartInterval,
    kind: "tpo" as const,
    candle_time: new Date(s.sessionStart).toISOString(),
    price_buckets: s,
    delta: null,
    total_volume: s.blockCount,
    week_start: weekStart,
  }));
  try {
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "symbol,interval,kind,candle_time" });
    if (error) console.error("[ElVoid AI] persistTpoSessions:", error.message);
  } catch (err) {
    console.error("[ElVoid AI] persistTpoSessions:", err instanceof Error ? err.message : err);
  }
}

/**
 * Reads stored canonical-view TPO sessions since `sinceMs` — extends
 * historical coverage past whatever `days` window the live request asked
 * for, using only real, previously-collected sessions. Empty array (never
 * throws) if Supabase isn't configured or the query fails.
 */
export async function loadStoredTpoSessions(symbol: string, chartInterval: string, sinceMs: number): Promise<TpoSession[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("price_buckets")
      .eq("symbol", symbol)
      .eq("interval", chartInterval)
      .eq("kind", "tpo")
      .gte("candle_time", new Date(sinceMs).toISOString())
      .order("candle_time", { ascending: true });
    if (error || !data) {
      if (error) console.error("[ElVoid AI] loadStoredTpoSessions:", error.message);
      return [];
    }
    return (data as { price_buckets: TpoSession }[]).map((row) => row.price_buckets);
  } catch (err) {
    console.error("[ElVoid AI] loadStoredTpoSessions:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface LiquiditySnapshotLevel {
  price: number;
  bidLiquidity: number;
  askLiquidity: number;
  totalLiquidity: number;
}

const LIQUIDITY_KIND = "liquidity" as const;
// Liquidity snapshots aren't tied to a chart interval — they're a raw
// point-in-time order-book capture — but market_history's unique key is
// (symbol, interval, kind, candle_time), so a fixed literal interval value
// is used to slot them into the same shared table without touching schema.
const LIQUIDITY_INTERVAL = "snapshot";
// Minimum spacing between persisted snapshots per symbol. Real order-book
// depth doesn't need per-second resolution to show a meaningful time×price
// picture, and Supabase Free's row budget is finite — this keeps storage
// compact (see spec section J, "aggregate, don't blindly store everything").
const MIN_SNAPSHOT_SPACING_MS = 5 * 60 * 1000;

/**
 * Best-effort, THROTTLED persistence of a real order-book depth snapshot.
 * Checked at the database level (not in-memory) so the throttle survives
 * serverless cold starts — a single cheap indexed lookup for this symbol's
 * most recent liquidity row, skipped entirely if one already exists inside
 * MIN_SNAPSHOT_SPACING_MS. This is what section G's "capture order-book
 * depth snapshots periodically and persist them" turns into on a platform
 * without reliable frequent cron (Vercel Hobby): every real call to the
 * live order-book endpoint opportunistically tries to persist, and the
 * throttle makes repeated calls within the window free no-ops instead of
 * flooding the table.
 */
export async function persistLiquiditySnapshotThrottled(symbol: string, timestampMs: number, levels: LiquiditySnapshotLevel[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || levels.length === 0) return;
  await ensureStorageBudget();
  try {
    const { data: last, error: lastErr } = await supabase
      .from(TABLE)
      .select("candle_time")
      .eq("symbol", symbol)
      .eq("interval", LIQUIDITY_INTERVAL)
      .eq("kind", LIQUIDITY_KIND)
      .order("candle_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) {
      console.error("[ElVoid AI] persistLiquiditySnapshotThrottled (lookup):", lastErr.message);
      return;
    }
    if (last && timestampMs - new Date(last.candle_time).getTime() < MIN_SNAPSHOT_SPACING_MS) return;

    const totalLiquidity = levels.reduce((s, l) => s + l.totalLiquidity, 0);
    const weekStart = currentWeekStartUtc(timestampMs).toISOString();
    const { error } = await supabase.from(TABLE).upsert(
      {
        symbol,
        interval: LIQUIDITY_INTERVAL,
        kind: LIQUIDITY_KIND,
        candle_time: new Date(timestampMs).toISOString(),
        price_buckets: levels,
        delta: null,
        total_volume: totalLiquidity,
        week_start: weekStart,
      },
      { onConflict: "symbol,interval,kind,candle_time" },
    );
    if (error) console.error("[ElVoid AI] persistLiquiditySnapshotThrottled (insert):", error.message);
  } catch (err) {
    console.error("[ElVoid AI] persistLiquiditySnapshotThrottled:", err instanceof Error ? err.message : err);
  }
}

export interface StoredLiquiditySnapshot {
  timestamp: number;
  levels: LiquiditySnapshotLevel[];
  totalLiquidity: number;
}

/**
 * Reads real, previously-persisted order-book snapshots for a symbol within
 * [sinceMs, now]. This is the genuine historical order-book series — never
 * confused with the trade/volume-derived proxy (buildLiquidityVolumeMap),
 * which is what the chart uses whenever real snapshot coverage is too thin
 * for the requested window. Empty array (never throws) if Supabase isn't
 * configured or the query fails.
 */
export async function loadStoredLiquiditySnapshots(symbol: string, sinceMs: number): Promise<StoredLiquiditySnapshot[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("candle_time, price_buckets, total_volume")
      .eq("symbol", symbol)
      .eq("interval", LIQUIDITY_INTERVAL)
      .eq("kind", LIQUIDITY_KIND)
      .gte("candle_time", new Date(sinceMs).toISOString())
      .order("candle_time", { ascending: true });
    if (error || !data) {
      if (error) console.error("[ElVoid AI] loadStoredLiquiditySnapshots:", error.message);
      return [];
    }
    return (data as { candle_time: string; price_buckets: LiquiditySnapshotLevel[]; total_volume: number }[]).map((row) => ({
      timestamp: new Date(row.candle_time).getTime(),
      levels: row.price_buckets ?? [],
      totalLiquidity: row.total_volume,
    }));
  } catch (err) {
    console.error("[ElVoid AI] loadStoredLiquiditySnapshots:", err instanceof Error ? err.message : err);
    return [];
  }
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
