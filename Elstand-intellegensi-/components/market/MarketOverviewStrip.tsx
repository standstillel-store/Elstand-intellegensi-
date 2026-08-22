"use client";
import {
  Gauge,
  Bitcoin,
  TrendingUp,
  Globe2,
  CalendarClock,
  Coins,
  DollarSign,
  Landmark,
} from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { GlowCard } from "@/components/ui/GlowCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { formatUsd, formatPct } from "@/lib/format";
import type { AltseasonReading, MacroReading } from "@/lib/market-insights";
import type { StablecoinReading } from "@/lib/stablecoins";
import type { DxyReading, M2Reading } from "@/lib/macro";

function OverviewCard({
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
      <div className="text-lg font-semibold leading-tight text-ink">{children}</div>
      {sub && <p className={clsx("mt-0.5 text-[11px]", subTone)}>{sub}</p>}
    </GlowCard>
  );
}

export function MarketOverviewStrip({
  fng,
  btcDominance,
  altseason,
  totalMarketCapUsd,
  marketCapChange24h,
  macro,
  stablecoin,
  dxy,
  m2,
}: {
  fng?: { value: number; classification: string };
  btcDominance?: number;
  altseason?: AltseasonReading;
  totalMarketCapUsd?: number;
  marketCapChange24h?: number;
  macro: MacroReading;
  stablecoin?: StablecoinReading;
  dxy?: DxyReading;
  m2?: M2Reading;
}) {
  const fngTone = fng ? (fng.value >= 55 ? "up" : fng.value <= 45 ? "down" : "amber") : "neutral";
  const macroTone = macro.level === "alert" ? "down" : macro.level === "watch" ? "amber" : "up";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <OverviewCard icon={<Gauge size={13} />} label="Fear & Greed" tone={fngTone} sub={fng?.classification ?? "N/A"} delay={0.02}>
        {fng ? <AnimatedNumber value={fng.value} format={(n) => Math.round(n).toString()} /> : "—"}
      </OverviewCard>

      <OverviewCard
        icon={<Bitcoin size={13} />}
        label="BTC Dominance"
        tone="neutral"
        sub={btcDominance !== undefined ? "Market share" : "N/A"}
        delay={0.04}
      >
        {btcDominance !== undefined ? (
          <>
            <AnimatedNumber value={btcDominance} format={(n) => n.toFixed(1)} />%
          </>
        ) : (
          "—"
        )}
      </OverviewCard>

      <OverviewCard
        icon={<TrendingUp size={13} />}
        label="Altseason Index"
        tone={altseason ? (altseason.index >= 75 ? "up" : altseason.index <= 25 ? "down" : "neutral") : "neutral"}
        sub={altseason?.label ?? "N/A"}
        delay={0.06}
      >
        {altseason ? <AnimatedNumber value={altseason.index} format={(n) => Math.round(n).toString()} /> : "—"}
      </OverviewCard>

      <OverviewCard
        icon={<Globe2 size={13} />}
        label="Total Market Cap"
        tone={marketCapChange24h !== undefined ? (marketCapChange24h >= 0 ? "up" : "down") : "neutral"}
        sub={marketCapChange24h !== undefined ? formatPct(marketCapChange24h) : "24h"}
        delay={0.08}
      >
        {totalMarketCapUsd !== undefined ? formatUsd(totalMarketCapUsd) : "—"}
      </OverviewCard>

      <OverviewCard icon={<CalendarClock size={13} />} label="Macro Event" tone={macroTone} sub={macro.nextEvent?.title ?? "—"} delay={0.1}>
        <span className="text-sm">{macro.label}</span>
      </OverviewCard>

      <OverviewCard
        icon={<Coins size={13} />}
        label="Stablecoin Supply"
        tone={stablecoin?.change24hUsd !== undefined ? (stablecoin.change24hUsd >= 0 ? "up" : "down") : "neutral"}
        sub={stablecoin?.change24hUsd !== undefined ? `${stablecoin.change24hUsd >= 0 ? "+" : ""}${formatUsd(stablecoin.change24hUsd)} 24h` : "DefiLlama"}
        delay={0.12}
      >
        {stablecoin ? formatUsd(stablecoin.totalUsd) : "—"}
      </OverviewCard>

      <OverviewCard
        icon={<DollarSign size={13} />}
        label="DXY (Broad USD Index)"
        tone={dxy?.changePct !== undefined ? (dxy.changePct >= 0 ? "down" : "up") : "neutral"}
        sub={dxy ? `FRED · ${dxy.asOf}` : "Perlu FRED_API_KEY"}
        delay={0.14}
      >
        {dxy ? <AnimatedNumber value={dxy.value} format={(n) => n.toFixed(2)} /> : "—"}
      </OverviewCard>

      <OverviewCard
        icon={<Landmark size={13} />}
        label="M2 Money Supply"
        tone={m2?.changePct !== undefined ? (m2.changePct >= 0 ? "up" : "down") : "neutral"}
        sub={m2 ? `FRED · ${m2.asOf}` : "Perlu FRED_API_KEY"}
        delay={0.16}
      >
        {m2 ? formatUsd(m2.valueUsd * 1_000_000_000) : "—"}
      </OverviewCard>
    </div>
  );
}
