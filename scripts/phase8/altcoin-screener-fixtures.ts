// ---------------------------------------------------------------------------
// Phase 8.4.5 — Altcoin Screener Integration fixtures (dev-only, not part
// of the app). Pure/offline — no network, no LLM, no database, no mocks
// that bypass real logic. Every `PumpCandidate`/`RugpullRisk` object below
// is SYNTHETIC TEST DATA, hand-written to exercise this analyzer's logic —
// it is NOT real fetched CoinGecko/GeckoTerminal data. Real score/grade
// helpers (`pumpGrade`, `rugpullGrade`, `computeVolumeAnomalies`) ARE the
// genuine, already-existing repo functions — nothing about the SCORING
// LOGIC is synthetic, only the input numbers are.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/altcoin-screener-fixtures.ts
// ---------------------------------------------------------------------------

import { analyzeAltcoinScreener } from "@/lib/ai/externalIntelligence/screener/analyze";
import type { AltcoinScreenerRawInput } from "@/lib/ai/externalIntelligence/screener/contracts";
import { pumpGrade, rugpullGrade } from "@/lib/intelligence/premium";
import type { PumpCandidate, RugpullRisk, CoinMarket } from "@/lib/types";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const ASOF = "2026-09-05T12:00:00.000Z";

function deepKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    keys.push(prefix + k);
    keys.push(...deepKeys(v, prefix + k + "."));
  }
  return keys;
}

// SYNTHETIC test fixtures — not real fetched data.
const HIGH_SCORE_PUMP: PumpCandidate = {
  id: "synthetic-token-a",
  symbol: "TOKENA",
  name: "Synthetic Token A",
  price: 1.23,
  change24h: 12.5,
  score: 62, // pumpGrade(62) -> "A" / "MEDIUM"
  confidence: 69,
  reasons: ["Price up 12.5% in 24h", "Large whale transfers detected (>$1M)"],
};

const LOW_SCORE_PUMP: PumpCandidate = {
  id: "synthetic-token-b",
  symbol: "TOKENB",
  name: "Synthetic Token B",
  price: 0.05,
  change24h: 2.1,
  score: 20, // pumpGrade(20) -> "WATCH" / "LOW"
  confidence: 30,
  reasons: ["Small-cap name has more room to move"],
};

const ANOMALOUS_RUGPULL: RugpullRisk = {
  id: "synthetic-pool-x",
  symbol: "TOKENX",
  name: "Synthetic Token X",
  network: "bsc",
  score: 65,
  confidence: 66,
  flags: ["Pool is under 48h old with heavy volume", "Liquidity pool is very small (<$20k)"],
  liquidityUsd: 15_000,
  volume24hUsd: 300_000,
};

const NORMAL_RUGPULL: RugpullRisk = {
  id: "synthetic-pool-y",
  symbol: "TOKENY",
  name: "Synthetic Token Y",
  network: "ethereum",
  score: 25,
  confidence: 42,
  flags: ["Liquidity is under 2% of fully diluted value"],
  liquidityUsd: 500_000,
  volume24hUsd: 200_000,
};

const MARKETS: CoinMarket[] = [
  { id: "synthetic-token-a", symbol: "tokena", name: "Synthetic Token A", image: "", current_price: 1.23, market_cap: 45_000_000, market_cap_rank: 312, total_volume: 9_000_000 },
];

// ---------------------------------------------------------------------------
// A. Full valid screener data
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP, LOW_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL, NORMAL_RUGPULL], markets: MARKETS };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  check("A. status=AVAILABLE for a complete, non-empty screener snapshot", ctx.status === "AVAILABLE", ctx.status);
  check("A. assets contains all 4 entries", ctx.assets.length === 4, String(ctx.assets.length));
  check("A. evidence built for both pump candidates and both rugpull pools (4 total)", ctx.evidence.length === 4, String(ctx.evidence.length));
  check("A. sources traces to the real, already-registered ids only", [...ctx.sources].sort().join(",") === "coingecko_markets,geckoterminal_dex_pools", ctx.sources.join(","));
}

// ---------------------------------------------------------------------------
// B. Empty screener
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [], rugpullRisks: [] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  check("B. both lists present but empty -> INSUFFICIENT_DATA", ctx.status === "INSUFFICIENT_DATA", ctx.status);
  check("B. no assets/evidence fabricated from an empty screener", ctx.assets.length === 0 && ctx.evidence.length === 0, JSON.stringify(ctx));
}

