// ---------------------------------------------------------------------------
// ForexFactoryProvider — thin adapter over the EXISTING lib/economiccalendar.ts
// fetch. Zero new network calls, zero scraping, zero new endpoint. This
// file's only job is shaping the already-fetched `EconomicEvent[]` into
// this subsystem's `EconomicRelease[]` domain type.
//
// Never populates `actual` — the underlying ForexFactory feed doesn't
// carry a realized print (see lib/economiccalendar.ts and
// lib/intelligence/macroEvents.ts's own honesty notes, which this file
// inherits rather than re-litigates). `actual` is always `null` here.
// ---------------------------------------------------------------------------

import { getEconomicCalendar } from "@/lib/economiccalendar";
import type { EconomicEvent } from "@/lib/types";
import { resolveCanonicalIndicatorId } from "../canonicalIndicators";
import type { EconomicRelease, ProviderResult } from "../types";

function inferReleasePeriod(dateIso: string): string | undefined {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return undefined;
  // Monthly period label — the vast majority of aliased indicators here are
  // monthly. GDP/PMI-style quarterly labeling is left undefined rather than
  // guessed; repository.ts's identity key tolerates a missing period by
  // falling back to scheduledAt (see repository.ts::buildReleaseIdentity()).
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toRelease(event: EconomicEvent): EconomicRelease | null {
  const indicatorId = resolveCanonicalIndicatorId(event.title);
  if (indicatorId === "UNKNOWN") return null; // never guessed — see canonicalIndicators.ts

  const scheduledMs = new Date(event.date).getTime();
  const status: EconomicRelease["status"] = Number.isFinite(scheduledMs) && scheduledMs > Date.now() ? "upcoming" : "released";

  return {
    id: `forexfactory:${indicatorId}:${event.country}:${inferReleasePeriod(event.date) ?? event.date}`,
    source: "forexfactory",
    indicatorId,
    rawTitle: event.title,
    country: event.country,
    impact: event.impact,
    scheduledAt: event.date,
    releasePeriod: inferReleasePeriod(event.date),
    actual: null, // never inferred — see file header
    forecast: event.forecast ?? null,
    previous: event.previous ?? null,
    revisedPrevious: null, // ForexFactory's "this week" feed never carries a revision figure
    status,
  };
}

export async function fetchForexFactoryReleases(): Promise<ProviderResult<EconomicRelease>> {
  try {
    const calendar = await getEconomicCalendar();
    const releases = calendar.map(toRelease).filter((r): r is EconomicRelease => r !== null);
    return { ok: true, data: releases };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[economicData:forexfactory] ${message}`);
    return { ok: false, data: [], error: message };
  }
}
