// ---------------------------------------------------------------------------
// ELVOID Intelligence — Altcoin Screener analyzer (Phase 8.4.5)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PURE and DETERMINISTIC. No network call, no database access, no LLM
//     call, no `Math.random()`, no `Date.now()` — the only "now" this
//     module knows is the caller-supplied `asOf`. Identical
//     `(raw, asOf)` always produces a deep-equal output.
//   - REUSES three real, already-existing, already-audited functions
//     verbatim — see contracts.ts's header for the full audit summary:
//       `pumpGrade()` / `rugpullGrade()` (lib/intelligence/premium.ts)
//       `computeVolumeAnomalies()` (lib/market-insights.ts)
//     This file adds zero new scoring/grading/anomaly logic of its own.
//   - ONLY `UNUSUAL_ACTIVITY` IS IMPLEMENTED AS A STRUCTURAL PATTERN.
//     `RANK_CHANGE`, `LIQUIDITY_CHANGE`, and `VOLUME_CHANGE` (as a trend)
//     all require comparing two points in time; `AltcoinScreenerRawInput`
//     is a SINGLE snapshot with no prior-snapshot argument anywhere in
//     its type, so this file has no way to compute them honestly and
//     does not attempt to. `PRICE_MOMENTUM` is not implemented as a
//     separate pattern either — `PumpCandidate.reasons` already contains
//     the exact momentum-related strings `buildPumpCandidates()` itself
//     produced (e.g. "Price up X% in 24h", "Momentum accelerating vs 7d
//     trend"), which this module already preserves verbatim on every
//     asset — inventing a second, redundant pattern object that just
//     repeats what `reasons` already says would add complexity without
//     adding information. All of this is recorded in `dataLimitations`,
//     never silently omitted.
//   - RESEARCH TRIGGER HINTS ARE THRESHOLD-REUSING, NOT NEW THRESHOLDS.
//     A pump candidate becomes `isAltcoinScreeningCandidate: true` only
//     when `pumpGrade(score).label !== "LOW"` — i.e. at least the
//     existing "EARLY" (B+) bucket `pumpGrade()` itself already defines,
//     never a new score cutoff invented here. A rugpull-risk asset
//     becomes `unusualMarketConditionDetected: true` only when
//     `computeVolumeAnomalies()` itself flags it — never a second,
//     independent anomaly rule. Neither hint is ever set from "this
//     asset merely appears in the list" or "this asset is ranked highly"
//     alone — see `buildPumpAsset()` and `buildRugpullAsset()` below,
//     where each hint is computed inline next to the asset it describes.
//   - EVIDENCE IS BUILT ONLY FOR RAW, ATTRIBUTABLE FIELDS. `score`/
//     `confidence`/`reasons`/`flags`/`grade` never become
//     `NormalizedExternalEvidence` — see contracts.ts's header for the
//     documented type-level gap (no `ReliabilityTier`/`AccessMethod`
//     member honestly describes "this app's own internal computation")
//     and the deliberate decision not to work around it by extending
//     Phase 8.4.1's closed unions. Only `price`/`priceChange24h`
//     (attributed to the real, already-registered `coingecko_markets`
//     source) and `liquidityUsd`/`volume24hUsd` (attributed to the real,
//     already-registered `geckoterminal_dex_pools` source) are
//     normalized — both are exactly the capabilities those two sources
//     already declare in the Phase 8.4.1 registry, so
//     `normalizeExternalEvidence()`'s own capability-registration check
//     passes cleanly (never `malformed` for this reason).
//   - NO DECISION AUTHORITY: this module never calls
//     `evaluateResearchTrigger()` (Phase 8.4.2) itself — it only produces
//     a plain-object HINT a future caller may fold into a
//     `ResearchTriggerInput`. It never touches `lib/ai/oracle/*`,
//     `autonomousDecision/*`, or `autonomousExecution/*`.
// ---------------------------------------------------------------------------

import type { PumpCandidate, RugpullRisk, CoinMarket } from "@/lib/types";
import { pumpGrade, rugpullGrade } from "@/lib/intelligence/premium";
import { computeVolumeAnomalies } from "@/lib/market-insights";
import { normalizeExternalEvidence } from "../evidence/normalize";
import type { NormalizedExternalEvidence, RawExternalObservation } from "../evidence/contracts";
import type {
  AltcoinScreenerAsset,
  AltcoinScreenerIntelligence,
  AltcoinScreenerPattern,
  AltcoinScreenerRawInput,
  AltcoinScreenerStatus,
  ScreenerResearchTriggerHint,
} from "./contracts";

