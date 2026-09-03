"use client";
import { useEffect, useRef, useState } from "react";
import { TradingChart } from "@/components/ai-signal-pro/TradingChart";
import { ComingSoonMode } from "./ComingSoonMode";
import { ProfileEmbeddedChart } from "./modes/ProfileEmbeddedChart";
import { TPOLetterChart } from "./modes/TPOLetterChart";
import { FootprintEmbeddedChart } from "./modes/FootprintEmbeddedChart";
import { FootprintMode } from "./modes/FootprintMode";
import { LiquidityMode } from "./modes/LiquidityMode";
import { LiquidityHeatmapEmbeddedChart } from "./modes/LiquidityHeatmapEmbeddedChart";
import { CHART_MODE_GROUPS, type ChartMode } from "./chartModes";
import type { Candle } from "@/lib/elvoid/types";
import { getMaxHistoryDays } from "@/lib/market-data/timeframeHistory";

const TF_TO_INTERVAL: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

const ALL_MODES = CHART_MODE_GROUPS.flatMap((g) => g.items);

// Every embedded chart mode below (candlestick via lightweight-charts,
// footprint/TPO/volume-profile/liquidity canvases, etc.) needs an explicit
// PIXEL height number — none of them can just be told "h-full" in CSS,
// because a <canvas> (or lightweight-charts' own internal canvas) doesn't
// auto-size itself the way a normal DOM element does. A hardcoded number
// here was the root cause of the desktop "chart doesn't fill available
// space" bug: this component's own wrapping box IS correctly stretched by
// the parent CSS Grid (see TerminalShell.tsx) to match the right rail's
// height, but a fixed height ignored that and just left the extra
// stretched space empty. Fixed by measuring the actual rendered wrapper
// height with a ResizeObserver and using THAT as the pixel height, so the
// chart always exactly fills whatever space its container really has —
// on a 1280px laptop, a 1920px desktop, or anything between.
function useMeasuredHeight(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.height;
      if (measured && measured > 0) setHeight(Math.round(measured));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, height };
}

export function AdvancedChart({ symbol, timeframe, chartMode }: { symbol: string; timeframe: string; chartMode: ChartMode }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Responsive floor (never a hardcoded ceiling) — this is only what's used
  // BEFORE the ResizeObserver's first measurement lands (effectively
  // instant) and as a hard minimum so the chart never collapses to
  // something unusably short even in a tiny/degenerate container.
  const { ref: measureRef, height } = useMeasuredHeight(440);

  useEffect(() => {
    if (chartMode !== "candlestick") return;
    let cancelled = false;
    setStatus("loading");
    setCandles([]); // don't keep showing the previous timeframe's candles while the new range loads
    const interval = TF_TO_INTERVAL[timeframe] ?? "5m";
    const days = getMaxHistoryDays(interval);
    fetch(`/api/klines?symbol=${symbol}&interval=${interval}&days=${days}`)
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

  let body: React.ReactNode;

  if (chartMode === "volume-profile") {
    body = <ProfileEmbeddedChart symbol={symbol} interval={TF_TO_INTERVAL[timeframe] ?? "5m"} height={height} mode="volume-profile" />;
  } else if (chartMode === "tpo") {
    body = <TPOLetterChart symbol={symbol} height={height} chartInterval={TF_TO_INTERVAL[timeframe] ?? "5m"} />;
  } else if (chartMode === "footprint") {
    body = <FootprintEmbeddedChart symbol={symbol} interval={TF_TO_INTERVAL[timeframe] ?? "5m"} height={height} />;
  } else if (chartMode === "delta" || chartMode === "imbalance") {
    body = <FootprintMode symbol={symbol} height={height} variant={chartMode} />;
  } else if (chartMode === "liquidity-heatmap") {
    body = <LiquidityHeatmapEmbeddedChart symbol={symbol} interval={TF_TO_INTERVAL[timeframe] ?? "5m"} height={height} />;
  } else if (chartMode === "order-book-chart" || chartMode === "liquidity-walls") {
    body = <LiquidityMode symbol={symbol} height={height} variant={chartMode} />;
  } else if (chartMode !== "candlestick") {
    const mode = ALL_MODES.find((m) => m.id === chartMode)!;
    body = <ComingSoonMode mode={mode} height={height} />;
  } else if (status === "loading" && candles.length === 0) {
    body = (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Memuat data candle {symbol}/USDT…
      </div>
    );
  } else if (status === "error") {
    body = (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Gagal mengambil data candle dari Binance. Coba lagi nanti.
      </div>
    );
  } else {
    body = <TradingChart symbol={`${symbol}USDT`} interval={TF_TO_INTERVAL[timeframe] ?? "5m"} candles={candles} height={height} />;
  }

  return (
    <div ref={measureRef} className="h-full min-h-[380px] sm:min-h-[440px] xl:min-h-[520px] 2xl:min-h-[600px]">
      {body}
    </div>
  );
}
