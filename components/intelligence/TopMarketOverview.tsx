"use client";
import { Bitcoin, Gem, Globe2, PieChart, Gauge, Activity } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { GlowCard } from "@/components/ui/GlowCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { formatUsd, formatPct } from "@/lib/format";
import { deriveTrend } from "@/lib/intelligence/shared";
import type { GlobalSentimentReading } from "@/lib/intelligence/globalSentiment";
import { MarketStatusBadge } from "./MarketStatusBadge";

function Card({
  icon,
  label,
  children,
  sub,
  tone = "neutral",
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  sub?: string;
  tone?: "up" | "down" | "neutral" | "amber";
  delay?: number;
}) {
  const subTone = { up: "text-up", down: "text-down", amber: "text-amber", neutral: "text-ink-faint" }[tone];
  return (
    <GlowCard delay={delay} className="p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-ink-faint">
        {icon}
        <span className="eyebrow text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mono-num text-lg font-semibold leading-tight text-ink">{children}</div>
      {sub && <p className={clsx("mt-0.5 text-[11px]", subTone)}>{sub}</p>}
    </GlowCard>
  );
}

export interface TopMarketOverviewProps {
  btc?: { price: number; change24h?: number; change7d?: number };
  eth?: { price: number; change24h?: number; change7d?: number };
  totalMarketCapUsd?: number;
  marketCapChange24h?: number;
  btcDominance?: number;
  fng?: { value: number; classification: string };
  sentiment: GlobalSentimentReading;
}

export function TopMarketOverview({
  btc,
  eth,
  totalMarketCapUsd,
  marketCapChange24h,
  btcDominance,
  fng,
  sentiment,
}: TopMarketOverviewProps) {
  const btcTrend = deriveTrend(btc?.change24h, btc?.change7d);
  const ethTrend = deriveTrend(eth?.change24h, eth?.change7d);
  const mcTone: "up" | "down" | "neutral" = marketCapChange24h === undefined ? "neutral" : marketCapChange24h >= 0 ? "up" : "down";
  const fngTone: "up" | "down" | "amber" = fng ? (fng.value >= 55 ? "up" : fng.value <= 45 ? "down" : "amber") : "amber";
  const statusReason = sentiment.reasons[0]?.text ?? sentiment.note ?? "Menunggu sinyal";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Card icon={<Bitcoin size={13} />} label="BTC Price" tone={btcTrend.tone} sub={btc ? `${btcTrend.label} · ${formatPct(btc.change24h ?? 0)}` : "—"} delay={0.02}>
        {btc ? formatUsd(btc.price) : "—"}
      </Card>

      <Card icon={<Gem size={13} />} label="ETH Price" tone={ethTrend.tone} sub={eth ? `${ethTrend.label} · ${formatPct(eth.change24h ?? 0)}` : "—"} delay={0.04}>
        {eth ? formatUsd(eth.price) : "—"}
      </Card>

      <Card icon={<Globe2 size={13} />} label="Total Crypto Market Cap" tone={mcTone} sub={marketCapChange24h !== undefined ? `${formatPct(marketCapChange24h)} 24h` : "24h"} delay={0.06}>
        {totalMarketCapUsd !== undefined ? <AnimatedNumber value={totalMarketCapUsd} format={(n) => formatUsd(n)} /> : "—"}
      </Card>

      <Card icon={<PieChart size={13} />} label="BTC Dominance" tone="neutral" sub="Market share" delay={0.08}>
        {btcDominance !== undefined ? (
          <>
            <AnimatedNumber value={btcDominance} format={(n) => n.toFixed(1)} />%
          </>
        ) : (
          "—"
        )}
      </Card>

      <Card icon={<Gauge size={13} />} label="Fear & Greed" tone={fngTone} sub={fng?.classification ?? "N/A"} delay={0.1}>
        {fng ? <AnimatedNumber value={fng.value} format={(n) => Math.round(n).toString()} /> : "—"}
      </Card>

      <GlowCard delay={0.12} className="p-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-ink-faint">
          <Activity size={13} />
          <span className="eyebrow text-[10px] uppercase tracking-wider">Market Status</span>
        </div>
        <MarketStatusBadge status={sentiment.status} />
        <p className="mt-1.5 truncate text-[11px] text-ink-faint" title={statusReason}>
          {statusReason} · {sentiment.confidence}% confidence
        </p>
      </GlowCard>
    </div>
  );
}
