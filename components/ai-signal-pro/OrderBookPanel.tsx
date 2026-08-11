"use client";
import { useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { SimulatedTag } from "@/components/ui/SimulatedTag";
import { formatUsd } from "@/lib/format";

// --- tiny seeded PRNG so the (still-simulated) book stays stable per symbol
// instead of reshuffling every render, without needing any new dependency. --
// NOTE: this is a straight lift of the previous IntelligenceRail order-book
// block, moved here as its own component so the desktop layout can put it
// beside the chart per the reference spec. Module 2 replaces everything
// below "simulated depth" with a real Binance depth WebSocket — the props
// (`symbol`, `referencePrice`) are already shaped for that swap.
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function OrderBookPanel({ symbol, referencePrice }: { symbol: string; referencePrice: number | null }) {
  const basePrice = referencePrice ?? 100;
  const rng = useMemo(() => mulberry32(seedFromString(symbol + basePrice)), [symbol, basePrice]);

  // Book "feels alive": re-tick every ~1.8s so sizes/spread visibly breathe,
  // without fully reshuffling the book each render.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, []);
  const tickRng = useMemo(() => mulberry32(seedFromString(`${symbol}:${tick}`)), [symbol, tick]);

  const orderBook = useMemo(() => {
    const spreadBps = (2 + rng() * 6) * (0.9 + tickRng() * 0.2);
    const spread = (basePrice * spreadBps) / 10000;
    const bids = Array.from({ length: 5 }, (_, i) => ({
      price: basePrice - spread / 2 - i * spread * (0.6 + rng() * 0.8),
      size: (0.4 + rng() * 6) * (0.85 + tickRng() * 0.3),
    }));
    const asks = Array.from({ length: 5 }, (_, i) => ({
      price: basePrice + spread / 2 + i * spread * (0.6 + rng() * 0.8),
      size: (0.4 + rng() * 6) * (0.85 + tickRng() * 0.3),
    }));
    const maxSize = Math.max(...bids.map((b) => b.size), ...asks.map((a) => a.size));
    return { bids, asks, spread, spreadBps, maxSize };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rng, tickRng, basePrice]);

  function heatOpacity(size: number, maxSize: number): number {
    return 0.08 + (size / maxSize) * 0.28;
  }

  return (
    <div className="glow-card flex h-full flex-col p-4">
      <div className="mb-1 flex items-center justify-between">
        <SectionHeader code="OB" title="Order Book" hint={`Spread ${orderBook.spreadBps.toFixed(1)} bps`} />
        <div className="flex items-center gap-1.5">
          <span className="live-dot bg-signal" />
          <SimulatedTag />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-[11px]">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-ink-faint">
            <BookOpen size={11} /> Bids
          </p>
          <div className="space-y-1">
            {orderBook.bids.map((b, i) => (
              <div key={i} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-1">
                <div
                  className="absolute inset-y-0 right-0 bg-up transition-all duration-700 ease-out"
                  style={{ width: `${(b.size / orderBook.maxSize) * 100}%`, opacity: heatOpacity(b.size, orderBook.maxSize) }}
                />
                <span className="mono-num relative text-up transition-all duration-700">{formatUsd(b.price)}</span>
                <span className="mono-num relative text-ink-muted transition-all duration-700">{b.size.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-center justify-end gap-1.5 text-ink-faint">Asks</p>
          <div className="space-y-1">
            {orderBook.asks.map((a, i) => (
              <div key={i} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-1">
                <div
                  className="absolute inset-y-0 left-0 bg-down transition-all duration-700 ease-out"
                  style={{ width: `${(a.size / orderBook.maxSize) * 100}%`, opacity: heatOpacity(a.size, orderBook.maxSize) }}
                />
                <span className="mono-num relative text-ink-muted transition-all duration-700">{a.size.toFixed(3)}</span>
                <span className="mono-num relative text-down transition-all duration-700">{formatUsd(a.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
