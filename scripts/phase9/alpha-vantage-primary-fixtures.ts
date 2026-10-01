// ---------------------------------------------------------------------------
// Alpha Vantage PRIMARY-source runtime fixtures (2026-09-29).
// Dev-only, pure/offline: global fetch is an in-memory fake; no Supabase, no
// network, no secret. Exercises the REAL exported functions:
//   primaryRelease -> interpretRelease (TREND basis) -> composeFromPairs ->
//   toOracleMacroContext, ingestHealth, and the Alpha Vantage provider itself.
// NOT exercised here (see the report): live Supabase reads/writes, Vercel cron.
//
// Usage:
//   node --experimental-strip-types --no-warnings --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/alpha-vantage-primary-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { buildPrimaryRelease, isObservationStale } from "@/lib/economicData/primaryRelease";
import { interpretRelease } from "@/lib/economicData/interpret";
import { evaluateIngestionHealth } from "@/lib/economicData/ingestHealth";
import { applyCoverageGuard, composeFromPairs } from "@/lib/ai/macroIntelligence/composeMacroContextPure";
import { toOracleMacroContext } from "@/lib/ai/economicIntelligence/oracleMacroPure";
import { fetchAlphaVantageObservations, fetchAlphaVantageObservationsDetailed, rotatedFunctionOrder } from "@/lib/economicData/providers/alphaVantageProvider";
import type { EconomicObservation, EconomicRelease } from "@/lib/economicData/types";
import type { CanonicalIndicatorId } from "@/lib/economicData/canonicalIndicators";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail = "") {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}
const src = (p: string) => readFileSync(p, "utf8");
const NOW = new Date("2026-09-29T12:00:00Z");

function obs(indicatorId: string, period: string, value: string, source: EconomicObservation["source"] = "alphavantage", country = "US"): EconomicObservation {
  return { id: `${source}:${indicatorId}:${country}:${period}`, source, indicatorId: indicatorId as CanonicalIndicatorId, country, observationPeriod: period, value };
}
function pairFor(id: string, latest: string, prev: string, latestPeriod = "2026-08", prevPeriod = "2026-07") {
  const out = buildPrimaryRelease(id as CanonicalIndicatorId, "US", [obs(id, latestPeriod, latest), obs(id, prevPeriod, prev)], NOW);
  if (out.status !== "OK") throw new Error(`expected OK for ${id}: ${JSON.stringify(out)}`);
  return { release: out.release, interpretation: interpretRelease(out.release) };
}

