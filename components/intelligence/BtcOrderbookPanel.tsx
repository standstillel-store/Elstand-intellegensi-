"use client";

import { useEffect, useState } from "react";
import type { OrderBookSnapshot } from "@/lib/types";

const POLL_MS = 12_000;
const DEPTH_ROWS = 10;

function SectionHeader({ stale }: { stale?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`live-dot ${stale ? "bg-amber" : "bg-up"}`} />
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink">BTC Order Book</h2>
      <span className="text-[10px] text-ink-faint">Binance Futures · depth 20</span>
    </div>
  );
}

function Row({ price, qty, maxQty, side }: { price: number; qty: number; maxQty: number; side: "bid" | "ask" }) {
  const pct = Math.max(4, (qty / maxQty) * 100);
  return (
    <div className="relative flex items-center justify-between overflow-hidden rounded px-2 py-[3px] text-[11px]">
      <div
        className={`absolute inset-y-0 ${side === "bid" ? "left-0 bg-up/15" : "right-0 bg-down/15"}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`mono-num relative z-10 ${side === "bid" ? "text-up" : "text-down"}`}>
        {price.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </span>
      <span className="mono-num relative z-10 text-ink-muted">{qty.toFixed(3)}</span>
    </div>
  );
}

export function BtcOrderbookPanel({ initial }: { initial: OrderBookSnapshot | undefined }) {
  const [book, setBook] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!initial) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=BTC&limit=20`);
        if (!res.ok) throw new Error("request failed");
        setBook(await res.json());
        setStale(false);
      } catch {
        setStale(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [initial]);

  if (!book || !book.bids.length || !book.asks.length) {
    return (
      <div className="glow-card ambient-glow ambient-glow-gold p-4">
        <SectionHeader />
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          DATA UNAVAILABLE — order book Binance tidak terjangkau
        </div>
      </div>
    );
  }

  const bids = book.bids.slice(0, DEPTH_ROWS);
  const asks = book.asks.slice(0, DEPTH_ROWS).slice().reverse();
  const maxQty = Math.max(...bids.map((b) => b.qty), ...asks.map((a) => a.qty), 0.0001);
  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const spread = bestAsk - bestBid;
  const spreadPct = (spread / bestAsk) * 100;
  const bidVol = book.bids.reduce((s, l) => s + l.qty, 0);
  const askVol = book.asks.reduce((s, l) => s + l.qty, 0);
  const imbalancePct = (bidVol / (bidVol + askVol)) * 100;

  return (
    <div className="glow-card ambient-glow ambient-glow-gold overflow-hidden p-4">
      <SectionHeader stale={stale} />

      <div className="mt-3 space-y-0.5">
        {asks.map((lvl) => (
          <Row key={`ask-${lvl.price}`} price={lvl.price} qty={lvl.qty} maxQty={maxQty} side="ask" />
        ))}
        <div className="my-1 flex items-center justify-between rounded bg-bg-raised px-2 py-1.5">
          <span className="mono-num text-sm font-bold text-ink">
            {bestAsk.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
          <span className="text-[10px] text-ink-faint">
            spread <span className="mono-num text-ink-muted">{spread.toFixed(1)}</span> ({spreadPct.toFixed(3)}%)
          </span>
        </div>
        {bids.map((lvl) => (
          <Row key={`bid-${lvl.price}`} price={lvl.price} qty={lvl.qty} maxQty={maxQty} side="bid" />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-down/20">
          <div className="h-full bg-up" style={{ width: `${imbalancePct}%` }} />
        </div>
        <span className="text-[10px] text-ink-faint">
          bid <span className="mono-num text-up">{imbalancePct.toFixed(0)}%</span> / ask{" "}
          <span className="mono-num text-down">{(100 - imbalancePct).toFixed(0)}%</span>
        </span>
      </div>
    </div>
  );
}
