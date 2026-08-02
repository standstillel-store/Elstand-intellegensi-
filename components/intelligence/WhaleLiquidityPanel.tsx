import clsx from "clsx";
import { Waves, Droplets, ArrowDownToLine, ArrowUpFromLine, TrendingUp, ArrowLeftRight } from "lucide-react";
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

// Recolored to the dashboard-wide system: Transition/caution now gold
// instead of amber-orange, Neutral now blue instead of plain ink. Scoped
// to this file only.
const TONE_STYLES: Record<DisplayTone, { text: string; bg: string; border: string }> = {
  up: { text: "text-up", bg: "bg-up/10", border: "border-up/30" },
  down: { text: "text-down", bg: "bg-down/10", border: "border-down/30" },
  amber: { text: "text-gold", bg: "bg-gold/10", border: "border-gold/30" },
  neutral: { text: "text-smartmoney-glow", bg: "bg-smartmoney/10", border: "border-smartmoney/30" },
};

// Direction icon derived from the card's own label text (buildWhaleTrackerCards
// in lib/intelligence/whaleLiquidity.ts always emits these four) — purely
// presentational, doesn't touch which cards get built or their values.
const DIRECTION_ICON: Record<string, typeof ArrowLeftRight> = {
  "Exchange Inflow": ArrowDownToLine,
  "Exchange Outflow": ArrowUpFromLine,
  "Wallet Accumulation": TrendingUp,
  "Large Transaction": ArrowLeftRight,
};

function MiniStat({ card }: { card: WhaleTrackerCard }) {
  const DirIcon = DIRECTION_ICON[card.label] ?? ArrowLeftRight;
  const style = TONE_STYLES[card.tone];
  return (
    <div
      className={clsx(
        "group rounded-lg border bg-bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
        card.sample ? "border-dashed border-line" : style.border
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", card.sample ? "bg-ink-faint/10 text-ink-faint" : clsx(style.bg, style.text))}>
            <DirIcon size={11} />
          </span>
          <p className="truncate text-[10px] uppercase tracking-wide text-ink-faint">{card.label}</p>
        </div>
        {/* Honest "confidence"/data-quality read: is this card's number real
           (buildWhaleTrackerCards) or the waiting-for-API sample fallback? */}
        <span
          className={clsx(
            "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
            card.sample ? "border-line text-ink-faint" : "border-up/30 bg-up/10 text-up"
          )}
        >
          <span className={clsx("h-1 w-1 rounded-full", card.sample ? "bg-ink-faint" : "bg-up animate-pulseGlow")} />
          {card.sample ? "Waiting" : "Live"}
        </span>
      </div>
      <p className={clsx("mono-num mt-1.5 text-base font-semibold", card.sample ? "text-ink-faint" : style.text)}>{card.value}</p>
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
    <div className="glow-card ambient-glow ambient-glow-gold p-4">
      <SectionHeader code="WHL" title="Whale & Liquidity Intelligence" hint={liquidity.symbol} icon={<Waves size={13} />} accent="gold" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-ink-faint">
            <Waves size={13} className="animate-cardFloat text-gold" />
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
            <div className="rounded-lg border border-line bg-bg-surface p-3 transition-colors hover:border-gold/30">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">Open Interest</p>
              <p className="mono-num mt-1 text-base font-semibold text-ink">{oiValue}</p>
            </div>
            <div className="rounded-lg border border-line bg-bg-surface p-3 transition-colors hover:border-gold/30">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">Funding Rate</p>
              <p className={clsx("mono-num mt-1 text-base font-semibold", TONE_STYLES[liquidity.fundingTone].text)}>{fundingValue}</p>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {liquidity.liquidationZones.map((zone) => (
              <div key={zone.label} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span
                    className={clsx(
                      "h-2.5 w-2.5 shrink-0 rounded-full border",
                      zone.tone === "up" ? "border-up/40 bg-up/40" : zone.tone === "down" ? "border-down/40 bg-down/40" : "border-line bg-ink-faint/40"
                    )}
                  />
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
