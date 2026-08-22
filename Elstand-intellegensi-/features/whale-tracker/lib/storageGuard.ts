import { getDataSupabase } from "@/lib/supabaseData";

const TABLE = "whale_transfers";

// ---------------------------------------------------------------------------
// Storage budget for whale_transfers. Per spec: "Target maksimum 150 MB
// untuk whale transaction dataset" with hysteresis back down to ~120 MB,
// not "delete everything the instant it crosses the line". Same shape as
// STORAGE_WARNING_BYTES/STORAGE_CRITICAL_BYTES/STORAGE_TARGET_BYTES in
// lib/marketHistory/storageGuard.ts, different table/thresholds.
// ---------------------------------------------------------------------------
export const STORAGE_WARNING_BYTES = 120 * 1024 * 1024; // 120 MB — enter pressure mode
export const STORAGE_CRITICAL_BYTES = 150 * 1024 * 1024; // 150 MB — must cleanup now
export const STORAGE_TARGET_BYTES = 120 * 1024 * 1024; // cleanup drains back to the 120 MB target

// Cached-size read interval — same reasoning as market_history's guard:
// every indexer write calling ensureStorageBudget() must not turn into a
// pg_total_relation_size() call per write.
const SIZE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const INLINE_CLEANUP_BATCH_ROWS = 500;
export const CRON_CLEANUP_BATCH_ROWS = 2000;
export const CRON_MAX_BATCHES = 25;

export type StoragePressure = "NORMAL" | "WARNING" | "CRITICAL";

export interface StorageUsage {
  bytes: number;
  mb: number;
  pressure: StoragePressure;
  cached: boolean;
}

function pressureFor(bytes: number): StoragePressure {
  if (bytes >= STORAGE_CRITICAL_BYTES) return "CRITICAL";
  if (bytes >= STORAGE_WARNING_BYTES) return "WARNING";
  return "NORMAL";
}

async function queryActualSizeBytes(): Promise<number | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("whale_transfers_table_size");
    if (error || data == null) {
      if (error) console.error("[Whale] size query failed:", error.message);
      return null;
    }
    return Number(data);
  } catch (err) {
    console.error("[Whale] size query failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function readCachedMeta(): Promise<{ bytes: number; checkedAt: number } | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("whale_meta").select("last_size_bytes, last_checked_at").eq("id", 1).maybeSingle();
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
    await supabase.from("whale_meta").upsert({ id: 1, last_size_bytes: bytes, last_checked_at: new Date().toISOString() }, { onConflict: "id" });
  } catch (err) {
    console.error("[Whale] writeCachedMeta failed:", err instanceof Error ? err.message : err);
  }
}

/** Current whale_transfers storage usage — cached reading unless stale or forceRefresh is passed (cron always forces a real read). Never throws. */
export async function getWhaleStorageUsage(forceRefresh = false): Promise<StorageUsage> {
  if (!forceRefresh) {
    const cached = await readCachedMeta();
    if (cached && Date.now() - cached.checkedAt < SIZE_CHECK_INTERVAL_MS) {
      return { bytes: cached.bytes, mb: cached.bytes / (1024 * 1024), pressure: pressureFor(cached.bytes), cached: true };
    }
  }
  const fresh = await queryActualSizeBytes();
  if (fresh == null) {
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
 * Deletes the oldest, lowest-value batch of whale_transfers and returns how
 * many rows were removed. Ordering is `value_usd asc nulls first, then
 * block_timestamp asc` — per spec priority list ("Prioritaskan
 * mempertahankan: 1. Important whale transactions, 2. Large-value
 * transactions... Hapus terlebih dahulu: oldest low-value transactions"),
 * so a $12K transfer from last year is dropped before a $2M transfer from
 * last week. Two-step select-then-delete, bounded by maxRows, same
 * never-empties-the-table guarantee as cleanupOldestMarketHistory. Never
 * touches whale_wallets/token_metadata — those are separate tables this
 * function never queries.
 */
export async function cleanupLowestPriorityTransfers(maxRows: number = CRON_CLEANUP_BATCH_ROWS): Promise<{ deleted: number; error?: string }> {
  const supabase = getDataSupabase();
  if (!supabase) return { deleted: 0 };
  try {
    const { data: victims, error: selErr } = await supabase
      .from(TABLE)
      .select("id")
      .order("value_usd", { ascending: true, nullsFirst: true })
      .order("block_timestamp", { ascending: true })
      .limit(maxRows);
    if (selErr) {
      console.error("[Whale] cleanup select failed:", selErr.message);
      return { deleted: 0, error: selErr.message };
    }
    if (!victims || victims.length === 0) return { deleted: 0 };
    const ids = victims.map((v) => v.id as number);
    const { error: delErr, count } = await supabase.from(TABLE).delete({ count: "exact" }).in("id", ids);
    if (delErr) {
      console.error("[Whale] cleanup delete failed:", delErr.message);
      return { deleted: 0, error: delErr.message };
    }
    return { deleted: count ?? ids.length };
  } catch (err) {
    console.error("[Whale] cleanup failed:", err instanceof Error ? err.message : err);
    return { deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

let inlineCleanupInFlight = false;

/**
 * Call at the top of the indexer's persist path (Phase 3+). Never blocks or
 * skips the caller's own write — indexing must keep working regardless of
 * storage pressure. Fires one small bounded batch in the background when
 * CRITICAL; the daily cron (mirroring app/api/market-history/cleanup) does
 * the full multi-batch drain back to STORAGE_TARGET_BYTES.
 */
export async function ensureWhaleStorageBudget(): Promise<StoragePressure> {
  const usage = await getWhaleStorageUsage();
  if (usage.pressure === "CRITICAL" && !inlineCleanupInFlight) {
    inlineCleanupInFlight = true;
    cleanupLowestPriorityTransfers(INLINE_CLEANUP_BATCH_ROWS)
      .then((result) => {
        if (result.deleted > 0) console.log(`[Whale] inline pressure cleanup deleted ${result.deleted} rows`);
      })
      .catch(() => {})
      .finally(() => {
        inlineCleanupInFlight = false;
      });
  }
  return usage.pressure;
}
