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

/**
 * Deterministic per-run precedence (pure, exported for fixtures): observations
 * for an indicator FRED covered THIS run are deferred to FRED; everything else
 * (incl. every indicator FRED never covers) flows from Alpha Vantage unchanged.
 */
export function applyFredPrecedence<T extends { indicatorId: string }>(avData: readonly T[], fredCovered: readonly string[]): { deferredToFred: T[]; avDataToWrite: T[] } {
  const covered = new Set(fredCovered);
  return { deferredToFred: avData.filter((o) => covered.has(o.indicatorId)), avDataToWrite: avData.filter((o) => !covered.has(o.indicatorId)) };
}

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
    written: number; // actually upserted this run, AFTER dropping indicators FRED already covered (see `deferredToFred`)
    empty: boolean;
    upserted: boolean;
    throttled: boolean;
    succeededFunctions: string[];
    failedFunctions: { function: string; reason: string }[];
    /** Indicator ids Alpha Vantage fetched but did NOT write this run, because FRED already covered them this run — added 2026-09-28 (see fredProvider.ts's precedence note). Never means Alpha Vantage's data was wrong; it means FRED's is preferred when both are available the same run. */
    deferredToFred: string[];
  };

  /** Added 2026-09-28 — preferred macro-observation source; see fredProvider.ts for exactly which indicators it covers and why some are deliberately left to Alpha Vantage. */
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

    // FRED is fetched BEFORE Alpha Vantage's data is written, so precedence
    // (below) can be applied before any upsert happens — see
    // fredProvider.ts's header for exactly which indicators FRED covers.
    const fredResult = await fetchFredObservationsDetailed();
    const fredEmpty = fredResult.data.length === 0;
    const fredUpserted = fredResult.data.length > 0 ? await upsertObservations(fredResult.data) : true;

    const avResult = await fetchAlphaVantageObservationsDetailed();
    // Precedence, per run: for any indicator FRED actually returned data
    // for THIS run, don't also write Alpha Vantage's version of that same
    // indicator this run — avoids two rows (one per source) disagreeing
    // for the same period. Indicators FRED doesn't cover at all (PPI, GDP,
    // Core Retail Sales — see fredProvider.ts) are unaffected and always
    // flow through from Alpha Vantage exactly as before this change.
    const { deferredToFred, avDataToWrite } = applyFredPrecedence(avResult.data, fredResult.coveredIndicatorIds);
    const alphaVantageEmpty = avDataToWrite.length === 0;
    const alphaVantageUpserted = avDataToWrite.length > 0 ? await upsertObservations(avDataToWrite) : true;

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
        written: avDataToWrite.length,
        empty: alphaVantageEmpty,
        upserted: alphaVantageUpserted,
        throttled: avResult.throttled,
        succeededFunctions: avResult.succeededFunctions,
        failedFunctions: avResult.failedFunctions,
        deferredToFred: [...new Set(deferredToFred.map((o) => o.indicatorId))],
      },
    };
    return summary;
  } finally {
    await lock.release();
  }
}
