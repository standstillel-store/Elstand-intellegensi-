"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { isRelevantAsset } from "@/lib/asset-filters";
import { formatPct } from "@/lib/format";
import type { CoinMarket, RugpullRisk } from "@/lib/types";
import type { SmartMoneyEntry } from "@/lib/scanner-categories";

type CellCategory = "bullish" | "bearish" | "rugpull" | "smartmoney";

interface HeatCell {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  rank: number;
  category: CellCategory;
  intensity: number; // 0.25 - 1
}

const CATEGORY_RGB: Record<CellCategory, string> = {
  bullish: "34,197,94", // up green
  bearish: "239,68,68", // down red
  rugpull: "168,85,247", // rugpull purple
  smartmoney: "59,130,246", // smartmoney blue
};

function tierSpan(rank: number): { col: number; row: number } {
  if (rank <= 8) return { col: 3, row: 2 };
  if (rank <= 20) return { col: 2, row: 2 };
  if (rank <= 40) return { col: 2, row: 1 };
  return { col: 1, row: 1 };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const LEGEND: { label: string; category: CellCategory }[] = [
  { label: "Bullish", category: "bullish" },
  { label: "Bearish", category: "bearish" },
  { label: "High Rugpull Risk", category: "rugpull" },
  { label: "Smart Money Accumulation", category: "smartmoney" },
];

export function CryptoHeatmap({
  markets,
  rugpullRisks,
  smartMoneyAccumulation,
}: {
  markets: CoinMarket[];
  rugpullRisks: RugpullRisk[];
  smartMoneyAccumulation: SmartMoneyEntry[];
}) {
  const { open } = useTokenAnalyzer();
  const [count, setCount] = useState<40 | 80>(40);

  const cells = useMemo<HeatCell[]>(() => {
    const rugSet = new Map(rugpullRisks.filter((r) => r.score >= 60).map((r) => [r.symbol, r]));
    const smSet = new Set(smartMoneyAccumulation.map((s) => s.symbol));

    return markets
      .filter((m) => isRelevantAsset(m))
      .slice(0, count)
      .map((m) => {
        const symbol = m.symbol.toUpperCase();
        const change24h = m.price_change_percentage_24h_in_currency ?? 0;
        let category: CellCategory;
        let intensity: number;
        if (rugSet.has(symbol)) {
          category = "rugpull";
          intensity = 0.6;
        } else if (smSet.has(symbol)) {
          category = "smartmoney";
          intensity = 0.6;
        } else if (change24h >= 0) {
          category = "bullish";
          intensity = clamp(0.28 + Math.abs(change24h) / 14, 0.28, 1);
        } else {
          category = "bearish";
          intensity = clamp(0.28 + Math.abs(change24h) / 14, 0.28, 1);
        }
        return {
          symbol,
          name: m.name,
          price: m.current_price,
          change24h,
          rank: m.market_cap_rank ?? 999,
          category,
          intensity,
        };
      });
  }, [markets, rugpullRisks, smartMoneyAccumulation, count]);

  return (
    <div className="glow-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionHeader code="HMP" title="Crypto Heatmap" hint={`${cells.length} aset`} />
          <LiveDot tone="signal" />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            {LEGEND.map((l) => (
              <span key={l.category} className="flex items-center gap-1.5 text-[10px] text-ink-faint">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: `rgba(${CATEGORY_RGB[l.category]},0.75)` }}
                />
                {l.label}
              </span>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
            {([40, 80] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={clsx(
                  "px-2.5 py-1 transition-colors",
                  count === n ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink"
                )}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scrollbar-none max-h-[460px] overflow-y-auto pr-0.5">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: "48px", gridAutoFlow: "dense" }}
      >
        {cells.map((c, i) => {
          const span = tierSpan(c.rank);
          const showDetail = span.col >= 2;
          return (
            <motion.button
              key={c.symbol}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.008, 0.4) }}
              onClick={() => open(c.symbol)}
              style={{
                gridColumn: `span ${span.col}`,
                gridRow: `span ${span.row}`,
                background: `rgba(${CATEGORY_RGB[c.category]},${c.intensity * 0.28})`,
                border: `1px solid rgba(${CATEGORY_RGB[c.category]},${clamp(c.intensity * 0.7, 0.25, 0.85)})`,
              }}
              className="heat-cell flex flex-col justify-between overflow-hidden p-2 text-left"
              title={`${c.name} · ${formatPct(c.change24h)}`}
            >
              <span className="mono-num truncate text-[11px] font-bold text-ink">{c.symbol}</span>
              {showDetail && (
                <span
                  className={clsx(
                    "mono-num text-[11px] font-medium",
                    c.category === "bullish" ? "text-up" : c.category === "bearish" ? "text-down" : "text-ink-muted"
                  )}
                >
                  {formatPct(c.change24h)}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-faint">Klik koin untuk membuka Token Analyzer.</p>
    </div>
  );
}
