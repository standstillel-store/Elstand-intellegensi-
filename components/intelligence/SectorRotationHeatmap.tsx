"use client";
import { useState } from "react";
import clsx from "clsx";
import { Bot, Landmark, Layers, Gamepad2, Box, Boxes, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Sparkline } from "./ui/Sparkline";
import { formatUsd } from "@/lib/format";
import type { SectorRotationRow } from "@/lib/intelligence/sectorRotation";
import type { TrendTone } from "@/lib/intelligence/shared";

// Recolored to the dashboard's brand hex; "neutral" now reads as blue
// ("Neutral = Blue") instead of grey, matching the rest of this redesign.
const TONE_RGB: Record<TrendTone, string> = {
  up: "0,230,118",
  down: "255,82,82",
  neutral: "59,130,246",
};
const TONE_TEXT: Record<TrendTone, string> = {
  up: "text-up",
  down: "text-down",
  neutral: "text-smartmoney-glow",
};
const TONE_ICON_WRAP: Record<TrendTone, string> = {
  up: "bg-up/15 text-up",
  down: "bg-down/15 text-down",
  neutral: "bg-smartmoney/15 text-smartmoney-glow",
};
const TONE_ARROW = { up: ArrowUpRight, down: ArrowDownRight, neutral: Minus } as const;

// One icon per sector taxonomy value (lib/intelligence/sectorRotation.ts) —
// purely decorative, doesn't touch how sectors are classified.
const SECTOR_ICON: Record<string, typeof Bot> = {
  AI: Bot,
  RWA: Landmark,
  DeFi: Layers,
  Gaming: Gamepad2,
  "Layer 1": Box,
  "Layer 2": Boxes,
};

function clampIntensity(momentum: number) {
  return Math.min(0.75, Math.max(0.15, 0.15 + (Math.abs(momentum - 50) / 50) * 0.6));
}

/**
 * Approximate 24h % move, derived from the already-computed momentum score
 * (display-only — mirrors, but doesn't replace, the momentum formula in
 * lib/intelligence/sectorRotation.ts: momentum = clamp(50 + avgChange24h * 3.5)).
 * Sector rows don't carry a raw % or a real history series, so the "mini
 * sparkline" below plots a two-point line from the neutral baseline (50)
 * to the live momentum reading — an honest read of the one real number we
 * have, not fabricated history (see this repo's stance on dummy data).
 */
function approxChangePct(momentum: number) {
  return (momentum - 50) / 3.5;
}

export function SectorRotationHeatmap({ rows }: { rows: SectorRotationRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.momentum - a.momentum);

  return (
    <div className="glow-card ambient-glow ambient-glow-gold p-4">
      <SectionHeader code="ROT" title="Sector Rotation" hint="24h momentum" icon={<Layers size={13} />} accent="gold" />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {sorted.map((row) => {
          const rgb = TONE_RGB[row.trendTone];
          const intensity = clampIntensity(row.momentum);
          const isActive = active === row.sector;
          const pct = approxChangePct(row.momentum);
          const Icon = SECTOR_ICON[row.sector] ?? Layers;
          const Arrow = TONE_ARROW[row.trendTone];
          return (
            <button
              key={row.sector}
              type="button"
              onClick={() => setActive(isActive ? null : row.sector)}
              className={clsx(
                "heat-cell relative overflow-hidden rounded-lg border p-3 text-left transition-all duration-200",
                isActive ? "border-gold/50 shadow-glow-gold" : "border-line hover:border-gold/30"
              )}
              style={{ backgroundColor: `rgba(${rgb},${intensity})` }}
            >
              <div className="flex items-center gap-1.5">
                <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", TONE_ICON_WRAP[row.trendTone])}>
                  <Icon size={13} />
                </span>
                <p className="truncate text-[11px] font-bold uppercase tracking-wide text-ink">{row.sector}</p>
              </div>

              <div className="mt-2.5 flex items-baseline gap-1">
                <Arrow size={13} className={clsx("shrink-0", TONE_TEXT[row.trendTone])} />
                <span className={clsx("mono-num text-lg font-bold leading-none", TONE_TEXT[row.trendTone])}>
                  {pct >= 0 ? "+" : ""}
                  {pct.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-ink-faint">
                {row.trendLabel} · momentum {Math.round(row.momentum)}
              </p>

              <div className="mt-2">
                <Sparkline series={[50, row.momentum]} tone={row.trendTone} height={22} />
              </div>

              <p className="mt-1.5 truncate text-[10px] text-ink/70">{row.coinCount ? formatUsd(row.volume24hUsd) : "—"}</p>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="mt-3 rounded-lg border border-line bg-bg-raised px-3 py-2.5 text-xs text-ink-muted">
          {(() => {
            const row = rows.find((r) => r.sector === active);
            if (!row) return null;
            return (
              <p>
                <span className="font-medium text-ink">{row.sector}</span> — {row.trendLabel}, momentum {Math.round(row.momentum)}
                /100, volume 24h {formatUsd(row.volume24hUsd)}
                {row.coinCount ? ` dari ${row.coinCount} koin terpantau` : ""}.
                {row.sample && " (menunggu API)"}
              </p>
            );
          })()}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-ink-faint sm:gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(0,230,118,0.6)" }} /> Uptrend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(59,130,246,0.6)" }} /> Sideways
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(255,82,82,0.6)" }} /> Downtrend
        </span>
        <span className="sm:ml-auto">Momentum: rule-based, bukan prediksi</span>
      </div>
    </div>
  );
}
