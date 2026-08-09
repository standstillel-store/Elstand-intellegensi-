import Link from "next/link";
import type { Metadata } from "next";
import { Radar, Wallet, ScanSearch, Waves, Newspaper } from "lucide-react";
import { getDashboardSnapshot } from "@/lib/dashboardSnapshot";
import { isRelevantAsset } from "@/lib/asset-filters";
import { TopNav } from "@/components/layout/TopNav";
import { Sidebar } from "@/components/Sidebar";
import { Footer } from "@/components/Footer";
import { NavDrawer } from "@/components/mobile/NavDrawer";
import { AIChatDock } from "@/components/AIChatDock";
import { AmbientBackground } from "@/components/dashboard/AmbientBackground";
import { MacroIntelligence, type MacroImpactRow } from "@/components/dashboard/MacroIntelligence";
import { AiEnergyWidget } from "@/components/dashboard/AiEnergyWidget";
import { SystemStatusStrip } from "@/components/dashboard/SystemStatusStrip";
import { AISummaryCard } from "@/components/right-rail/AISummaryCard";
import { TopMarketOverview } from "@/components/intelligence/TopMarketOverview";
import { RsiHeatmap } from "@/components/intelligence/RsiHeatmap";
import { getRsiHeatmapData } from "@/lib/intelligence/rsiHeatmap";
import { BtcOrderbookPanel } from "@/components/intelligence/BtcOrderbookPanel";
import { BtcFundingPanel } from "@/components/intelligence/BtcFundingPanel";
import { getBtcMicrostructure } from "@/lib/intelligence/btcMicrostructure";
import { CryptoHeatmap } from "@/components/heatmap/CryptoHeatmap";
import { WhaleLiquidityPanel } from "@/components/intelligence/WhaleLiquidityPanel";
import { InstitutionalFlowPanel } from "@/components/intelligence/InstitutionalFlowPanel";
import { MarketPulsePanel } from "@/components/intelligence/MarketPulsePanel";
import { AIFinalConclusion } from "@/components/intelligence/AIFinalConclusion";
import { getInstitutionalFlowData } from "@/lib/intelligence/institutionalFlow";
import { SectorRotationHeatmap } from "@/components/intelligence/SectorRotationHeatmap";
import { AltcoinScannerTable } from "@/components/intelligence/AltcoinScannerTable";
import { computeSectorRotation, getSampleSectorRotation } from "@/lib/intelligence/sectorRotation";
import { buildAltcoinScannerRows, getSampleAltcoinScannerRows } from "@/lib/intelligence/altcoinScanner";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getStocksReading } from "@/lib/intelligence/sources/stocks";
import { getEurReading, getGbpReading, getJpyReading, getCnyReading } from "@/lib/intelligence/sources/forex";
import { getCryptoPanicNews } from "@/lib/intelligence/sources/cryptoNews";
import { getMacroEventsView, getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { deriveGlobalSentiment } from "@/lib/intelligence/globalSentiment";
import { deriveAssetWhaleNote } from "@/lib/intelligence/whaleLiquidity";
import { deriveMarketPulse, type MarketPulseInputs } from "@/lib/intelligence/marketPulse";
import { deriveFinalConclusion } from "@/lib/intelligence/finalConclusion";
import { buildMarketSnapshotReport } from "@/lib/intelligence/marketSnapshotReport";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "ElStand AI Market Intelligence: Global Intelligence Map real-time, whale & liquidity, institutional flow, sector rotation, dan AI summary dalam satu dashboard.",
  robots: { index: false, follow: false },
};

// Fastest node TTL in the map is 30s (see lib/intelligence/sources/*) — this
// keeps the page itself from serving a stale ISR snapshot for longer than
// that, so each source's own cached() TTL actually gets a chance to expire.
export const revalidate = 30;

const QUICK_LINKS = [
  { href: "/ai-signal", label: "AI Signal", icon: Radar },
  { href: "/paper-trader", label: "Paper Trader", icon: Wallet },
  { href: "/scanner", label: "Token Scanner", icon: ScanSearch },
  { href: "/whale", label: "Whale Activity", icon: Waves },
  { href: "/news", label: "News", icon: Newspaper },
];