function determineStatus(pumpCandidates: readonly PumpCandidate[] | null, rugpullRisks: readonly RugpullRisk[] | null): AltcoinScreenerStatus {
  const pumpMissing = pumpCandidates === null;
  const riskMissing = rugpullRisks === null;
  if (pumpMissing && riskMissing) return "UNAVAILABLE_NOT_INTEGRATED";
  if (pumpMissing || riskMissing) return "DEGRADED"; // one half of the screener produced nothing to work with
  if (pumpCandidates.length === 0 && rugpullRisks.length === 0) return "INSUFFICIENT_DATA";
  return "AVAILABLE";
}

function findMarketBySymbol(markets: readonly CoinMarket[] | undefined, symbol: string): CoinMarket | undefined {
  if (!markets) return undefined;
  return markets.find((m) => m.symbol.toUpperCase() === symbol.toUpperCase());
}

function buildPumpAsset(c: PumpCandidate, markets: readonly CoinMarket[] | undefined): AltcoinScreenerAsset {
  const market = findMarketBySymbol(markets, c.symbol);
  const gradeResult = pumpGrade(c.score);
  const researchTriggerHint: ScreenerResearchTriggerHint =
    gradeResult.label === "LOW"
      ? "NO_TRIGGER"
      : {
          isAltcoinScreeningCandidate: true,
          unusualMarketConditionDetected: false,
          detail: `Pump candidate grade=${gradeResult.grade} (${gradeResult.label}), score=${c.score}, confidence=${c.confidence} — via lib/scoring.ts::buildPumpCandidates and lib/intelligence/premium.ts::pumpGrade`,
        };

  return {
    assetType: "PUMP_CANDIDATE",
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    priceChange24h: c.change24h,
    volume24hUsd: null,
    liquidityUsd: null,
    marketCap: market?.market_cap ?? null,
    rank: market?.market_cap_rank ?? null,
    score: c.score,
    confidence: c.confidence,
    reasons: c.reasons,
    grade: { grade: gradeResult.grade, label: gradeResult.label, tone: gradeResult.tone },
    researchTriggerHint,
  };
}

function buildRugpullAsset(r: RugpullRisk, anomalies: readonly RugpullRisk[]): AltcoinScreenerAsset {
  const gradeResult = rugpullGrade(r.score);
  const anomaly = anomalies.find((a) => a.id === r.id);
  const researchTriggerHint: ScreenerResearchTriggerHint = anomaly
    ? {
        isAltcoinScreeningCandidate: false,
        unusualMarketConditionDetected: true,
        detail: `Flagged by lib/market-insights.ts::computeVolumeAnomalies — matched flag(s): ${anomaly.flags.filter((f) => /5x\+ pool liquidity|under 48h old with heavy volume|shortly before\/after listing/i.test(f)).join("; ")}`,
      }
    : "NO_TRIGGER";

  return {
    assetType: "RUGPULL_RISK",
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    price: null,
    priceChange24h: null,
    volume24hUsd: r.volume24hUsd,
    liquidityUsd: r.liquidityUsd,
    marketCap: null, // pool-level entity — not a reliable symbol join target, see contracts.ts header
    rank: null,
    score: r.score,
    confidence: r.confidence,
    reasons: r.flags,
    grade: { label: gradeResult.label, tone: gradeResult.tone },
    researchTriggerHint,
  };
}

function buildPatterns(anomalies: readonly RugpullRisk[]): AltcoinScreenerPattern[] {
  const pattern = /5x\+ pool liquidity|under 48h old with heavy volume|shortly before\/after listing/i;
  return anomalies.map((a) => ({
    type: "UNUSUAL_ACTIVITY" as const,
    assetId: a.id,
    symbol: a.symbol,
    matchedFlags: a.flags.filter((f) => pattern.test(f)),
  }));
}

function buildEvidenceForPumpCandidate(c: PumpCandidate, asOf: string): NormalizedExternalEvidence[] {
  const evidence: NormalizedExternalEvidence[] = [];
  const priceRaw: RawExternalObservation = {
    source: "coingecko_markets",
    capability: "spot_price",
    symbol: c.symbol,
    observedAt: asOf,
    fetchedAt: asOf,
    kind: "FACTUAL_OBSERVATION",
    claim: `${c.symbol} price = ${c.price} USD (24h change ${c.change24h.toFixed(2)}%)`,
    rawValue: { price: c.price, change24h: c.change24h },
    status: "OK",
    reference: { note: "lib/scoring.ts::buildPumpCandidates() input (CoinMarket.current_price / price_change_percentage_24h_in_currency)" },
  };
  evidence.push(normalizeExternalEvidence(priceRaw, asOf));
  return evidence;
}

