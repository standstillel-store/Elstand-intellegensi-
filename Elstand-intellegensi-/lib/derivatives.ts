import type { CoinMarket, FundingInfo, WhaleTransfer } from "./types";
import { DERIVATIVES_WATCHLIST, getLongShortRatio, getOpenInterestHistory } from "./binance";
import { cached } from "./cache";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export interface DerivativesRow {
  symbol: string; // bare ticker, e.g. "BTC"
  hasData: boolean; // false => every field below is undefined, render as N/A
  fundingRate?: number;
  openInterestUsd?: number;
  openInterestChangePct?: number; // vs ~1h ago, from real openInterestHist
  longShortRatio?: number;
}

/**
 * Derivatives row per symbol. Only symbols in DERIVATIVES_WATCHLIST get real
 * funding/OI/L-S — everything else honestly reports hasData: false so the UI
 * renders N/A instead of inventing a number.
 */
export async function getDerivativesRows(funding: FundingInfo[]): Promise<Map<string, DerivativesRow>> {
  const fundingBySymbol = new Map(funding.map((f) => [f.symbol.replace("USDT", ""), f]));
  const rows = new Map<string, DerivativesRow>();

  await Promise.all(
    DERIVATIVES_WATCHLIST.map(async (pair) => {
      const symbol = pair.replace("USDT", "");
      const f = fundingBySymbol.get(symbol);
      if (!f) {
        rows.set(symbol, { symbol, hasData: false });
        return;
      }
      const [oiHist, lsRatio] = await Promise.all([
        getOpenInterestHistory(symbol, "1h", 2).catch(() => []),
        getLongShortRatio(symbol, "1h").catch(() => undefined),
      ]);
      let oiChangePct: number | undefined;
      if (oiHist.length >= 2) {
        const [prev, latest] = oiHist;
        oiChangePct = prev.openInterest > 0 ? ((latest.openInterest - prev.openInterest) / prev.openInterest) * 100 : undefined;
      }
      rows.set(symbol, {
        symbol,
        hasData: true,
        fundingRate: f.lastFundingRate,
        openInterestUsd: f.openInterestValue,
        openInterestChangePct: oiChangePct,
        longShortRatio: lsRatio,
      });
    })
  );

  return rows;
}

export interface DerivativesOverview {
  totalOpenInterestUsd: number;
  totalOpenInterestChangePct?: number;
  avgFundingRate: number;
  longShortRatio?: number; // simple average across watchlist rows that have it
  coveredSymbols: number; // how many watchlist symbols actually had data
}

/** Aggregate strip for the top of the screener — only ever built from real
 * per-symbol rows above, so it's honest about being watchlist-scoped rather
 * than exchange-wide (Binance has no free bulk OI/funding endpoint). */
export function buildDerivativesOverview(rows: Map<string, DerivativesRow>): DerivativesOverview {
  const withData = [...rows.values()].filter((r) => r.hasData);
  const totalOI = withData.reduce((sum, r) => sum + (r.openInterestUsd ?? 0), 0);
  const oiChanges = withData.map((r) => r.openInterestChangePct).filter((n): n is number => n !== undefined);
  const fundingRates = withData.map((r) => r.fundingRate).filter((n): n is number => n !== undefined);
  const lsRatios = withData.map((r) => r.longShortRatio).filter((n): n is number => n !== undefined);

  return {
    totalOpenInterestUsd: totalOI,
    totalOpenInterestChangePct: oiChanges.length ? oiChanges.reduce((a, b) => a + b, 0) / oiChanges.length : undefined,
    avgFundingRate: fundingRates.length ? fundingRates.reduce((a, b) => a + b, 0) / fundingRates.length : 0,
    longShortRatio: lsRatios.length ? lsRatios.reduce((a, b) => a + b, 0) / lsRatios.length : undefined,
    coveredSymbols: withData.length,
  };
}

export type AccumulationPhase = "A" | "B" | "C" | "D" | "E" | null;

/**
 * Rule-based accumulation phase — deliberately conservative: returns null
 * ("no clear phase") rather than guessing when the underlying signals don't
 * corroborate each other. This is a classification of *already-scored*
 * signals (turnover, whale flow, momentum, OI), not a new model.
 */
export function classifyAccumulationPhase(params: {
  turnoverRatio: number; // volume / market_cap
  whaleNetInflowUsd: number;
  change24h: number;
  change7d: number;
  oiChangePct?: number;
}): { phase: AccumulationPhase; label: string } {
  const { turnoverRatio, whaleNetInflowUsd, change24h, change7d, oiChangePct } = params;

  const compressed = Math.abs(change7d) < 5 && turnoverRatio < 0.05;
  const volumeRising = turnoverRatio > 0.15;
  const whaleAccumulating = whaleNetInflowUsd > 250_000;
  const breakout = change24h > 8 && (oiChangePct ?? 0) > 3;
  const trending = change24h > 3 && change7d > 5;

  if (breakout) return { phase: "D", label: "Momentum expansion / breakout" };
  if (trending) return { phase: "E", label: "Trend continuation" };
  if (whaleAccumulating && volumeRising) return { phase: "C", label: "Whale/smart-money accumulation" };
  if (volumeRising) return { phase: "B", label: "Volume increasing" };
  if (compressed) return { phase: "A", label: "Low activity / compression" };
  return { phase: null, label: "No clear phase" };
}

export interface IntelligenceRow {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  change24h: number;
  volume24hUsd: number;
  marketCapUsd: number;
  sparkline7d?: number[]; // real price points from CoinGecko, for mini sparklines
  derivatives: DerivativesRow;
  whaleNetFlowUsd: number;
  aiOpportunity: number;
  aiRisk: number;
  aiOpportunityReasons: string[];
  aiRiskReasons: string[];
  phase: AccumulationPhase;
  phaseLabel: string;
}

