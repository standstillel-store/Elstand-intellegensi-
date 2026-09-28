// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — repository.
//
// Only place in this subsystem that touches Supabase. Uses
// getLearningSupabase() from lib/ai/learning/db.ts (service-role client,
// null when the two ELVOID_LEARNING_* env vars aren't set) — the
// economic_releases / economic_observations tables live in the existing
// Learning DB project, NOT in Main/Core. Follows the same "degrade to
// null/empty, never throw" convention as lib/ai/decisionMemory/repository.ts.
//
// The calculation engine (interpret.ts/clusters.ts/regime.ts) never
// queries Supabase directly — it only ever receives EconomicRelease[] /
// EconomicObservation[] arrays from the functions in this file. Storage
// is fully separated from reasoning, per architecture correction §7.
//
// Upsert is idempotent by primary key (`id`, deterministic — see
// normalize.ts and the migration's own header) — re-running ingestion
// with the same logical release/observation updates the row in place,
// never inserts a duplicate.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { CanonicalIndicatorId } from "./canonicalIndicators";
import type { EconomicObservation, EconomicRelease } from "./types";

/**
 * Distinguishes PostgREST's "table not found in schema cache" failure
 * (code PGRST205 — the table exists at the SQL level but the REST layer's
 * cached schema hasn't picked it up yet, e.g. right after a migration was
 * applied through the SQL Editor) from every other kind of query failure.
 *
 * Added 2026-09-28 after a confirmed-live production incident: reads against
 * economic_releases failed with exactly this signature for several days
 * after the Phase G migration was applied, self-resolved once the cache
 * refreshed. This never changes behavior (callers still degrade to []/false
 * the same as any other error) — it only makes the *next* occurrence
 * instantly diagnosable in logs instead of looking like a generic failure,
 * a wiring bug, or a missing migration.
 */
function isSchemaCacheError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /schema cache/i.test(msg) && /not find/i.test(msg);
}

function logRepositoryError(op: string, error: { code?: string; message?: string }): void {
  if (isSchemaCacheError(error)) {
    console.error(
      `[economicData:repository] SCHEMA_CACHE_STALE during ${op}: PostgREST cannot see the table yet ` +
        `(code=${error.code ?? "unknown"}). The table itself may already exist and hold data — this is a ` +
        `REST schema-cache staleness signal, NOT proof the migration was never applied or applied to the ` +
        `wrong project. Reload the Learning DB project's schema cache (Supabase dashboard → API → ` +
        `"Reload schema", or \`NOTIFY pgrst, 'reload schema';\`) before assuming a deeper wiring problem. ` +
        `Raw: ${error.message}`,
    );
  } else {
    console.error(`[economicData:repository] ${op}: ${error.message}`);
  }
}

function toReleaseRow(r: EconomicRelease) {
  return {
    id: r.id,
    source: r.source,
    indicator_id: r.indicatorId,
    raw_title: r.rawTitle,
    country: r.country,
    currency: r.currency ?? null,
    impact: r.impact,
    scheduled_at: r.scheduledAt,
    release_period: r.releasePeriod ?? null,
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    revised_previous: r.revisedPrevious,
    status: r.status,
    updated_at: new Date().toISOString(),
  };
}

function toObservationRow(o: EconomicObservation) {
  return {
    id: o.id,
    source: o.source,
    indicator_id: o.indicatorId,
    country: o.country,
    observation_period: o.observationPeriod,
    value: o.value,
    unit: o.unit ?? null,
    published_at: o.publishedAt ?? null,
  };
}

function fromReleaseRow(row: Record<string, unknown>): EconomicRelease {
  return {
    id: row.id as string,
    source: row.source as EconomicRelease["source"],
    indicatorId: row.indicator_id as CanonicalIndicatorId,
    rawTitle: row.raw_title as string,
    country: row.country as string,
    currency: (row.currency as string | null) ?? undefined,
    impact: row.impact as EconomicRelease["impact"],
    scheduledAt: row.scheduled_at as string,
    releasePeriod: (row.release_period as string | null) ?? undefined,
    actual: row.actual as string | null,
    forecast: row.forecast as string | null,
    previous: row.previous as string | null,
    revisedPrevious: row.revised_previous as string | null,
    status: row.status as EconomicRelease["status"],
  };
}

function fromObservationRow(row: Record<string, unknown>): EconomicObservation {
  return {
    id: row.id as string,
    source: row.source as EconomicObservation["source"],
    indicatorId: row.indicator_id as CanonicalIndicatorId,
    country: row.country as string,
    observationPeriod: row.observation_period as string,
    value: row.value as string,
    unit: (row.unit as string | null) ?? undefined,
    publishedAt: (row.published_at as string | null) ?? undefined,
  };
}

export async function upsertReleases(releases: readonly EconomicRelease[]): Promise<boolean> {
  if (!releases.length) return true;
  const db = getLearningSupabase();
  if (!db) return false;
  const { error } = await db.from("economic_releases").upsert(releases.map(toReleaseRow), { onConflict: "id" });
  if (error) {
    logRepositoryError("upsertReleases", error);
    return false;
  }
  return true;
}

export async function upsertObservations(observations: readonly EconomicObservation[]): Promise<boolean> {
  if (!observations.length) return true;
  const db = getLearningSupabase();
  if (!db) return false;
  const { error } = await db.from("economic_observations").upsert(observations.map(toObservationRow), { onConflict: "id" });
  if (error) {
    logRepositoryError("upsertObservations", error);
    return false;
  }
  return true;
}

/** Most recent releases for one indicator, newest first. Returns `null` (not []) when Supabase isn't configured, so callers can distinguish "no storage available" from "storage available but empty" — same distinction lib/ai/decisionMemory/repository.ts makes. */
export async function getRecentReleases(indicatorId: CanonicalIndicatorId, country: string, limit = 6): Promise<EconomicRelease[] | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("economic_releases")
    .select("*")
    .eq("indicator_id", indicatorId)
    .eq("country", country)
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) {
    logRepositoryError(`getRecentReleases(${indicatorId})`, error);
    return [];
  }
  return (data ?? []).map(fromReleaseRow);
}

export async function getRecentObservations(indicatorId: CanonicalIndicatorId, country: string, limit = 12): Promise<EconomicObservation[] | null> {
  const db = getLearningSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("economic_observations")
    .select("*")
    .eq("indicator_id", indicatorId)
    .eq("country", country)
    .order("observation_period", { ascending: false })
    .limit(limit);
  if (error) {
    logRepositoryError(`getRecentObservations(${indicatorId})`, error);
    return [];
  }
  return (data ?? []).map(fromObservationRow);
}

/** The single most recent release for an indicator, or `undefined` if none exists / storage unavailable — the shape interpret.ts's per-indicator entry point actually needs. */
export async function getLatestRelease(indicatorId: CanonicalIndicatorId, country: string): Promise<EconomicRelease | undefined> {
  const recent = await getRecentReleases(indicatorId, country, 1);
  return recent?.[0];
}
