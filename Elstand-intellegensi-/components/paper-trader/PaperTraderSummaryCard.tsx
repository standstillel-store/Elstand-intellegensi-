import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import { timeAgo } from "@/lib/format";
import type { PaperWallet, AiStatistics, JournalWithSignal } from "@/lib/elvoid/types";
import type { EquityPoint } from "@/lib/elvoid/performance";

function MiniEquitySvg({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) {
    return <div className="flex h-16 items-center justify-center text-[11px] text-ink-faint">Belum ada data equity.</div>;
  }
  const W = 320;
  const H = 64;
  const values = points.map((p) => p.equityPercent);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const xStep = W / (points.length - 1);
  const yFor = (v: number) => H - ((v - min) / range) * H;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * xStep).toFixed(1)},${yFor(p.equityPercent).toFixed(1)}`).join(" ");
  const positive = values[values.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={positive ? "#22C55E" : "#EF4444"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PaperTraderSummaryCard({
  wallet,
  stats,
  equityCurve,
  recentTrades,
}: {
  wallet: PaperWallet;
  stats: AiStatistics;
  equityCurve: EquityPoint[];
  recentTrades: JournalWithSignal[];
}) {
  return (
    <div className="glow-card p-4">
      <SectionHeader code="PPT" title="Paper Trader" hint="ElVoid AI · Supabase" />

      <MiniEquitySvg points={equityCurve} />

      <div className="mono-num mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Equity</p>
          <p className="text-sm font-semibold">{formatUsd(wallet.equity)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Win Rate</p>
          <p className="text-sm font-semibold">{stats.win_rate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Profit Factor</p>
          <p className="text-sm font-semibold">{stats.profit_factor.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-ink-faint">Max Drawdown</p>
          <p className="text-sm font-semibold text-down">{stats.max_drawdown.toFixed(2)}%</p>
        </div>
      </div>

      {recentTrades.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {recentTrades.slice(0, 4).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${t.result === "win" ? "bg-up" : t.result === "loss" ? "bg-down" : "bg-ink-faint"}`}
                />
                {t.signal?.coin ?? "?"}
              </span>
              <span className={`mono-num ${t.profit_percent >= 0 ? "text-up" : "text-down"}`}>
                {t.profit_percent >= 0 ? "+" : ""}
                {t.profit_percent.toFixed(2)}%
              </span>
              <span className="text-ink-faint">{timeAgo(t.closed_at)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/paper-trader"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink"
      >
        Buka Paper Trader lengkap <ArrowRight size={12} />
      </Link>
    </div>
  );
}
