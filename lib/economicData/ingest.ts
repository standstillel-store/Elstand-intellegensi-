// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — ingestion orchestration (Phase G.5).
//
// The only function that WRITES to economic_releases/economic_observations.
// Called exclusively by app/api/economic-data/ingest/route.ts (the cron
// route) — never called from a dashboard/request-serving path, keeping
// writes and reads (composeMacroContext.ts) fully decoupled per the
// architecture doc's data-flow diagram.
//
// DAILY SNAPSHOT, not real-time (Correction 1): this function runs once
// per cron invocation and refreshes whatever the providers currently
// have. It never claims same-minute release freshness — see
// route.ts's response and this file's IngestionSummary.startedAt/
// finishedAt, which are ingestion-run timestamps, not release-event
// timestamps.
//
// NEVER DELETES: on any provider failure/empty response, that half's
// upsert call is simply skipped for this run — existing stored rows from
// a prior successful run are left exactly as they are. This is what
// makes "stale data survives a failed refresh" and "provider failure
// doesn't wipe existing data" true structurally, not just by convention.
// ---------------------------------------------------------------------------

import { claimIngestionLock } from "./ingestionLock";
import { fetchForexFactoryReleases } from "./providers/forexFactoryProvider";
import { fetchAlphaVantageObservationsDetailed } from "./providers/alphaVantageProvider";
import { upsertObservations, upsertReleases } from "./repository";

export interface IngestionSummary {
  ok: boolean;
  ran: boolean;
  startedAt: string;
  finishedAt: string;

  lock: { state: "ACQUIRED" | "HELD_BY_OTHER" | "UNAVAILABLE"; reason?: string };

  forexFactory?: {
    ok: boolean; // provider fetch succeeded (even if it returned zero rows)
    fetched: number;
    empty: boolean;
    upserted: boolean; // database write succeeded (vacuously true if fetched === 0)
  };

  alphaVantage?: {
    ok: boolean; // every function attempted succeeded (empty counts as success — see alphaVantageProvider.ts)
    fetched: number;
    empty: boolean;
    upserted: boolean;
    throttled: boolean;
    succeededFunctions: string[];
    failedFunctions: { function: string; reason: string }[];
  };
}

const LOCK_ID = "economic-data-ingest";

export async function runMacroDataIngestion(): Promise<IngestionSummary> {
  const startedAt = new Date().toISOString();
  const lock = await claimIngestionLock(LOCK_ID);

  if (lock.state === "HELD_BY_OTHER") {
    return { ok: true, ran: false, startedAt, finishedAt: new Date().toISOString(), lock: { state: "HELD_BY_OTHER" } };
  }
  if (lock.state === "UNAVAILABLE") {
    // Correction 3: a write-protecting lock that can't confirm exclusivity
    // must not be bypassed. Report a controlled failure, do NOT ingest.
    return { ok: false, ran: false, startedAt, finishedAt: new Date().toISOString(), lock: { state: "UNAVAILABLE", reason: lock.reason } };
  }

  // ACQUIRED
  try {
    const ffResult = await fetchForexFactoryReleases();
    const forexFactoryEmpty = ffResult.ok && ffResult.data.length === 0;
    const forexFactoryUpserted = ffResult.ok && ffResult.data.length > 0 ? await upsertReleases(ffResult.data) : true;

    const avResult = await fetchAlphaVantageObservationsDetailed();
    const alphaVantageEmpty = avResult.data.length === 0;
    const alphaVantageUpserted = avResult.data.length > 0 ? await upsertObservations(avResult.data) : true;

    const summary: IngestionSummary = {
      ok: true,
      ran: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      lock: { state: "ACQUIRED" },
      forexFactory: {
        ok: ffResult.ok,
        fetched: ffResult.data.length,
        empty: forexFactoryEmpty,
        upserted: forexFactoryUpserted,
      },
      alphaVantage: {
        ok: avResult.ok,
        fetched: avResult.data.length,
        empty: alphaVantageEmpty,
        upserted: alphaVantageUpserted,
        throttled: avResult.throttled,
        succeededFunctions: avResult.succeededFunctions,
        failedFunctions: avResult.failedFunctions,
      },
    };
    return summary;
  } finally {
    await lock.release();
  }
}
