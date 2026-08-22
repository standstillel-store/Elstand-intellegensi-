import { NextResponse } from "next/server";
import {
  getWhaleStorageUsage,
  cleanupLowestPriorityTransfers,
  shouldTriggerCleanup,
  STORAGE_TARGET_BYTES,
  CRON_CLEANUP_BATCH_ROWS,
  CRON_MAX_BATCHES,
} from "@/features/whale-tracker/lib/storageGuard";
import { isAuthorizedCron } from "@/features/whale-tracker/lib/config";

// Same shape as app/api/market-history/cleanup/route.ts: force a real
// pg_total_relation_size() read, then loop bounded batches (oldest +
// lowest-value first) until back under the 120MB target or
// CRON_MAX_BATCHES is hit. Only ever touches whale_transfers — never
// whale_wallets / token_metadata / wallet_balances (spec: "Cleanup hanya
// boleh menyentuh Whale Tracker data" scoped even tighter, to the transfers
// table specifically, since that's the only unbounded-growth table here).

async function runCleanup(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    let usage = await getWhaleStorageUsage(true);
    console.log(`[Whale] storage usage: ${usage.mb.toFixed(1)} MB (pressure: ${usage.pressure})`);

    let totalDeleted = 0;
    let batches = 0;
    if (shouldTriggerCleanup(usage.pressure)) {
      console.log("[Whale] cleanup started");
      while (batches < CRON_MAX_BATCHES && usage.bytes > STORAGE_TARGET_BYTES) {
        const result = await cleanupLowestPriorityTransfers(CRON_CLEANUP_BATCH_ROWS);
        batches++;
        if (result.deleted === 0) break;
        totalDeleted += result.deleted;
        console.log(`[Whale] deleted: ${result.deleted} rows`);
        usage = await getWhaleStorageUsage(true);
      }
      console.log(`[Whale] cleanup completed — storage now: ${usage.mb.toFixed(1)} MB (pressure: ${usage.pressure})`);
    }

    return NextResponse.json({ ok: true, storage: { mb: usage.mb, pressure: usage.pressure, batchesRun: batches, rowsDeleted: totalDeleted } });
  } catch (err) {
    console.error("[Whale] cleanup error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Whale storage cleanup gagal." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runCleanup(req);
}

export async function POST(req: Request) {
  return runCleanup(req);
}