// ---------------------------------------------------------------------------
// C. Partial asset metrics (no markets join supplied -> honest null enrichment)
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const asset = ctx.assets[0];
  check("C. marketCap/rank stay null when no `markets` array is supplied", asset.marketCap === null && asset.rank === null, JSON.stringify(asset));
  check(
    "C. dataLimitations names the missing markets join explicitly",
    ctx.dataLimitations.some((l) => l.includes("marketCap/rank cannot be joined")),
    JSON.stringify(ctx.dataLimitations)
  );
}

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [], markets: MARKETS };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const asset = ctx.assets[0];
  check("C2. marketCap/rank ARE populated via an honest symbol join when `markets` is supplied", asset.marketCap === 45_000_000 && asset.rank === 312, JSON.stringify(asset));
}

// ---------------------------------------------------------------------------
// D. Existing score preservation
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const pumpAsset = ctx.assets.find((a) => a.assetType === "PUMP_CANDIDATE")!;
  const rugAsset = ctx.assets.find((a) => a.assetType === "RUGPULL_RISK")!;
  check("D. PumpCandidate.score/confidence/reasons preserved verbatim", pumpAsset.score === HIGH_SCORE_PUMP.score && pumpAsset.confidence === HIGH_SCORE_PUMP.confidence && JSON.stringify(pumpAsset.reasons) === JSON.stringify(HIGH_SCORE_PUMP.reasons), JSON.stringify(pumpAsset));
  check("D. pumpGrade() output reused as-is, not recomputed differently", JSON.stringify(pumpAsset.grade) === JSON.stringify(pumpGrade(HIGH_SCORE_PUMP.score)), JSON.stringify(pumpAsset.grade));
  check("D. RugpullRisk.score/confidence/flags preserved verbatim (as `reasons`)", rugAsset.score === ANOMALOUS_RUGPULL.score && rugAsset.confidence === ANOMALOUS_RUGPULL.confidence && JSON.stringify(rugAsset.reasons) === JSON.stringify(ANOMALOUS_RUGPULL.flags), JSON.stringify(rugAsset));
  check("D. rugpullGrade() output reused as-is", JSON.stringify(rugAsset.grade) === JSON.stringify(rugpullGrade(ANOMALOUS_RUGPULL.score)), JSON.stringify(rugAsset.grade));
}

// ---------------------------------------------------------------------------
// E. No historical data -> analyzer must NOT fabricate a trend
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const forbiddenPatternTypes = ["VOLUME_INCREASING", "RANK_IMPROVING", "LIQUIDITY_GROWING", "RANK_CHANGE", "VOLUME_CHANGE", "LIQUIDITY_CHANGE", "PRICE_MOMENTUM"];
  check("E. patterns[] only ever contains UNUSUAL_ACTIVITY, never a trend claim", ctx.patterns.every((p) => p.type === "UNUSUAL_ACTIVITY") && !forbiddenPatternTypes.some((f) => JSON.stringify(ctx.patterns).includes(f)), JSON.stringify(ctx.patterns));
  check(
    "E. dataLimitations explicitly discloses the no-historical-comparison limitation",
    ctx.dataLimitations.some((l) => l.includes("RANK_CHANGE, LIQUIDITY_CHANGE, and VOLUME_CHANGE")),
    JSON.stringify(ctx.dataLimitations)
  );
}

// ---------------------------------------------------------------------------
// F. Deterministic same-input output
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP, LOW_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL, NORMAL_RUGPULL], markets: MARKETS };
  const ctx1 = analyzeAltcoinScreener(input, ASOF);
  const ctx2 = analyzeAltcoinScreener(JSON.parse(JSON.stringify(input)), ASOF);
  check("F. identical input -> deep-equal output", JSON.stringify(ctx1) === JSON.stringify(ctx2), "outputs differed on identical input");
}

// ---------------------------------------------------------------------------
// G. No fabricated bullish/bearish score
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL], markets: MARKETS };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const forbidden = ["bullish", "bearish", "moonscore", "opportunityscore", "aiconviction", "aiscore", "aiintelligencescore"];
  const keys = deepKeys(ctx).map((k) => k.toLowerCase());
  const leaked = forbidden.filter((f) => keys.some((k) => k.includes(f)));
  check("G. no bullish/bearish/moonScore/opportunityScore/AI-conviction key anywhere in the output", leaked.length === 0, `leaked: ${leaked.join(", ")}`);
}

