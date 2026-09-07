// ---------------------------------------------------------------------------
// Phase 8.4.4 — Community Intelligence fixtures (dev-only, not part of the
// app). Pure/offline — no network, no LLM, no database, no mocks that
// bypass real logic. Covers required cases A-J from the task brief. K
// (8.4.1/8.4.2/8.4.3 regression) is run as separate script invocations —
// see the final report.
//
// NOTE ON SYNTHETIC EVIDENCE: no real community source is integrated in
// this repository (see contracts.ts's audit header), so every
// `NormalizedExternalEvidence` object below is SYNTHETIC — built by
// calling the real Phase 8.4.3 `normalizeExternalEvidence()` with
// `source: "community_unintegrated"` (the only community-category id
// that exists in the Phase 8.4.1 registry) and a hand-written `raw`
// payload standing in for what a real future provider would one day
// supply. This exercises the genuine 8.4.3 -> 8.4.4 boundary; it is not,
// and does not claim to be, real fetched community data.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/community-intelligence-fixtures.ts
// ---------------------------------------------------------------------------

import { normalizeExternalEvidence } from "@/lib/ai/externalIntelligence/evidence/normalize";
import type { RawExternalObservation, NormalizedExternalEvidence } from "@/lib/ai/externalIntelligence/evidence/contracts";
import { analyzeCommunityIntelligence, determineStatus } from "@/lib/ai/externalIntelligence/community/analyze";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const ASOF = "2026-09-05T12:00:00.000Z";

function communityRaw(overrides: Partial<RawExternalObservation>): RawExternalObservation {
  return {
    source: "community_unintegrated",
    capability: "discussion_velocity",
    symbol: "TOKENUSDT",
    observedAt: "2026-09-05T11:55:00.000Z",
    fetchedAt: "2026-09-05T11:55:05.000Z",
    kind: "FACTUAL_OBSERVATION",
    claim: "Mention count rose from 120 to 340 in 24h",
    rawValue: { previous: 120, current: 340 },
    status: "OK",
    ...overrides,
  };
}

function normalize(overrides: Partial<RawExternalObservation>): NormalizedExternalEvidence {
  return normalizeExternalEvidence(communityRaw(overrides), ASOF);
}

function deepKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    keys.push(prefix + k);
    keys.push(...deepKeys(v, prefix + k + "."));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// A. no community provider -> UNAVAILABLE_NOT_INTEGRATED
// ---------------------------------------------------------------------------

{
  const ctx = analyzeCommunityIntelligence([], "TOKENUSDT", ASOF);
  check("A. empty evidence + no registered community source -> UNAVAILABLE_NOT_INTEGRATED", ctx.status === "UNAVAILABLE_NOT_INTEGRATED", ctx.status);
  check("A. evidenceCount.total=0", ctx.evidenceCount.total === 0, String(ctx.evidenceCount.total));
  check(
    "A. dataLimitations names the registry fact, not an invented reason",
    ctx.dataLimitations.some((l) => l.includes("Phase 8.4.1 Source Registry")),
    JSON.stringify(ctx.dataLimitations)
  );
}

// ---------------------------------------------------------------------------
// B. empty/insufficient evidence -> INSUFFICIENT_DATA
// ---------------------------------------------------------------------------

{
  // B1: determineStatus's other branch — a hypothetically-available registered
  // source (can't be simulated via the real registry, since the only
  // community entry is permanently NOT_INTEGRATED) with zero evidence.
  check("B1. evidence=[] but a source IS available -> INSUFFICIENT_DATA (not UNAVAILABLE_NOT_INTEGRATED)", determineStatus([], true) === "INSUFFICIENT_DATA", determineStatus([], true));
  check("B2. evidence=[] and no source available -> UNAVAILABLE_NOT_INTEGRATED", determineStatus([], false) === "UNAVAILABLE_NOT_INTEGRATED", determineStatus([], false));
}

{
  // B3: real evidence exists but every record reports the provider had nothing usable.
  const e1 = normalize({ status: "INSUFFICIENT_DATA", claim: "", rawValue: undefined, direction: undefined });
  const e2 = normalize({ status: "UNAVAILABLE", claim: "", rawValue: undefined, direction: undefined, capability: "catalyst_announcement" });
  const ctx = analyzeCommunityIntelligence([e1, e2], "TOKENUSDT", ASOF);
  check("B3. no AVAILABLE evidence among what was supplied -> INSUFFICIENT_DATA", ctx.status === "INSUFFICIENT_DATA", ctx.status);
  check("B3. no activity/announcement patterns fabricated from unusable evidence", ctx.activitySignals.length === 0 && ctx.announcements.length === 0, JSON.stringify(ctx));
}

// ---------------------------------------------------------------------------
// C. real evidence provenance preserved
// ---------------------------------------------------------------------------

