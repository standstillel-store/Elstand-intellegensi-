import { getDataSupabase } from "@/lib/supabaseData";

// ---------------------------------------------------------------------------
// Storage budget for bn_trade_ticks (raw Binance aggTrade tick data). Same
// pattern as lib/marketHistory/storageGuard.ts for market_history: at
// CRITICAL (>=250MB) the table is FULLY RESET (TRUNCATE, ~0MB) rather than
// relying on the 7-day time-based cleanupExpiredTicks() alone — that cleanup
// only ever runs if /api/tick-capture gets hit, which isn't guaranteed by
// any cron, so this check runs inline on every insertTicks() call instead.
// See supabase/migrations/bn-trade-ticks-full-reset.sql for the SQL side.
// ---------------------------------------------------------------------------
export const TICK_STORAGE_WARNING_BYTES = 200 * 1024 * 1024; // 200 MB — informational only
export const TICK_STORAGE_CRITICAL_BYTES = 250 * 1024 * 1024; // 250 MB — triggers automatic full reset

const SIZE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min — same cache window as market_history

export type StoragePressure = "NORMAL" | "WARNING" | "CRITICAL";

function pressureFor(bytes: number): StoragePressure {
  if (bytes >= TICK_STORAGE_CRITICAL_BYTES) return "CRITICAL";
  if (bytes >= TICK_STORAGE_WARNING_BYTES) return "WARNING";
  return "NORMAL";
}

async function queryActualSizeBytes(): Promise<number | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("bn_trade_ticks_table_size");
    if (error || data == null) {
      if (error) console.error("[TickStorage] size query failed:", error.message);
      return null;
    }
    return Number(data);
  } catch (err) {
    console.error("[TickStorage] size query failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function readCachedMeta(): Promise<{ bytes: number; checkedAt: number } | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("bn_trade_ticks_meta").select("last_size_bytes, last_checked_at").eq("id", 1).maybeSingle();
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
    await supabase.from("bn_trade_ticks_meta").upsert({ id: 1, last_size_bytes: bytes, last_checked_at: new Date().toISOString() }, { onConflict: "id" });
  } catch (err) {
    console.error("[TickStorage] writeCachedMeta failed:", err instanceof Error ? err.message : err);
  }
}

async function getTickStorageUsage(forceRefresh = false): Promise<{ bytes: number; mb: number; pressure: StoragePressure }> {
  if (!forceRefresh) {
    const cached = await readCachedMeta();
    if (cached && Date.now() - cached.checkedAt < SIZE_CHECK_INTERVAL_MS) {
      return { bytes: cached.bytes, mb: cached.bytes / (1024 * 1024), pressure: pressureFor(cached.bytes) };
    }
  }
  const fresh = await queryActualSizeBytes();
  if (fresh == null) {
    const cached = await readCachedMeta();
    if (cached) return { bytes: cached.bytes, mb: cached.bytes / (1024 * 1024), pressure: pressureFor(cached.bytes) };
    return { bytes: 0, mb: 0, pressure: "NORMAL" };
  }
  await writeCachedMeta(fresh);
  return { bytes: fresh, mb: fresh / (1024 * 1024), pressure: pressureFor(fresh) };
}

/**
 * FULL reset of bn_trade_ticks — TRUNCATEs via reset_bn_trade_ticks_full()
 * and returns rows removed. Never throws.
 */
export async function resetTickHistory(): Promise<{ deleted: number; error?: string }> {
  const supabase = getDataSupabase();
  if (!supabase) return { deleted: 0 };
  try {
    const { data, error } = await supabase.rpc("reset_bn_trade_ticks_full");
    if (error) {
      console.error("[TickStorage] reset failed:", error.message);
      return { deleted: 0, error: error.message };
    }
    return { deleted: Number(data ?? 0) };
  } catch (err) {
    console.error("[TickStorage] reset failed:", err instanceof Error ? err.message : err);
    return { deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

let inlineResetInFlight = false;

async function performAutomaticReset(usageBeforeMb: number): Promise<void> {
  const resetAt = new Date().toISOString();
  console.log(`[TickStorage] current size: ${usageBeforeMb.toFixed(1)} MB`);
  console.log(`[TickStorage] threshold reached: CRITICAL (>= ${(TICK_STORAGE_CRITICAL_BYTES / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`[TickStorage] reset triggered at ${resetAt}`);

  const result = await resetTickHistory();
  if (result.error) {
    console.error(`[TickStorage] reset failed, table left as-is: ${result.error}`);
    return;
  }
  console.log(`[TickStorage] rows deleted: ${result.deleted}`);

  const after = await getTickStorageUsage(true);
  console.log(`[TickStorage] size after reset: ${after.mb.toFixed(2)} MB`);
  console.log(`[TickStorage] reset completed at ${new Date().toISOString()}`);
}

/**
 * Call this at the top of insertTicks() (and ideally from a daily cron too,
 * see app/api/tick-capture/cleanup/route.ts). Cheap (cached in the common
 * case), never blocks or skips the caller's own insert. If CRITICAL
 * (>=250MB), fires a full reset in the background.
 */
export async function ensureTickStorageBudget(): Promise<StoragePressure> {
  const usage = await getTickStorageUsage();
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
