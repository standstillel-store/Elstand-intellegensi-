// ---------------------------------------------------------------------------
// Phase 8.4.3 — External Evidence Normalization fixtures (dev-only, not
// part of the app). Pure/offline — no network, no LLM, no database, no
// mocks that bypass real logic. Covers required cases A-K from the task
// brief. L (8.4.1 regression) and M (8.4.2 regression) are run as
// separate script invocations — see the final report.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evidence-normalization-fixtures.ts
// ---------------------------------------------------------------------------

import { normalizeExternalEvidence, normalizeExternalEvidenceBatch } from "@/lib/ai/externalIntelligence/evidence/normalize";
import type { RawExternalObservation, NormalizedExternalEvidence } from "@/lib/ai/externalIntelligence/evidence/contracts";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const ASOF = "2026-09-05T12:00:00.000Z";

function raw(overrides: Partial<RawExternalObservation>): RawExternalObservation {
  return {
    source: "binance_derivatives",
    capability: "funding_rate",
    symbol: "BTCUSDT",
    observedAt: "2026-09-05T11:59:50.000Z", // 10s before ASOF — well within binance_derivatives' 45s TTL
    fetchedAt: "2026-09-05T11:59:51.000Z",
    kind: "FACTUAL_OBSERVATION",
    claim: "Funding rate = 0.012%",
    rawValue: 0.00012,
    status: "OK",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. valid factual numeric observation preserved
// ---------------------------------------------------------------------------

{
  const r = raw({});
  const e = normalizeExternalEvidence(r, ASOF);
  check("A. claim preserved verbatim", e.claim === r.claim, e.claim);
  check("A. rawValue preserved verbatim", e.rawValue === r.rawValue, JSON.stringify(e.rawValue));
  check("A. kind preserved as FACTUAL_OBSERVATION", e.kind === "FACTUAL_OBSERVATION", e.kind);
  check("A. availability=AVAILABLE for OK status + non-empty claim", e.availability === "AVAILABLE", e.availability);
  check("A. freshness=FRESH (10s old, 45s TTL)", e.freshness.bucket === "FRESH", JSON.stringify(e.freshness));
  check("A. not malformed", e.malformed === false, JSON.stringify(e.malformedReasons));
}

// ---------------------------------------------------------------------------
// B. provenance preserved
// ---------------------------------------------------------------------------

{
  const r = raw({ reference: { url: "https://fapi.binance.com/fapi/v1/fundingRate", note: "Binance futures funding endpoint" } });
  const e = normalizeExternalEvidence(r, ASOF);
  check("B. provenance.source matches raw.source", e.provenance.source === r.source, e.provenance.source);
  check("B. provenance.sourceRegistered=true for a real registry id", e.provenance.sourceRegistered === true, JSON.stringify(e.provenance));
  check("B. provenance.capability matches raw.capability", e.provenance.capability === r.capability, e.provenance.capability);
  check("B. category resolved from registry (derivatives)", e.category === "derivatives", e.category);
  check("B. reference passed through verbatim", JSON.stringify(e.provenance.reference) === JSON.stringify(r.reference), JSON.stringify(e.provenance.reference));
  check("B. no limitation when source+capability are both registered", e.provenance.limitation === null, String(e.provenance.limitation));
}

// ---------------------------------------------------------------------------
// C. source unavailable remains unavailable (never becomes a market signal)
// ---------------------------------------------------------------------------

{
  const r = raw({ status: "UNAVAILABLE", claim: "", rawValue: undefined, observedAt: null, fetchedAt: null });
  const e = normalizeExternalEvidence(r, ASOF);
  check("C. availability=UNAVAILABLE, not AVAILABLE/neutral", e.availability === "UNAVAILABLE", e.availability);
  check("C. direction is null (no data to derive anything from)", e.direction === null, String(e.direction));
  check("C. no market-sentiment field exists to have been set", !("sentiment" in e) && !("marketSignal" in e), Object.keys(e).join(","));
}

// ---------------------------------------------------------------------------
// D. missing timestamp -> UNKNOWN freshness
// ---------------------------------------------------------------------------

{
  const r = raw({ observedAt: null, fetchedAt: null });
  const e = normalizeExternalEvidence(r, ASOF);
  check("D. missing timestamps -> freshness UNKNOWN", e.freshness.bucket === "UNKNOWN", JSON.stringify(e.freshness));
  check("D. ageMs is null when no timestamp exists", e.freshness.ageMs === null, String(e.freshness.ageMs));
}

// ---------------------------------------------------------------------------
// E. deterministic freshness with explicit asOf
// ---------------------------------------------------------------------------

{
  const r = raw({});
  const e1 = normalizeExternalEvidence(r, ASOF);
  const e2 = normalizeExternalEvidence(JSON.parse(JSON.stringify(r)), ASOF);
  check("E. same (raw, asOf) -> identical freshness", JSON.stringify(e1.freshness) === JSON.stringify(e2.freshness), `${JSON.stringify(e1.freshness)} vs ${JSON.stringify(e2.freshness)}`);
  check("E. ageMs is exactly asOf-observedAt (10000ms)", e1.freshness.ageMs === 10_000, String(e1.freshness.ageMs));
}

// ---------------------------------------------------------------------------
// F. unsupported semantic direction rejected/omitted
// ---------------------------------------------------------------------------

{
  const r = raw({ direction: "POSITIVE", rawValue: undefined }); // direction with no backing value
  const e = normalizeExternalEvidence(r, ASOF);
  check("F. direction dropped when no rawValue backs it", e.direction === null, String(e.direction));
  check("F. malformed flag set with a traceable reason", e.malformed === true && e.malformedReasons.some((m) => m.includes("omitted")), JSON.stringify(e.malformedReasons));
}

{
  // Simulates a malformed raw JSON payload smuggling an unsupported semantic value past compile-time types.
  const r = raw({ direction: "BULLISH" as unknown as RawExternalObservation["direction"] });
  const e = normalizeExternalEvidence(r, ASOF);
  check("F2. unrecognized/semantic direction value never reaches output", e.direction === null, String(e.direction));
  check("F2. reason recorded for the dropped value", e.malformedReasons.some((m) => m.includes("unrecognized direction")), JSON.stringify(e.malformedReasons));
}

{
  // A properly-backed, objectively-derivable direction IS preserved.
  const r = raw({ direction: "POSITIVE", rawValue: 0.00012 });
  const e = normalizeExternalEvidence(r, ASOF);
  check("F3. direction preserved when rawValue backs it", e.direction === "POSITIVE", String(e.direction));
}

// ---------------------------------------------------------------------------
// G. two conflicting sources remain separate (no fake consensus)
// ---------------------------------------------------------------------------

{
  const rA = raw({ source: "binance_derivatives", claim: "Funding rate = +0.012% (Binance)", rawValue: 0.00012, direction: "POSITIVE" });
  const rB = raw({ source: "okx_funding", claim: "Funding rate = -0.008% (OKX)", rawValue: -0.00008, direction: "NEGATIVE" });
  const batch = normalizeExternalEvidenceBatch([rA, rB], ASOF);
  check("G. batch preserves both entries (no merge)", batch.length === 2, String(batch.length));
  check("G. entries carry distinct ids", batch[0].id !== batch[1].id, `${batch[0].id} vs ${batch[1].id}`);
  check("G. entries keep their own opposing directions", batch[0].direction === "POSITIVE" && batch[1].direction === "NEGATIVE", `${batch[0].direction}, ${batch[1].direction}`);
  check("G. entries keep their own source attribution", batch[0].source === "binance_derivatives" && batch[1].source === "okx_funding", `${batch[0].source}, ${batch[1].source}`);
  check(
    "G. no consensus/averaged field exists anywhere on either record",
    !("consensus" in batch[0]) && !("averagedValue" in batch[0]) && !("consensus" in batch[1]) && !("averagedValue" in batch[1]),
    "found a consensus-shaped field"
  );
}

// ---------------------------------------------------------------------------
// H. no fabricated confidence/reliability
// ---------------------------------------------------------------------------

{
  const e = normalizeExternalEvidence(raw({}), ASOF);
  const forbiddenKeys = ["confidence", "reliability", "score", "reliabilityScore", "truthScore", "sentimentScore"];
  const keys = Object.keys(e);
  const leaked = forbiddenKeys.filter((k) => keys.includes(k));
  check("H. no confidence/reliability/score field on the evidence record", leaked.length === 0, `leaked: ${leaked.join(", ")}`);
}

// ---------------------------------------------------------------------------
// I. symbol/subject preservation
// ---------------------------------------------------------------------------

{
  const e1 = normalizeExternalEvidence(raw({ symbol: "ETHUSDT" }), ASOF);
  check("I. symbol preserved verbatim", e1.symbol === "ETHUSDT", String(e1.symbol));
  const e2 = normalizeExternalEvidence(raw({ symbol: null }), ASOF);
  check("I. null symbol stays null (never fabricated)", e2.symbol === null, String(e2.symbol));
}

// ---------------------------------------------------------------------------
// J. batch normalization deterministic
// ---------------------------------------------------------------------------

{
  const batchInput: RawExternalObservation[] = [
    raw({ source: "binance_derivatives", symbol: "BTCUSDT" }),
    raw({ source: "okx_funding", symbol: "BTCUSDT", claim: "Funding rate = 0.009%", rawValue: 0.00009 }),
    raw({ source: "alternativeme_fear_greed", capability: "fear_greed_index", symbol: null, claim: "Fear & Greed = 62 (Greed)", rawValue: 62 }),
  ];
  const out1 = normalizeExternalEvidenceBatch(batchInput, ASOF);
  const out2 = normalizeExternalEvidenceBatch(JSON.parse(JSON.stringify(batchInput)), ASOF);
  check("J. batch is deterministic (deep-equal on repeat)", JSON.stringify(out1) === JSON.stringify(out2), "outputs differed on identical input");
  check("J. batch output length matches input length", out1.length === batchInput.length, `${out1.length} vs ${batchInput.length}`);
}

// ---------------------------------------------------------------------------
// K. malformed raw evidence handled honestly (never thrown, never dropped)
// ---------------------------------------------------------------------------

{
  const malformed = {
    source: "does_not_exist_source",
    capability: "funding_rate",
    symbol: 12345, // wrong type at runtime
    observedAt: "not-a-date",
    fetchedAt: undefined,
    kind: "FACTUAL_OBSERVATION",
    claim: undefined,
    rawValue: undefined,
    status: "BOGUS_STATUS",
  } as unknown as RawExternalObservation;

  let threw = false;
  let e: NormalizedExternalEvidence | null = null;
  try {
    e = normalizeExternalEvidence(malformed, ASOF);
  } catch {
    threw = true;
  }
  check("K. normalization never throws on malformed input", threw === false, "an exception was thrown");
  check("K. malformed evidence is still emitted (not dropped)", e !== null, "no record produced");
  check("K. malformed=true with multiple traceable reasons", !!e && e.malformed === true && e.malformedReasons.length >= 3, JSON.stringify(e?.malformedReasons));
  check("K. unregistered source -> category UNKNOWN, sourceRegistered=false", !!e && e.category === "UNKNOWN" && e.provenance.sourceRegistered === false, JSON.stringify(e?.provenance));
  check("K. unresolvable claim coerced to empty string, never undefined leaking through", !!e && e.claim === "", String(e?.claim));
  check("K. wrong-typed symbol coerced to null, never left as a non-string", !!e && e.symbol === null, String(e?.symbol));
  check("K. unparseable observedAt coerced to null", !!e && e.observedAt === null, String(e?.observedAt));
  check("K. unrecognized status -> availability UNKNOWN (never AVAILABLE)", !!e && e.availability === "UNKNOWN", String(e?.availability));
}

console.log(failures === 0 ? `\nAll Phase 8.4.3 evidence normalization fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
