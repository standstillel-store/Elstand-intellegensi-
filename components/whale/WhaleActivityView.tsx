"use client";
import { useState } from "react";
import { Waves, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { GlowCard } from "@/components/ui/GlowCard";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { formatUsd, timeAgo, shortAddr } from "@/lib/format";
import type { WhaleTransfer } from "@/lib/types";
import type { WhaleFlowGroup } from "@/lib/scanner-categories";

const DIR_ICON = { in: ArrowDownLeft, out: ArrowUpRight, "wallet-to-wallet": ArrowLeftRight } as const;
const DIR_TONE = { in: "text-up", out: "text-down", "wallet-to-wallet": "text-ink-faint" } as const;

type DirFilter = "all" | "in" | "out";

export function WhaleActivityView({
  transfers,
  buying,
  selling,
}: {
  transfers: WhaleTransfer[];
  buying: WhaleFlowGroup[];
  selling: WhaleFlowGroup[];
}) {
  const { open } = useTokenAnalyzer();
  const [filter, setFilter] = useState<DirFilter>("all");

  if (!transfers.length) {
    return (
      <div className="glow-card p-6 text-center text-sm text-ink-muted">
        Tidak ada transfer whale besar terdeteksi saat ini, atau ALCHEMY_API_KEY belum diset. Lihat Settings untuk status
        integrasi.
      </div>
    );
  }

  const filtered = transfers.filter((t) => filter === "all" || t.direction === filter);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlowCard tone="up" className="p-4">
          <SectionHeader code="BUY" title="Whale Buying" hint={`${buying.length} aset`} />
          <ul className="divide-y divide-line">
            {buying.slice(0, 8).map((b) => (
              <li key={b.asset}>
                <button onClick={() => open(b.asset)} className="flex w-full items-center justify-between py-2 text-sm hover:text-up">
                  <span className="font-medium">{b.asset}</span>
                  <span className="text-ink-faint">{b.count} transfer</span>
                  <span className="mono-num text-up">{formatUsd(b.totalUsd)}</span>
                </button>
              </li>
            ))}
            {!buying.length && <li className="py-4 text-center text-xs text-ink-muted">Tidak ada whale buying signifikan.</li>}
          </ul>
        </GlowCard>

        <GlowCard tone="down" className="p-4">
          <SectionHeader code="SEL" title="Whale Selling" hint={`${selling.length} aset`} />
          <ul className="divide-y divide-line">
            {selling.slice(0, 8).map((s) => (
              <li key={s.asset}>
                <button onClick={() => open(s.asset)} className="flex w-full items-center justify-between py-2 text-sm hover:text-down">
                  <span className="font-medium">{s.asset}</span>
                  <span className="text-ink-faint">{s.count} transfer</span>
                  <span className="mono-num text-down">{formatUsd(s.totalUsd)}</span>
                </button>
              </li>
            ))}
            {!selling.length && <li className="py-4 text-center text-xs text-ink-muted">Tidak ada whale selling signifikan.</li>}
          </ul>
        </GlowCard>
      </div>

      <div className="glow-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionHeader code="SMN" title="Recent Transfers" hint={`${filtered.length} transfer`} />
          <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
            {([
              ["all", "Semua"],
              ["in", "Masuk"],
              ["out", "Keluar"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={clsx("px-2.5 py-1 transition-colors", filter === key ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-line">
          {filtered.slice(0, 40).map((w) => {
            const Icon = DIR_ICON[w.direction];
            return (
              <li key={w.hash} className="flex items-center gap-3 py-2.5 text-sm">
                <Icon size={13} className={clsx("shrink-0", DIR_TONE[w.direction])} />
                <button onClick={() => open(w.asset)} className="mono-num w-16 shrink-0 text-left font-medium text-signal-glow hover:underline">
                  {w.asset}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  {shortAddr(w.from)} → {shortAddr(w.to)}
                </span>
                <span className="mono-num shrink-0 text-right">{formatUsd(w.valueUsd)}</span>
                <span className="w-14 shrink-0 text-right text-[11px] text-ink-faint">{timeAgo(w.timestamp)}</span>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="flex items-center justify-center gap-2 py-6 text-xs text-ink-muted">
              <Waves size={13} /> Tidak ada transfer yang cocok dengan filter ini.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