{
  const e = normalize({ direction: "INCREASING", reference: { url: "https://example-provider.test/mentions/TOKEN", note: "synthetic test reference" } });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  check("C. activity signal traces to the exact evidence id", ctx.activitySignals[0]?.evidenceId === e.id, JSON.stringify(ctx.activitySignals));
  check("C. underlying evidence still carries its own provenance (source/reference) independently", e.provenance.source === "community_unintegrated" && e.provenance.reference?.url === "https://example-provider.test/mentions/TOKEN", JSON.stringify(e.provenance));
  check("C. no source reference fabricated when none was supplied on a different record", normalize({ reference: null }).provenance.reference === null, "reference was fabricated");
}

// ---------------------------------------------------------------------------
// D. measurable activity preserved without market interpretation
// ---------------------------------------------------------------------------

{
  const e = normalize({ direction: "INCREASING" });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  const signal = ctx.activitySignals[0];
  check("D. activity signal fires for discussion_velocity + INCREASING", signal?.direction === "ACTIVITY_INCREASING", JSON.stringify(signal));
  const keys = signal ? Object.keys(signal) : [];
  check(
    "D. activity signal carries only structural fields, no market-interpretation field",
    JSON.stringify(keys.sort()) === JSON.stringify(["capability", "direction", "evidenceId", "observedAt", "symbol"].sort()),
    JSON.stringify(keys)
  );
}

{
  // sentiment_divergence / narrative_emergence must NEVER produce an activity signal (see analyze.ts header).
  const e1 = normalize({ capability: "sentiment_divergence", direction: "POSITIVE", claim: "Sentiment metric diverges positively", rawValue: 0.4 });
  const e2 = normalize({ capability: "narrative_emergence", direction: "INCREASING", claim: "A new narrative is emerging", rawValue: 5 });
  const ctx = analyzeCommunityIntelligence([e1, e2], "TOKENUSDT", ASOF);
  check("D2. sentiment_divergence/narrative_emergence never produce an ACTIVITY_* signal", ctx.activitySignals.length === 0, JSON.stringify(ctx.activitySignals));
}

// ---------------------------------------------------------------------------
// E. claim never upgraded to fact
// ---------------------------------------------------------------------------

{
  const e = normalize({ kind: "EXTERNAL_CLAIM", capability: "catalyst_announcement", claim: "Community expects a major exchange listing soon" });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  check("E. an EXTERNAL_CLAIM about an announcement never lands in `announcements` (FACTUAL_OBSERVATION only)", ctx.announcements.length === 0, JSON.stringify(ctx.announcements));
}

{
  const e = normalize({ kind: "FACTUAL_OBSERVATION", capability: "catalyst_announcement", claim: "Official project account posted a partnership announcement" });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  check("E2. a genuine FACTUAL_OBSERVATION announcement IS surfaced", ctx.announcements.length === 1 && ctx.announcements[0].evidenceId === e.id, JSON.stringify(ctx.announcements));
}

// ---------------------------------------------------------------------------
// F. conflicting claims remain conflict
// ---------------------------------------------------------------------------

