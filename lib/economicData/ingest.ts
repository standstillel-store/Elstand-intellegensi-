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
import { fetchFredObservationsDetailed } from "./providers/fredProvider";
import { upsertObservations, upsertReleases } from "./repository";
import { evaluateIngestionHealth } from "./ingestHealth";

export { evaluateIngestionHealth } from "./ingestHealth";

/**
 * DATA HIERARCHY (owner decision, 2026-09-29): Alpha Vantage is the PRIMARY
 * economic source; FRED / ForexFactory / others are SUPPORTING. Supporting data
 * never displaces primary data — so every Alpha Vantage observation fetched in
 * a run is written, unconditionally. (The previous `applyFredPrecedence` held
 * back any indicator FRED "covered" — and when the FRED write was then rejected
 * by the source CHECK constraint, both were lost: NFP was never persisted.)
 * Rows from different providers never collide: the row id embeds the source.
 * At read time the runtime selects source = "alphavantage" (see
 * primaryRelease.ts / composeMacroContext.ts).
 */

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
    fetched: number; // fetched from Alpha Vantage this run, BEFORE precedence filtering
    written: number; // upserted this run — always equal to `fetched` (Alpha Vantage is PRIMARY and is never withheld)
    empty: boolean;
    upserted: boolean;
    throttled: boolean;
    succeededFunctions: string[];
    failedFunctions: { function: string; reason: string }[];
  };

  /** Health problems found this run. Names starting with PRIMARY_ make `ok` false; `supporting_` ones are informational. Empty when everything is healthy. */
  degraded?: string[];

  /** SUPPORTING observation source (confirms / enriches; never outranks Alpha Vantage). See fredProvider.ts for exactly which indicators it covers. */
  fred?: {
    ok: boolean;
    fetched: number;
    empty: boolean;
    upserted: boolean;
    coveredIndicatorIds: string[];
    succeededSeries: string[];
    failedSeries: { series: string; reason: string }[];
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

    // PRIMARY: Alpha Vantage. Written in full, independent of any supporting provider.
    const avResult = await fetchAlphaVantageObservationsDetailed();
    const alphaVantageEmpty = avResult.data.length === 0;
    const alphaVantageUpserted = avResult.data.length > 0 ? await upsertObservations(avResult.data) : true;

    // SUPPORTING: FRED — persisted under its own source for confirmation/enrichment.
    const fredResult = await fetchFredObservationsDetailed();
    const fredEmpty = fredResult.data.length === 0;
    const fredUpserted = fredResult.data.length > 0 ? await upsertObservations(fredResult.data) : true;

    const health = evaluateIngestionHealth({
      alphaVantageOk: avResult.ok,
      // "nothing fetched" with failed functions is already covered by alphaVantageOk=false; an empty-but-clean fetch is not a write failure.
      alphaVantageUpserted,
      alphaVantageThrottled: avResult.throttled,
      forexFactoryOk: ffResult.ok,
      forexFactoryUpserted,
      fredOk: fredResult.ok,
      fredUpserted,
    });

    const summary: IngestionSummary = {
      ok: health.ok,
      ran: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      lock: { state: "ACQUIRED" },
      degraded: health.degraded,
      forexFactory: {
        ok: ffResult.ok,
        fetched: ffResult.data.length,
        empty: forexFactoryEmpty,
        upserted: forexFactoryUpserted,
      },
      fred: {
        ok: fredResult.ok,
        fetched: fredResult.data.length,
        empty: fredEmpty,
        upserted: fredUpserted,
        coveredIndicatorIds: fredResult.coveredIndicatorIds,
        succeededSeries: fredResult.succeededSeries,
        failedSeries: fredResult.failedSeries,
      },
      alphaVantage: {
        ok: avResult.ok,
        fetched: avResult.data.length,
        written: alphaVantageUpserted ? avResult.data.length : 0,
        empty: alphaVantageEmpty,
        upserted: alphaVantageUpserted,
        throttled: avResult.throttled,
        succeededFunctions: avResult.succeededFunctions,
        failedFunctions: avResult.failedFunctions,
      },
    };
    // One compact, greppable line per run so the outcome survives in runtime logs even when the response body is discarded by the cron caller.
    console.log(
      `[economicData:ingest] ok=${summary.ok} primary(av) fetched=${summary.alphaVantage?.fetched} written=${summary.alphaVantage?.written} throttled=${summary.alphaVantage?.throttled} failed=${summary.alphaVantage?.failedFunctions.length} | supporting fred fetched=${summary.fred?.fetched} upserted=${summary.fred?.upserted} ff fetched=${summary.forexFactory?.fetched} | degraded=[${health.degraded.join(",")}]`
    );
    return summary;
  } finally {
    await lock.release();
  }
}
