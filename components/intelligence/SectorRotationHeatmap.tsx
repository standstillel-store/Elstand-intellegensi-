"use client";
import { useState } from "react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd } from "@/lib/format";
import type { SectorRotationRow } from "@/lib/intelligence/sectorRotation";
import type { TrendTone } from "@/lib/intelligence/shared";

const TONE_RGB: Record<TrendTone, string> = {
  up: "34,197,94",
  down: "239,68,68",
  neutral: "138,143,152",
};

function clampIntensity(momentum: number) {
  return Math.min(0.75, Math.max(0.15, 0.15 + (Math.abs(momentum - 50) / 50) * 0.6));
}

export function SectorRotationHeatmap({ rows }: { rows: SectorRotationRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.momentum - a.momentum);

  return (
    <div className="glow-card p-4">
      <SectionHeader code="ROT" title="Sector Rotation" hint="24h momentum" />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {sorted.map((row) => {
          const rgb = TONE_RGB[row.trendTone];
          const intensity = clampIntensity(row.momentum);
          const isActive = active === row.sector;
          return (
            <button
              key={row.sector}
              type="button"
              onClick={() => setActive(isActive ? null : row.sector)}
              className="heat-cell border border-line p-3 text-left"
              style={{ backgroundColor: `rgba(${rgb},${intensity})` }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink">{row.sector}</p>
              <p className="mt-1.5 text-[11px] text-ink/80">{row.trendLabel}</p>
              <p className="mono-num mt-2 text-xl font-bold text-ink">{Math.round(row.momentum)}</p>
              <p className="mt-1 text-[10px] text-ink/70">{row.coinCount ? formatUsd(row.volume24hUsd) : "—"}</p>
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

      <div className="mt-3 flex items-center gap-4 text-[10px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(34,197,94,0.6)" }} /> Uptrend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(138,143,152,0.6)" }} /> Sideways
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(239,68,68,0.6)" }} /> Downtrend
        </span>
        <span className="ml-auto">Momentum: rule-based, bukan prediksi</span>
      </div>
    </div>
  );
}
