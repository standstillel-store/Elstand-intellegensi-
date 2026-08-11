"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatUsd } from "@/lib/format";
import type { OrderBookSnapshot } from "@/lib/types";

// ---------------------------------------------------------------------------
// REAL market depth from Binance Futures, via the existing public
// /api/orderbook-depth route (lib/binance.ts getOrderBookDepth) — the same
// endpoint BtcOrderbookPanel already uses, just with the symbol now driven
// by whatever asset is selected on this page instead of hardcoded to BTC.
//
// This polls the endpoint every POLL_MS. The endpoint itself caches
// Binance's response for 10s server-side, so this is real exchange depth
// on a short delay — not a raw diff-depth WebSocket. That's a deliberate
// simplification: Binance's WS depth stream requires maintaining a local
// order-book state machine (snapshot + buffered diffs + resync-on-gap)
// which is real additional work. If sub-second depth updates matter more
// than implementation cost, that upgrade can follow as its own module —
// flagging that trade-off explicitly rather than presenting this as the
// full websocket architecture from the spec.
// ---------------------------------------------------------------------------

const POLL_MS = 3_000;
const ROWS = 5;
const STALE_AFTER_MS = 15_000;

type ConnState = "live" | "reconnecting" | "disconnected";

export function OrderBookPanel({ symbol }: { symbol: string; referencePrice?: number | null }) {
  const [book, setBook] = useState<OrderBookSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnState>("reconnecting");
  const [failCount, setFailCount] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setLastUpdated(null);
    setStatus("reconnecting");
    setFailCount(0);

    async function poll() {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=${encodeURIComponent(symbol)}&limit=${ROWS}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as OrderBookSnapshot & { error?: string };
        if (cancelled) return;
        if (data.error || !data.bids?.length || !data.asks?.length) {
          setFailCount((f) => f + 1);
          return;
        }
        setBook(data);
        setLastUpdated(Date.now());
        setStatus("live");
        setFailCount(0);
      } catch {
        if (!cancelled) setFailCount((f) => f + 1);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      controllerRef.current?.abort();
    };
  }, [symbol]);

  // Derive connection status from freshness + consecutive failures, so a
  // transient hiccup shows "reconnecting" while a sustained outage (or no
  // data ever received) shows "disconnected" — never silently keeps
  // showing "LIVE" on stale data.
  useEffect(() => {
    const id = setInterval(() => {
      if (!lastUpdated) {
        setStatus(failCount >= 2 ? "disconnected" : "reconnecting");
        return;
      }
      const age = Date.now() - lastUpdated;
      if (age > STALE_AFTER_MS && failCount >= 2) setStatus("disconnected");
      else if (age > STALE_AFTER_MS) setStatus("reconnecting");
      else setStatus("live");
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated, failCount]);

  if (!book) {
    return (
      <div className="glow-card flex h-full flex-col p-4">
        <SectionHeader code="OB" title="Order Book" hint={`${symbol}USDT`} />
        <div className="flex h-40 flex-1 items-center justify-center rounded-md border border-dashed border-line text-center text-[11px] text-ink-faint">
          {failCount >= 2 ? "DISCONNECTED — Binance Futures depth tidak terjangkau" : "Menyambungkan…"}
        </div>
      </div>
    );
  }

  const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, ROWS);
  const asks = [...book.asks].sort((a, b) => a.price - b.price).slice(0, ROWS);
  let running = 0;
  const bidsWithCum = bids.map((l) => ({ ...l, cum: (running += l.qty) }));
  running = 0;
  const asksWithCum = asks.map((l) => ({ ...l, cum: (running += l.qty) }));
  const maxCum = Math.max(bidsWithCum.at(-1)?.cum ?? 0, asksWithCum.at(-1)?.cum ?? 0, 1e-9);

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const spreadPct = (spread / bestAsk) * 100;

  const bidVol = bids.reduce((s, l) => s + l.qty, 0);
  const askVol = asks.reduce((s, l) => s + l.qty, 0);
  const bidPct = (bidVol / (bidVol + askVol || 1)) * 100;

  const STATUS_LABEL: Record<ConnState, string> = { live: "LIVE", reconnecting: "RECONNECTING", disconnected: "DISCONNECTED" };
  const STATUS_TONE: Record<ConnState, "up" | "amber" | "down"> = { live: "up", reconnecting: "amber", disconnected: "down" };

  return (
    <div className="glow-card flex h-full flex-col p-4">
      <div className="mb-1 flex items-center justify-between">
        <SectionHeader code="OB" title="Order Book (Live)" hint={`Spread ${spreadPct.toFixed(3)}%`} />
        <div className="flex items-center gap-1.5">
          <LiveDot tone={STATUS_TONE[status]} />
          <span className={`text-[10px] font-medium uppercase tracking-wide ${status === "live" ? "text-up" : status === "reconnecting" ? "text-amber" : "text-down"}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-[11px]">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-ink-faint">
            <BookOpen size={11} /> Bids
          </p>
          <div className="space-y-1">
            {bidsWithCum.map((b) => (
              <div key={b.price} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-1">
                <div
                  className="absolute inset-y-0 right-0 bg-up transition-all duration-500 ease-out"
                  style={{ width: `${(b.cum / maxCum) * 100}%`, opacity: 0.1 + (b.qty / maxCum) * 0.35 }}
                />
                <span className="mono-num relative text-up">{formatUsd(b.price)}</span>
                <span className="mono-num relative text-ink-muted">{b.qty.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-center justify-end gap-1.5 text-ink-faint">Asks</p>
          <div className="space-y-1">
            {asksWithCum.map((a) => (
              <div key={a.price} className="relative flex items-center justify-between overflow-hidden rounded px-1.5 py-1">
                <div
                  className="absolute inset-y-0 left-0 bg-down transition-all duration-500 ease-out"
                  style={{ width: `${(a.cum / maxCum) * 100}%`, opacity: 0.1 + (a.qty / maxCum) * 0.35 }}
                />
                <span className="mono-num relative text-ink-muted">{a.qty.toFixed(3)}</span>
                <span className="mono-num relative text-down">{formatUsd(a.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-line pt-2">
        <div className="mono-num flex items-center justify-between text-sm font-semibold text-ink">
          <span>{formatUsd(mid)}</span>
          <span className="text-[10px] font-normal text-ink-faint">Spread {formatUsd(spread)}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-down/25">
          <div className="h-full bg-up transition-[width] duration-500 ease-out" style={{ width: `${bidPct}%` }} />
        </div>
        <div className="mono-num flex justify-between text-[10px]">
          <span className="text-up">{bidPct.toFixed(1)}%</span>
          <span className="text-ink-faint">
            {lastUpdated ? `updated ${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s lalu` : ""}
          </span>
          <span className="text-down">{(100 - bidPct).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
