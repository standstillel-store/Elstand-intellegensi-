import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/dashboardSnapshot";
import { routeTerminalMessage } from "@/lib/analysis";
import { deriveGlobalSentiment } from "@/lib/intelligence/globalSentiment";
import { deriveMarketPulse, type MarketPulseInputs } from "@/lib/intelligence/marketPulse";
import { deriveFinalConclusion } from "@/lib/intelligence/finalConclusion";
import { buildMarketSnapshotReport } from "@/lib/intelligence/marketSnapshotReport";
import { getInstitutionalFlowData } from "@/lib/intelligence/institutionalFlow";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getStocksReading } from "@/lib/intelligence/sources/stocks";
import { getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { isRelevantAsset } from "@/lib/asset-filters";
import { getActiveProvider } from "@/lib/ai/provider";
import type { TerminalReport } from "@/lib/terminalReport";

interface ChatBody {
  message: string;
  /** Recent turns as plain text, only used when an LLM provider is active — see lib/ai/provider.ts. */
  history?: string;
}

function errorReport(message: string, eyebrow = "ERR"): TerminalReport {
  return { eyebrow, title: "SYSTEM", found: false, emptyNote: message, rows: [] };
}

// ELSTAND INTELLIGENCE's chat dock (ElVoid AI) used to proxy every question to the
// OpenAI API, which costs real money per request. It now runs entirely on
// ElVoid AI's own rule-based Intelligence Engine (lib/analysis.ts): live data
// in, a structured TerminalReport out — no LLM call, no API key, no cost,
// ever. See lib/terminalReport.ts for the response shape (V3 "institutional
// terminal" format — no more markdown/emoji strings).
export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ report: errorReport("Pesan tidak valid.") }, { status: 400 });
  }

  const message = (body.message ?? "").toString().slice(0, 500);
  if (!message.trim()) {
    return NextResponse.json({
      report: errorReport('Tanya sesuatu dulu — misalnya "analisa BTC" atau "whale activity".', "AI"),
    });
  }

  try {
    const snap = await getDashboardSnapshot();
    const { base } = snap;

    let report = routeTerminalMessage(message, base);

    if (!report) {
      const provider = getActiveProvider();
      if (provider.id !== "rule-based") {
        try {
          const text = await provider.generate({
            message,
            history: body.history?.slice(0, 4000),
            liveContext: buildLiveContextDigest(snap),
          });
          report = { eyebrow: "AI", title: "ElVoid AI", found: true, rows: [], conclusion: text };
        } catch (err) {
          console.error(`[ElVoid AI] ${provider.label} error, falling back to market snapshot:`, err);
        }
      }
    }

    if (!report) {
      report = await buildGeneralMarketReport(snap);
    }

    return NextResponse.json({ report });
  } catch (err) {
    console.error("[ElVoid AI] chat engine error:", err);
    return NextResponse.json({
      report: errorReport("Data live sedang tidak bisa diambil sebentar — coba lagi dalam beberapa detik."),
    });
  }
}

/** A short plain-text digest of live data so an LLM provider (when configured) answers grounded in real numbers instead of guessing. Deliberately compact — this is context, not the reply itself. */
function buildLiveContextDigest(snap: Awaited<ReturnType<typeof getDashboardSnapshot>>): string {
  const { markets, global, fng } = snap.base;
  const btc = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const parts: string[] = [];
  if (btc) parts.push(`BTC ${btc.current_price} USD (${btc.price_change_percentage_24h_in_currency?.toFixed(2)}% 24h)`);
  if (global?.market_cap_percentage.btc) parts.push(`BTC Dominance ${global.market_cap_percentage.btc.toFixed(1)}%`);
  if (fng?.now) parts.push(`Fear & Greed ${fng.now.value} (${fng.now.classification})`);
  return parts.join(" · ");
}

/**
 * Builds the "ringkasan market" reply. Mirrors the sentiment/pulse/final-
 * conclusion assembly in app/dashboard/page.tsx (same input fields, same
 * derive*() calls) so this chat reply can never disagree with the Map,
 * Market Pulse gauges, or Final Conclusion card shown on the dashboard
 * itself. Keep the two in sync if either one changes.
 */
async function buildGeneralMarketReport(snap: Awaited<ReturnType<typeof getDashboardSnapshot>>): Promise<TerminalReport> {
  const { base } = snap;
  const { markets, global, funding, fng, calendar } = base;

  const btcMarket = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const ethMarket = markets.find((m) => m.symbol.toLowerCase() === "eth");
  const altMarkets = markets
    .filter((m) => isRelevantAsset(m))
    .filter((m) => m.symbol.toLowerCase() !== "btc" && m.symbol.toLowerCase() !== "eth");
  const altSample = altMarkets.slice(0, 30);
  const altChange24h = altSample.length
    ? altSample.reduce((s, m) => s + (m.price_change_percentage_24h_in_currency ?? 0), 0) / altSample.length
    : undefined;
  const rankedAlts = altMarkets.filter((m) => m.price_change_percentage_24h_in_currency !== undefined);
  const watchlist = [...rankedAlts]
    .sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0))
    .slice(0, 3)
    .map((m) => ({ symbol: m.symbol.toUpperCase(), change24h: m.price_change_percentage_24h_in_currency ?? 0 }));

  const [usd, gold, stocks, institutionalFlow] = await Promise.all([
    getUsdReading(),
    getGoldReading(),
    getStocksReading(),
    getInstitutionalFlowData(),
  ]);
  const nextHighImpact = getNextHighImpactEvent(calendar);
  const stocksChangePct = stocks?.indices.length
    ? stocks.indices.reduce((s, i) => s + (i.changePct ?? 0), 0) / stocks.indices.length
    : undefined;

  const sentiment = deriveGlobalSentiment({
    fngValue: fng?.now.value,
    mcChange24h: global?.market_cap_change_percentage_24h_usd,
    dxyChangePct: usd?.changePct,
    goldChangePct: gold?.changePct,
    stocksChangePct,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    btcChange7d: btcMarket?.price_change_percentage_7d_in_currency,
    altcoinChange24h: altChange24h,
    imminentHighImpactEvent: nextHighImpact,
  });

  const btcFunding = funding.find((f) => f.symbol.toUpperCase() === "BTCUSDT");
  const pulseInputs: MarketPulseInputs = {
    sentiment,
    macro: snap.macro,
    whaleSummary: snap.whaleSummary,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    stablecoinChange24hUsd: snap.stablecoin?.change24hUsd,
    btcFundingRate: btcFunding?.lastFundingRate,
    altseason: snap.altseason,
    etfNetTotalUsd: institutionalFlow.connected ? institutionalFlow.etfNetTotalUsd : undefined,
  };
  const pulse = deriveMarketPulse(pulseInputs);
  const finalConclusion = deriveFinalConclusion({
    sentiment,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    ethChange24h: ethMarket?.price_change_percentage_24h_in_currency,
    altChange24h,
    watchlist,
  });

  return buildMarketSnapshotReport({
    pulse,
    finalConclusion,
    totalMarketCapUsd: global?.total_market_cap.usd,
    marketCapChange24h: global?.market_cap_change_percentage_24h_usd,
    btcDominance: global?.market_cap_percentage.btc,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    btcFundingRate: btcFunding?.lastFundingRate,
    btcOpenInterestUsd: btcFunding?.openInterestValue,
  });
}