{
  const eA = normalize({ source: "community_unintegrated", capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Listing on a major exchange expected next week", symbol: "TOKENUSDT" });
  // Simulate a second, distinct source by overriding provenance-relevant fields via a second normalize call —
  // same registry id (only one community source exists) but a distinct claim, which is what conflict detection here actually keys on.
  const eB = normalize({ source: "community_unintegrated", capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Team denies any exchange listing talks", symbol: "TOKENUSDT" });
  // Force distinct `source` identifiers to reflect "two different community sources" honestly, since only one is registered today.
  const eA2: NormalizedExternalEvidence = { ...eA, source: "community_unintegrated#sourceA" };
  const eB2: NormalizedExternalEvidence = { ...eB, source: "community_unintegrated#sourceB" };
  const ctx = analyzeCommunityIntelligence([eA2, eB2], "TOKENUSDT", ASOF);
  check("F. two distinctly-worded claims from different sources -> one claimConflict entry", ctx.claimConflicts.length === 1, JSON.stringify(ctx.claimConflicts));
  check("F. both original claims preserved verbatim, neither dropped", ctx.claimConflicts[0]?.claims.includes(eA.claim) && ctx.claimConflicts[0]?.claims.includes(eB.claim), JSON.stringify(ctx.claimConflicts));
  check("F. note explicitly disclaims semantic verification", ctx.claimConflicts[0]?.note.includes("NOT a verified semantic contradiction"), String(ctx.claimConflicts[0]?.note));
}

{
  // Same claim text from two sources -> agreement, not conflict.
  const eA = normalize({ source: "community_unintegrated#sourceA", capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Listing expected next week", symbol: "TOKENUSDT" });
  const eB: NormalizedExternalEvidence = { ...normalize({ source: "community_unintegrated#sourceB", capability: "catalyst_announcement", kind: "EXTERNAL_CLAIM", claim: "Listing expected next week", symbol: "TOKENUSDT" }) };
  const ctx = analyzeCommunityIntelligence([eA, eB], "TOKENUSDT", ASOF);
  check("F2. identical (normalized) claim text from two sources is NOT flagged as conflict", ctx.claimConflicts.length === 0, JSON.stringify(ctx.claimConflicts));
}

// ---------------------------------------------------------------------------
// G. no fabricated sentiment score
// ---------------------------------------------------------------------------

{
  const e = normalize({ direction: "INCREASING" });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  const forbidden = ["score", "sentiment", "bullish", "bearish", "hype", "confidence", "reliability"];
  const keys = deepKeys(ctx).map((k) => k.toLowerCase());
  const leaked = forbidden.filter((f) => keys.some((k) => k.includes(f)));
  check("G. no score/sentiment/bullish/bearish/hype/confidence/reliability key anywhere in the output", leaked.length === 0, `leaked: ${leaked.join(", ")}`);
}

// ---------------------------------------------------------------------------
// H. no BUY/SELL implication
// ---------------------------------------------------------------------------

{
  const e = normalize({ direction: "INCREASING" });
  const ctx = analyzeCommunityIntelligence([e], "TOKENUSDT", ASOF);
  const keys = deepKeys(ctx);
  const tradeWords = ["BUY", "SELL", "EXECUTE", "LONG", "SHORT"];
  const leakedKeys = keys.filter((k) => tradeWords.some((w) => k.toUpperCase() === w));
  check("H. no field/enum value equal to a trade-action word", leakedKeys.length === 0, JSON.stringify(leakedKeys));
  check(
    "H. CommunityActivityDirection values are structural only, never a trade action",
    ctx.activitySignals.every((s) => (["ACTIVITY_INCREASING", "ACTIVITY_DECREASING", "ACTIVITY_STABLE"] as string[]).includes(s.direction)),
    JSON.stringify(ctx.activitySignals)
  );
}

// ---------------------------------------------------------------------------
// I. malformed evidence degrades honestly
// ---------------------------------------------------------------------------

{
  const good = normalize({ direction: "INCREASING" });
  const badRaw: RawExternalObservation = { ...communityRaw({}), source: "not_a_real_source", capability: "discussion_velocity" };
  const bad = normalizeExternalEvidence(badRaw, ASOF);
  check("I. setup — the malformed record really is flagged malformed by 8.4.3", bad.malformed === true, JSON.stringify(bad.malformedReasons));

  // The malformed record's `category` resolves to "UNKNOWN" (unregistered source) so it
  // is naturally excluded from `communityEvidence` filtering by category === "community".
  // To test degrade-honestly behavior for a malformed COMMUNITY record specifically, use
  // a capability/source mismatch instead — still registered as community, still malformed.
  const badCommunityRaw: RawExternalObservation = { ...communityRaw({}), capability: "spot_price" }; // spot_price is not one of community_unintegrated's declared capabilities
  const badCommunity = normalizeExternalEvidence(badCommunityRaw, ASOF);
  check("I. setup — capability/source mismatch is malformed but still category=community", badCommunity.malformed === true && badCommunity.category === "community", JSON.stringify(badCommunity));

  const ctx = analyzeCommunityIntelligence([good, badCommunity], "TOKENUSDT", ASOF);
  check("I. mix of usable + malformed evidence -> DEGRADED, not AVAILABLE", ctx.status === "DEGRADED", ctx.status);
  check("I. malformed record excluded from activitySignals (only `good` contributes)", ctx.activitySignals.length === 1 && ctx.activitySignals[0].evidenceId === good.id, JSON.stringify(ctx.activitySignals));
  check(
    "I. dataLimitations explicitly names the malformed-exclusion",
    ctx.dataLimitations.some((l) => l.includes("malformed")),
    JSON.stringify(ctx.dataLimitations)
  );
}

// ---------------------------------------------------------------------------
// J. deterministic identical input -> identical output
// ---------------------------------------------------------------------------

{
  const batch = [normalize({ direction: "INCREASING" }), normalize({ capability: "catalyst_announcement", kind: "FACTUAL_OBSERVATION", claim: "Announcement posted" })];
  const ctx1 = analyzeCommunityIntelligence(batch, "TOKENUSDT", ASOF);
  const ctx2 = analyzeCommunityIntelligence(JSON.parse(JSON.stringify(batch)), "TOKENUSDT", ASOF);
  check("J. identical input -> deep-equal output", JSON.stringify(ctx1) === JSON.stringify(ctx2), "outputs differed on identical input");
}

console.log(failures === 0 ? `\nAll Phase 8.4.4 community intelligence fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
