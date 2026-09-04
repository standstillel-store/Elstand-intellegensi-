// ---------------------------------------------------------------------------
// AlphaVantageProvider — historical macro OBSERVATION source (§5, Phase G.5
// Correction 2).
//
// Server-side only (ALPHA_VANTAGE_API_KEY, never sent to the client — same
// convention as TWELVEDATA_API_KEY in lib/intelligence/sources/twelvedata.ts
// and FRED_API_KEY in lib/macro.ts). Uses `cached()` from lib/cache.ts
// (6h TTL per function), same as every other external source in this app.
//
// CORRECTION 2 — defensive against rate limits without hardcoding a specific
// plan quota (this file makes no "25/day" style assumption anywhere):
//   - Functions are fetched SEQUENTIALLY (a for..of loop, not Promise.all)
//     — never more than one in-flight Alpha Vantage request from this
//     provider at a time.
//   - Each function's outcome is tracked independently
//     (ok / empty / throttled / error) — one function's failure never
//     cancels the others' attempts (unless the failure IS a throttle
//     signal, see next point).
//   - Alpha Vantage's throttle responses are always HTTP 200 with a JSON
//     body carrying `Note` (classic rate-limit message) or an
//     `Information` field mentioning "rate limit"/"frequency" (current
//     messaging) — detected via isThrottleResponse() below. The FIRST
//     detected throttle response stops the loop immediately (no point
//     spending the remaining functions' calls against a key that's
//     already being rate-limited this run) — the remaining, not-yet-
//     attempted functions are reported as failed with reason
//     "skipped_after_throttle", not silently dropped. This is the "no
//     retry storm" requirement: one attempt per function per cron
//     invocation, full stop — the next day's cron is the retry.
//
// Raw series are LEVELS or a RATE, not pre-computed % changes — see
// canonicalIndicators.ts's ALPHA_VANTAGE_FUNCTION_MAP header for the full
// explanation. This file fetches the raw series and, for LEVEL-type
// series, derives the MoM/YoY/absolute-diff observations markets actually
// quote via normalize.ts::deriveChangeSeries().
//
// Does NOT fetch FEDERAL_FUNDS_RATE or TREASURY_YIELD — lib/macro.ts
// already covers both via FRED; duplicating them here would create two
// disagreeing sources for the same number (architecture correction §5).
// ---------------------------------------------------------------------------

import { cached } from "@/lib/cache";
import { ALPHA_VANTAGE_FUNCTION_MAP, type CanonicalIndicatorId } from "../canonicalIndicators";
import { deriveChangeSeries, toMonthlyPeriod, toObservation, type RawSeriesPoint } from "../normalize";
import type { EconomicObservation, ProviderResult } from "../types";

const AV_BASE = "https://www.alphavantage.co/query";
const COUNTRY = "US"; // every ALPHA_VANTAGE_FUNCTION_MAP entry is a US series

interface AlphaVantageRawResponse {
  data?: { date: string; value: string }[];
  Note?: string; // classic rate-limit message
  Information?: string; // current-style plan/rate-limit/invalid-key message
  "Error Message"?: string; // bad params / unknown function
}

type SeriesOutcome =
  | { status: "ok"; points: RawSeriesPoint[] }
  | { status: "empty" }
  | { status: "throttled"; message: string }
  | { status: "error"; message: string };

function isThrottleResponse(json: AlphaVantageRawResponse): string | undefined {
  if (json.Note) return json.Note; // classic API always uses Note specifically for rate-limit
  if (json.Information && /rate limit|frequency|per (day|minute)/i.test(json.Information)) return json.Information;
  return undefined;
}

