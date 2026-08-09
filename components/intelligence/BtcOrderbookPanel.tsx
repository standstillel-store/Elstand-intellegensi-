"use client";

import { useEffect, useMemo, useState } from "react";
import { LiveDot } from "@/components/ui/LiveDot";
import { SectionHeader } from "@/components/SectionHeader";
import { Layers } from "lucide-react";
import type { OrderBookSnapshot } from "@/lib/types";

// Binance's own /depth response is cached server-side for 10s (see
// lib/binance.ts getOrderBookDepth) — polling faster than that just
// re-fetches the same cached snapshot. POLL_MS sits comfortably under
// that TTL so a fresh snapshot is picked up almost as soon as it's
// available, without hammering the route. The "feels like 1s" motion
// Zhwan asked for comes from CSS `transition` on every bar/path below:
// each poll's new widths/paths animate smoothly from the previous frame
// instead of snapping, so the book always reads as continuously alive
// even though the underlying data only actually changes every ~10s.
const POLL_MS = 4_000;
const DEPTH_ROWS = 11;

function fmtPrice(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function fmtQty(n: number) {
  return n.toFixed(5);
}

/** Builds a cumulative staircase path (SVG) from best price outward — same
 *  shape as the reference: a step chart that fills as depth accumulates,
 *  not a bar-per-level chart. viewBox is 0..100 wide, 0..100 tall; both
 *  sides share this one function and are mirrored via CSS `scale-x-[-1]`
 *  on the asks half instead of duplicating the path math. */
function buildStaircasePath(cumulative: number[], maxCumulative: number): string {
  if (!cumulative.length) return "";
  const n = cumulative.length;
  const stepH = 100 / n;
  let d = `M 100 0`;
  cumulative.forEach((c, i) => {
    const x = 100 - (c / maxCumulative) * 100;
    const yTop = i * stepH;
    const yBottom = (i + 1) * stepH;
    d += ` L ${x} ${yTop} L ${x} ${yBottom}`;
  });
  d += ` L 100 100 Z`;
  return d;
}

function DepthChart({
  asksTopDown,
  bids,
  maxCum,
  mid,
  flash,
  className = "",
}: {
  asksTopDown: { cum: number }[];
  bids: { cum: number }[];
  maxCum: number;
  mid: number;
  flash: boolean;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-bg ${className}`}>
      <div className="grid h-full grid-cols-2">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full scale-x-[-1]">
          <path
            d={buildStaircasePath(asksTopDown.map((a) => a.cum).reverse(), maxCum)}
            fill="rgba(255,82,82,0.16)"
            stroke="#FF5252"
            strokeWidth={0.6}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <path
            d={buildStaircasePath(bids.map((b) => b.cum), maxCum)}
            fill="rgba(0,230,118,0.16)"
            stroke="#00E676"
            strokeWidth={0.6}
            className="transition-all duration-700 ease-out"
          />
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
      <div
        className={`pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 rounded bg-bg-raised px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
          flash ? "text-gold" : "text-ink"
        }`}
      >
        <span className="mono-num">{fmtPrice(mid)}</span>
      </div>
    </div>
  );
}

export function BtcOrderbookPanel({ initial }: { initial: OrderBookSnapshot | undefined }) {
  const [book, setBook] = useState(initial);
  const [stale, setStale] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!initial) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=BTC&limit=20`);
        if (!res.ok) throw new Error("request failed");
        const next = (await res.json()) as OrderBookSnapshot;
        setBook(next);
        setStale(false);
        setFlash(true);
        setTimeout(() => setFlash(false), 260);
      } catch {
        setStale(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [initial]);

  const derived = useMemo(() => {
    if (!book || !book.bids.length || !book.asks.length) return undefined;

    const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, DEPTH_ROWS);
    const asks = [...book.asks].sort((a, b) => a.price - b.price).slice(0, DEPTH_ROWS);

    let running = 0;
    const bidCum = bids.map((l) => (running += l.qty));
    running = 0;
    const askCum = asks.map((l) => (running += l.qty));

    const maxCum = Math.max(bidCum[bidCum.length - 1] ?? 0, askCum[askCum.length - 1] ?? 0, 0.0001);

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const mid = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;

    const bidVol = book.bids.reduce((s, l) => s + l.qty, 0);
    const askVol = book.asks.reduce((s, l) => s + l.qty, 0);
    const imbalancePct = (bidVol / (bidVol + askVol)) * 100;

    return {
      bids: bids.map((l, i) => ({ ...l, cum: bidCum[i] })),
      asks: asks.map((l, i) => ({ ...l, cum: askCum[i] })),
      maxCum,
      mid,
      spread,
      spreadPct,
      imbalancePct,
      bidVol,
      askVol,
    };
  }, [book]);

  if (!derived) {
    return (
      <div className="rounded-xl border border-line bg-bg-raised p-4">
        <div className="flex items-center gap-2.5">
          <LiveDot tone="up" />
          <SectionHeader code="BOOK" title="BTC Order Book" hint="Binance Futures" icon={<Layers size={13} />} accent="up" />
        </div>
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          DATA UNAVAILABLE — order book Binance tidak terjangkau
        </div>
      </div>
    );
  }

  const { bids, asks, maxCum, mid, spread, spreadPct, imbalancePct, bidVol, askVol } = derived;
  // Reversed so the row nearest the spread sits at the bottom of the ask
  // half and the top of the bid half — mirrors the reference layout where
  // both books read "outward" from the price in the middle.
  const asksTopDown = [...asks].reverse();

  const indicators = [
    { label: "Mid Price", value: fmtPrice(mid), tone: "text-ink" },
    { label: "Spread", value: `${spread.toFixed(1)} (${spreadPct.toFixed(4)}%)`, tone: "text-ink-muted" },
    { label: "Bid Volume", value: fmtQty(bidVol), tone: "text-up" },
    { label: "Ask Volume", value: fmtQty(askVol), tone: "text-down" },
  ];

  return (
    <div className="rounded-xl border border-line bg-bg-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <LiveDot tone={stale ? "amber" : "up"} />
          <SectionHeader code="BOOK" title="BTC Order Book" hint="Binance Futures · depth 20" icon={<Layers size={13} />} accent="up" />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span className="mono-num text-up">{imbalancePct.toFixed(0)}%</span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-down/25">
            <div
              className="h-full bg-up transition-[width] duration-700 ease-out"
              style={{ width: `${imbalancePct}%` }}
            />
          </div>
          <span className="mono-num text-down">{(100 - imbalancePct).toFixed(0)}%</span>
        </div>
      </div>

      {/* Mobile/tablet (<1024px): stacked — chart on top, price ladder
          below, same as before. Desktop/laptop (lg: 1024px+): three
          columns side by side — Indicators | Harga (price ladder) |
          Order Book (depth chart) — per Zhwan's sketch, making use of the
          extra horizontal room instead of stacking everything vertically. */}
      <div className="lg:hidden">
        <DepthChart asksTopDown={asksTopDown} bids={bids} maxCum={maxCum} mid={mid} flash={flash} className="h-32 sm:h-36" />

        <div className="mt-2.5 grid grid-cols-2 gap-x-2 text-[10.5px]">
          <div className="space-y-px">
            {asksTopDown.map((lvl) => {
              const pct = Math.max(6, (lvl.qty / (maxCum / DEPTH_ROWS)) * 18);
              return (
                <div key={`ask-m-${lvl.price}`} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-[2.5px]">
                  <div
                    className="absolute inset-y-0 right-0 bg-down/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="mono-num relative z-10 text-down">{fmtPrice(lvl.price)}</span>
                  <span className="mono-num relative z-10 text-ink-faint">{fmtQty(lvl.qty)}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-px">
            {bids.map((lvl) => {
              const pct = Math.max(6, (lvl.qty / (maxCum / DEPTH_ROWS)) * 18);
              return (
                <div key={`bid-m-${lvl.price}`} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-[2.5px]">
                  <div
                    className="absolute inset-y-0 left-0 bg-up/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="mono-num relative z-10 text-up">{fmtPrice(lvl.price)}</span>
                  <span className="mono-num relative z-10 text-ink-faint">{fmtQty(lvl.qty)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.4fr)] lg:gap-3">
        {/* Column 1 — Indicators */}
        <div className="flex flex-col gap-2">
          {indicators.map((ind) => (
            <div key={ind.label} className="rounded-lg border border-line bg-bg px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wide text-ink-faint">{ind.label}</div>
              <div className={`mono-num text-[12px] font-semibold ${ind.tone}`}>{ind.value}</div>
            </div>
          ))}
        </div>

        {/* Column 2 — Harga (price ladder) */}
        <div className="grid grid-cols-2 gap-x-2 text-[10.5px]">
          <div className="space-y-px">
            {asksTopDown.map((lvl) => {
              const pct = Math.max(6, (lvl.qty / (maxCum / DEPTH_ROWS)) * 18);
              return (
                <div key={`ask-d-${lvl.price}`} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-[2.5px]">
                  <div
                    className="absolute inset-y-0 right-0 bg-down/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="mono-num relative z-10 text-down">{fmtPrice(lvl.price)}</span>
                  <span className="mono-num relative z-10 text-ink-faint">{fmtQty(lvl.qty)}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-px">
            {bids.map((lvl) => {
              const pct = Math.max(6, (lvl.qty / (maxCum / DEPTH_ROWS)) * 18);
              return (
                <div key={`bid-d-${lvl.price}`} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-[2.5px]">
                  <div
                    className="absolute inset-y-0 left-0 bg-up/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="mono-num relative z-10 text-up">{fmtPrice(lvl.price)}</span>
                  <span className="mono-num relative z-10 text-ink-faint">{fmtQty(lvl.qty)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3 — Order Book (depth chart) */}
        <DepthChart asksTopDown={asksTopDown} bids={bids} maxCum={maxCum} mid={mid} flash={flash} className="h-full min-h-[220px]" />
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-bg py-1.5 text-[10px] text-ink-faint">
        Spread <span className="mono-num text-ink">{spread.toFixed(1)}</span>
        <span className="text-ink-faint/60">·</span>
        <span className="mono-num text-ink-muted">{spreadPct.toFixed(4)}%</span>
      </div>
    </div>
  );
}