// ---- A. primaryRelease -------------------------------------------------------
{
  const ok = buildPrimaryRelease("CPI_HEADLINE_YOY", "US", [obs("CPI_HEADLINE_YOY", "2026-08", "3.1"), obs("CPI_HEADLINE_YOY", "2026-07", "2.9")], NOW);
  check("A1. fresh consecutive Alpha Vantage observations -> OK release (actual/previous set, forecast null, source alphavantage)",
    ok.status === "OK" && ok.release.actual === "3.1" && ok.release.previous === "2.9" && ok.release.forecast === null && ok.release.source === "alphavantage" && ok.release.status === "released", JSON.stringify(ok));

  const stale = buildPrimaryRelease("CPI_HEADLINE_YOY", "US", [obs("CPI_HEADLINE_YOY", "2025-01", "3.0")], NOW);
  check("A2. stale primary observation -> UNAVAILABLE(STALE), never used (fail-closed)", stale.status === "UNAVAILABLE" && stale.reason === "STALE", JSON.stringify(stale));

  const gap = buildPrimaryRelease("CPI_HEADLINE_YOY", "US", [obs("CPI_HEADLINE_YOY", "2026-08", "3.1"), obs("CPI_HEADLINE_YOY", "2026-05", "2.0")], NOW);
  check("A3. non-consecutive prior period -> previous is null (a gap is not a 'previous')", gap.status === "OK" && gap.release.previous === null, JSON.stringify(gap));

  const none = buildPrimaryRelease("NFP", "US", [], NOW);
  check("A4. no primary observation -> UNAVAILABLE(NO_PRIMARY_OBSERVATION)", none.status === "UNAVAILABLE" && none.reason === "NO_PRIMARY_OBSERVATION", JSON.stringify(none));

  const fredOnly = buildPrimaryRelease("NFP", "US", [obs("NFP", "2026-08", "150", "fred"), obs("NFP", "2026-07", "140", "fred")], NOW);
  check("A5. HIERARCHY: fresh FRED (supporting) rows can NOT stand in for a missing Alpha Vantage reading", fredOnly.status === "UNAVAILABLE" && fredOnly.reason === "NO_PRIMARY_OBSERVATION", JSON.stringify(fredOnly));

  const ffOnly = buildPrimaryRelease("NFP", "US", [obs("NFP", "2026-08", "150", "forexfactory")], NOW);
  check("A5b. HIERARCHY: ForexFactory rows can NOT stand in either", ffOnly.status === "UNAVAILABLE", JSON.stringify(ffOnly));

  const mixed = buildPrimaryRelease("NFP", "US", [obs("NFP", "2026-08", "999", "fred"), obs("NFP", "2026-08", "150", "alphavantage"), obs("NFP", "2026-07", "140", "alphavantage")], NOW);
  check("A6. when both exist, ONLY the Alpha Vantage value is used (supporting never outranks primary)", mixed.status === "OK" && mixed.release.actual === "150" && mixed.release.previous === "140", JSON.stringify(mixed));

  const nan = buildPrimaryRelease("NFP", "US", [obs("NFP", "2026-08", "n/a")], NOW);
  check("A7. non-numeric value -> UNAVAILABLE(NON_NUMERIC_VALUE)", nan.status === "UNAVAILABLE" && nan.reason === "NON_NUMERIC_VALUE", JSON.stringify(nan));

  check("A8. quarterly GDP: quarter starting 2026-04 is fresh on 2026-09-29; quarter starting 2025-10 is stale", !isObservationStale("REAL_GDP_QOQ" as CanonicalIndicatorId, "2026-04", NOW) && isObservationStale("REAL_GDP_QOQ" as CanonicalIndicatorId, "2025-10", NOW), "");
  check("A9. unparseable period is treated as stale (cannot be proven fresh)", isObservationStale("NFP" as CanonicalIndicatorId, "Q2-2026", NOW), "");

  const gdp = buildPrimaryRelease("REAL_GDP_QOQ", "US", [obs("REAL_GDP_QOQ", "2026-04", "0.6"), obs("REAL_GDP_QOQ", "2026-01", "0.4")], NOW);
  check("A10. quarterly cadence: consecutive quarters (3 months apart) -> previous set", gdp.status === "OK" && gdp.release.previous === "0.4", JSON.stringify(gdp));
}

