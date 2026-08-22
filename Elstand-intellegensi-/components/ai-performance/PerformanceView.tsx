import { Trophy, TrendingDown, Coins, Target, Brain, Clock, Gauge } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import type { PerformanceReport } from "@/lib/elvoid/performance";

function formatHoldTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} menit`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} jam`;
  return `${(minutes / 1440).toFixed(1)} hari`;
}

function HighlightCard({
  icon: Icon,
  label,
  title,
  sub,
  tone,
}: {
  icon: typeof Trophy;
  label: string;
  title: string;
  sub: string;
  tone: "up" | "down" | "neutral";
}) {
  return (
    <div className="glow-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-faint">
        <Icon size={13} />
        {label}
      </div>
      <p className={`mt-1.5 text-base font-semibold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>
        {title}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
    </div>
  );
}

export function PerformanceView({ report }: { report: PerformanceReport }) {
  if (!report.strategies.length) {
    return (
      <div className="glow-card p-6 text-center text-sm text-ink-muted">
        Belum cukup trade yang ditutup untuk analisis performa. Setiap strategi/coin butuh minimal 2 trade sebelum masuk
        peringkat — jalankan beberapa paper trade dulu di <strong className="text-ink">Paper Trader</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {report.bestStrategy && (
          <HighlightCard
            icon={Trophy}
            label="Strategi Paling Profitable"
            title={report.bestStrategy.strategy}
            sub={`PF ${report.bestStrategy.profitFactor.toFixed(2)} · ${report.bestStrategy.trades} trade`}
            tone="up"
          />
        )}
        {report.worstStrategy && (
          <HighlightCard
            icon={TrendingDown}
            label="Strategi Paling Sering Gagal"
            title={report.worstStrategy.strategy}
            sub={`Win rate ${report.worstStrategy.winRate.toFixed(1)}% · ${report.worstStrategy.trades} trade`}
            tone="down"
          />
        )}
        {report.bestCoin && (
          <HighlightCard
            icon={Coins}
            label="Coin Performa Terbaik"
            title={report.bestCoin.coin}
            sub={`${report.bestCoin.totalProfit >= 0 ? "+" : ""}${report.bestCoin.totalProfit.toFixed(2)}% · ${report.bestCoin.trades} trade`}
            tone="up"
          />
        )}
        {report.worstCoin && (
          <HighlightCard
            icon={Coins}
            label="Coin Performa Terburuk"
            title={report.worstCoin.coin}
            sub={`${report.worstCoin.totalProfit >= 0 ? "+" : ""}${report.worstCoin.totalProfit.toFixed(2)}% · ${report.worstCoin.trades} trade`}
            tone="down"
          />
        )}
        {report.bestSetup && (
          <HighlightCard
            icon={Target}
            label="Setup Win Rate Tertinggi"
            title={report.bestSetup.setup}
            sub={`${report.bestSetup.winRate.toFixed(1)}% · ${report.bestSetup.trades} trade`}
            tone="up"
          />
        )}
        {report.avgHoldMinutes !== null && (
          <HighlightCard
            icon={Clock}
            label="Average Hold Time"
            title={formatHoldTime(report.avgHoldMinutes)}
            sub="Rata-rata durasi posisi terbuka"
            tone="neutral"
          />
        )}
        {report.avgConfidence !== null && (
          <HighlightCard
            icon={Gauge}
            label="Average Confidence"
            title={`${report.avgConfidence.toFixed(1)}%`}
            sub="Rata-rata confidence saat sinyal dibuka"
            tone="neutral"
          />
        )}
      </div>

      <div className="panel flex items-start gap-2.5 p-4 text-xs leading-relaxed text-ink-muted">
        <Brain size={15} className="mt-0.5 shrink-0 text-signal-glow" />
        <p>
          <strong className="text-ink">AI Learning:</strong> ElVoid AI menaikkan atau menurunkan Confidence Score
          untuk strategi yang punya riwayat minimal 5 trade tertutup, dibatasi maksimal ±8 poin — cukup untuk belajar
          dari histori, tidak cukup untuk mengklaim kepastian. Saat ini kalibrasi berjalan dari{" "}
          <strong className="text-ink">
            {report.strategies.reduce((s, x) => s + x.trades, 0)} trade tertutup
          </strong>{" "}
          di {report.strategies.length} strategi berbeda — semakin banyak trade, semakin representatif angkanya. Ini
          adalah <strong className="text-ink">probability</strong> berbasis data, bukan jaminan hasil ke depan.
        </p>
      </div>

      <div className="glow-card p-4">
        <SectionHeader code="STR" title="Strategy Performance" hint={`${report.strategies.length} strategi`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Strategi</th>
                <th className="pb-2 pr-3 font-medium">Trade</th>
                <th className="pb-2 pr-3 font-medium">Win Rate</th>
                <th className="pb-2 pr-3 font-medium">Profit Factor</th>
                <th className="pb-2 font-medium">Total Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...report.strategies]
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .map((s) => (
                  <tr key={s.strategy}>
                    <td className="py-2 pr-3">{s.strategy}</td>
                    <td className="mono-num py-2 pr-3 text-xs text-ink-muted">{s.trades}</td>
                    <td className="mono-num py-2 pr-3 text-xs">{s.winRate.toFixed(1)}%</td>
                    <td className="mono-num py-2 pr-3 text-xs">{s.profitFactor.toFixed(2)}</td>
                    <td className={`mono-num py-2 text-xs ${s.totalProfit >= 0 ? "text-up" : "text-down"}`}>
                      {s.totalProfit >= 0 ? "+" : ""}
                      {s.totalProfit.toFixed(2)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="glow-card p-4">
          <SectionHeader code="COI" title="Coin Performance" hint={`${report.coins.length} coin`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-3 font-medium">Coin</th>
                  <th className="pb-2 pr-3 font-medium">Trade</th>
                  <th className="pb-2 pr-3 font-medium">Win Rate</th>
                  <th className="pb-2 font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...report.coins]
                  .sort((a, b) => b.totalProfit - a.totalProfit)
                  .map((c) => (
                    <tr key={c.coin}>
                      <td className="py-2 pr-3 font-medium">{c.coin}</td>
                      <td className="mono-num py-2 pr-3 text-xs text-ink-muted">{c.trades}</td>
                      <td className="mono-num py-2 pr-3 text-xs">{c.winRate.toFixed(1)}%</td>
                      <td className={`mono-num py-2 text-xs ${c.totalProfit >= 0 ? "text-up" : "text-down"}`}>
                        {c.totalProfit >= 0 ? "+" : ""}
                        {c.totalProfit.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glow-card p-4">
          <SectionHeader code="SET" title="Setup Win Rate" hint={`${report.setups.length} setup`} />
          <ul className="divide-y divide-line">
            {report.setups.map((s) => (
              <li key={s.setup} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{s.setup}</span>
                <span className="mono-num shrink-0 text-xs text-ink-muted">
                  {s.winRate.toFixed(1)}% ({s.trades})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
