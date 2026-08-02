"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight, ArrowDownRight, Minus, ArrowUpDown, Bot, Landmark, Layers, Gamepad2, Box, Boxes } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import type { AltcoinScannerRow } from "@/lib/intelligence/altcoinScanner";
import type { DisplayTone } from "@/lib/intelligence/shared";

type SortKey = "aiScore" | "momentum" | "volume24hUsd" | "symbol";

// Neutral/"amber" recolored to blue/gold to match the rest of this redesign
// (Neutral = Blue, Transition/caution = Gold) — this file only feeds the
// dashboard's Altcoin Scanner card.
const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-gold",
  neutral: "text-smartmoney-glow",
};
const TONE_BADGE: Record<DisplayTone, string> = {
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
  amber: "border-gold/30 bg-gold/10 text-gold",
  neutral: "border-smartmoney/30 bg-smartmoney/10 text-smartmoney-glow",
};

// Same small icon set as Sector Rotation (duplicated locally, matching this
// codebase's existing pattern of per-file tone/icon maps rather than a
// shared lookup) — purely decorative, doesn't touch sector classification.
const SECTOR_ICON: Record<string, typeof Bot> = {
  AI: Bot,
  RWA: Landmark,
  DeFi: Layers,
  Gaming: Gamepad2,
  "Layer 1": Box,
  "Layer 2": Boxes,
};

function CoinLogo({ symbol, image }: { symbol: string; image?: string }) {
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-raised text-[9px] font-bold text-ink-faint ring-1 ring-line">
      {symbol.slice(0, 1)}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- external CoinGecko logos, next/image would need remote-pattern config (out of scope for a UI-only pass)
        <img
          src={image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

function AiScoreBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex w-[92px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-signal-dim to-signal-glow shadow-glow-signal transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="mono-num w-6 shrink-0 text-right text-[11px] font-bold text-signal-glow">{clamped}</span>
    </div>
  );
}

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
    <div className="glow-card ambient-glow ambient-glow-gold p-4">
      <SectionHeader code="SCN" title="Altcoin Scanner" hint={`${rows.length} koin`} icon={<Bot size={13} />} accent="gold" />

      <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[680px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2 text-left font-medium">Coin</th>
              <th className="px-2 py-2 text-left font-medium">Sector</th>
              <th className="px-2 py-2 text-left font-medium">Trend</th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("volume24hUsd")} className="inline-flex items-center gap-1 hover:text-gold">
                  Volume <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("momentum")} className="inline-flex items-center gap-1 hover:text-gold">
                  Momentum <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="px-2 py-2 text-left font-medium">Liquidity</th>
              <th className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort("aiScore")} className="inline-flex items-center gap-1 hover:text-gold">
                  AI Score <ArrowUpDown size={10} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((row) => {
              const TrendIcon = row.trendTone === "up" ? ArrowUpRight : row.trendTone === "down" ? ArrowDownRight : Minus;
              const SectorIcon = SECTOR_ICON[row.sector] ?? Layers;
              return (
                <tr key={row.id} className="group transition-colors duration-200 hover:bg-bg-raised">
                  <td className="border-l-2 border-transparent px-2 py-2.5 transition-colors duration-200 group-hover:border-gold/60">
                    <div className="flex items-center gap-2">
                      <CoinLogo symbol={row.symbol} image={row.image} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-ink">{row.symbol}</span>
                          {row.smartMoneyFlag && (
                            <span className="rounded border border-smartmoney/30 bg-smartmoney/10 px-1 text-[9px] uppercase text-smartmoney-glow">
                              SM
                            </span>
                          )}
                        </div>
                        <p className="mono-num text-[11px] text-ink-faint">{formatUsd(row.price)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-surface px-2 py-0.5 text-[10px] text-ink-muted">
                      <SectorIcon size={10} />
                      {row.sector}
                    </span>
                  </td>
                  <td className={clsx("px-2 py-2.5", TONE_TEXT[row.trendTone])}>
                    <span className="inline-flex items-center gap-1 font-medium">
                      <TrendIcon size={12} /> {row.trendLabel}
                    </span>
                  </td>
                  <td className="mono-num px-2 py-2.5 text-right text-ink-muted">{formatUsd(row.volume24hUsd)}</td>
                  <td className="mono-num px-2 py-2.5 text-right text-ink">{Math.round(row.momentum)}</td>
                  <td className="px-2 py-2.5">
                    <span className={clsx("rounded-md border px-2 py-0.5 text-[10px] font-medium", TONE_BADGE[row.liquidityTone])}>
                      {row.liquidity}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end">
                      <AiScoreBar value={row.aiScore} />
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
