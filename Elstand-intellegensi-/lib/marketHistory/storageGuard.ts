import { getDataSupabase } from "@/lib/supabaseData";

const TABLE = "market_history";

// ---------------------------------------------------------------------------
// Storage budget for the shared market_history table (Footprint + TPO +
// Liquidity Heatmap all write here — see supabase/schema.sql). Supabase
// Free's whole-project cap is 500MB; this keeps ONE table's rolling buffer
// well inside that regardless of how volatile a week gets (NFP/FOMC/CPI can
// inflate footprint row counts fast).
//
// Behavior (2026-08 revision): at CRITICAL (>=250MB) the table is FULLY
// RESET (TRUNCATE, ~0MB) rather than drained down to a target — see
// resetMarketHistory() below and supabase/migrations/market-history-full-reset.sql.
// Ingestion (persistFootprintCandles/persistTpoSessions/
// persistLiquiditySnapshotThrottled) keeps writing immediately afterward —
// nothing about the table schema/constraints changes, so fresh rows insert
// exactly as before.
// ---------------------------------------------------------------------------
export const STORAGE_WARNING_BYTES = 200 * 1024 * 1024; // 200 MB — informational "pressure" flag only
export const STORAGE_CRITICAL_BYTES = 250 * 1024 * 1024; // 250 MB — triggers automatic full reset

// How long a cached size reading is trusted before re-querying Postgres.
// Every indicator persist call goes through ensureStorageBudget(), so
// without this cache every single write would run pg_total_relation_size —
// exactly the "full database scan on every poll" the spec forbids. 10
// minutes is frequent enough to react well within a single volatile
// session, cheap enough to never be a bottleneck on the hot path.
const SIZE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type StoragePressure = "NORMAL" | "WARNING" | "CRITICAL";

export interface StorageUsage {
  bytes: number;
  mb: number;
  pressure: StoragePressure;
  /** true if this reading came from the meta cache rather than a fresh query. */
  cached: boolean;
}

function pressureFor(bytes: number): StoragePressure {
  if (bytes >= STORAGE_CRITICAL_BYTES) return "CRITICAL";
  if (bytes >= STORAGE_WARNING_BYTES) return "WARNING";
  return "NORMAL";
}

/**
 * Real Postgres relation size (table + indexes + TOAST — the actual number
 * that counts against Supabase's storage quota, not a row-count estimate).
 * Requires the `market_history_table_size()` SQL function added in
 * supabase/schema.sql. Never throws — null means "couldn't determine it",
 * and callers treat that as NORMAL rather than breaking the indicator
 * pipeline over a monitoring failure.
 */
async function queryActualSizeBytes(): Promise<number | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("market_history_table_size");
    if (error || data == null) {
      if (error) console.error("[MarketHistory] size query failed:", error.message);
      return null;
    }
    return Number(data);
  } catch (err) {
    console.error("[MarketHistory] size query failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function readCachedMeta(): Promise<{ bytes: number; checkedAt: number } | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("market_history_meta").select("last_size_bytes, last_checked_at").eq("id", 1).maybeSingle();
    if (error || !data) return null;
    return { bytes: Number(data.last_size_bytes), checkedAt: new Date(data.last_checked_at).getTime() };
  } catch {
    return null;
  }
}

