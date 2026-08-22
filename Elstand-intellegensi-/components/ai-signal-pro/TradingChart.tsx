"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import clsx from "clsx";
import type { Candle } from "@/lib/elvoid/types";
import { sma, calcBollingerSeries, calcIchimokuSeries, calcSupertrendSeries, atr, calcAdx } from "@/lib/elvoid/indicators";

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

// Overlay toggles — every extra indicator lives in the SAME chart instead of
// its own separate widget, per request. Off by default except EMA (kept as
// it was) so the chart doesn't turn into visual noise the moment it loads;
// the user picks whichever extra overlays they actually want to see.
const OVERLAY_DEFS = [
  { key: "sma", label: "SMA 20/50", color: "#FFB020" },
  { key: "vwap", label: "VWAP", color: "#22D3EE" },
  { key: "bollinger", label: "Bollinger", color: "#EC4899" },
  { key: "ichimoku", label: "Ichimoku", color: "#F97316" },
  { key: "supertrend", label: "Supertrend", color: "#10B981" },
] as const;
type OverlayKey = (typeof OVERLAY_DEFS)[number]["key"];

function calcEmaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Cumulative VWAP from the start of the loaded candle window (same "since loaded window, not per exchange session" semantics as lib/elvoid/scanners.ts scanVwap). */
function calcVwapSeries(candles: Candle[]): number[] {
  let cumPV = 0;
  let cumVol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumVol += c.volume;
    return cumVol > 0 ? cumPV / cumVol : NaN;
  });
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
  compact = false,
}: {
  symbol: string;
  interval: string;
  candles: Candle[];
  levels?: ChartLevels | null;
  height?: number;
  /** Full WebSocket URL for live candle updates. Defaults to Binance's public Spot mainnet stream (existing behavior) — pass this to point the chart at Testnet/Futures instead (see lib/binance/wsUrl.ts). */
  wsUrl?: string;
  /** Mini/card context (e.g. Watchlist grid tiles): hides the overlay-toggle chip row, the live badge, and the ATR/ADX readout — those are sized for the big 440px Chart Analysis view and just crowd a ~180px card. Also defaults every extra overlay off so the small candle area stays readable; EMA + entry/SL/TP levels still draw. */
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichimokuARef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichimokuBRef = useRef<ISeriesApi<"Line"> | null>(null);
  const supertrendRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "live" | "offline">("connecting");
  // All 6 price-scale overlays default ON for the full chart — but OFF in compact mode, where a tiny
  // canvas plus the chip row that toggles them would just overlap and look crowded (candles + EMA + levels is enough).
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>(
    compact ? { sma: false, vwap: false, bollinger: false, ichimoku: false, supertrend: false } : { sma: true, vwap: true, bollinger: true, ichimoku: true, supertrend: true }
  );
  // ATR/ADX are oscillators (different scale from price) so they can't be drawn as chart lines without
  // wrecking the candle scale — shown instead as a compact readout inside the chart, same as TradingView does.
  const [atrAdx, setAtrAdx] = useState<{ atr: number | null; adx: number | null; plusDI: number | null; minusDI: number | null }>({
    atr: null,
    adx: null,
    plusDI: null,
    minusDI: null,
  });

  const toggleOverlay = (key: OverlayKey) => setOverlays((o) => ({ ...o, [key]: !o[key] }));

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
    sma20Ref.current = chart.addLineSeries({ color: "#FFB020", lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, visible: false });
    sma50Ref.current = chart.addLineSeries({ color: "#FDBA74", lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, visible: false });
    vwapRef.current = chart.addLineSeries({ color: "#22D3EE", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });
    bbUpperRef.current = chart.addLineSeries({ color: "#EC4899", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });
    bbLowerRef.current = chart.addLineSeries({ color: "#EC4899", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });
    ichimokuARef.current = chart.addLineSeries({ color: "#F97316", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
    ichimokuBRef.current = chart.addLineSeries({ color: "#FB923C", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
    supertrendRef.current = chart.addLineSeries({ color: "#10B981", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, visible: false });

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
      sma20Ref.current = null;
      sma50Ref.current = null;
      vwapRef.current = null;
      bbUpperRef.current = null;
      bbLowerRef.current = null;
      ichimokuARef.current = null;
      ichimokuBRef.current = null;
      supertrendRef.current = null;
    };
  }, [height]);

  // Seed historical data + all overlay series whenever candles change (symbol/interval/timeframe switch).
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
    const times = candles.map((c) => toChartTime(c.time));

    if (ema20Ref.current && closes.length >= 20) {
      const ema20 = calcEmaSeries(closes, 20);
      ema20Ref.current.setData(candles.map((c, i) => ({ time: toChartTime(c.time), value: ema20[i] })));
    }
    if (ema50Ref.current && closes.length >= 50) {
      const ema50 = calcEmaSeries(closes, 50);
      ema50Ref.current.setData(candles.map((c, i) => ({ time: toChartTime(c.time), value: ema50[i] })));
    }

    // SMA — same overlay everywhere else uses moving averages, here as dotted lines so EMA/SMA stay visually distinct.
    if (sma20Ref.current && closes.length >= 20) {
      const s20 = sma(closes, 20);
      sma20Ref.current.setData(times.map((t, i) => ({ time: t, value: s20[i] })).filter((p) => !Number.isNaN(p.value)));
    }
    if (sma50Ref.current && closes.length >= 50) {
      const s50 = sma(closes, 50);
      sma50Ref.current.setData(times.map((t, i) => ({ time: t, value: s50[i] })).filter((p) => !Number.isNaN(p.value)));
    }
    if (vwapRef.current) {
      const vwapSeries = calcVwapSeries(candles);
      vwapRef.current.setData(times.map((t, i) => ({ time: t, value: vwapSeries[i] })).filter((p) => !Number.isNaN(p.value)));
    }
    if (bbUpperRef.current && bbLowerRef.current && closes.length >= 20) {
      const bb = calcBollingerSeries(candles, 20, 2);
      bbUpperRef.current.setData(times.map((t, i) => ({ time: t, value: bb.upper[i] })).filter((p) => !Number.isNaN(p.value)));
      bbLowerRef.current.setData(times.map((t, i) => ({ time: t, value: bb.lower[i] })).filter((p) => !Number.isNaN(p.value)));
    }
    if (ichimokuARef.current && ichimokuBRef.current && candles.length >= 52) {
      const ich = calcIchimokuSeries(candles);
      ichimokuARef.current.setData(times.map((t, i) => ({ time: t, value: ich.senkouA[i] })).filter((p) => !Number.isNaN(p.value)));
      ichimokuBRef.current.setData(times.map((t, i) => ({ time: t, value: ich.senkouB[i] })).filter((p) => !Number.isNaN(p.value)));
    }
    if (supertrendRef.current && candles.length >= 12) {
      const st = calcSupertrendSeries(candles, 10, 3);
      supertrendRef.current.setData(times.map((t, i) => ({ time: t, value: st.value[i] })).filter((p) => !Number.isNaN(p.value)));
    }

    // ATR / ADX — computed here so their latest reading can be shown as a readout inside the chart.
    const atrSeries = atr(candles, 14);
    const latestAtr = atrSeries.length ? atrSeries[atrSeries.length - 1] : NaN;
    const adxReading = calcAdx(candles, 14);
    setAtrAdx({
      atr: Number.isFinite(latestAtr) ? latestAtr : null,
      adx: adxReading ? adxReading.adx : null,
      plusDI: adxReading ? adxReading.plusDI : null,
      minusDI: adxReading ? adxReading.minusDI : null,
    });

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Apply overlay visibility toggles without recomputing/reseeding data.
  useEffect(() => {
    sma20Ref.current?.applyOptions({ visible: overlays.sma });
    sma50Ref.current?.applyOptions({ visible: overlays.sma });
    vwapRef.current?.applyOptions({ visible: overlays.vwap });
    bbUpperRef.current?.applyOptions({ visible: overlays.bollinger });
    bbLowerRef.current?.applyOptions({ visible: overlays.bollinger });
    ichimokuARef.current?.applyOptions({ visible: overlays.ichimoku });
    ichimokuBRef.current?.applyOptions({ visible: overlays.ichimoku });
    supertrendRef.current?.applyOptions({ visible: overlays.supertrend });
  }, [overlays]);

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
      {!compact && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-line bg-bg/80 px-2 py-1 text-[10px] backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              wsStatus === "live" ? "bg-up animate-pulseGlow" : wsStatus === "connecting" ? "bg-amber animate-pulse" : "bg-ink-faint"
            }`}
          />
          <span className="text-ink-faint">{wsStatus === "live" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Offline"}</span>
        </div>
      )}

      {/* Overlay toggles — merge EMA/SMA/VWAP/Bollinger/Ichimoku/Supertrend into the SAME chart instead of separate widgets. EMA stays always-on (unchanged prior behavior); the rest are opt-in so the chart doesn't get crowded by default. Hidden entirely in compact mode — no room for a chip row on a ~180px card, and IndicatorsSuitePanel below already covers the readouts. */}
      {!compact && (
        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
          <span className="rounded-full border border-signal/40 bg-bg/80 px-2 py-0.5 text-[9px] font-medium text-signal-glow backdrop-blur">EMA</span>
          {OVERLAY_DEFS.map((o) => (
            <button
              key={o.key}
              onClick={() => toggleOverlay(o.key)}
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[9px] font-medium backdrop-blur transition-colors",
                overlays[o.key] ? "border-white/30 bg-bg/90 text-ink" : "border-line/60 bg-bg/60 text-ink-faint hover:text-ink-muted"
              )}
              style={overlays[o.key] ? { color: o.color, borderColor: `${o.color}66` } : undefined}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ height }} className="w-full" />

      {/* ATR/ADX readout — oscillators can't be overlaid as price lines, so shown as compact text inside the chart per the required layout (all 8 indicators live inside this same chart card). Hidden in compact mode for the same crowding reason as the toggle chips. */}
      {!compact && (
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-md border border-line bg-bg/80 px-2 py-1 text-[9px] backdrop-blur">
          <span className="text-ink-faint">
            ATR(14) <span className="mono-num font-semibold text-amber">{atrAdx.atr !== null ? atrAdx.atr.toFixed(2) : "—"}</span>
          </span>
          <span className="h-2.5 w-px bg-line" />
          <span className="text-ink-faint">
            ADX(14) <span className="mono-num font-semibold text-ink">{atrAdx.adx !== null ? atrAdx.adx.toFixed(1) : "—"}</span>
            {atrAdx.plusDI !== null && atrAdx.minusDI !== null && (
              <>
                {" "}
                <span className="text-up">+DI {atrAdx.plusDI.toFixed(1)}</span> <span className="text-down">-DI {atrAdx.minusDI.toFixed(1)}</span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
