import { getSupabase } from "@/lib/supabase";

const TABLE = "market_history";

// ---------------------------------------------------------------------------
// Storage budget for the shared market_history table (Footprint + TPO +
// Liquidity Heatmap all write here — see supabase/schema.sql). Supabase
// Free's whole-project cap is 500MB; this keeps ONE table's rolling buffer
// well inside that regardless of how volatile a week gets (NFP/FOMC/CPI can
// inflate footprint row counts fast). See PHASE spec: "target maksimum
// market_history: 250 MB", not the project-wide limit.
// ---------------------------------------------------------------------------
export const STORAGE_WARNING_BYTES = 200 * 1024 * 1024; // 200 MB — enter pressure mode
export const STORAGE_CRITICAL_BYTES = 250 * 1024 * 1024; // 250 MB — must cleanup now
export const STORAGE_TARGET_BYTES = 190 * 1024 * 1024; // cleanup drains back to ~180-200MB, aim for the middle

// How long a cached size reading is trusted before re-querying Postgres.
// Every indicator persist call goes through ensureStorageBudget(), so
// without this cache every single write would run pg_total_relation_size —
// exactly the "full database scan on every poll" the spec forbids. 10
// minutes is frequent enough to react well within a single volatile
// session, cheap enough to never be a bottleneck on the hot path.
const SIZE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

// ensureStorageBudget() runs INLINE on the hot persist path (called from
// every Footprint/TPO/Liquidity write), so its own cleanup nudge must stay
// small and non-blocking — never a scan-until-done loop. The daily cron
// (see app/api/market-history/cleanup) is what does the heavy multi-batch
// draining; this just keeps pressure from growing unchecked on a busy day
// between cron runs.
const INLINE_CLEANUP_BATCH_ROWS = 500;

// Cron's batch size per DELETE — larger since it isn't on the hot path,
// still bounded so no single query scans/locks too much at once.
export const CRON_CLEANUP_BATCH_ROWS = 2000;
// Hard cap on how many batches one cron invocation will run — a real
// safety limit against turning a bad backlog into a function-timeout risk,
// not a "delete exactly N and stop" number.
export const CRON_MAX_BATCHES = 25;

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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
 * Deletes the oldest `maxRows` market_history rows (across ALL kinds —
 * Footprint/TPO/Liquidity share one rolling buffer, one shared cleanup) and
 * returns how many were actually removed. Ordered by `created_at` ascending
 * — same timestamp column the existing daily retention job
 * (cleanupExpiredMarketHistory in store.ts) already uses as its source of
 * truth, so both cleanup paths agree on what "oldest" means and can never
 * fight each other. Two-step select-then-delete (not a single DELETE ...
 * ORDER BY ... LIMIT) so this only ever removes exactly the batch it
 * inspected — no surprises from a concurrent insert changing what "the
 * oldest N" means between planning and deleting.
 *
 * Never deletes everything: bounded by `maxRows`, and if fewer than
 * `maxRows` old rows exist it simply deletes what's there and stops —
 * there is no scenario where this empties the table, since callers always
 * re-check real usage before running another batch (see the cron loop in
 * app/api/market-history/cleanup) rather than looping blindly. Best-effort
 * and never throws, matching every other function in this file's "an
 * indicator pipeline write/read must never crash because storage
 * maintenance had a hiccup" contract.
 */
export async function cleanupOldestMarketHistory(maxRows: number = CRON_CLEANUP_BATCH_ROWS): Promise<{ deleted: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { deleted: 0 };
  try {
    const { data: victims, error: selErr } = await supabase.from(TABLE).select("id").order("created_at", { ascending: true }).limit(maxRows);
    if (selErr) {
      console.error("[MarketHistory] cleanup select failed:", selErr.message);
      return { deleted: 0, error: selErr.message };
    }
    if (!victims || victims.length === 0) return { deleted: 0 };
    const ids = victims.map((v) => v.id as string);
    const { error: delErr, count } = await supabase.from(TABLE).delete({ count: "exact" }).in("id", ids);
    if (delErr) {
      console.error("[MarketHistory] cleanup delete failed:", delErr.message);
      return { deleted: 0, error: delErr.message };
    }
    return { deleted: count ?? ids.length };
  } catch (err) {
    console.error("[MarketHistory] cleanup failed:", err instanceof Error ? err.message : err);
    return { deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

let inlineCleanupInFlight = false;

/**
 * Called at the top of every Footprint/TPO/Liquidity persist path (see
 * lib/marketHistory/store.ts) and before the Footprint backfill loop opens
 * a new historical batch (see app/api/footprint-candles/route.ts). Cheap
 * (usually just the cached meta read) and NEVER blocks or skips the
 * caller's own write — persistence must keep working regardless of
 * pressure, per spec ("jangan menghentikan Footprint, TPO, atau Liquidity
 * Heatmap"). All this does is:
 *
 *   1. Read current pressure (cached in the common case).
 *   2. If CRITICAL, fire a SINGLE bounded inline cleanup batch in the
 *      background (not awaited by the caller, so it can never slow down
 *      the indicator write that triggered this check) — a small nudge
 *      downward between cron runs, not the full drain. `inlineCleanupInFlight`
 *      is a same-instance guard so a burst of concurrent persist calls on a
 *      warm serverless instance doesn't fire a dozen redundant cleanup
 *      batches at once; it resets per cold start, which is fine since the
 *      worst case is one extra harmless batch.
 *
 * Returns the pressure so callers with a real choice — e.g. footprint's
 * backfill loop, which is the one place still expanding older history —
 * can decide to prioritize newest data and stop opening new historical
 * batches while pressure is elevated, without ever touching the live/most-
 * recent write that actually needs to persist.
 */
export async function ensureStorageBudget(): Promise<StoragePressure> {
  const usage = await getMarketHistoryStorageUsage();
  if (usage.pressure === "CRITICAL" && !inlineCleanupInFlight) {
    inlineCleanupInFlight = true;
    cleanupOldestMarketHistory(INLINE_CLEANUP_BATCH_ROWS)
      .then((result) => {
        if (result.deleted > 0) console.log(`[MarketHistory] inline pressure cleanup deleted ${result.deleted} rows`);
      })
      .catch(() => {})
      .finally(() => {
        inlineCleanupInFlight = false;
      });
  }
  return usage.pressure;
}
