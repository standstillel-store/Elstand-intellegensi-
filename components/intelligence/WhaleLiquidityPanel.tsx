import clsx from "clsx";
import { Waves, Droplets } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import type { WhaleTransfer, FundingInfo } from "@/lib/types";
import type { WhaleSummary } from "@/lib/market-insights";
import type { ExchangeFlowReading } from "@/lib/intelligence/sources/cryptoquant";
import {
  buildWhaleTrackerCards,
  getSampleWhaleTrackerCards,
  buildLiquidityReading,
  getSampleLiquidityReading,
  type WhaleTrackerCard,
} from "@/lib/intelligence/whaleLiquidity";
import type { DisplayTone } from "@/lib/intelligence/shared";

const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink",
};

function MiniStat({ card }: { card: WhaleTrackerCard }) {
  return (
    <div className="rounded-lg border border-line bg-bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-ink-faint">{card.label}</p>
        {card.sample && <span className="shrink-0 rounded border border-line px-1 text-[9px] uppercase text-ink-faint">waiting</span>}
      </div>
      <p className={clsx("mono-num mt-1 text-base font-semibold", TONE_TEXT[card.tone])}>{card.value}</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">{card.hint}</p>
    </div>
  );
}

export function WhaleLiquidityPanel({
  transfers,
  whaleSummary,
  funding,
  liquiditySymbol = "BTCUSDT",
  exchangeFlow,
  btcPriceUsd,
}: {
  transfers?: WhaleTransfer[];
  whaleSummary?: WhaleSummary;
  funding?: FundingInfo[];
  liquiditySymbol?: string;
  /** Real CryptoQuant exchange flow — see lib/intelligence/sources/cryptoquant.ts. Undefined without CRYPTOQUANT_API_KEY, and the cards fall back gracefully. */
  exchangeFlow?: ExchangeFlowReading;
  /** BTC/USD spot price, used only to convert exchangeFlow's native-BTC totals to USD. */
  btcPriceUsd?: number;
}) {
  const whaleCards = transfers
    ? buildWhaleTrackerCards(transfers, whaleSummary, exchangeFlow, btcPriceUsd)
    : getSampleWhaleTrackerCards();
  const liquidity = (funding ? buildLiquidityReading(funding, liquiditySymbol) : undefined) ?? getSampleLiquidityReading();

  const fundingValue =
    liquidity.fundingRatePct !== undefined ? `${liquidity.fundingRatePct >= 0 ? "+" : ""}${liquidity.fundingRatePct.toFixed(4)}%` : "—";
  const oiValue =
    liquidity.openInterestUsd !== undefined
      ? liquidity.openInterestUsd >= 1_000_000_000
        ? `$${(liquidity.openInterestUsd / 1_000_000_000).toFixed(2)}B`
        : `$${(liquidity.openInterestUsd / 1_000_000).toFixed(1)}M`
      : "—";

  return (
    <div className="glow-card p-4">
      <SectionHeader code="WHL" title="Whale & Liquidity Intelligence" hint={liquidity.symbol} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <Waves size={13} />
            <span className="eyebrow text-[10px] uppercase tracking-wider">Whale Tracker</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {whaleCards.map((card) => (
              <MiniStat key={card.label} card={card} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <Droplets size={13} />
            <span className="eyebrow text-[10px] uppercase tracking-wider">Liquidity</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-bg-surface p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">Open Interest</p>
              <p className="mono-num mt-1 text-base font-semibold text-ink">{oiValue}</p>
            </div>
            <div className="rounded-lg border border-line bg-bg-surface p-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">Funding Rate</p>
              <p className={clsx("mono-num mt-1 text-base font-semibold", TONE_TEXT[liquidity.fundingTone])}>{fundingValue}</p>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {liquidity.liquidationZones.map((zone) => (
              <div key={zone.label} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", zone.tone === "up" ? "bg-up" : zone.tone === "down" ? "bg-down" : "bg-ink-faint")} />
                  {zone.label}
                </div>
                <span className="mono-num shrink-0 text-xs text-ink">{zone.range}</span>
              </div>
            ))}
            <p className="text-[10px] leading-relaxed text-ink-faint">
              Liquidation Zone &amp; High Liquidity Area adalah estimasi heuristik dari mark price, bukan data order book
              real-time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