export default async function Home() {
  const [snap, usd, gold, stocks, cryptoNews, eur, gbp, jpy, cny] = await Promise.all([
    getDashboardSnapshot(),
    getUsdReading(),
    getGoldReading(),
    getStocksReading(),
    getCryptoPanicNews(),
    getEurReading(),
    getGbpReading(),
    getJpyReading(),
    getCnyReading(),
  ]);
  const { base } = snap;
  const { markets, global, funding, whales, fng, news, calendar, rugpullRisks } = base;

  const btcMarket = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const ethMarket = markets.find((m) => m.symbol.toLowerCase() === "eth");

  const altMarkets = markets
    .filter((m) => isRelevantAsset(m))
    .filter((m) => m.symbol.toLowerCase() !== "btc" && m.symbol.toLowerCase() !== "eth");
  const altSample = altMarkets.slice(0, 30);
  const altChange24h = altSample.length
    ? altSample.reduce((s, m) => s + (m.price_change_percentage_24h_in_currency ?? 0), 0) / altSample.length
    : undefined;
  const altcoinMarketCapUsd =
    global?.total_market_cap.usd !== undefined
      ? Math.max(0, global.total_market_cap.usd - (btcMarket?.market_cap ?? 0) - (ethMarket?.market_cap ?? 0))
      : undefined;

  const rankedAlts = altMarkets.filter((m) => m.price_change_percentage_24h_in_currency !== undefined);
  const topGainer = rankedAlts.length
    ? [...rankedAlts].sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0))[0]
    : undefined;
  const topLoser = rankedAlts.length
    ? [...rankedAlts].sort((a, b) => (a.price_change_percentage_24h_in_currency ?? 0) - (b.price_change_percentage_24h_in_currency ?? 0))[0]
    : undefined;
  const watchlist = [...rankedAlts]
    .sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0))
    .slice(0, 3)
    .map((m) => ({ symbol: m.symbol.toUpperCase(), change24h: m.price_change_percentage_24h_in_currency ?? 0 }));

  // Derived for real from data already on hand — not in CoinGecko's /global
  // response by default, but both are simple, honest sums/ratios over `markets`.
  const totalVolume24hUsd = markets.length ? markets.reduce((s, m) => s + (m.total_volume ?? 0), 0) : undefined;
  const ethDominance =
    global?.total_market_cap.usd && ethMarket?.market_cap ? (ethMarket.market_cap / global.total_market_cap.usd) * 100 : undefined;

  const sectorRotation = markets.length ? computeSectorRotation(markets) : getSampleSectorRotation();
  const scannerRows = markets.length ? buildAltcoinScannerRows(markets, snap.smartMoneyAccumulation) : getSampleAltcoinScannerRows();

  const macroEvents = getMacroEventsView(calendar, 24);
  const nextHighImpact = getNextHighImpactEvent(calendar);
  const newsItems = cryptoNews ?? news;

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
  const ethFunding = funding.find((f) => f.symbol.toUpperCase() === "ETHUSDT");
  const btcWhaleNote = deriveAssetWhaleNote(whales, ["BTC"]);
  const ethWhaleNote = deriveAssetWhaleNote(whales, ["ETH", "WETH"]);
  const [institutionalFlow, rsiHeatmap, btcMicrostructure] = await Promise.all([
    getInstitutionalFlowData(),
    getRsiHeatmapData(markets),
    getBtcMicrostructure(btcFunding, btcMarket?.current_price),
  ]);

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
  const pulseMetrics = deriveMarketPulse(pulseInputs);
  const finalConclusion = deriveFinalConclusion({
    sentiment,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    ethChange24h: ethMarket?.price_change_percentage_24h_in_currency,
    altChange24h,
    watchlist,
  });
  // AI Summary card — same underlying numbers as Market Pulse + Final
  // Conclusion below, reshaped into the V3 "Market Snapshot" terminal
  // format (lib/intelligence/marketSnapshotReport.ts). Not a re-derivation.
  const marketSnapshotReport = buildMarketSnapshotReport({
    pulse: pulseMetrics,
    finalConclusion,
    totalMarketCapUsd: global?.total_market_cap.usd,
    marketCapChange24h: global?.market_cap_change_percentage_24h_usd,
    btcDominance: global?.market_cap_percentage.btc,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    btcFundingRate: btcFunding?.lastFundingRate,
    btcOpenInterestUsd: btcFunding?.openInterestValue,
  });

  // Honest connectivity count for the status ribbon — derived from which
  // optional macro/intelligence sources actually resolved, not fabricated.
  // Core sources (Binance markets, funding, whales, F&G) gate the whole
  // page render, so they're not counted here — only the supplementary ones
  // that can genuinely be null when a key isn't configured.
  const macroSources = [usd, gold, stocks, eur, gbp, jpy, cny];
  const connectedSources = macroSources.filter(Boolean).length + (institutionalFlow.connected ? 1 : 0);
  const totalSources = macroSources.length + 1;

  // Market Impact rows for Macro Intelligence — only built from readings
  // that actually resolved this request (usd/gold/stocks/btc/eth). No
  // fabricated "affected assets" list.
  const marketImpact: MacroImpactRow[] = [];
  if (usd?.changePct !== undefined) {
    const assets: { label: string; direction: "up" | "down" }[] = [
      { label: "DXY", direction: usd.changePct >= 0 ? "up" : "down" },
    ];
    if (gold?.changePct !== undefined) assets.push({ label: "Gold", direction: gold.changePct >= 0 ? "up" : "down" });
    if (btcMarket?.price_change_percentage_24h_in_currency !== undefined)
      assets.push({ label: "BTC", direction: btcMarket.price_change_percentage_24h_in_currency >= 0 ? "up" : "down" });
    marketImpact.push({ trigger: "USD Strength", assets });
  }
  if (stocks?.indices.length) {
    const assets: { label: string; direction: "up" | "down" }[] = [
      { label: "Stocks", direction: stocksChangePct !== undefined && stocksChangePct >= 0 ? "up" : "down" },
    ];
    if (btcMarket?.price_change_percentage_24h_in_currency !== undefined)
      assets.push({ label: "BTC", direction: btcMarket.price_change_percentage_24h_in_currency >= 0 ? "up" : "down" });
    if (altChange24h !== undefined) assets.push({ label: "Altcoins", direction: altChange24h >= 0 ? "up" : "down" });
    marketImpact.push({ trigger: "Risk Assets (Stocks)", assets });
  }
  if (fng) {
    const assets: { label: string; direction: "up" | "down" }[] = [
      { label: "Sentiment", direction: fng.now.value >= 50 ? "up" : "down" },
    ];
    if (ethMarket?.price_change_percentage_24h_in_currency !== undefined)
      assets.push({ label: "ETH", direction: ethMarket.price_change_percentage_24h_in_currency >= 0 ? "up" : "down" });
    marketImpact.push({ trigger: "Fear & Greed", assets });
  }

  return (
    <main className="min-h-screen lg:pt-14">
      <AmbientBackground />
      <TopNav />
      <Sidebar />

      {/* Mobile header — desktop uses TopNav + Sidebar above instead */}
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <NavDrawer />
        <span className="h-2 w-2 rounded-full bg-gold animate-pulseGlow" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tracking-tight">ELSTAND</span>
          <span className="text-[10px] font-semibold tracking-wide text-ink-faint">INTEL</span>
        </div>
      </div>

      <div className="lg:pl-60">
        <div className="relative mx-auto max-w-[1680px] space-y-4 px-4 py-5 lg:space-y-5 lg:px-5">
          <div className="flex justify-end">
            <AiEnergyWidget />
          </div>

          <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber">
            ElStand AI menyajikan analisis hubungan antar market berbasis data publik secara rule-based dan transparan —
            bukan model black-box, bukan sinyal beli/jual, dan bukan jaminan keuntungan. Selalu lakukan riset mandiri
            sebelum mengambil keputusan.
          </div>

          {/* Terminal grid: dashboard panels as a 12-column workstation grid instead of a vertical card stack */}
          <div className="grid grid-cols-12 gap-4 lg:gap-5">
            <div className="col-span-12">
              <SystemStatusStrip connectedSources={connectedSources} totalSources={totalSources} />
            </div>

            <div className="col-span-12">
              <TopMarketOverview
            btc={
              btcMarket
                ? {
                    price: btcMarket.current_price,
                    change24h: btcMarket.price_change_percentage_24h_in_currency,
                    change7d: btcMarket.price_change_percentage_7d_in_currency,
                  }
                : undefined
            }
            eth={
              ethMarket
                ? {
                    price: ethMarket.current_price,
                    change24h: ethMarket.price_change_percentage_24h_in_currency,
                    change7d: ethMarket.price_change_percentage_7d_in_currency,
                  }
                : undefined
            }
            totalMarketCapUsd={global?.total_market_cap.usd}
            marketCapChange24h={global?.market_cap_change_percentage_24h_usd}
            btcDominance={global?.market_cap_percentage.btc}
            fng={fng ? { value: fng.now.value, classification: fng.now.classification } : undefined}
            sentiment={sentiment}
              />
            </div>

            {/* Hero: market-wide RSI condition, real klines + real RSI-14 — see lib/intelligence/rsiHeatmap.ts */}
            <div className="col-span-12">
              <RsiHeatmap data={rsiHeatmap} />
            </div>

            {/* Old standalone News + Economic Calendar surfaces (formerly the
                "News/Macro" nodes inside GlobalIntelligenceMap and
                GlobalIntelligenceTimeline) are replaced by the connected
                Macro Intelligence layer below: EVENT -> NEWS -> SENTIMENT ->
                MARKET IMPACT -> INSIGHT, in one module. */}
            <div className="col-span-12">
              <MacroIntelligence
                macroEvents={macroEvents}
                newsItems={newsItems}
                sentiment={sentiment}
                nextHighImpact={nextHighImpact}
                marketImpact={marketImpact}
              />
            </div>

            <div className="col-span-12">
              <CryptoHeatmap markets={markets} rugpullRisks={rugpullRisks} smartMoneyAccumulation={snap.smartMoneyAccumulation} />
            </div>

            {/* Order flow: BTC-only for now — see lib/intelligence/btcMicrostructure.ts.
                col-span-7/-5 mirrors on mobile too now (was col-span-12 stacked)
                so Order Book sits beside Funding & OI like the laptop layout. */}
            <div className="col-span-7 lg:col-span-7">
              <BtcOrderbookPanel initial={btcMicrostructure.orderbook} />
            </div>
            <div className="col-span-5 lg:col-span-5">
              <BtcFundingPanel data={btcMicrostructure} />
            </div>

            <div className="col-span-6 lg:col-span-6">
              <WhaleLiquidityPanel
            transfers={whales}
            whaleSummary={snap.whaleSummary}
            funding={funding}
            liquiditySymbol="BTCUSDT"
            exchangeFlow={snap.exchangeFlow}
            btcPriceUsd={btcMarket?.current_price}
              />
            </div>

            <div className="col-span-6 lg:col-span-6">
              <InstitutionalFlowPanel smartMoney={snap.smartMoneyAccumulation} />
            </div>

            <div className="col-span-12">
              <SectorRotationHeatmap rows={sectorRotation} />
            </div>

            <div className="col-span-12">
              <AltcoinScannerTable rows={scannerRows} />
            </div>

            <div className="col-span-12">
              <MarketPulsePanel inputs={pulseInputs} />
            </div>

            <div className="col-span-6 lg:col-span-6">
              <AISummaryCard report={marketSnapshotReport} />
            </div>

            <div className="col-span-6 lg:col-span-6">
              <AIFinalConclusion
                sentiment={sentiment}
                btcChange24h={btcMarket?.price_change_percentage_24h_in_currency}
                ethChange24h={ethMarket?.price_change_percentage_24h_in_currency}
                altChange24h={altChange24h}
                watchlist={watchlist}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Lainnya dari ElStand AI</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {QUICK_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="glow-card glow-card-gold flex items-center gap-2 px-3 py-2.5 text-xs text-ink-muted hover:text-ink"
                >
                  <item.icon size={14} className="shrink-0 text-gold" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <Footer />
      </div>

      <AIChatDock />
    </main>
  );
}