async function fetchRawSeries(functionName: string): Promise<SeriesOutcome> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { status: "error", message: "ALPHA_VANTAGE_API_KEY not configured" };

  return cached(`av:${functionName}`, 6 * 3_600_000, async (): Promise<SeriesOutcome> => {
    try {
      const url = `${AV_BASE}?function=${functionName}&interval=monthly&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 6 * 3600 } });
      if (!res.ok) {
        return { status: "error", message: `HTTP ${res.status} ${res.statusText}` };
      }
      const json = (await res.json()) as AlphaVantageRawResponse;

      const throttleMessage = isThrottleResponse(json);
      if (throttleMessage) return { status: "throttled", message: throttleMessage };
      if (json["Error Message"]) return { status: "error", message: json["Error Message"] };
      if (json.Information) return { status: "error", message: json.Information }; // non-throttle Information (e.g. bad function name)
      if (!json.data?.length) return { status: "empty" };

      // Alpha Vantage returns newest-first; deriveChangeSeries() needs oldest-first.
      const points: RawSeriesPoint[] = [...json.data]
        .reverse()
        .map((d) => ({ date: d.date, value: Number(d.value) }))
        .filter((p) => Number.isFinite(p.value));
      return points.length ? { status: "ok", points } : { status: "empty" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** Lag (in series-native periods) for each derivation, per target. GDP is quarterly (lag 4 = YoY), everything else here is monthly (lag 12 = YoY). MoM/QoQ derivations always use lag 1 — "one period back" at whatever the series' native cadence is. */
function lagFor(functionName: string, derivation: string): number {
  if (derivation === "PCT_CHANGE_YOY") return functionName === "REAL_GDP" ? 4 : 12;
  return 1; // PCT_CHANGE_MOM, DIFF_ABSOLUTE_MOM
}

function deriveObservations(functionName: string, points: RawSeriesPoint[]): EconomicObservation[] {
  const mapping = ALPHA_VANTAGE_FUNCTION_MAP[functionName];
  if (!mapping) return [];
  const observations: EconomicObservation[] = [];
  for (const target of mapping.targets) {
    const derived = deriveChangeSeries(points, target.derivation, lagFor(functionName, target.derivation));
    for (const point of derived) {
      const period = functionName === "REAL_GDP" ? point.date.slice(0, 7) : toMonthlyPeriod(point.date);
      observations.push(
        toObservation(
          "alphavantage",
          target.indicatorId as CanonicalIndicatorId,
          COUNTRY,
          point,
          period,
          mapping.seriesKind === "RATE" ? "PERCENT" : undefined
        )
      );
    }
  }
  return observations;
}

export interface AlphaVantageIngestResult {
  ok: boolean;
  data: EconomicObservation[];
  throttled: boolean;
  succeededFunctions: string[];
  failedFunctions: { function: string; reason: string }[];
}

/**
 * Sequential, throttle-aware fetch across every configured Alpha Vantage
 * function — the function ingest.ts (Phase G.5) actually calls. See file
 * header for the sequential/stop-on-throttle rationale.
 */
export async function fetchAlphaVantageObservationsDetailed(): Promise<AlphaVantageIngestResult> {
  const functionNames = Object.keys(ALPHA_VANTAGE_FUNCTION_MAP);
  const data: EconomicObservation[] = [];
  const succeededFunctions: string[] = [];
  const failedFunctions: { function: string; reason: string }[] = [];
  let throttled = false;

  for (const fn of functionNames) {
    if (throttled) {
      failedFunctions.push({ function: fn, reason: "skipped_after_throttle" });
      continue;
    }
    const outcome = await fetchRawSeries(fn);
    if (outcome.status === "ok") {
      data.push(...deriveObservations(fn, outcome.points));
      succeededFunctions.push(fn);
    } else if (outcome.status === "empty") {
      // Not a failure — the series legitimately returned no usable points
      // this run. Counted separately from error/throttled so the
      // ingestion summary can distinguish "nothing new" from "broken".
      succeededFunctions.push(fn);
    } else if (outcome.status === "throttled") {
      throttled = true;
      failedFunctions.push({ function: fn, reason: outcome.message });
      console.error(`[economicData:alphavantage] ${fn}: throttled — ${outcome.message}`);
    } else {
      failedFunctions.push({ function: fn, reason: outcome.message });
      console.error(`[economicData:alphavantage] ${fn}: ${outcome.message}`);
    }
  }

  return { ok: failedFunctions.length === 0, data, throttled, succeededFunctions, failedFunctions };
}

/** Simple ProviderResult shape, built on top of the detailed sequential fetch above — kept for any caller that only needs the flat EconomicObservation[] and doesn't care about per-function/throttle detail. */
export async function fetchAlphaVantageObservations(): Promise<ProviderResult<EconomicObservation>> {
  const detailed = await fetchAlphaVantageObservationsDetailed();
  return { ok: true, data: detailed.data }; // "not configured"/throttled/etc. all honestly degrade to an empty-but-ok result here, matching lib/macro.ts's "no key -> undefined, not throw" convention
}
