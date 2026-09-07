// ---------------------------------------------------------------------------
// ELVOID Intelligence — Altcoin Screener Integration contracts (Phase 8.4.5)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - MANDATORY AUDIT PERFORMED FIRST (see the final report for the full
//     FILE/PURPOSE/INPUT/OUTPUT/CACHING/FAILURE table). Summary of what
//     was found and reused, so nothing below is duplicated logic:
//       - `lib/scoring.ts::buildPumpCandidates()` / `buildRugpullRisks()`
//         — the REAL, ALREADY-EXISTING rule-based scoring engines behind
//         "Altcoin Screener Pro" (`components/dashboard/premium/AltcoinScreenerPro.tsx`).
//         This module NEVER recomputes `score`/`confidence`/`reasons`/
//         `flags` — it only reads the objects those functions already
//         produced, verbatim, as the caller's `AltcoinScreenerRawInput`.
//       - `lib/intelligence/premium.ts::pumpGrade()` / `rugpullGrade()` —
//         the REAL, ALREADY-EXISTING grade-bucket functions Altcoin
//         Screener Pro's own UI uses ("A+"/"A"/"B+"/"WATCH" and
//         "CRITICAL"/"HIGH"/"ELEVATED"/"WATCH"). Reused directly, never
//         reimplemented, never renamed into something like "AI
//         Intelligence Score".
//       - `lib/market-insights.ts::computeVolumeAnomalies()` — the REAL,
//         ALREADY-EXISTING single-snapshot "unusual activity" reader (its
//         own doc comment: "re-labels existing flags, it doesn't invent
//         new ones"). This is the ONLY structural pattern this module
//         derives — see `analyze.ts`'s header for exactly why the other
//         four example categories from the task brief (RANK_CHANGE,
//         LIQUIDITY_CHANGE, VOLUME_CHANGE as a *trend*, and a fabricated
//         PRICE_MOMENTUM bucket) are deliberately NOT implemented.
//       - Audited-but-EXCLUDED: `lib/derivatives.ts::buildIntelligenceRows()`
//         / `computeAiScore()` (the `opportunity`/`risk` composite score
//         behind `components/scanner/IntelligenceTerminal.tsx` /
//         `app/scanner/page.tsx`) is a DIFFERENT feature ("Scanner", not
//         "Altcoin Screener Pro") with its own distinct score. Folding it
//         in here would blur two already-existing, independently-named
//         scoring systems into one — exactly what this phase is told not
//         to do ("the goal is NOT to create a second screener... do not
//         invent a new scoring system"). Not touched, not imported.
//   - THIS MODULE NEVER FETCHES. It receives `AltcoinScreenerRawInput` —
//     whatever a caller already computed via `buildPumpCandidates()` /
//     `buildRugpullRisks()` (e.g. via `getPremiumIntelligenceSnapshot()`
//     in `lib/intelligence/premium.ts`, or `getSnapshot()` in
//     `lib/snapshot.ts`, or the `/api/pump-candidates` route) — and never
//     calls CoinGecko/GeckoTerminal/Binance/Alchemy itself.
//   - NO NEW SCORE IS INVENTED. `score`/`confidence` on every
//     `AltcoinScreenerAsset` below are copied verbatim from the source
//     `PumpCandidate`/`RugpullRisk` object — same 0-100 scale, same
//     semantics documented in `lib/scoring.ts`'s own header ("a signal
//     aggregator, not a price oracle... treat scores as 'worth a closer
//     look', never as a guarantee"). `grade` is `pumpGrade()`/
//     `rugpullGrade()`'s own real output, reused as-is.
//   - HONEST FIELD ABSENCE, NEVER FABRICATED. Neither `PumpCandidate` nor
//     `RugpullRisk` (see `lib/types.ts`) carries `marketCap`, `rank`, or
//     a per-item timestamp. `marketCap`/`rank` are `null` unless the
//     caller separately supplies the same `CoinMarket[]` array the
//     screener itself was built from (an optional, honest join by
//     symbol — never a new fetch); a `PUMP_CANDIDATE` asset can be
//     enriched this way, a `RUGPULL_RISK` asset (a pool-level entity,
//     not reliably symbol-unique across chains) is not. There is no
//     per-item observed timestamp on either source type, so evidence
//     built from them uses the batch's own `asOf` for both `observedAt`
//     and `fetchedAt` — documented as a real precision limitation, not
//     hidden.
//   - EVIDENCE NORMALIZATION IS SELECTIVE, NOT BLANKET. Only the RAW,
//     directly-attributable numeric fields (`price`/`priceChange24h` from
//     CoinGecko via `coingecko_markets`; `liquidityUsd`/`volume24hUsd`
//     from GeckoTerminal via `geckoterminal_dex_pools` — see Phase 8.4.1's
//     registry, unmodified) are normalized into `NormalizedExternalEvidence`.
//     The existing `score`/`confidence`/`reasons`/`flags` are NOT
//     converted into evidence — see `analyze.ts`'s header for the exact
//     reasoning (a genuine type-level gap was found and deliberately NOT
//     worked around; documented in the final report rather than silently
//     extending Phase 8.4.1's `ReliabilityTier`/`AccessMethod` unions to
//     invent an "internal computation" pseudo-source).
//   - NO DECISION AUTHORITY: nothing here touches `lib/ai/oracle/*`,
//     `autonomousDecision/*`, `autonomousExecution/*`, `lib/elvoid/*`,
//     `lib/economicData/*`, or Phase 8.3. This module produces
//     evidence/context and an optional research-trigger HINT (plain
//     booleans a future caller may fold into a `ResearchTriggerInput`) —
//     it never calls `evaluateResearchTrigger()` itself and never
//     produces BUY/SELL/EXECUTE/WAIT/REJECT.
// ---------------------------------------------------------------------------