// ---- B. interpretation on TREND basis ------------------------------------------
{
  const cpi = pairFor("CPI_HEADLINE_YOY", "3.1", "2.9").interpretation;
  check("B1. CPI YoY rising on primary data -> INFLATIONARY + hawkish, basis TREND, completeness HIGH", cpi.macroPressure === "INFLATIONARY" && cpi.policyImplication === "INCREASES_HAWKISH_PRESSURE" && cpi.pressureBasis === "TREND" && cpi.dataCompleteness === "HIGH", JSON.stringify(cpi));
  const cool = pairFor("CPI_HEADLINE_YOY", "2.7", "2.9").interpretation;
  check("B2. CPI YoY falling -> DISINFLATIONARY + dovish", cool.macroPressure === "DISINFLATIONARY" && cool.policyImplication === "INCREASES_DOVISH_PRESSURE", JSON.stringify(cool));
  const ur = pairFor("UNEMPLOYMENT_RATE", "4.3", "4.1").interpretation;
  check("B3. Unemployment rate RISING -> LABOR_WEAKENING (explicit inversion preserved)", ur.macroPressure === "LABOR_WEAKENING", JSON.stringify(ur));
  const nfp = pairFor("NFP", "180", "120").interpretation;
  check("B4. NFP up vs prior -> LABOR_TIGHT", nfp.macroPressure === "LABOR_TIGHT", JSON.stringify(nfp));
  const flat = pairFor("RETAIL_SALES_HEADLINE", "0.4", "0.4").interpretation;
  check("B5. unchanged print -> NEUTRAL (IN_LINE), not a directional claim", flat.macroPressure === "NEUTRAL", JSON.stringify(flat));

  const noPrev = buildPrimaryRelease("CPI_HEADLINE_YOY", "US", [obs("CPI_HEADLINE_YOY", "2026-08", "3.1")], NOW);
  const noPrevI = noPrev.status === "OK" ? interpretRelease(noPrev.release) : undefined;
  check("B6. primary release WITHOUT a previous -> INSUFFICIENT_DATA, completeness LIMITED (fail-closed, no guessing)", noPrevI?.macroPressure === "INSUFFICIENT_DATA" && noPrevI?.dataCompleteness === "LIMITED" && noPrevI?.pressureBasis === "NONE", JSON.stringify(noPrevI));

  const ff: EconomicRelease = { id: "forexfactory:CPI_HEADLINE_YOY:USD:2026-09", source: "forexfactory", indicatorId: "CPI_HEADLINE_YOY" as CanonicalIndicatorId, rawTitle: "CPI y/y", country: "USD", impact: "high", scheduledAt: "2026-09-30T01:30:00Z", releasePeriod: "2026-09", actual: "3.2", forecast: null, previous: "2.9", revisedPrevious: null, status: "released" };
  const ffI = interpretRelease(ff);
  check("B7. HIERARCHY: a SUPPORTING (calendar) release without a forecast is NOT promoted to a trend reading — stays INSUFFICIENT_DATA", ffI.macroPressure === "INSUFFICIENT_DATA" && ffI.pressureBasis === "NONE", JSON.stringify(ffI));

  const withForecast: EconomicRelease = { ...ff, source: "alphavantage", forecast: "3.0" };
  const wfI = interpretRelease(withForecast);
  check("B8. a release that HAS a forecast still uses the SURPRISE basis (unchanged behavior)", wfI.pressureBasis === "SURPRISE" && wfI.macroPressure === "INFLATIONARY", JSON.stringify(wfI));
}

// ---- C. context assembly, coverage guard, Oracle availability -----------------------
{
  const input = { asOf: NOW.toISOString(), calendar: [] };
  const inflation = [pairFor("CPI_HEADLINE_YOY", "3.1", "2.9")];
  const labor = [pairFor("NFP", "180", "120"), pairFor("UNEMPLOYMENT_RATE", "4.0", "4.2")];
  const growth = [pairFor("REAL_GDP_QOQ", "0.6", "0.4", "2026-04", "2026-01"), pairFor("RETAIL_SALES_HEADLINE", "0.5", "0.3")];

  const full = composeFromPairs(input, { inflationPairs: inflation, laborPairs: labor, growthPairs: growth });
  const fullOracle = toOracleMacroContext(full);
  check("C1. inflation+labor+growth all represented from primary data -> completeness HIGH -> Oracle dataAvailability AVAILABLE", full.dataCompleteness === "HIGH" && fullOracle.dataAvailability === "AVAILABLE", JSON.stringify({ c: full.dataCompleteness, a: fullOracle.dataAvailability }));
  check("C2. clusters carry real states (not INSUFFICIENT_DATA) when primary data is present", full.clusters?.inflation !== "INSUFFICIENT_DATA" && full.clusters?.growth !== "INSUFFICIENT_DATA", JSON.stringify(full.clusters));

  const thin = composeFromPairs(input, { inflationPairs: inflation, laborPairs: [], growthPairs: [] });
  const thinOracle = toOracleMacroContext(thin);
  check("C3. FAIL-CLOSED breadth guard: ONE fresh indicator (labor+growth missing) can NOT make macro AVAILABLE -> PARTIAL", thin.dataCompleteness === "MEDIUM" && thinOracle.dataAvailability === "PARTIAL", JSON.stringify({ c: thin.dataCompleteness, a: thinOracle.dataAvailability }));

  const empty = composeFromPairs(input, { inflationPairs: [], laborPairs: [], growthPairs: [] });
  check("C4. no primary data at all -> UNAVAILABLE (never invented)", toOracleMacroContext(empty).dataAvailability === "UNAVAILABLE" && empty.clusters?.inflation === "INSUFFICIENT_DATA", JSON.stringify(empty.clusters));

  check("C5. applyCoverageGuard only ever LOWERS HIGH; never raises anything", applyCoverageGuard("HIGH", false) === "MEDIUM" && applyCoverageGuard("HIGH", true) === "HIGH" && applyCoverageGuard("LIMITED", true) === "LIMITED" && applyCoverageGuard("UNAVAILABLE", true) === "UNAVAILABLE", "");
}

