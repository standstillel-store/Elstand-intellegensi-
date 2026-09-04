// ---------------------------------------------------------------------------
// AlphaVantageProvider — historical macro OBSERVATION source (§5).
//
// Server-side only (ALPHA_VANTAGE_API_KEY, never sent to the client — same
// convention as TWELVEDATA_API_KEY in lib/intelligence/sources/twelvedata.ts
// and FRED_API_KEY in lib/macro.ts). Uses `cached()`/`logged()` from
// lib/cache.ts, same as every other external source in this app. Returns
// [] (never throws) on missing key / non-2xx / bad shape / rate limit —
// matching every existing lib/intelligence/sources/*.ts source's
// graceful-degrade rule.
//
// Does NOT fetch FEDERAL_FUNDS_RATE or TREASURY_YIELD — lib/macro.ts
// already covers both via FRED; duplicating them here would create two
// disagreeing sources for the same number (architecture correction §5).
//
// Raw series are LEVELS or a RATE, not pre-computed % changes — see
// canonicalIndicators.ts's ALPHA_VANTAGE_FUNCTION_MAP header for the full
// explanation. This file fetches the raw series and, for LEVEL-type
// series, derives the MoM/YoY/absolute-diff observations markets actually
// quote via normalize.ts::deriveChangeSeries().
// ---------------------------------------------------------------------------

import { cached, logged } from "@/lib/cache";
import { ALPHA_VANTAGE_FUNCTION_MAP, type CanonicalIndicatorId } from "../canonicalIndicators";
import { deriveChangeSeries, toMonthlyPeriod, toObservation, type RawSeriesPoint } from "../normalize";
import type { EconomicObservation, ProviderResult } from "../types";

const AV_BASE = "https://www.alphavantage.co/query";
const COUNTRY = "US"; // every ALPHA_VANTAGE_FUNCTION_MAP entry is a US series

interface AlphaVantageRawResponse {
  data?: { date: string; value: string }[];
  Note?: string; // rate-limit message
  Information?: string; // invalid key / plan message
  "Error Message"?: string;
}

async function fetchRawSeries(functionName: string): Promise<RawSeriesPoint[] | undefined> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return undefined;

  return cached(`av:${functionName}`, 6 * 3_600_000, async () => {
    try {
      const url = `${AV_BASE}?function=${functionName}&interval=monthly&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 6 * 3600 } });
      if (!res.ok) {
        console.error(`[economicData:alphavantage] ${functionName}: HTTP ${res.status} ${res.statusText}`);
        return undefined;
      }
      const json = (await res.json()) as AlphaVantageRawResponse;
      if (json.Note || json.Information || json["Error Message"]) {
        console.error(`[economicData:alphavantage] ${functionName}: ${json.Note || json.Information || json["Error Message"]}`);
        return undefined;
      }
      if (!json.data?.length) return undefined;

      // Alpha Vantage returns newest-first; deriveChangeSeries() needs oldest-first.
      const points: RawSeriesPoint[] = [...json.data]
        .reverse()
        .map((d) => ({ date: d.date, value: Number(d.value) }))
        .filter((p) => Number.isFinite(p.value));
      return points.length ? points : undefined;
    } catch (err) {
      console.error(`[economicData:alphavantage] ${functionName}: ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  });
}

/** Lag (in series-native periods) for each derivation, per target. GDP is quarterly (lag 4 = YoY), everything else here is monthly (lag 12 = YoY). MoM/QoQ derivations always use lag 1 — "one period back" at whatever the series' native cadence is. */
function lagFor(functionName: string, derivation: string): number {
  if (derivation === "PCT_CHANGE_YOY") return functionName === "REAL_GDP" ? 4 : 12;
  return 1; // PCT_CHANGE_MOM, DIFF_ABSOLUTE_MOM
}

async function fetchIndicatorObservations(functionName: string): Promise<EconomicObservation[]> {
  const mapping = ALPHA_VANTAGE_FUNCTION_MAP[functionName];
  if (!mapping) return [];

  const raw = await fetchRawSeries(functionName);
  if (!raw) return [];

  const observations: EconomicObservation[] = [];
  for (const target of mapping.targets) {
    const derived = deriveChangeSeries(raw, target.derivation, lagFor(functionName, target.derivation));
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

export async function fetchAlphaVantageObservations(): Promise<ProviderResult<EconomicObservation>> {
  const functionNames = Object.keys(ALPHA_VANTAGE_FUNCTION_MAP);
  const results = await Promise.all(
    functionNames.map((fn) => logged(`economicData:alphavantage:${fn}`, fetchIndicatorObservations(fn), [] as EconomicObservation[]))
  );
  const data = results.flat();
  // Not configured (no key) yields an honest empty result, not an error —
  // matches lib/macro.ts's getFedFundsRate()/getUs10Y() "no key → undefined,
  // not throw" convention.
  return { ok: true, data };
}
