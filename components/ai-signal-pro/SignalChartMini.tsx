"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { IndicatorsSuitePanel } from "./IndicatorsSuitePanel";
import type { Candle } from "@/lib/elvoid/types";
import type { ChartLevels } from "./TradingChart";

const TradingChart = dynamic(() => import("./TradingChart").then((m) => m.TradingChart), {
  ssr: false,
  loading: () => (
    <div className="flex h-[180px] w-full items-center justify-center text-ink-faint">
      <Loader2 size={14} className="animate-spin" />
    </div>
  ),
});

/**
 * Per-signal chart + indicators for the Watchlist grid — the exact same
 * TradingChart + IndicatorsSuitePanel used on the Chart Analysis tab, just
 * scaled down to card size, so every watchlist tile shows its own live
 * chart with entry/SL/TP levels plotted, plus the RSI/MACD/Volume Profile
 * trio underneath. Fetches its own candles independently per coin —
 * SignalCardPro doesn't have OHLCV data, only the saved signal levels.
 */
export function SignalChartMini({ symbol, timeframe, levels }: { symbol: string; timeframe: string; levels?: ChartLevels | null }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/klines?symbol=${symbol}&interval=${timeframe}&limit=150`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setCandles(Array.isArray(res.candles) ? res.candles : []);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  return (
    <div className="space-y-2.5">
      <div className="overflow-hidden rounded-lg border border-line bg-bg">
        {loading ? (
          <div className="flex h-[180px] items-center justify-center gap-2 text-[11px] text-ink-muted">
            <Loader2 size={13} className="animate-spin" /> Memuat chart {symbol}…
          </div>
        ) : candles.length ? (
          <TradingChart symbol={symbol} interval={timeframe} candles={candles} levels={levels} height={180} />
        ) : (
          <div className="flex h-[180px] items-center justify-center text-[11px] text-ink-faint">Data candle tidak tersedia.</div>
        )}
      </div>
      <IndicatorsSuitePanel symbol={symbol} candles={candles} />
    </div>
  );
}
