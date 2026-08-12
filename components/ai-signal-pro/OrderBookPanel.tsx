"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatUsd } from "@/lib/format";
import type { OrderBookSnapshot } from "@/lib/types";

// ---------------------------------------------------------------------------
// REAL market depth from Binance Futures, via the existing public
// /api/orderbook-depth route (lib/binance.ts getOrderBookDepth) — same
// endpoint BtcOrderbookPanel already uses, now symbol-dynamic. Polls every
// POLL_MS; the endpoint itself caches Binance's response for 10s
// server-side, so this is real exchange depth on a short delay — not a raw
// diff-depth WebSocket (that needs a local snapshot+buffer+resync state
// machine, real extra work — flagged as a possible follow-up upgrade,
// not silently presented as full websocket architecture).
// ---------------------------------------------------------------------------

const POLL_MS = 3_000;
const DEPTH_ROWS = 22;
const STALE_AFTER_MS = 15_000;

type ConnState = "live" | "reconnecting" | "disconnected";

function fmtPrice(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 2 : 6, minimumFractionDigits: n >= 100 ? 2 : 2 });
}
function fmtQty(n: number) {
  return n.toFixed(4);
}

/** Cumulative staircase path (SVG), best price outward — same shape as BtcOrderbookPanel's depth chart, generalized for any symbol. */
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

