"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { FootprintLadder } from "@/lib/elvoid/footprint";
import { formatUsd } from "@/lib/format";

type Variant = "footprint" | "delta" | "imbalance";

export function FootprintMode({ symbol, height, variant = "footprint" }: { symbol: string; height: number; variant?: Variant }) {
  const [ladder, setLadder] = useState<FootprintLadder | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/footprint?symbol=${symbol}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error || !data.ladder) {
          setStatus("error");
          return;
        }
        setLadder(data.ladder);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    setStatus("loading");
    load();
    const id = setInterval(load, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (status === "loading" && !ladder) {
    return (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Membaca trade tape {symbol}/USDT…
      </div>
    );
  }

  if (status === "error" || !ladder || ladder.cells.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Footprint tidak tersedia saat ini.
      </div>
    );
  }

  const maxCellVol = Math.max(...ladder.cells.map((c) => c.buyVolume + c.sellVolume), 1);
  const maxAbsDelta = Math.max(...ladder.cells.map((c) => Math.abs(c.delta)), 1);
  const title = variant === "delta" ? "Delta" : variant === "imbalance" ? "Imbalance" : "Footprint";

  return (
    <div style={{ height }} className="flex flex-col rounded-md border border-line bg-bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-ink-muted">{title} · Bid/Ask (real trades)</span>
        <span className="mono-num text-ink-faint">
          Buy <span className="text-up">{ladder.totalBuy.toFixed(2)}</span> · Sell <span className="text-down">{ladder.totalSell.toFixed(2)}</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-px overflow-hidden font-mono text-[10px]">
        {ladder.cells.map((cell, i) => {
          const isPoc = ladder.poc && cell.priceLow === ladder.poc.priceLow;
          const totalVol = cell.buyVolume + cell.sellVolume;

          if (variant === "delta") {
            const widthPct = (Math.abs(cell.delta) / maxAbsDelta) * 100;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right text-ink-faint">{formatUsd((cell.priceLow + cell.priceHigh) / 2)}</span>
                <div className="relative h-2 flex-1 rounded-sm bg-bg-raised">
                  <div
                    className={clsx("absolute inset-y-0 rounded-sm", cell.delta >= 0 ? "left-1/2 bg-up/70" : "right-1/2 bg-down/70")}
                    style={{ width: `${widthPct / 2}%` }}
                  />
                </div>
                <span className={clsx("w-14 shrink-0", cell.delta >= 0 ? "text-up" : "text-down")}>
                  {cell.delta >= 0 ? "+" : ""}
                  {cell.delta.toFixed(3)}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={clsx("flex items-center gap-1.5 rounded-sm px-1", isPoc && "bg-signal/10", cell.imbalance && variant === "imbalance" && "bg-gold/10")}
            >
              <span className="w-16 shrink-0 text-right text-ink-faint">{formatUsd((cell.priceLow + cell.priceHigh) / 2)}</span>
              <span className="w-12 shrink-0 text-right text-down">{cell.sellVolume > 0 ? cell.sellVolume.toFixed(3) : "—"}</span>
              <div className="relative h-2 flex-1 rounded-sm bg-bg-raised">
                <div className="absolute inset-y-0 left-0 rounded-sm bg-down/50" style={{ width: `${(cell.sellVolume / maxCellVol) * 100}%` }} />
                <div className="absolute inset-y-0 right-0 rounded-sm bg-up/50" style={{ width: `${(cell.buyVolume / maxCellVol) * 100}%` }} />
              </div>
              <span className="w-12 shrink-0 text-up">{cell.buyVolume > 0 ? cell.buyVolume.toFixed(3) : "—"}</span>
              {variant === "imbalance" && cell.imbalance && <span className="shrink-0 text-[8px] font-bold text-gold">▲</span>}
              {totalVol === 0 && <span className="w-3" />}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[9px] text-ink-faint">
        {ladder.cells.length} level harga · dari trade agregasi (aggTrades) real-time, refresh 6s
      </p>
    </div>
  );
}
