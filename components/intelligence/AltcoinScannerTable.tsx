"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight, ArrowDownRight, Minus, ArrowUpDown } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { formatUsd } from "@/lib/format";
import type { AltcoinScannerRow } from "@/lib/intelligence/altcoinScanner";
import type { DisplayTone } from "@/lib/intelligence/shared";

type SortKey = "aiScore" | "momentum" | "volume24hUsd" | "symbol";

const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink-faint",
};

export function AltcoinScannerTable({ rows }: { rows: AltcoinScannerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("aiScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="SCN" title="Altcoin Scanner" hint={`${rows.length} koin`} />

      <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 text-left font-medium">Coin</th>
              <th className="px-2 py-2 text-left font-medium">Sector</th>
              <th className="px-2 py-2 text-left font-medium">Trend</th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("volume24hUsd")} className="inline-flex items-center gap-1 hover:text-ink">
                  Volume <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("momentum")} className="inline-flex items-center gap-1 hover:text-ink">
                  Momentum <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="px-2 py-2 text-left font-medium">Liquidity</th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("aiScore")} className="inline-flex items-center gap-1 hover:text-ink">
                  AI Score <ArrowUpDown size={10} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((row) => {
              const TrendIcon = row.trendTone === "up" ? ArrowUpRight : row.trendTone === "down" ? ArrowDownRight : Minus;
              return (
                <tr key={row.id} className="transition-colors hover:bg-bg-raised">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{row.symbol}</span>
                      {row.smartMoneyFlag && (
                        <span className="rounded border border-smartmoney/30 bg-smartmoney/10 px-1 text-[9px] uppercase text-smartmoney-glow">
                          SM
                        </span>
                      )}
                    </div>
                    <p className="mono-num text-[11px] text-ink-faint">{formatUsd(row.price)}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-muted">{row.sector}</span>
                  </td>
                  <td className={clsx("px-2 py-2.5", TONE_TEXT[row.trendTone])}>
                    <span className="inline-flex items-center gap-1">
                      <TrendIcon size={12} /> {row.trendLabel}
                    </span>
                  </td>
                  <td className="mono-num px-2 py-2.5 text-right text-ink-muted">{formatUsd(row.volume24hUsd)}</td>
                  <td className="mono-num px-2 py-2.5 text-right text-ink">{Math.round(row.momentum)}</td>
                  <td className="px-2 py-2.5">
                    <span className={clsx("text-[11px]", TONE_TEXT[row.liquidityTone])}>{row.liquidity}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end">
                      <ConfidenceMeter value={Math.round(row.aiScore)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        AI Score adalah skor komposit rule-based (momentum, likuiditas, aktivitas smart money) — bukan prediksi harga atau
        ajakan transaksi.
      </p>
    </div>
  );
}