export function OrderBookPanel({ symbol }: { symbol: string; referencePrice?: number | null }) {
  const [book, setBook] = useState<(OrderBookSnapshot & { source?: "futures" | "spot" }) | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnState>("reconnecting");
  const [failCount, setFailCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setLastUpdated(null);
    setStatus("reconnecting");
    setFailCount(0);

    async function poll() {
      // Skip this tick instead of aborting a still-pending request — a slow
      // (but eventually successful) response should never be counted as a
      // failure just because the next 3s tick fired first.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=${encodeURIComponent(symbol)}&limit=${DEPTH_ROWS}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as OrderBookSnapshot & { error?: string; source?: "futures" | "spot" };
        if (cancelled) return;
        if (data.error || !data.bids?.length || !data.asks?.length) {
          setFailCount((f) => f + 1);
          return;
        }
        setBook(data);
        setLastUpdated(Date.now());
        setStatus("live");
        setFailCount(0);
        setFlash(true);
        setTimeout(() => setFlash(false), 260);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        if (!cancelled && !isAbort) setFailCount((f) => f + 1);
      } finally {
        inFlightRef.current = false;
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

  const derived = useMemo(() => {
    if (!book || !book.bids.length || !book.asks.length) return undefined;
    const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, DEPTH_ROWS);
    const asks = [...book.asks].sort((a, b) => a.price - b.price).slice(0, DEPTH_ROWS);

    let running = 0;
    const bidCum = bids.map((l) => (running += l.qty));
    running = 0;
    const askCum = asks.map((l) => (running += l.qty));
    const maxCum = Math.max(bidCum.at(-1) ?? 0, askCum.at(-1) ?? 0, 1e-9);

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const mid = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;

    const bidVol = bids.reduce((s, l) => s + l.qty, 0);
    const askVol = asks.reduce((s, l) => s + l.qty, 0);
    const imbalancePct = (bidVol / (bidVol + askVol || 1)) * 100;
    const pressure: "buy" | "sell" = imbalancePct >= 50 ? "buy" : "sell";

    return {
      bids: bids.map((l, i) => ({ ...l, cum: bidCum[i] })),
      asks: asks.map((l, i) => ({ ...l, cum: askCum[i] })),
      maxCum,
      mid,
      spread,
      spreadPct,
      imbalancePct,
      pressure,
      bidVol,
      askVol,
    };
  }, [book]);

  const STATUS_LABEL: Record<ConnState, string> = { live: "LIVE", reconnecting: "RECONNECTING", disconnected: "DISCONNECTED" };
  const STATUS_TONE: Record<ConnState, "up" | "amber" | "down"> = { live: "up", reconnecting: "amber", disconnected: "down" };

  if (!derived) {
    return (
      <div className="glow-card relative flex flex-col overflow-hidden p-4 xl:h-[520px]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-signal/10 blur-3xl" />
        <SectionHeader code="OB" title="Order Book (Live)" hint={`${symbol}USDT`} icon={<Layers size={13} />} />
        <div className="flex h-52 flex-1 items-center justify-center rounded-md border border-dashed border-line text-center text-[11px] text-ink-faint">
          {failCount >= 2 ? "DISCONNECTED — Binance Futures depth tidak terjangkau" : "Menyambungkan…"}
        </div>
      </div>
    );
  }

  const { bids, asks, maxCum, mid, spread, spreadPct, imbalancePct, pressure } = derived;
  const asksTopDown = [...asks].reverse();
  // Combined ladder: asks (red, descending toward spread) on top, spread row, bids (green, descending from spread) below — one continuous price column like a real exchange ladder.
  const ladderAsks = asksTopDown.slice(-12);
  const ladderBids = bids.slice(0, 12);

  return (
    <div className="glow-card relative flex flex-col overflow-hidden p-4 xl:h-[520px]">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-signal/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-up/5 blur-3xl" />

      <div className="relative mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionHeader code="OB" title="Order Book (Live)" hint={`${symbol}USDT · Binance ${book?.source === "spot" ? "Spot (fallback)" : "Futures"}`} icon={<Layers size={13} />} />
        <div className="flex items-center gap-1.5">
          <LiveDot tone={STATUS_TONE[status]} />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${status === "live" ? "text-up" : status === "reconnecting" ? "text-amber" : "text-down"}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* Stat strip: Spread / Imbalance / Pressure — same trio as the Order Book reference design */}
      <div className="relative mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-line bg-bg px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-ink-faint">Spread</div>
          <div className="mono-num text-[12px] font-semibold text-ink">
            {fmtPrice(spread)} <span className="text-ink-faint">({spreadPct.toFixed(3)}%)</span>
          </div>
        </div>
        <div className="rounded-md border border-line bg-bg px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-ink-faint">Imbalance</div>
          <div className={`mono-num text-[12px] font-semibold ${imbalancePct >= 50 ? "text-up" : "text-down"}`}>
            {imbalancePct >= 50 ? "+" : "-"}
            {Math.abs(imbalancePct - 50).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-md border border-line bg-bg px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-ink-faint">Pressure</div>
          <div className={`text-[12px] font-bold uppercase ${pressure === "buy" ? "text-up" : "text-down"}`}>{pressure}</div>
        </div>
      </div>

      {/* Depth chart (staircase) + price ladder, side by side — mirrors the reference Order Book design */}
      <div className="relative grid flex-1 grid-cols-[1fr_1.3fr] gap-3">
        <div className={`relative overflow-hidden rounded-lg border border-line bg-bg transition-shadow duration-300 ${flash ? "shadow-[0_0_20px_rgb(var(--signal-glow-rgb)/0.25)]" : ""}`}>
          <div className="grid h-full grid-cols-2">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full scale-x-[-1]">
              <path
                d={buildStaircasePath(asksTopDown.map((a) => a.cum).reverse(), maxCum)}
                fill="rgba(255,82,82,0.18)"
                stroke="#FF5252"
                strokeWidth={0.6}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
              <path
                d={buildStaircasePath(bids.map((b) => b.cum), maxCum)}
                fill="rgba(0,230,118,0.18)"
                stroke="#00E676"
                strokeWidth={0.6}
                className="transition-all duration-500 ease-out"
              />
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
          <div
            className={`pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 rounded bg-bg-raised px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
              flash ? "text-signal-glow" : "text-ink"
            }`}
          >
            <span className="mono-num">{fmtPrice(mid)}</span>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-bg">
          <div className="grid grid-cols-3 border-b border-line px-2 py-1 text-[9px] uppercase tracking-wide text-ink-faint">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {ladderAsks.map((a) => (
              <div key={`ask-${a.price}`} className="relative grid grid-cols-3 items-center overflow-hidden px-2 py-[3px] text-[10.5px]">
                <div className="absolute inset-y-0 right-0 bg-down/12" style={{ width: `${Math.min(100, (a.cum / maxCum) * 100)}%` }} />
                <span className="mono-num relative z-10 text-down">{fmtPrice(a.price)}</span>
                <span className="mono-num relative z-10 text-right text-ink-muted">{fmtQty(a.qty)}</span>
                <span className="mono-num relative z-10 text-right text-ink-faint">{a.cum.toFixed(3)}</span>
              </div>
            ))}
            <div className="mono-num flex items-center justify-between border-y border-line bg-bg-raised px-2 py-1 text-[11px] font-semibold">
              <span className="text-ink">{fmtPrice(mid)}</span>
              <span className="text-[9px] font-normal text-ink-faint">
                {lastUpdated ? `${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s lalu` : ""}
              </span>
            </div>
            {ladderBids.map((b) => (
              <div key={`bid-${b.price}`} className="relative grid grid-cols-3 items-center overflow-hidden px-2 py-[3px] text-[10.5px]">
                <div className="absolute inset-y-0 right-0 bg-up/12" style={{ width: `${Math.min(100, (b.cum / maxCum) * 100)}%` }} />
                <span className="mono-num relative z-10 text-up">{fmtPrice(b.price)}</span>
                <span className="mono-num relative z-10 text-right text-ink-muted">{fmtQty(b.qty)}</span>
                <span className="mono-num relative z-10 text-right text-ink-faint">{b.cum.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-down/25">
        <div className="h-full bg-up shadow-[0_0_8px_rgb(0,230,118,0.5)] transition-[width] duration-500 ease-out" style={{ width: `${imbalancePct}%` }} />
      </div>
    </div>
  );
}
