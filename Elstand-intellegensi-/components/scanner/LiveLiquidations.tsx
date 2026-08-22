"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { formatUsd } from "@/lib/format";

// Public Binance Futures liquidation order stream — no API key needed.
// Docs: wss://fstream.binance.com/ws/!forceOrder@arr
const LIQUIDATION_WS_URL = "wss://fstream.binance.com/ws/!forceOrder@arr";
const MAX_EVENTS = 30;

interface LiquidationEvent {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT"; // the liquidated position's side
  qty: number;
  price: number;
  valueUsd: number;
  time: number;
}

type ConnStatus = "connecting" | "live" | "error";

// Binance's forceOrder payload uses `S` = the *order* side that closed the
// position: a SELL order liquidates a LONG, a BUY order liquidates a SHORT.
function sideFromOrder(orderSide: string): "LONG" | "SHORT" {
  return orderSide === "SELL" ? "LONG" : "SHORT";
}

export function LiveLiquidations({ watchlistSymbols }: { watchlistSymbols: string[] }) {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [events, setEvents] = useState<LiquidationEvent[]>([]);
  const [sessionTotalUsd, setSessionTotalUsd] = useState(0);
  const wanted = useRef(new Set(watchlistSymbols.map((s) => `${s.toUpperCase()}USDT`)));

  useEffect(() => {
    wanted.current = new Set(watchlistSymbols.map((s) => `${s.toUpperCase()}USDT`));
  }, [watchlistSymbols]);

  useEffect(() => {
    let ws: WebSocket;
    let cancelled = false;

    function connect() {
      try {
        ws = new WebSocket(LIQUIDATION_WS_URL);
      } catch {
        setStatus("error");
        return;
      }
      ws.onopen = () => !cancelled && setStatus("live");
      ws.onerror = () => !cancelled && setStatus("error");
      ws.onclose = () => {
        if (cancelled) return;
        setStatus("connecting");
        setTimeout(connect, 3000);
      };
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data as string);
          const o = parsed?.o;
          if (!o || !wanted.current.has(o.s)) return;
          const qty = parseFloat(o.q);
          const price = parseFloat(o.ap ?? o.p);
          const valueUsd = qty * price;
          const event: LiquidationEvent = {
            id: `${o.s}-${o.T}-${o.q}`,
            symbol: (o.s as string).replace("USDT", ""),
            side: sideFromOrder(o.S),
            qty,
            price,
            valueUsd,
            time: o.T ?? Date.now(),
          };
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
          setSessionTotalUsd((prev) => prev + valueUsd);
        } catch {
          // malformed frame — skip rather than crash the feed
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, []);

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {status === "live" && <span className="live-dot bg-up" />}
          <span className="text-[11px] font-semibold tracking-wide text-signal-glow">LIVE LIQUIDATIONS</span>
        </div>
        <span className="text-[10px] text-ink-faint">
          {status === "live" ? "Live · Binance Futures stream" : status === "connecting" ? "Connecting…" : "Stream unavailable"}
        </span>
      </div>

      <p className="mono-num text-[11px] text-ink-faint">
        Session total (since page opened):{" "}
        <span className="font-semibold text-ink">{formatUsd(sessionTotalUsd)}</span>
        <span className="ml-1">— not a 24h figure; no free bulk history endpoint exists for this.</span>
      </p>

      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {status === "error" && events.length === 0 && (
          <p className="py-3 text-center text-[11px] text-ink-faint">Tidak bisa konek ke stream liquidation saat ini.</p>
        )}
        {status !== "error" && events.length === 0 && (
          <p className="py-3 text-center text-[11px] text-ink-faint">Menunggu liquidation pertama dari watchlist…</p>
        )}
        {events.map((e) => (
          <div key={e.id} className="mono-num flex items-center justify-between text-[11px]">
            <span className="font-medium">{e.symbol}</span>
            <span className={clsx(e.side === "LONG" ? "text-down" : "text-up")}>{e.side} liq</span>
            <span className="text-ink-muted">{formatUsd(e.valueUsd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
