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
import { AISummaryCard } from "@/components/right-rail/AISummaryCard";
import { TopMarketOverview } from "@/components/intelligence/TopMarketOverview";
import { GlobalIntelligenceMap } from "@/components/intelligence/GlobalIntelligenceMap";
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
  const [snap, usd, gold, stocks, cryptoNews] = await Promise.all([
    getDashboardSnapshot(),
    getUsdReading(),
    getGoldReading(),
    getStocksReading(),
    getCryptoPanicNews(),
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

  const macroEvents = getMacroEventsView(calendar);
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
  const institutionalFlow = await getInstitutionalFlowData();

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

  return (
    <main className="min-h-screen lg:pt-14">
      <TopNav />
      <Sidebar />

      {/* Mobile header — desktop uses TopNav + Sidebar above instead */}
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <NavDrawer />
        <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tracking-tight">ELSTAND</span>
          <span className="text-[10px] font-semibold tracking-wide text-ink-faint">INTEL</span>
        </div>
      </div>

      <div className="lg:pl-60">
        <div className="mx-auto max-w-[1680px] space-y-5 px-4 py-5 lg:px-5">
          <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber">
            ElStand AI menyajikan analisis hubungan antar market berbasis data publik secara rule-based dan transparan —
            bukan model black-box, bukan sinyal beli/jual, dan bukan jaminan keuntungan. Selalu lakukan riset mandiri
            sebelum mengambil keputusan.
          </div>

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

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <GlobalIntelligenceMap
            live={{
              sentiment,
              macroEvents,
              newsItems,
              usd,
              gold,
              stocks,
              totalMarketCapUsd: global?.total_market_cap.usd,
              totalMarketCapChange24h: global?.market_cap_change_percentage_24h_usd,
              totalVolume24hUsd,
              btcDominance: global?.market_cap_percentage.btc,
              ethDominance,
              btc: btcMarket
                ? {
                    price: btcMarket.current_price,
                    change24h: btcMarket.price_change_percentage_24h_in_currency,
                    change7d: btcMarket.price_change_percentage_7d_in_currency,
                    volume24h: btcMarket.total_volume,
                  }
                : undefined,
              eth: ethMarket
                ? {
                    price: ethMarket.current_price,
                    change24h: ethMarket.price_change_percentage_24h_in_currency,
                    change7d: ethMarket.price_change_percentage_7d_in_currency,
                    volume24h: ethMarket.total_volume,
                  }
                : undefined,
              btcFundingRate: btcFunding?.lastFundingRate,
              btcOpenInterestUsd: btcFunding?.openInterestValue,
              ethFundingRate: ethFunding?.lastFundingRate,
              ethOpenInterestUsd: ethFunding?.openInterestValue,
              fngValue: fng?.now.value,
              btcWhaleNote,
              ethWhaleNote,
              altseasonIndex: snap.altseason?.index,
              altcoinTopGainer: topGainer
                ? { symbol: topGainer.symbol.toUpperCase(), change24h: topGainer.price_change_percentage_24h_in_currency ?? 0 }
                : undefined,
              altcoinTopLoser: topLoser
                ? { symbol: topLoser.symbol.toUpperCase(), change24h: topLoser.price_change_percentage_24h_in_currency ?? 0 }
                : undefined,
              sectorRotation,
            }}
          />
          <CryptoHeatmap markets={markets} rugpullRisks={rugpullRisks} smartMoneyAccumulation={snap.smartMoneyAccumulation} />
          </div>

          <WhaleLiquidityPanel
            transfers={whales}
            whaleSummary={snap.whaleSummary}
            funding={funding}
            liquiditySymbol="BTCUSDT"
            exchangeFlow={snap.exchangeFlow}
            btcPriceUsd={btcMarket?.current_price}
          />

          <InstitutionalFlowPanel smartMoney={snap.smartMoneyAccumulation} />

          <SectorRotationHeatmap rows={sectorRotation} />

          <AltcoinScannerTable rows={scannerRows} />

          <MarketPulsePanel inputs={pulseInputs} />

          <AISummaryCard report={marketSnapshotReport} />

          <AIFinalConclusion
            sentiment={sentiment}
            btcChange24h={btcMarket?.price_change_percentage_24h_in_currency}
            ethChange24h={ethMarket?.price_change_percentage_24h_in_currency}
            altChange24h={altChange24h}
            watchlist={watchlist}
          />

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Lainnya dari ElStand AI</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {QUICK_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="glow-card flex items-center gap-2 px-3 py-2.5 text-xs text-ink-muted hover:text-ink"
                >
                  <item.icon size={14} className="shrink-0 text-signal-glow" />
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
