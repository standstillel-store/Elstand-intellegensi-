import { StatCard } from "@/components/StatCard";
import { EquityCurveChart } from "@/components/paper-trader/EquityCurveChart";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import type { AiSignal, AiStatistics, PaperWallet } from "@/lib/elvoid/types";
import type { EquityPoint } from "@/lib/elvoid/performance";

function AllocationBar({ coin, side, pct, count }: { coin: string; side: "LONG" | "SHORT"; pct: number; count: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{coin}</span>
          <span className={side === "LONG" ? "text-up" : "text-down"}>{side}</span>
          {count > 1 && <span className="text-ink-faint">×{count}</span>}
        </span>
        <span className="mono-num text-ink-muted">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
        <div className={`h-full rounded-full ${side === "LONG" ? "bg-up" : "bg-down"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PortfolioView({
  wallet,
  stats,
  openSignals,
  equityCurve,
}: {
  wallet: PaperWallet;
  stats: AiStatistics;
  openSignals: AiSignal[];
  equityCurve: EquityPoint[];
}) {
  const totalRisk = openSignals.reduce((s, sig) => s + sig.risk_percent, 0) || 1;
  const grouped = new Map<string, { coin: string; side: "LONG" | "SHORT"; risk: number; count: number }>();
  for (const s of openSignals) {
    const key = `${s.coin}-${s.side}`;
    const prev = grouped.get(key) ?? { coin: s.coin, side: s.side, risk: 0, count: 0 };
    prev.risk += s.risk_percent;
    prev.count += 1;
    grouped.set(key, prev);
  }
  const allocation = [...grouped.values()].sort((a, b) => b.risk - a.risk);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Equity" value={formatUsd(wallet.equity)} />
        <StatCard label="Balance" value={formatUsd(wallet.balance)} />
        <StatCard
          label="Total Profit"
          value={`${wallet.total_profit >= 0 ? "+" : ""}${wallet.total_profit.toFixed(2)}%`}
          tone={wallet.total_profit >= 0 ? "up" : "down"}
        />
        <StatCard label="Open Positions" value={`${openSignals.length}`} hint={`${stats.total_trade} total trade`} />
      </div>

      <EquityCurveChart points={equityCurve} />

      <div className="glow-card p-4">
        <SectionHeader code="ALC" title="Allocation" hint="% dari total risk budget posisi terbuka" />
        {!allocation.length ? (
          <p className="py-8 text-center text-sm text-ink-muted">Tidak ada posisi terbuka saat ini.</p>
        ) : (
          <div className="space-y-3">
            {allocation.map((a) => (
              <AllocationBar key={`${a.coin}-${a.side}`} coin={a.coin} side={a.side} pct={(a.risk / totalRisk) * 100} count={a.count} />
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-ink-faint">
        Portfolio ini merefleksikan wallet paper trading ElVoid AI — belum terhubung ke exchange atau wallet on-chain nyata.
      </p>
    </div>
  );
}