function buildEvidenceForRugpullRisk(r: RugpullRisk, asOf: string): NormalizedExternalEvidence[] {
  const raw: RawExternalObservation = {
    source: "geckoterminal_dex_pools",
    capability: "dex_pool_activity",
    symbol: r.symbol,
    observedAt: asOf,
    fetchedAt: asOf,
    kind: "FACTUAL_OBSERVATION",
    claim: `${r.symbol} pool liquidity = $${r.liquidityUsd.toLocaleString("en-US")}, 24h volume = $${r.volume24hUsd.toLocaleString("en-US")}`,
    rawValue: { liquidityUsd: r.liquidityUsd, volume24hUsd: r.volume24hUsd },
    status: "OK",
    reference: { note: "lib/scoring.ts::buildRugpullRisks() input (DexPool.liquidityUsd / volume24hUsd)" },
  };
  return [normalizeExternalEvidence(raw, asOf)];
}

function buildDataLimitations(input: AltcoinScreenerRawInput, status: AltcoinScreenerStatus): string[] {
  const limitations: string[] = [];
  if (input.pumpCandidates === null) limitations.push("pumpCandidates was not supplied (null) — Accumulation-side screener data is unavailable for this analysis.");
  if (input.rugpullRisks === null) limitations.push("rugpullRisks was not supplied (null) — Dump/Rugpull-side screener data is unavailable for this analysis.");
  if (!input.markets) limitations.push("No `markets` array was supplied — marketCap/rank cannot be joined onto PUMP_CANDIDATE assets and are reported as null rather than fabricated.");
  limitations.push(
    "RANK_CHANGE, LIQUIDITY_CHANGE, and VOLUME_CHANGE (as a trend) are not computed — this analyzer receives a single snapshot with no prior-snapshot comparison data; claiming a trend from one point in time would not be honest. Only UNUSUAL_ACTIVITY (single-snapshot volume/liquidity-ratio anomaly, via lib/market-insights.ts::computeVolumeAnomalies) is structurally defensible here."
  );
  limitations.push(
    "PumpCandidate/RugpullRisk carry no per-item timestamp — evidence built from them uses this analysis's own asOf for both observedAt and fetchedAt, which is a real precision limitation, not a fabricated exact measurement time."
  );
  if (status === "AVAILABLE" && input.pumpCandidates && input.pumpCandidates.length === 0) {
    limitations.push("pumpCandidates was supplied and ran successfully but found zero qualifying candidates this snapshot.");
  }
  if (status === "AVAILABLE" && input.rugpullRisks && input.rugpullRisks.length === 0) {
    limitations.push("rugpullRisks was supplied and ran successfully but found zero flagged pools this snapshot.");
  }
  return limitations;
}

/**
 * The single exported entry point. Pure, synchronous. See this file's
 * header for exactly what is and is not derived.
 */
export function analyzeAltcoinScreener(input: AltcoinScreenerRawInput, asOf: string): AltcoinScreenerIntelligence {
  const pumpCandidates = input.pumpCandidates ?? [];
  const rugpullRisks = input.rugpullRisks ?? [];
  const status = determineStatus(input.pumpCandidates, input.rugpullRisks);

  const pumpAssets = pumpCandidates.map((c) => buildPumpAsset(c, input.markets));
  const anomalies = computeVolumeAnomalies([...rugpullRisks], rugpullRisks.length);
  const rugpullAssets = rugpullRisks.map((r) => buildRugpullAsset(r, anomalies));
  const assets = [...pumpAssets, ...rugpullAssets];

  const patterns = buildPatterns(anomalies);

  const evidence: NormalizedExternalEvidence[] = [
    ...pumpCandidates.flatMap((c) => buildEvidenceForPumpCandidate(c, asOf)),
    ...rugpullRisks.flatMap((r) => buildEvidenceForRugpullRisk(r, asOf)),
  ];

  const sources = Array.from(new Set(evidence.map((e) => e.source)));

  const dataLimitations = buildDataLimitations(input, status);

  return {
    version: 1,
    generatedAt: asOf,
    status,
    assets,
    patterns,
    evidence,
    evidenceCount: {
      total: evidence.length,
      pumpCandidateCount: pumpCandidates.length,
      rugpullRiskCount: rugpullRisks.length,
    },
    sources,
    dataLimitations,
  };
}