async function writeCachedMeta(bytes: number): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  try {
    await supabase.from("market_history_meta").upsert({ id: 1, last_size_bytes: bytes, last_checked_at: new Date().toISOString() }, { onConflict: "id" });
  } catch (err) {
    console.error("[MarketHistory] writeCachedMeta failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Current market_history storage usage. Uses the meta-table cache whenever
 * it's fresher than SIZE_CHECK_INTERVAL_MS; only runs the real Postgres
 * size query (and refreshes the cache) when the cached reading is stale or
 * missing, or when `forceRefresh` is passed (used by the cron job, which
 * wants a real number before deciding whether to keep cleaning). Never
 * throws — degrades to `{ bytes: 0, pressure: "NORMAL" }` if Supabase isn't
 * configured or every query fails, so a monitoring outage can never stop
 * Footprint/TPO/Liquidity from persisting.
 */
export async function getMarketHistoryStorageUsage(forceRefresh = false): Promise<StorageUsage> {
  if (!forceRefresh) {
    const cached = await readCachedMeta();
    if (cached && Date.now() - cached.checkedAt < SIZE_CHECK_INTERVAL_MS) {
      return { bytes: cached.bytes, mb: cached.bytes / (1024 * 1024), pressure: pressureFor(cached.bytes), cached: true };
    }
  }
  const fresh = await queryActualSizeBytes();
  if (fresh == null) {
    // Fall back to whatever's cached (even if stale) rather than assuming
    // zero, so a transient RPC hiccup doesn't briefly report "NORMAL" over
    // real CRITICAL usage right before a cron run.
    const cached = await readCachedMeta();
    if (cached) return { bytes: cached.bytes, mb: cached.bytes / (1024 * 1024), pressure: pressureFor(cached.bytes), cached: true };
    return { bytes: 0, mb: 0, pressure: "NORMAL", cached: false };
  }
  await writeCachedMeta(fresh);
  return { bytes: fresh, mb: fresh / (1024 * 1024), pressure: pressureFor(fresh), cached: false };
}

export function shouldTriggerCleanup(pressure: StoragePressure): boolean {
  return pressure === "CRITICAL";
}

/**
 * FULL reset of market_history — TRUNCATEs the table via the
 * reset_market_history_full() SQL function (see
 * supabase/migrations/market-history-full-reset.sql) and returns how many
 * rows were removed. TRUNCATE (not a batched DELETE) so the table's
 * physical size actually drops to ~0 bytes immediately — no waiting on
 * autovacuum — which matters because callers log the real post-reset size
 * right after this runs.
 *
 * Only ever touches market_history. Every other table (whale_transfers,
 * whale_wallets, token_metadata, wallet_balances, users, profiles,
 * bn_credentials, ai_signals, bn_trade_ticks, etc.) lives outside this
 * function's reach entirely — the SQL function's body is a single
 * `truncate table market_history`, nothing else.
 *
 * Never throws — degrades to `{ deleted: 0, error }` like every other
 * function in this file, so a reset failure can never crash the indicator
 * write path that triggered it.
 */
export async function resetMarketHistory(): Promise<{ deleted: number; error?: string }> {
  const supabase = getDataSupabase();
  if (!supabase) return { deleted: 0 };
  try {
    const { data, error } = await supabase.rpc("reset_market_history_full");
    if (error) {
      console.error("[MarketHistory] reset failed:", error.message);
      return { deleted: 0, error: error.message };
    }
    return { deleted: Number(data ?? 0) };
  } catch (err) {
    console.error("[MarketHistory] reset failed:", err instanceof Error ? err.message : err);
    return { deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

let inlineResetInFlight = false;

/**
 * Runs the full reset with the exact logging trail requested: current
 * size, threshold reached, reset triggered, rows deleted, size after
 * reset, timestamp. Shared by both the inline (write-path) trigger and the
 * daily cron, so the log shape is identical no matter which one fires it.
 */
async function performAutomaticReset(usageBeforeMb: number): Promise<void> {
  const resetAt = new Date().toISOString();
  console.log(`[MarketHistory] current size: ${usageBeforeMb.toFixed(1)} MB`);
  console.log(`[MarketHistory] threshold reached: CRITICAL (>= ${(STORAGE_CRITICAL_BYTES / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`[MarketHistory] reset triggered at ${resetAt}`);

  const result = await resetMarketHistory();
  if (result.error) {
    console.error(`[MarketHistory] reset failed, table left as-is: ${result.error}`);
    return;
  }
  console.log(`[MarketHistory] rows deleted: ${result.deleted}`);

  const after = await getMarketHistoryStorageUsage(true); // force a real query — must reflect the post-TRUNCATE size, not a stale cache
  console.log(`[MarketHistory] size after reset: ${after.mb.toFixed(2)} MB`);
  console.log(`[MarketHistory] reset completed at ${new Date().toISOString()}`);
}

/**
 * Called at the top of every Footprint/TPO/Liquidity persist path (see
 * lib/marketHistory/store.ts) and before the Footprint backfill loop opens
 * a new historical batch (see app/api/footprint-candles/route.ts). Cheap
 * (usually just the cached meta read) and NEVER blocks or skips the
 * caller's own write — persistence must keep working regardless of
 * pressure. All this does is:
 *
 *   1. Read current pressure (cached in the common case).
 *   2. If CRITICAL (>=250MB), fire the full reset in the background (not
 *      awaited by the caller, so it can never slow down the indicator
 *      write that triggered this check). `inlineResetInFlight` is a
 *      same-instance guard so a burst of concurrent persist calls on a
 *      warm serverless instance doesn't fire the reset more than once at
 *      a time; it resets per cold start, which is fine — a second reset
 *      attempt on an already-empty table is a harmless no-op (deletes 0
 *      rows).
 *
 * Returns the pressure so callers with a real choice — e.g. footprint's
 * backfill loop, which is the one place still expanding older history —
 * can decide to prioritize newest data and stop opening new historical
 * batches while pressure is elevated, without ever touching the live/most-
 * recent write that actually needs to persist.
 */
export async function ensureStorageBudget(): Promise<StoragePressure> {
  const usage = await getMarketHistoryStorageUsage();
  if (usage.pressure === "CRITICAL" && !inlineResetInFlight) {
    inlineResetInFlight = true;
    performAutomaticReset(usage.mb)
      .catch(() => {})
      .finally(() => {
        inlineResetInFlight = false;
      });
  }
  return usage.pressure;
}