import type { PumpCandidate, RugpullRisk, CoinMarket } from "@/lib/types";
import type { NormalizedExternalEvidence } from "../evidence/contracts";

/** Same four-state honesty model as Community Intelligence (Phase 8.4.4) and Evidence availability (Phase 8.4.3) — kept consistent across the whole External Intelligence architecture. */
export type AltcoinScreenerStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE_NOT_INTEGRATED" | "DEGRADED";

export type AltcoinScreenerAssetType = "PUMP_CANDIDATE" | "RUGPULL_RISK";

/** Only ever `computeVolumeAnomalies()`'s own real result, reused — see this file's header and analyze.ts's own header for why nothing else is implemented. */
export type AltcoinScreenerPatternType = "UNUSUAL_ACTIVITY";

export interface AltcoinScreenerPattern {
  readonly type: AltcoinScreenerPatternType;
  readonly assetId: string;
  readonly symbol: string;
  /** The exact `RugpullRisk.flags` entries that matched `computeVolumeAnomalies()`'s own pattern — never reworded. */
  readonly matchedFlags: readonly string[];
}

/**
 * A plain hint a future caller MAY fold into a Phase 8.4.2
 * `ResearchTriggerInput` (`isAltcoinScreeningCandidate`,
 * `unusualMarketConditionDetected`, `unusualMarketConditionDetail`) — this
 * module never calls `evaluateResearchTrigger()` itself. `"NO_TRIGGER"`
 * means neither condition below was defensibly met for this asset — a
 * screener asset existing, or being ranked, is never by itself a trigger
 * (see analyze.ts's header).
 */
export type ScreenerResearchTriggerHint =
  | "NO_TRIGGER"
  | {
      readonly isAltcoinScreeningCandidate: boolean;
      readonly unusualMarketConditionDetected: boolean;
      /** Factual, traceable explanation of whichever boolean above is `true` — never a market-direction claim. `null` only when both booleans are `false` (which itself should never occur outside `"NO_TRIGGER"` — see analyze.ts). */
      readonly detail: string | null;
    };

/**
 * One entry per `PumpCandidate` or `RugpullRisk` the caller supplied.
 * Every raw/measurable field is `null` when the underlying source type
 * simply does not carry it — never filled in with a guess.
 */
export interface AltcoinScreenerAsset {
  readonly assetType: AltcoinScreenerAssetType;
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  /** `PumpCandidate.price` only; `RugpullRisk` has no price field. */
  readonly price: number | null;
  /** `PumpCandidate.change24h` only. */
  readonly priceChange24h: number | null;
  /** `RugpullRisk.volume24hUsd` only. */
  readonly volume24hUsd: number | null;
  /** `RugpullRisk.liquidityUsd` only. */
  readonly liquidityUsd: number | null;
  /** Only populated for `PUMP_CANDIDATE` assets, and only when the caller supplied the same `markets` array the screener itself used — an honest symbol join, never a new fetch. Always `null` for `RUGPULL_RISK` (pool-level entity, not a reliable symbol join target). */
  readonly marketCap: number | null;
  /** Same join rule as `marketCap`. */
  readonly rank: number | null;
  /** = `PumpCandidate.score` or `RugpullRisk.score`, verbatim. Same 0-100 rule-based scale documented in `lib/scoring.ts` — never renamed or reinterpreted. */
  readonly score: number;
  /** = `PumpCandidate.confidence` or `RugpullRisk.confidence`, verbatim — "how many independent signal categories corroborate", per `lib/scoring.ts`'s own doc comment. NOT a probability. */
  readonly confidence: number;
  /** = `PumpCandidate.reasons` or `RugpullRisk.flags`, verbatim, same order — field name unified for a shared shape, content never altered. */
  readonly reasons: readonly string[];
  /** = `pumpGrade(score)` or `rugpullGrade(score)`'s own real, already-existing output — reused as-is, never recomputed differently here. */
  readonly grade: { readonly grade?: string; readonly label: string; readonly tone: "up" | "down" | "amber" | "neutral" };
  readonly researchTriggerHint: ScreenerResearchTriggerHint;
}

export interface AltcoinScreenerEvidenceCount {
  readonly total: number;
  readonly pumpCandidateCount: number;
  readonly rugpullRiskCount: number;
}

/** The single output type. Deterministic given identical `(raw, asOf)`. */
export interface AltcoinScreenerIntelligence {
  readonly version: 1;
  readonly generatedAt: string;
  readonly status: AltcoinScreenerStatus;
  readonly assets: readonly AltcoinScreenerAsset[];
  readonly patterns: readonly AltcoinScreenerPattern[];
  /** Raw, directly-attributable numeric fields normalized against the Phase 8.4.1 registry's already-existing `coingecko_markets`/`geckoterminal_dex_pools` entries. Never includes `score`/`confidence`/`reasons`/`flags` — see this file's header. */
  readonly evidence: readonly NormalizedExternalEvidence[];
  readonly evidenceCount: AltcoinScreenerEvidenceCount;
  /** Which Phase 8.4.1 registry source ids this analysis's evidence is attributed to. Never a fabricated "altcoin_screener" pseudo-source — see this file's header. */
  readonly sources: readonly string[];
  readonly dataLimitations: readonly string[];
}

/** The pure analyzer's single input type. `null` for a list means "this half of the screener did not run / was unavailable for this call" — distinct from `[]` ("ran, found nothing"). */
export interface AltcoinScreenerRawInput {
  readonly pumpCandidates: readonly PumpCandidate[] | null;
  readonly rugpullRisks: readonly RugpullRisk[] | null;
  /** Optional — only for the honest `marketCap`/`rank` join described in this file's header. Never fetched by this module. */
  readonly markets?: readonly CoinMarket[];
}
