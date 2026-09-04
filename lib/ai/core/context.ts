import { getDashboardSnapshot } from "@/lib/dashboardSnapshot";
import { deriveGlobalSentiment } from "@/lib/intelligence/globalSentiment";
import { getInstitutionalFlowData } from "@/lib/intelligence/institutionalFlow";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getStocksReading } from "@/lib/intelligence/sources/stocks";
import { getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { isRelevantAsset } from "@/lib/asset-filters";
import { composeMacroContext } from "@/lib/ai/macroIntelligence/composeMacroContext";
import type { MarketIntelligenceContext } from "./types";

// ---------------------------------------------------------------------------
// Builds the compact, curated payload AI Market Intelligence (Module 5) and
// AI Narrative both reason from. Pulls the exact same live sources
// app/api/chat/route.ts's buildGeneralMarketReport() already assembles
// (getDashboardSnapshot + usd/gold/stocks readings + institutional flow +
// deriveGlobalSentiment + getNextHighImpactEvent) — all independently
// exported functions, so this file shares zero code with that route and
// touches nothing about how chat already works. Curated on purpose rather
// than dumping the full DashboardSnapshot: smaller prompts are cheaper and
// keep the model from reasoning about fields (paper wallet, open trading
// signals) that have nothing to do with a market-wide read.
// ---------------------------------------------------------------------------

export async function buildMarketIntelligenceContext(): Promise<MarketIntelligenceContext> {
  const snap = await getDashboardSnapshot();
  const { markets, global, funding, fng, calendar } = snap.base;

  const btc = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const eth = markets.find((m) => m.symbol.toLowerCase() === "eth");
  const btcFunding = funding.find((f) => f.symbol.toUpperCase() === "BTCUSDT");

  const altMarkets = markets
    .filter((m) => isRelevantAsset(m))
    .filter((m) => m.symbol.toLowerCase() !== "btc" && m.symbol.toLowerCase() !== "eth");
  const rankedAlts = altMarkets.filter((m) => m.price_change_percentage_24h_in_currency !== undefined);
  const topMovers = [...rankedAlts]
    .sort(
      (a, b) =>
        Math.abs(b.price_change_percentage_24h_in_currency ?? 0) - Math.abs(a.price_change_percentage_24h_in_currency ?? 0)
    )
    .slice(0, 5)
    .map((m) => ({ symbol: m.symbol.toUpperCase(), change24h: m.price_change_percentage_24h_in_currency ?? 0 }));
  const altChange24h = altMarkets.length
    ? altMarkets.reduce((s, m) => s + (m.price_change_percentage_24h_in_currency ?? 0), 0) / altMarkets.length
    : undefined;

  const [usd, gold, stocks, institutionalFlow] = await Promise.all([
    getUsdReading(),
    getGoldReading(),
    getStocksReading(),
    getInstitutionalFlowData(),
  ]);
  const nextHighImpact = getNextHighImpactEvent(calendar);

  // ADDITIVE (Phase G) — reuses the exact same MacroIntelligenceContext the
  // dashboard's Reading<> gets (see lib/intelligence/premium.ts), never a
  // second/duplicate macro pipeline. Wrapped so a macro-composition failure
  // (provider down, Supabase unreachable, etc.) can never break the rest of
  // ELVOID AI's context assembly — composeMacroContext() is itself designed
  // to never throw, but this try/catch is the "must never break existing
  // ELVOID AI context assembly" guarantee made explicit rather than assumed.
  let macroIntelligence: MarketIntelligenceContext["macroIntelligence"];
  try {
    macroIntelligence = await composeMacroContext({ asOf: new Date().toISOString(), calendar });
  } catch (err) {
    console.error(`[ai/core/context] macroIntelligence composition failed: ${err instanceof Error ? err.message : err}`);
    macroIntelligence = undefined;
  }
  const stocksChangePct = stocks?.indices.length
    ? stocks.indices.reduce((s, i) => s + (i.changePct ?? 0), 0) / stocks.indices.length
    : undefined;

  const sentiment = deriveGlobalSentiment({
    fngValue: fng?.now.value,
    mcChange24h: global?.market_cap_change_percentage_24h_usd,
    dxyChangePct: usd?.changePct,
    goldChangePct: gold?.changePct,
    stocksChangePct,
    btcChange24h: btc?.price_change_percentage_24h_in_currency,
    btcChange7d: btc?.price_change_percentage_7d_in_currency,
    altcoinChange24h: altChange24h,
    imminentHighImpactEvent: nextHighImpact,
  });

  const ctx: MarketIntelligenceContext = {
    btcPrice: btc?.current_price,
    btcChange24h: btc?.price_change_percentage_24h_in_currency,
    ethPrice: eth?.current_price,
    ethChange24h: eth?.price_change_percentage_24h_in_currency,
    btcDominance: global?.market_cap_percentage.btc,
    totalMarketCapUsd: global?.total_market_cap.usd,
    marketCapChange24h: global?.market_cap_change_percentage_24h_usd,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    dxyChangePct: usd?.changePct,
    goldChangePct: gold?.changePct,
    stocksChangePct,
    stablecoinChange24hUsd: snap.stablecoin?.change24hUsd,
    etfNetTotalUsd: institutionalFlow.connected ? institutionalFlow.etfNetTotalUsd : undefined,
    btcFundingRate: btcFunding?.lastFundingRate,
    btcOpenInterestUsd: btcFunding?.openInterestValue,
    altseasonScore: snap.altseason?.index,
    whaleTotalUsd: snap.whaleSummary.totalUsd,
    sentimentStatus: sentiment.status,
    sentimentConfidence: sentiment.confidence,
    nextHighImpactEvent: nextHighImpact ?? null,
    topMovers,
    macroIntelligence,
  };
  return ctx;
}