/**
 * One row per relevant coin, combining every real signal already computed
 * elsewhere in the app. `derivatives.hasData` tells the UI whether to render
 * real funding/OI/L-S or "N/A" — this function never fills that gap itself.
 */
export function buildIntelligenceRows(
  markets: CoinMarket[],
  derivativesRows: Map<string, DerivativesRow>,
  whales: WhaleTransfer[],
  pumpScoreBySymbol: Map<string, number>,
  momentumScoreBySymbol: Map<string, number>
): IntelligenceRow[] {
  const whaleNetBySymbol = new Map<string, number>();
  for (const w of whales) {
    const k = w.asset.toUpperCase();
    const delta = w.direction === "in" ? w.valueUsd : w.direction === "out" ? -w.valueUsd : 0;
    whaleNetBySymbol.set(k, (whaleNetBySymbol.get(k) ?? 0) + delta);
  }

  return markets
    .filter((m) => m.market_cap && m.market_cap > 0)
    .map((m) => {
      const symbol = m.symbol.toUpperCase();
      const derivatives = derivativesRows.get(symbol) ?? { symbol, hasData: false };
      const whaleNetFlowUsd = whaleNetBySymbol.get(symbol) ?? 0;
      const turnoverRatio = m.market_cap ? m.total_volume / m.market_cap : 0;

      const ai = computeAiScore({
        pumpScore: pumpScoreBySymbol.get(symbol),
        momentumScore: momentumScoreBySymbol.get(symbol),
        whaleNetInflowUsd: whaleNetFlowUsd,
        derivatives,
        turnoverRatio,
        marketCapUsd: m.market_cap,
      });

      const { phase, label } = classifyAccumulationPhase({
        turnoverRatio,
        whaleNetInflowUsd: whaleNetFlowUsd,
        change24h: m.price_change_percentage_24h_in_currency ?? 0,
        change7d: m.price_change_percentage_7d_in_currency ?? 0,
        oiChangePct: derivatives.openInterestChangePct,
      });

      return {
        id: m.id,
        symbol,
        name: m.name,
        image: m.image,
        price: m.current_price,
        change24h: m.price_change_percentage_24h_in_currency ?? 0,
        volume24hUsd: m.total_volume,
        marketCapUsd: m.market_cap,
        sparkline7d: m.sparkline_in_7d?.price,
        derivatives,
        whaleNetFlowUsd,
        aiOpportunity: ai.opportunity,
        aiRisk: ai.risk,
        aiOpportunityReasons: ai.opportunityReasons,
        aiRiskReasons: ai.riskReasons,
        phase,
        phaseLabel: label,
      } satisfies IntelligenceRow;
    });
}

export interface AiScore {
  opportunity: number; // 0-100
  risk: number; // 0-100
  opportunityReasons: string[];
  riskReasons: string[];
}

/**
 * Unified AI Opportunity/Risk score. Deterministic: a weighted combination
 * of signals that are each already real (pump score, momentum score, whale
 * flow, funding/OI health, rugpull-style liquidity flags). No randomness,
 * no black-box model — every point added is traceable to a reason string.
 */
export function computeAiScore(params: {
  pumpScore?: number; // from buildPumpCandidates, 0-100
  momentumScore?: number; // from buildHighMomentum, 0-100
  whaleNetInflowUsd: number;
  derivatives?: DerivativesRow;
  turnoverRatio: number;
  marketCapUsd: number;
}): AiScore {
  const { pumpScore = 0, momentumScore = 0, whaleNetInflowUsd, derivatives, turnoverRatio, marketCapUsd } = params;

  let opportunity = 0;
  const opportunityReasons: string[] = [];
  let risk = 0;
  const riskReasons: string[] = [];

  const strength = Math.max(pumpScore, momentumScore);
  if (strength > 0) {
    opportunity += strength * 0.5;
    if (strength > 40) opportunityReasons.push("Strong pump/momentum score from live price & turnover");
  }

  if (whaleNetInflowUsd > 1_000_000) {
    opportunity += 20;
    opportunityReasons.push("Large whale net inflow (>$1M)");
  } else if (whaleNetInflowUsd > 250_000) {
    opportunity += 10;
    opportunityReasons.push("Whale net inflow detected");
  }

  if (derivatives?.hasData) {
    if ((derivatives.openInterestChangePct ?? 0) > 5) {
      opportunity += 12;
      opportunityReasons.push("Open interest expanding");
    }
    if (derivatives.fundingRate !== undefined) {
      if (derivatives.fundingRate < -0.0005) {
        opportunity += 8;
        opportunityReasons.push("Negative funding — shorts paying longs");
      }
      if (derivatives.fundingRate > 0.0015) {
        risk += 15;
        riskReasons.push("Funding crowded long — squeeze/reversal risk");
      }
    }
    if (derivatives.longShortRatio !== undefined && derivatives.longShortRatio > 2.5) {
      risk += 10;
      riskReasons.push("Long positioning heavily crowded");
    }
  }

  if (marketCapUsd > 0 && marketCapUsd < 30_000_000) {
    risk += 10;
    riskReasons.push("Very low market cap — higher volatility/manipulation risk");
  }
  if (turnoverRatio > 1) {
    risk += 15;
    riskReasons.push("Volume far exceeds market cap — abnormal turnover");
  } else if (turnoverRatio < 0.01) {
    risk += 8;
    riskReasons.push("Very low liquidity turnover");
  }

  return {
    opportunity: clamp(Math.round(opportunity)),
    risk: clamp(Math.round(risk)),
    opportunityReasons: opportunityReasons.slice(0, 4),
    riskReasons: riskReasons.slice(0, 4),
  };
}