// ---- D. ingestion health -------------------------------------------------------------------
{
  const good = evaluateIngestionHealth({ alphaVantageOk: true, alphaVantageUpserted: true, alphaVantageThrottled: false, forexFactoryOk: true, forexFactoryUpserted: true, fredOk: true, fredUpserted: true });
  check("D1. healthy run -> ok, nothing degraded", good.ok && good.degraded.length === 0, JSON.stringify(good));
  const thr = evaluateIngestionHealth({ alphaVantageOk: false, alphaVantageUpserted: true, alphaVantageThrottled: true, forexFactoryOk: true, forexFactoryUpserted: true, fredOk: true, fredUpserted: true });
  check("D2. Alpha Vantage throttled -> ok:false with a PRIMARY_ reason (no longer reported as success)", !thr.ok && thr.degraded.some((d) => d.startsWith("PRIMARY_")), JSON.stringify(thr));
  const fredBad = evaluateIngestionHealth({ alphaVantageOk: true, alphaVantageUpserted: true, alphaVantageThrottled: false, forexFactoryOk: true, forexFactoryUpserted: true, fredOk: false, fredUpserted: false });
  check("D3. SUPPORTING (FRED) failure never fails a healthy primary run, but is still reported", fredBad.ok && fredBad.degraded.length === 2 && fredBad.degraded.every((d) => d.startsWith("supporting_")), JSON.stringify(fredBad));
  const wr = evaluateIngestionHealth({ alphaVantageOk: true, alphaVantageUpserted: false, alphaVantageThrottled: false, forexFactoryOk: true, forexFactoryUpserted: true, fredOk: true, fredUpserted: true });
  check("D4. primary write failure -> ok:false", !wr.ok && wr.degraded.includes("PRIMARY_alphavantage_write_failed"), JSON.stringify(wr));
}

