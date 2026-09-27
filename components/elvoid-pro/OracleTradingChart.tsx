"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { Candle } from "@/lib/elvoid/types";
import type { ChartLevels } from "@/components/ai-signal-pro/TradingChart";

// The exact same chart component /ai-signal's Watchlist Signal cards render
// (via components/ai-signal-pro/SignalChartMini.tsx) — not reimplemented,
// not modified. Loaded the same lazy/no-SSR way that component already
// loads it.
const TradingChart = dynamic(() => import("@/components/ai-signal-pro/TradingChart").then((m) => m.TradingChart), {
  ssr: false,
  loading: () => (
    <div className="flex h-[180px] w-full items-center justify-center text-ink-faint">
      <Loader2 size={14} className="animate-spin" />
    </div>
  ),
});

const DEFAULT_INTERVAL = "15m"; // same timeframe the ELVOID Pro Oracle itself runs on (app/api/elvoid-pro/oracle "interval=15m") — used here only to fetch candles to *display*, never to recompute a decision.

/**
 * One real candlestick chart, real /api/klines candles, Entry/TP/SL drawn
 * as price lines on the candles themselves — nothing else in it (no RSI,
 * no MACD, no volume profile, no confidence curve). This is the shared
 * base both the ELVOID PRO ORACLE card (OraclePanel.tsx) and the AI Signal
 * Intelligence cards (AISignalIntelligencePanel.tsx) render, so there's
 * one chart implementation for ELVOID PRO, not two. Candle data and
 * levels are only ever passed through, never computed here.
 */
export function OracleTradingChart({
  symbol,
  interval = DEFAULT_INTERVAL,
  levels,
  height = 180,
}: {
  symbol: string;
  interval?: string;
  levels: ChartLevels | null;
  height?: number;
}) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=150`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (!Array.isArray(res.candles) || res.candles.length === 0) {
          setStatus("error");
          return;
        }
        setCandles(res.candles);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg">
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 text-[11px] text-ink-muted" style={{ height }}>
          <Loader2 size={13} className="animate-spin" /> Memuat chart {symbol}…
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center justify-center text-[11px] text-ink-faint" style={{ height }}>
          Data candle tidak tersedia.
        </div>
      )}
      {status === "ready" && <TradingChart symbol={symbol} interval={interval} candles={candles} levels={levels} height={height} compact />}
    </div>
  );
}

/**
 * Maps a single entry/stopLoss/takeProfit + side into the shape
 * TradingChart expects — straight passthrough, no recalculation.
 * `ChartLevels` has no second-take-profit concept in this Oracle (single
 * TP by design — see lib/ai/oracle/risk.ts), so tp2 is set to NaN
 * specifically so TradingChart's own `!isFinite(price)` guard skips
 * drawing it, and tp3 to null for the same reason — never a second,
 * invented TP level. Returns null (chart renders candles only) when
 * there's no complete directional risk plan to show.
 */
export function toChartLevels(input: { side: "LONG" | "SHORT" | null; entry: number | null; stopLoss: number | null; takeProfit: number | null }): ChartLevels | null {
  if (!input.side || input.entry === null || input.stopLoss === null || input.takeProfit === null) return null;
  return { side: input.side, entry: input.entry, sl: input.stopLoss, tp1: input.takeProfit, tp2: Number.NaN, tp3: null };
}
