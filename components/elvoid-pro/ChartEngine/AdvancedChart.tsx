"use client";
import { useEffect, useState } from "react";
import { TradingChart } from "@/components/ai-signal-pro/TradingChart";
import { ComingSoonMode } from "./ComingSoonMode";
import { CHART_MODE_GROUPS, type ChartMode } from "./chartModes";
import type { Candle } from "@/lib/elvoid/types";

const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

const ALL_MODES = CHART_MODE_GROUPS.flatMap((g) => g.items);

export function AdvancedChart({ symbol, timeframe, chartMode }: { symbol: string; timeframe: string; chartMode: ChartMode }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const height = 520;

  useEffect(() => {
    if (chartMode !== "candlestick") return;
    let cancelled = false;
    setStatus("loading");
    const interval = TF_TO_INTERVAL[timeframe] ?? "5m";
    fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=300`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.candles)) {
          setStatus("error");
          return;
        }
        setCandles(data.candles);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, chartMode]);

  if (chartMode !== "candlestick") {
    const mode = ALL_MODES.find((m) => m.id === chartMode)!;
    return <ComingSoonMode mode={mode} height={height} />;
  }

  if (status === "loading" && candles.length === 0) {
    return (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Memuat data candle {symbol}/USDT…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Gagal mengambil data candle dari Binance. Coba lagi nanti.
      </div>
    );
  }

  return (
    <TradingChart
      symbol={`${symbol}USDT`}
      interval={TF_TO_INTERVAL[timeframe] ?? "5m"}
      candles={candles}
      height={height}
    />
  );
}
