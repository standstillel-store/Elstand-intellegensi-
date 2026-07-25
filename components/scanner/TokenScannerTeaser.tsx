"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { formatUsd, formatPct } from "@/lib/format";
import type { PumpCandidate, RugpullRisk } from "@/lib/types";
import type { MomentumCandidate, SmartMoneyEntry, WhaleFlowGroup } from "@/lib/scanner-categories";

interface TeaserData {
  pump: PumpCandidate[];
  dump: MomentumCandidate[];
  rugpull: RugpullRisk[];
  smartMoney: SmartMoneyEntry[];
  momentum: MomentumCandidate[];
  whaleBuying: WhaleFlowGroup[];
  whaleSelling: WhaleFlowGroup[];
}

const TABS = [
  { key: "pump", label: "Top Pump" },
  { key: "dump", label: "Top Dump" },
  { key: "rugpull", label: "Rugpull Risk" },
  { key: "smartMoney", label: "Smart Money" },
  { key: "momentum", label: "High Momentum" },
  { key: "whaleBuying", label: "Whale Buying" },
  { key: "whaleSelling", label: "Whale Selling" },
] as const;

export function TokenScannerTeaser({ data }: { data: TeaserData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pump");
  const { open } = useTokenAnalyzer();

  return (
    <div className="glow-card p-4">
      <SectionHeader code="SCN" title="Token Scanner" hint="7 kategori" />

      <div className="scrollbar-none mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              tab === t.key ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-faint hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5">
        {tab === "pump" &&
          data.pump.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.symbol)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.symbol}</span>
                <span className="text-ink-muted">{formatUsd(c.price)}</span>
                <span className="text-up">Score {c.score}</span>
              </button>
            </li>
          ))}
        {tab === "dump" &&
          data.dump.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.symbol)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.symbol}</span>
                <span className="text-ink-muted">{formatUsd(c.price)}</span>
                <span className="text-down">Score {c.score}</span>
              </button>
            </li>
          ))}
        {tab === "rugpull" &&
          data.rugpull.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.symbol)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.symbol}</span>
                <span className="text-ink-muted">Liq {formatUsd(c.liquidityUsd)}</span>
                <span className="text-rugpull-glow">Risk {c.score}</span>
              </button>
            </li>
          ))}
        {tab === "smartMoney" &&
          data.smartMoney.slice(0, 3).map((c) => (
            <li key={c.symbol}>
              <button onClick={() => open(c.symbol)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.symbol}</span>
                <span className="text-ink-muted">{c.txCount} tx</span>
                <span className="text-smartmoney-glow">+{formatUsd(c.netInflowUsd)}</span>
              </button>
            </li>
          ))}
        {tab === "momentum" &&
          data.momentum.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.symbol)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.symbol}</span>
                <span className="text-ink-muted">{formatUsd(c.price)}</span>
                <span className="text-signal-glow">{formatPct(c.change24h)}</span>
              </button>
            </li>
          ))}
        {tab === "whaleBuying" &&
          data.whaleBuying.slice(0, 3).map((c) => (
            <li key={c.asset}>
              <button onClick={() => open(c.asset)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.asset}</span>
                <span className="text-ink-muted">{c.count} transfer</span>
                <span className="text-up">{formatUsd(c.totalUsd)}</span>
              </button>
            </li>
          ))}
        {tab === "whaleSelling" &&
          data.whaleSelling.slice(0, 3).map((c) => (
            <li key={c.asset}>
              <button onClick={() => open(c.asset)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-bg-raised">
                <span className="font-medium">{c.asset}</span>
                <span className="text-ink-muted">{c.count} transfer</span>
                <span className="text-down">{formatUsd(c.totalUsd)}</span>
              </button>
            </li>
          ))}
      </ul>

      <Link
        href="/scanner"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink"
      >
        Buka Token Scanner lengkap <ArrowRight size={12} />
      </Link>
    </div>
  );
}
