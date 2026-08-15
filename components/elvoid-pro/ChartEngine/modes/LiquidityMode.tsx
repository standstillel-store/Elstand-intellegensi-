"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatUsd } from "@/lib/format";

type Variant = "order-book-chart" | "liquidity-walls" | "liquidity-heatmap";

interface Level {
  price: number;
  qty: number;
}

export function LiquidityMode({ symbol, height, variant }: { symbol: string; height: number; variant: Variant }) {
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=${symbol}&limit=50`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setStatus("error");
          return;
        }
        setBids(data.bids ?? []);
        setAsks(data.asks ?? []);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    setStatus("loading");
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (status === "loading" && bids.length === 0) {
    return (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Memuat order book {symbol}/USDT…
      </div>
    );
  }

  if (status === "error" || (bids.length === 0 && asks.length === 0)) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Order book tidak tersedia saat ini.
      </div>
    );
  }

  const allLevels = [...bids, ...asks];
  const avgQty = allLevels.reduce((s, l) => s + l.qty, 0) / (allLevels.length || 1);
  const maxQty = Math.max(...allLevels.map((l) => l.qty), 1);
  // "Wall" = a level with size well above the book's own average — derived
  // live from the real depth snapshot, not a fixed/fabricated threshold.
  const wallThreshold = avgQty * 3;

  const levels = variant === "liquidity-walls"
    ? [...asks.filter((a) => a.qty >= wallThreshold), ...bids.filter((b) => b.qty >= wallThreshold)]
        .sort((a, b) => b.price - a.price)
    : null;

  return (
    <div style={{ height }} className="flex flex-col overflow-y-auto rounded-md border border-line bg-bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-ink-muted">
          {variant === "liquidity-walls" ? "Liquidity Walls" : variant === "liquidity-heatmap" ? "Liquidity Heatmap" : "Order Book"}
        </span>
        <span className="text-[9px] text-ink-faint">live snapshot · bukan riwayat time×price</span>
      </div>

      {variant === "liquidity-walls" ? (
        levels && levels.length > 0 ? (
          <div className="mono-num space-y-1 text-[11px]">
            {levels.map((l) => {
              const isAsk = asks.some((a) => a.price === l.price);
              return (
                <div key={`${isAsk ? "ask" : "bid"}-${l.price}`} className="flex items-center justify-between rounded bg-bg-raised px-2 py-1">
                  <span className={isAsk ? "text-down" : "text-up"}>{formatUsd(l.price)}</span>
                  <span className="text-ink">{l.qty.toFixed(3)} {symbol}</span>
                  <span className="text-[9px] text-gold">{(l.qty / avgQty).toFixed(1)}x avg</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-ink-faint">Tidak ada wall signifikan (≥3x rata-rata) saat ini.</p>
        )
      ) : (
        <div className="mono-num space-y-px text-[10px]">
          {[...asks].reverse().map((a) => (
            <div key={`ask-${a.price}`} className="relative flex justify-between rounded px-1.5 py-0.5">
              <div
                className="absolute inset-y-0 right-0 rounded"
                style={{ width: `${(a.qty / maxQty) * 100}%`, backgroundColor: `rgba(239,68,68,${0.15 + (a.qty / maxQty) * 0.55})` }}
              />
              <span className="relative text-down">{formatUsd(a.price)}</span>
              <span className="relative text-ink-muted">{a.qty.toFixed(3)}</span>
            </div>
          ))}
          <div className="my-1 border-t border-line" />
          {bids.map((b) => (
            <div key={`bid-${b.price}`} className="relative flex justify-between rounded px-1.5 py-0.5">
              <div
                className="absolute inset-y-0 right-0 rounded"
                style={{ width: `${(b.qty / maxQty) * 100}%`, backgroundColor: `rgba(34,197,94,${0.15 + (b.qty / maxQty) * 0.55})` }}
              />
              <span className="relative text-up">{formatUsd(b.price)}</span>
              <span className="relative text-ink-muted">{b.qty.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
