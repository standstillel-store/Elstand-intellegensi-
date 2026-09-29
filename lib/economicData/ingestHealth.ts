// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — ingestion health verdict (pure, no DB/network).
// Split from ingest.ts so it is fixture-testable without Supabase imports.
// ---------------------------------------------------------------------------

/**
 * Pure, exported for fixtures: the run is ok ONLY IF the primary source was
 * fully fetched AND written. Supporting-provider trouble is reported in
 * `degraded` but never turns a good primary run into a failure, and a primary
 * problem is never hidden behind `ok: true`.
 */
export function evaluateIngestionHealth(input: {
  alphaVantageOk: boolean;
  alphaVantageUpserted: boolean;
  alphaVantageThrottled: boolean;
  forexFactoryOk: boolean;
  forexFactoryUpserted: boolean;
  fredOk: boolean;
  fredUpserted: boolean;
}): { ok: boolean; degraded: string[] } {
  const degraded: string[] = [];
  if (!input.alphaVantageOk) degraded.push(input.alphaVantageThrottled ? "PRIMARY_alphavantage_throttled_or_incomplete" : "PRIMARY_alphavantage_incomplete");
  if (!input.alphaVantageUpserted) degraded.push("PRIMARY_alphavantage_write_failed");
  if (!input.forexFactoryOk) degraded.push("supporting_forexfactory_fetch_failed");
  if (!input.forexFactoryUpserted) degraded.push("supporting_forexfactory_write_failed");
  if (!input.fredOk) degraded.push("supporting_fred_incomplete");
  if (!input.fredUpserted) degraded.push("supporting_fred_write_failed");
  return { ok: input.alphaVantageOk && input.alphaVantageUpserted, degraded };
}
