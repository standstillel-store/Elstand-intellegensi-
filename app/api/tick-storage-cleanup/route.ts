import { NextResponse } from "next/server";
import { cleanupExpiredTicks } from "@/lib/marketHistory/tickStore";
import { resetTickHistory, TICK_STORAGE_CRITICAL_BYTES } from "@/lib/marketHistory/tickStorageGuard";
import { getDataSupabase } from "@/lib/supabaseData";

// ---------------------------------------------------------------------------
// Daily backstop cleanup for bn_trade_ticks. The inline check in
// insertTicks() (ensureTickStorageBudget) already fires a reset whenever
// >=250MB is hit on capture, but this cron guarantees it also runs even if
// ticks aren't being captured for a while. Same pattern as
// app/api/market-history/cleanup/route.ts.
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function queryActualSizeMb(): Promise<number> {
  const supabase = getDataSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("bn_trade_ticks_table_size");
  if (error || data == null) return 0;
  return Number(data) / (1024 * 1024);
}

async function runCleanup(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    const expiredResult = await cleanupExpiredTicks();

    let mb = await queryActualSizeMb();
    console.log(`[TickStorage] current size: ${mb.toFixed(1)} MB`);

    let rowsDeleted = 0;
    let resetTriggered = false;
    if (mb * 1024 * 1024 >= TICK_STORAGE_CRITICAL_BYTES) {
      resetTriggered = true;
      console.log(`[TickStorage] threshold reached: CRITICAL (>= ${(TICK_STORAGE_CRITICAL_BYTES / 1024 / 1024).toFixed(0)} MB)`);
      const result = await resetTickHistory();
      rowsDeleted = result.deleted;
      console.log(`[TickStorage] rows deleted: ${rowsDeleted}`);
      if (result.error) console.error(`[TickStorage] reset error: ${result.error}`);
      mb = await queryActualSizeMb();
      console.log(`[TickStorage] size after reset: ${mb.toFixed(2)} MB`);
    }

    return NextResponse.json({
      ok: true,
      ...expiredResult,
      storage: { mb, resetTriggered, rowsDeleted },
    });
  } catch (err) {
    console.error("[ElVoid AI] tick storage cleanup error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal menjalankan tick cleanup." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runCleanup(req);
}

export async function POST(req: Request) {
  return runCleanup(req);
}
