import { SectionHeader } from "@/components/SectionHeader";
import type { MonthlyPoint } from "@/lib/elvoid/performance";

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
}

export function MonthlyPerformanceChart({ months }: { months: MonthlyPoint[] }) {
  if (!months.length) {
    return (
      <div className="glow-card p-4">
        <SectionHeader code="MTH" title="Monthly Performance" />
        <p className="py-8 text-center text-sm text-ink-muted">Belum ada trade yang ditutup bulan ini.</p>
      </div>
    );
  }

  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.profitPercent)));

  return (
    <div className="glow-card p-4">
      <SectionHeader code="MTH" title="Monthly Performance" hint="% profit per bulan" />
      <div className="flex items-end gap-3 overflow-x-auto pb-1 pt-4">
        {months.map((m) => {
          const heightPct = Math.max(4, (Math.abs(m.profitPercent) / maxAbs) * 100);
          const positive = m.profitPercent >= 0;
          return (
            <div key={m.month} className="flex w-12 shrink-0 flex-col items-center gap-1.5">
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className={`w-6 rounded-t-sm ${positive ? "bg-up" : "bg-down"}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${m.profitPercent >= 0 ? "+" : ""}${m.profitPercent.toFixed(2)}% (${m.trades} trade)`}
                />
              </div>
              <span className={`mono-num text-[10px] ${positive ? "text-up" : "text-down"}`}>
                {m.profitPercent >= 0 ? "+" : ""}
                {m.profitPercent.toFixed(1)}%
              </span>
              <span className="text-[10px] text-ink-faint">{monthLabel(m.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
