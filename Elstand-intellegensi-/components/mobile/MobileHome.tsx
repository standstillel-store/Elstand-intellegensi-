import { NavDrawer } from "./NavDrawer";
import { AskNocturnBar } from "./AskNocturnBar";
import { MarketHealthSection } from "./MarketHealthSection";
import { SmartMoneySection } from "./SmartMoneySection";
import { AiSignalSection } from "./AiSignalSection";
import { MarketIntelSection } from "./MarketIntelSection";
import { TokenAnalyzerSection } from "./TokenAnalyzerSection";
import { Footer } from "@/components/Footer";
import { PaperTraderTeaser } from "@/components/paper-trader/PaperTraderTeaser";
import type { AltseasonReading, MacroReading, WhaleSummary } from "@/lib/market-insights";
import type { PaperWallet, AiStatistics } from "@/lib/elvoid/types";
import type {
  CoinMarket,
  EconomicEvent,
  FearGreedPoint,
  NewsItem,
  PumpCandidate,
  RugpullRisk,
  WhaleTransfer,
} from "@/lib/types";

export function MobileHome({
  tagline,
  fng,
  btcDominance,
  altseason,
  totalMcUsd,
  mcChange24h,
  macro,
  whaleSummary,
  whales,
  pumpCandidates,
  topDecliners,
  rugpullRisks,
  volumeAnomalies,
  news,
  calendar,
  paperWallet,
  paperStats,
  newSignalCount,
}: {
  tagline: string;
  fng?: { now: FearGreedPoint; yesterday?: FearGreedPoint };
  btcDominance?: number;
  altseason?: AltseasonReading;
  totalMcUsd?: number;
  mcChange24h?: number;
  macro: MacroReading;
  whaleSummary: WhaleSummary;
  whales: WhaleTransfer[];
  pumpCandidates: PumpCandidate[];
  topDecliners: CoinMarket[];
  rugpullRisks: RugpullRisk[];
  volumeAnomalies: RugpullRisk[];
  news: NewsItem[];
  calendar: EconomicEvent[];
  paperWallet: PaperWallet;
  paperStats: AiStatistics;
  newSignalCount: number;
}) {
  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <NavDrawer />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">Elstand Intelligence</p>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulseGlow" />
              <span className="text-base font-bold tracking-tight">ELSTAND</span>
            </div>
          </div>
        </div>
        <p className="truncate px-4 pb-2 text-[11px] italic text-ink-muted">&ldquo;{tagline}&rdquo;</p>
        <AskNocturnBar />
      </header>

      <div className="space-y-2.5 px-4 pt-3">
        <PaperTraderTeaser wallet={paperWallet} stats={paperStats} newSignalCount={newSignalCount} />
        <MarketHealthSection
          fng={fng}
          btcDominance={btcDominance}
          altseason={altseason}
          totalMcUsd={totalMcUsd}
          mcChange24h={mcChange24h}
          macro={macro}
        />
        <SmartMoneySection whaleSummary={whaleSummary} whales={whales} />
        <AiSignalSection
          pumpCandidates={pumpCandidates}
          topDecliners={topDecliners}
          rugpullRisks={rugpullRisks}
          volumeAnomalies={volumeAnomalies}
        />
        <MarketIntelSection news={news} calendar={calendar} />
        <TokenAnalyzerSection />

        <p className="rounded-lg border border-amber/30 bg-amber/5 px-3.5 py-3 text-[11px] leading-relaxed text-amber">
          ElVoid AI menyajikan sinyal berbasis data publik. Bukan nasihat keuangan — semua skor adalah bahan
          pertimbangan, bukan jaminan. Selalu verifikasi mandiri sebelum bertransaksi.
        </p>
      </div>

      <Footer />
    </div>
  );
}
