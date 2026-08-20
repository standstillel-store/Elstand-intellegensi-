import { NextResponse } from "next/server";
import { runIncrementalScan } from "@/features/whale-tracker/lib/chains/bsc/indexer";
import { isAuthorizedCron } from "@/features/whale-tracker/lib/config";

// Runs one bounded incremental scan pass (BSC_BLOCK_BATCH_SIZE blocks,
// default 500) and returns. Two ways it gets called, exactly like
// app/api/binance/auto-trade/tick:
//   1. Client-side, automatically: features/whale-tracker/hooks/
//      useWhaleIndexerTick.ts POSTs here every 30s while the Whale Tracker
//      tab is open — this is what makes indexing work out of the box, on
//      any hosting plan, no extra setup required.
//   2. Server-side cron (optional, for when nobody has the tab open):
//      Vercel Cron can hit this as a GET/POST with an
//      `Authorization: Bearer $CRON_SECRET` header, but a sub-daily
//      schedule needs a Vercel Pro plan (Hobby only allows once-a-day and
//      will refuse to deploy e.g. `*/10 * * * *` — same limitation
//      app/api/binance/auto-trade/tick documents). Pro users can add
//      `{ "path": "/api/whale/indexer/run", "schedule": "*/10 * * * *" }`
//      to vercel.json's crons array themselves. Hobby/self-hosted can
//      instead point an external scheduler (cron-job.org, GitHub Actions,
//      etc.) at this same URL.
//
// isAuthorizedCron gate: if CRON_SECRET isn't set, the route stays open
// (fine for local/dev or an external scheduler); production deployments
// exposed to the public internet should set it.

async function run(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  try {
    const result = await runIncrementalScan();
    if (!result.skippedNoWork) {
      console.log(
        `[Whale] indexed blocks ${result.fromBlock}-${result.toBlock} (latest=${result.latestBlock}) — erc20 logs: ${result.erc20LogsScanned}, native tx: ${result.nativeTransactionsScanned}, decoded: ${result.transfersDecoded}, qualified: ${result.transfersQualified}, inserted: ${result.transfersInserted}, checkpoint ${result.checkpointBefore ?? "null"} -> ${result.checkpointAfter}, ${result.durationMs}ms`
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Whale] indexer run failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Whale indexer run gagal." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
