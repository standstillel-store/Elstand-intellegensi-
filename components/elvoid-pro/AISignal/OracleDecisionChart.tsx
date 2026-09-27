"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";

/**
 * Minimal, purpose-built decision chart for the ELVOID Pro Oracle card.
 *
 * Deliberately NOT the shared `components/ai-signal-pro/TradingChart.tsx`
 * (that one carries EMA/SMA/VWAP/Bollinger/Ichimoku/Supertrend overlays, a
 * volume histogram, a live-websocket badge, and an overlay-toggle chip row —
 * all correct for the full Chart Analysis view, all noise for a "what did
 * ELVOID see and where did it place its levels" transparency card). This
 * component draws real candles plus, when present, the Entry/TP/SL levels
 * ELVOID actually computed — nothing else. Same underlying chart library
 * (`lightweight-charts`) as the rest of the app, per the redesign brief's
 * "reuse the existing chart library" instruction — just a leaner series set.
 *
 * Pure presentation: candles and levels are passed in as props exactly as
 * received from the existing `/api/klines` and `/api/elvoid-pro/oracle`
 * responses. Nothing here fetches, computes, or invents a value.
 */

export interface DecisionChartLevels {
  entry: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
}

// Matches the app's existing up/down/gold design tokens (tailwind.config.ts:
// up #00E676, down #FF5252, gold #D4AF37) — lightweight-charts needs literal
// color strings, so these are the same colors those Tailwind classes resolve
// to, not a new palette.
const UP_COLOR = "#00E676";
const DOWN_COLOR = "#FF5252";
const GOLD_COLOR = "#D4AF37";

function toChartTime(msEpoch: number): UTCTimestamp {
  return Math.floor(msEpoch / 1000) as UTCTimestamp;
}

export function OracleDecisionChart({
  candles,
  levels,
  height = 260,
}: {
  candles: Candle[];
  levels?: DecisionChartLevels | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Create the chart once per mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8A8F98", fontFamily: "var(--font-sans)" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      width: containerRef.current.clientWidth,
      height,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#1E2129" },
      rightPriceScale: { borderColor: "#1E2129" },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: false,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    seriesRef.current = series;

    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);
    // Also re-measure on next tick — the card's own layout (chart mounted
    // inside a flex column that's still settling its width) can otherwise
    // leave the chart briefly sized to a stale/zero container width, the
    // same class of issue TradingChart's own onResize hook guards against.
    const raf = requestAnimationFrame(onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Load / reload candle data.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !candles.length) return;
    series.setData(
      candles.map((c) => ({
        time: toChartTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Draw / redraw the Entry/TP/SL lines — values only, never recomputed here.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (!levels) return;

    const specs: { label: string; price: number | null; color: string; style: LineStyle }[] = [
      { label: "Entry", price: levels.entry, color: GOLD_COLOR, style: LineStyle.Solid },
      { label: "TP", price: levels.takeProfit, color: UP_COLOR, style: LineStyle.Dashed },
      { label: "SL", price: levels.stopLoss, color: DOWN_COLOR, style: LineStyle.Dashed },
    ];
    for (const spec of specs) {
      if (spec.price === null || !Number.isFinite(spec.price)) continue;
      const line = series.createPriceLine({
        price: spec.price,
        color: spec.color,
        lineWidth: 2,
        lineStyle: spec.style,
        axisLabelVisible: true,
        title: spec.label,
      });
      priceLinesRef.current.push(line);
    }
  }, [levels]);

  return (
    <div className="w-full overflow-hidden rounded-md border border-line/60 bg-bg/40">
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