// ---------------------------------------------------------------------------
// H. Degraded provider data
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: null };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  check("H. one list null, the other present -> DEGRADED", ctx.status === "DEGRADED", ctx.status);
  check("H. only the available half's assets are present (1 pump asset, 0 rugpull)", ctx.assets.length === 1 && ctx.assets[0].assetType === "PUMP_CANDIDATE", JSON.stringify(ctx.assets));
  check(
    "H. dataLimitations names exactly which half is missing",
    ctx.dataLimitations.some((l) => l.includes("rugpullRisks was not supplied")),
    JSON.stringify(ctx.dataLimitations)
  );
}

// ---------------------------------------------------------------------------
// I. Research trigger only when justified
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP, LOW_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL, NORMAL_RUGPULL] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  const highAsset = ctx.assets.find((a) => a.id === HIGH_SCORE_PUMP.id)!;
  const lowAsset = ctx.assets.find((a) => a.id === LOW_SCORE_PUMP.id)!;
  const anomalousAsset = ctx.assets.find((a) => a.id === ANOMALOUS_RUGPULL.id)!;
  const normalAsset = ctx.assets.find((a) => a.id === NORMAL_RUGPULL.id)!;

  check("I. a WATCH/LOW-grade pump candidate never gets a research trigger hint", lowAsset.researchTriggerHint === "NO_TRIGGER", JSON.stringify(lowAsset.researchTriggerHint));
  check(
    "I. a non-WATCH pump candidate DOES get isAltcoinScreeningCandidate=true",
    typeof highAsset.researchTriggerHint === "object" && highAsset.researchTriggerHint.isAltcoinScreeningCandidate === true,
    JSON.stringify(highAsset.researchTriggerHint)
  );
  check("I. a rugpull pool NOT flagged by computeVolumeAnomalies never gets a research trigger hint", normalAsset.researchTriggerHint === "NO_TRIGGER", JSON.stringify(normalAsset.researchTriggerHint));
  check(
    "I. a rugpull pool flagged by computeVolumeAnomalies DOES get unusualMarketConditionDetected=true",
    typeof anomalousAsset.researchTriggerHint === "object" && anomalousAsset.researchTriggerHint.unusualMarketConditionDetected === true,
    JSON.stringify(anomalousAsset.researchTriggerHint)
  );
  check(
    "I. 'ranked/appearing in the list' alone never sets isAltcoinScreeningCandidate on a rugpull-type asset",
    typeof anomalousAsset.researchTriggerHint !== "object" || anomalousAsset.researchTriggerHint.isAltcoinScreeningCandidate === false,
    JSON.stringify(anomalousAsset.researchTriggerHint)
  );
}

// ---------------------------------------------------------------------------
// J. Missing screener integration
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: null, rugpullRisks: null };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  check("J. both lists null -> UNAVAILABLE_NOT_INTEGRATED", ctx.status === "UNAVAILABLE_NOT_INTEGRATED", ctx.status);
  check("J. zero assets/evidence/patterns fabricated", ctx.assets.length === 0 && ctx.evidence.length === 0 && ctx.patterns.length === 0, JSON.stringify(ctx));
}

// ---------------------------------------------------------------------------
// K. Evidence normalization compatibility
// ---------------------------------------------------------------------------

{
  const input: AltcoinScreenerRawInput = { pumpCandidates: [HIGH_SCORE_PUMP], rugpullRisks: [ANOMALOUS_RUGPULL] };
  const ctx = analyzeAltcoinScreener(input, ASOF);
  check("K. every evidence record is well-formed (not malformed)", ctx.evidence.every((e) => e.malformed === false), JSON.stringify(ctx.evidence.map((e) => e.malformedReasons)));
  check("K. every evidence record resolves AVAILABLE (capability genuinely registered for its source)", ctx.evidence.every((e) => e.availability === "AVAILABLE"), JSON.stringify(ctx.evidence.map((e) => e.availability)));
  check("K. every evidence record's category resolves via the real registry (never UNKNOWN)", ctx.evidence.every((e) => e.category === "market"), JSON.stringify(ctx.evidence.map((e) => e.category)));
  check("K. evidence never carries score/confidence/reasons/flags fields", ctx.evidence.every((e) => !("score" in e) && !("confidence" in e) && !("reasons" in e) && !("flags" in e)), "leaked a score-shaped field into evidence");
}

console.log(failures === 0 ? `\nAll Phase 8.4.5 altcoin screener fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