// ---- E. provider behavior against a fake Alpha Vantage ------------------------------------------
async function providerFixtures() {
  process.env.ALPHA_VANTAGE_API_KEY = "test-key";
  process.env.ALPHA_VANTAGE_MIN_SPACING_MS = "0";
  process.env.ALPHA_VANTAGE_THROTTLE_RETRY_MS = "0";

  const THROTTLE = { Information: "Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second). ... (25 requests per day)" };
  const monthly = (n: number, base = 100) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7 - i, 1));
    return { date: d.toISOString().slice(0, 10), value: String(base + (n - i) * 0.5) };
  });
  const quarterly = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 3 - i * 3, 1));
    return { date: d.toISOString().slice(0, 10), value: String(20000 + (n - i) * 40) };
  });

  const realFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  let mode: "always-throttle" | "throttle-once-then-ok" | "ok" = "always-throttle";
  let throttledOnce = false;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const fn = /function=([A-Z_]+)/.exec(url)?.[1] ?? "";
    const body = (): unknown => (fn === "REAL_GDP" ? { data: quarterly(8) } : { data: monthly(16) });
    if (mode === "always-throttle") return new Response(JSON.stringify(THROTTLE), { status: 200 });
    if (mode === "throttle-once-then-ok" && !throttledOnce) {
      throttledOnce = true;
      return new Response(JSON.stringify(THROTTLE), { status: 200 });
    }
    return new Response(JSON.stringify(body()), { status: 200 });
  }) as typeof fetch;

  try {
    // Run 1 — persistent throttle: every function gets its own bounded 2
    // attempts (1 + 1 retry) — a throttle on one function no longer aborts
    // the rest (2026-09-30 correction). 6 functions x 2 attempts = 12 calls.
    const r1 = await fetchAlphaVantageObservationsDetailed();
    check("E1. persistent throttle -> every function gets 2 bounded attempts, no retry storm (6 functions x 2 = 12 calls)", calls.length === 12, `calls=${calls.length}`);
    check("E2. persistent throttle -> throttled:true, ok:false, ALL 6 functions individually reported failed with the real throttle reason (none skipped, none silently dropped)", r1.throttled && !r1.ok && r1.failedFunctions.length === 6 && r1.failedFunctions.every((f) => f.reason !== "skipped_after_throttle" && f.reason.includes("Alpha Vantage")) && r1.data.length === 0, JSON.stringify(r1.failedFunctions.map((f) => ({ fn: f.function, reason: f.reason.slice(0, 24) }))));
    // Capture the order functions were actually attempted in during run 1,
    // BEFORE the flat-wrapper call below runs a second internal fetch (which
    // would append its own 12 calls to the same array) and before `calls`
    // gets reset for run 2 (used by E12 below).
    const run1AttemptedOrder: string[] = [];
    for (const c of calls) {
      const fn = /function=([A-Z_]+)/.exec(c.url)?.[1];
      if (fn && run1AttemptedOrder[run1AttemptedOrder.length - 1] !== fn) run1AttemptedOrder.push(fn);
    }

    const flat = await fetchAlphaVantageObservations();
    check("E3. flat wrapper no longer reports ok:true when the run failed", flat.ok === false && typeof flat.error === "string" && flat.error.length > 0, JSON.stringify(flat));

    // Run 2 — a throttle body must NOT have been cached: one burst throttle, then success on the retry.
    calls.length = 0;
    mode = "throttle-once-then-ok";
    throttledOnce = false;
    const r2 = await fetchAlphaVantageObservationsDetailed();
    check("E4. a throttled outcome is not cached, and one burst throttle recovers on the bounded retry -> all 6 functions succeed", r2.ok && !r2.throttled && r2.succeededFunctions.length === 6 && r2.data.length > 0, JSON.stringify({ ok: r2.ok, s: r2.succeededFunctions, f: r2.failedFunctions }));
    check("E5. total requests = 6 functions + 1 retry = 7 (well under the 25/day free quota)", calls.length === 7, `calls=${calls.length}`);
    const urlOf = (fn: string) => calls.find((c) => c.url.includes(`function=${fn}&`) || c.url.endsWith(`function=${fn}`))?.url ?? "";
    check("E6. interval is sent only where defined: CPI=monthly, REAL_GDP=quarterly, others none", /function=CPI&interval=monthly/.test(urlOf("CPI")) && /function=REAL_GDP&interval=quarterly/.test(urlOf("REAL_GDP")) && !/interval=/.test(urlOf("NONFARM_PAYROLL")) && !/interval=/.test(urlOf("UNEMPLOYMENT")), calls.map((c) => c.url.replace(/apikey=[^&]+/, "apikey=***")).join(" | "));
    check("E7. fetch bypasses Next's data cache (cache: 'no-store') so a throttle body can't be replayed for hours", calls.every((c) => c.init?.cache === "no-store"), "");
    const ids = new Set(r2.data.map((o) => o.indicatorId));
    check("E8. all mapped indicators are produced from a full run (CPI MoM/YoY, NFP, Unemployment, Retail, Durables, GDP QoQ/YoY)", ["CPI_HEADLINE_MOM", "CPI_HEADLINE_YOY", "NFP", "UNEMPLOYMENT_RATE", "RETAIL_SALES_HEADLINE", "DURABLE_GOODS_ORDERS", "REAL_GDP_QOQ", "REAL_GDP_YOY"].every((k) => ids.has(k as CanonicalIndicatorId)), [...ids].join(","));
    check("E9. every produced row is source alphavantage / country US", r2.data.every((o) => o.source === "alphavantage" && o.country === "US"), "");

    // ---- E10-E12. daily rotation (2026-09-30 correction) --------------------
    const functionNames = ["CPI", "NONFARM_PAYROLL", "UNEMPLOYMENT", "RETAIL_SALES", "DURABLES", "REAL_GDP"];
    check("E10. rotatedFunctionOrder is a pure permutation — same 6 functions, no duplicates, deterministic for a given date", (() => {
      const day = new Date("2026-09-30T00:00:00Z");
      const a = rotatedFunctionOrder(functionNames, day);
      const b = rotatedFunctionOrder(functionNames, day);
      const isPermutation = a.length === functionNames.length && new Set(a).size === functionNames.length && functionNames.every((f) => a.includes(f));
      return isPermutation && JSON.stringify(a) === JSON.stringify(b);
    })(), "");

    check("E11. rotation starts a DIFFERENT function each UTC day and cycles back after N days (CPI no longer permanently first)", (() => {
      const day0 = new Date("2026-09-30T00:00:00Z");
      const orders = Array.from({ length: functionNames.length }, (_, i) => rotatedFunctionOrder(functionNames, new Date(day0.getTime() + i * 86_400_000)));
      const starts = orders.map((o) => o[0]);
      const everyFunctionLedOnce = new Set(starts).size === functionNames.length;
      const cyclesBack = JSON.stringify(rotatedFunctionOrder(functionNames, new Date(day0.getTime() + functionNames.length * 86_400_000))) === JSON.stringify(orders[0]);
      return everyFunctionLedOnce && cyclesBack;
    })(), "");

    // Integration check against run 1 (always-throttle, captured above): the
    // actual fetch order this process used for "today" must match
    // rotatedFunctionOrder() for that same date — confirms
    // fetchAlphaVantageObservationsDetailed() is really wired to the
    // rotation, not just testing the helper in isolation.
    const expectedOrderToday = rotatedFunctionOrder(functionNames, new Date());
    check("E12. fetchAlphaVantageObservationsDetailed() actually fetches in rotatedFunctionOrder() order (not always CPI-first)", JSON.stringify(run1AttemptedOrder) === JSON.stringify(expectedOrderToday), `attempted=${run1AttemptedOrder.join(",")} expected=${expectedOrderToday.join(",")}`);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---- F. wiring / policy invariants in source text --------------------------------------------------
{
  const ing = src("lib/economicData/ingest.ts");
  const comp = src("lib/ai/macroIntelligence/composeMacroContext.ts");
  const repo = src("lib/economicData/repository.ts");
  const mig = src("supabase/migrations/2026-09-29-economic-source-allow-fred.sql");
  check("F1. ingest no longer withholds Alpha Vantage rows for FRED (applyFredPrecedence / deferredToFred removed)", !/applyFredPrecedence|deferredToFred|avDataToWrite/.test(ing.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")), "");
  check("F2. ingest writes ALL Alpha Vantage data (upsertObservations(avResult.data))", /upsertObservations\(avResult\.data\)/.test(ing), "");
  check("F3. runtime reads PRIMARY observations only (getRecentObservations(..., \"alphavantage\")) and no longer reads calendar releases", /getRecentObservations\(id, country, 2, "alphavantage"\)/.test(comp) && !/getLatestRelease/.test(comp.replace(/\/\/.*$/gm, "")), "");
  check("F4. repository read supports a source filter", /source\?: EconomicObservation\["source"\]/.test(repo) && /\.eq\("source", source\)/.test(repo), "");
  check("F5. migration allows 'fred' on BOTH tables and deletes nothing", /economic_observations_source_check[\s\S]*'fred'/.test(mig) && /economic_releases_source_check[\s\S]*'fred'/.test(mig) && !/delete\s+from|drop\s+table|truncate/i.test(mig), "");
  check("F6. ingest route declares maxDuration for the spaced requests", /export const maxDuration = \d+/.test(src("app/api/economic-data/ingest/route.ts")), "");
}

providerFixtures()
  .catch((err) => {
    failures++;
    console.log(`FAIL — provider fixtures threw: ${err instanceof Error ? err.stack : String(err)}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
  });
