"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";

export interface ChartLevels {
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
}

const LEVEL_COLORS = {
  entry: "#22C55E", // 🟢
  sl: "#EF4444", // 🔴
  tp1: "#A855F7", // 🟣
  tp2: "#FFB020", // 🟡
  tp3: "#3B82F6", // 🔵
} as const;

function calcEmaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function toChartTime(msEpoch: number): UTCTimestamp {
  return Math.floor(msEpoch / 1000) as UTCTimestamp;
}

export function TradingChart({
  symbol,
  interval,
  candles,
  levels,
  height = 440,
  wsUrl,
}: {
  symbol: string;
  interval: string;
  candles: Candle[];
  levels?: ChartLevels | null;
  height?: number;
  /** Full WebSocket URL for live candle updates. Defaults to Binance's public Spot mainnet stream (existing behavior) — pass this to point the chart at Testnet/Futures instead (see lib/binance/wsUrl.ts). */
  wsUrl?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "live" | "offline">("connecting");

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
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    ema20Ref.current = chart.addLineSeries({ color: "#8B7BFF", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema50Ref.current = chart.addLineSeries({ color: "#FFB020", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
    };
  }, [height]);

  // Seed historical data whenever candles change (symbol/interval/timeframe switch).
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles.length) return;

    candleSeriesRef.current.setData(
      candles.map((c) => ({ time: toChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time: toChartTime(c.time),
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      }))
    );

    const closes = candles.map((c) => c.close);
    if (ema20Ref.current && closes.length >= 20) {
      const ema20 = calcEmaSeries(closes, 20);
      ema20Ref.current.setData(candles.map((c, i) => ({ time: toChartTime(c.time), value: ema20[i] })));
    }
    if (ema50Ref.current && closes.length >= 50) {
      const ema50 = calcEmaSeries(closes, 50);
      ema50Ref.current.setData(candles.map((c, i) => ({ time: toChartTime(c.time), value: ema50[i] })));
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Draw / redraw AI entry-SL-TP price lines.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (!levels) return;

    const specs: { key: keyof typeof LEVEL_COLORS; label: string; price: number | null }[] = [
      { key: "entry", label: "Entry", price: levels.entry },
      { key: "sl", label: "SL", price: levels.sl },
      { key: "tp1", label: "TP1", price: levels.tp1 },
      { key: "tp2", label: "TP2", price: levels.tp2 },
      { key: "tp3", label: "TP3", price: levels.tp3 },
    ];
    for (const spec of specs) {
      if (spec.price === null || !isFinite(spec.price)) continue;
      const line = series.createPriceLine({
        price: spec.price,
        color: LEVEL_COLORS[spec.key],
        lineWidth: 2,
        lineStyle: spec.key === "entry" ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: spec.label,
      });
      priceLinesRef.current.push(line);
    }
  }, [levels]);

  // Live updates via a public kline WebSocket stream — no key required
  // (works identically on Testnet, Live, Spot, and Futures public streams).
  useEffect(() => {
    if (!symbol || !interval) return;
    setWsStatus("connecting");
    const streamSymbol = symbol.toLowerCase().replace(/usdt$/i, "") + "usdt";
    const url = wsUrl ?? `wss://stream.binance.com:9443/ws/${streamSymbol}@kline_${interval}`;
    const ws = new WebSocket(url);

    ws.onopen = () => setWsStatus("live");
    ws.onerror = () => setWsStatus("offline");
    ws.onclose = () => setWsStatus("offline");
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const k = msg.k;
        if (!k || !candleSeriesRef.current || !volumeSeriesRef.current) return;
        const bar = { time: toChartTime(k.t), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c) };
        candleSeriesRef.current.update(bar);
        volumeSeriesRef.current.update({
          time: toChartTime(k.t),
          value: Number(k.v),
          color: Number(k.c) >= Number(k.o) ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
        });
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => ws.close();
  }, [symbol, interval, wsUrl]);

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-line bg-bg/80 px-2 py-1 text-[10px] backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            wsStatus === "live" ? "bg-up animate-pulseGlow" : wsStatus === "connecting" ? "bg-amber animate-pulse" : "bg-ink-faint"
          }`}
        />
        <span className="text-ink-faint">{wsStatus === "live" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Offline"}</span>
      </div>
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
