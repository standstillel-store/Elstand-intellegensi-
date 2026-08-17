"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import { buildLiquidityVolumeMap, buildLiquidityMapFromSnapshots, type LiquidityVolumeMap } from "@/lib/elvoid/liquidityVolumeMap";
import type { StoredLiquiditySnapshot } from "@/lib/marketHistory/store";
import { getLiquidityHistoryMs } from "@/lib/market-data/liquidityHistory";
import { useLiveLiquiditySnapshots } from "@/lib/elvoid/useLiveLiquiditySnapshots";

type Source = "historical" | "live";

interface BubbleLayout {
  x: number;
  y: number;
  size: number;
  color: string;
  price: number;
  qty: number;
}

const HIST_PRICE_ROWS = 48; // price bin count for the historical (DB + live-merged) matrix
const LIVE_PRICE_ROWS = 40; // price bin count for the pure live rolling-buffer matrix
const ROLLING_WINDOW = 20; // candles of lookback per historical column, candle-proxy fallback only
const MIN_HISTORY_CANDLES = 10; // floor so a very sparse time-window still renders *something* real, never fabricated
// How many real, persisted+live order-book snapshots must fall inside the
// window before the chart trusts them enough to replace the candle-derived
// proxy. Snapshots now accumulate continuously via the shared depth
// WebSocket (lib/elvoid/depthStream.ts) — see useLiveLiquiditySnapshots —
// so coverage grows as soon as ANY client has this symbol open, not only
// when someone opens the Live Book tab.
const MIN_REAL_SNAPSHOTS = 5;

// Continuous colormap — near-black -> deep blue -> cyan -> green -> yellow
// -> orange -> red, interpolated (not stepped), matching the reference
// screenshots' stronger intensity hierarchy (spec section 8/9). Driven
// purely by each cell's value relative to its own dataset's max — never
// random — and color encodes liquidity intensity only, never a buy/sell
// signal.
const HEAT_STOPS: [number, number, number][] = [
  [6, 10, 20], // 0.00 near-black background
  [20, 45, 120], // 0.15 deep blue
  [37, 99, 235], // 0.32 blue
  [34, 211, 238], // 0.5 cyan
  [34, 197, 94], // 0.65 green
  [250, 204, 21], // 0.8 yellow
  [249, 115, 22], // 0.9 orange
  [239, 68, 68], // 1.00 red
];

function heatRgb(ratio: number): [number, number, number] {
  const r = Math.max(0, Math.min(1, ratio));
  const segments = HEAT_STOPS.length - 1;
  const scaled = r * segments;
  const idx = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - idx;
  const [r1, g1, b1] = HEAT_STOPS[idx];
  const [r2, g2, b2] = HEAT_STOPS[idx + 1];
  return [Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t)];
}

function intensityColor(ratio: number): { fill: string; dot: string } {
  const r = Math.max(0, Math.min(1, ratio));
  const [red, green, blue] = heatRgb(r);
  const alpha = Math.min(0.95, 0.06 + r * 0.75);
  return { fill: `rgba(${red},${green},${blue},${alpha.toFixed(3)})`, dot: `rgb(${red},${green},${blue})` };
}

function formatHistoryLabel(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return `${Math.round(hours)} jam`;
  return `${Math.round(hours / 24)} hari`;
}

// Real candles only — filters to the spec's timeframe->history window, with
// a floor so an unusually sparse window still shows genuine recent candles
// rather than rendering nothing.
function sliceToHistoryWindow(candles: Candle[], interval: string): Candle[] {
  if (candles.length === 0) return [];
  const windowMs = getLiquidityHistoryMs(interval);
  const lastTime = candles[candles.length - 1].time;
  const sliced = candles.filter((c) => c.time >= lastTime - windowMs);
  return sliced.length >= MIN_HISTORY_CANDLES ? sliced : candles.slice(-Math.min(candles.length, MIN_HISTORY_CANDLES));
}

// Merge real DB-persisted snapshots with the current live rolling buffer
// into one chronological series — spec section 12 ("live + historical
// continuity"): the right edge of stored history should flow straight into
// the live trail without a gap or a duplicate-timestamp seam.
function mergeSnapshots(stored: StoredLiquiditySnapshot[], live: StoredLiquiditySnapshot[]): StoredLiquiditySnapshot[] {
  const byTime = new Map<number, StoredLiquiditySnapshot>();
  for (const s of stored) byTime.set(s.timestamp, s);
  for (const s of live) byTime.set(s.timestamp, s); // live wins on exact-timestamp collision (shouldn't happen in practice)
  return Array.from(byTime.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function LiquidityHeatmapEmbeddedChart({
  symbol,
  interval,
  height,
}: {
  symbol: string;
  interval: string;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null); // reused across redraws — raw cells drawn here first, then blur-composited onto canvasRef
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [source, setSource] = useState<Source>("historical");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleStatus, setCandleStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bubbles, setBubbles] = useState<BubbleLayout[]>([]);
  const [snapshots, setSnapshots] = useState<StoredLiquiditySnapshot[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "ready" | "error">("loading");

  // Real, live order-book snapshots sampled every ~12s from the SHARED
  // depth WebSocket (lib/elvoid/depthStream.ts) — the same connection the
  // Order Book panel reads from (spec section 1). Always subscribed
  // (both Historical and Live sub-modes) so persistence/coverage keeps
  // growing regardless of which sub-tab is active, and so Historical mode
  // can merge in the freshest trail (spec section 12).
  const { buffer: liveBuffer, status: liveDepthStatus } = useLiveLiquiditySnapshots(symbol, true);

  // Real candles — same /api/klines source every other embedded mode uses.
  useEffect(() => {
    let cancelled = false;
    setCandleStatus("loading");
    fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=150`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.candles)) {
          setCandleStatus("error");
          return;
        }
        setCandles(data.candles);
        setCandleStatus("ready");
      })
      .catch(() => !cancelled && setCandleStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  // Real, previously-persisted order-book snapshots for this symbol's
  // window — only fetched in historical mode. Separate network source from
  // candles on purpose (see loadStoredLiquiditySnapshots), merged with the
  // live buffer below rather than blended into the candle-derived proxy.
  useEffect(() => {
    if (source !== "historical") return;
    let cancelled = false;
    setSnapshotStatus("loading");
    fetch(`/api/liquidity-history?symbol=${symbol}&interval=${interval}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.snapshots)) {
          setSnapshotStatus("error");
          return;
        }
        setSnapshots(data.snapshots);
        setSnapshotStatus("ready");
      })
      .catch(() => !cancelled && setSnapshotStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, source]);

  const windowedCandles = useMemo(() => sliceToHistoryWindow(candles, interval), [candles, interval]);

  // Merge DB history with the live trail (spec section 12), windowed to
  // this timeframe's history span.
  const mergedHistorical = useMemo(() => {
    if (source !== "historical") return [];
    const windowMs = getLiquidityHistoryMs(interval);
    const cutoff = Date.now() - windowMs;
    return mergeSnapshots(
      snapshots.filter((s) => s.timestamp >= cutoff),
      liveBuffer
    );
  }, [source, snapshots, liveBuffer, interval]);

  const usingRealSnapshots = source === "historical" && mergedHistorical.length >= MIN_REAL_SNAPSHOTS;

  const liquidityMap: LiquidityVolumeMap | null = useMemo(() => {
    if (source === "live") {
      if (liveBuffer.length === 0) return null;
      return buildLiquidityMapFromSnapshots(liveBuffer, LIVE_PRICE_ROWS);
    }
    if (usingRealSnapshots) return buildLiquidityMapFromSnapshots(mergedHistorical, HIST_PRICE_ROWS);
    if (windowedCandles.length === 0) return null;
    return buildLiquidityVolumeMap(windowedCandles, HIST_PRICE_ROWS, ROLLING_WINDOW);
  }, [source, usingRealSnapshots, mergedHistorical, windowedCandles, liveBuffer]);

  // Mount the real candlestick chart once — identical setup to
  // ProfileEmbeddedChart/FootprintEmbeddedChart so it behaves consistently.
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
    const series = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    seriesRef.current = series;

    let rafId: number | null = null;
    const scheduleRecompute = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputeRef.current?.();
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRecompute);
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      scheduleRecompute();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRecompute);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Push real candle data in, and pick the default visible range: the
  // historical mode zooms to roughly the spec's history window (so what's
  // on screen matches what the heatmap actually covers); live mode fits
  // everything fetched, since the live matrix rides on real time (ms) that
  // lands inside the same recent candles.
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: (c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    if (source === "historical") {
      const visibleCount = Math.min(candles.length, Math.max(MIN_HISTORY_CANDLES, windowedCandles.length));
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: candles.length - visibleCount - 1, to: candles.length + 1 });
    } else {
      chartRef.current?.timeScale().fitContent();
    }
    recomputeRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, source]);

  // Single, shared matrix renderer for BOTH sub-modes — historical (DB +
  // live-merged real snapshots, or candle-proxy fallback) and live (pure
  // rolling buffer). Same coordinate-sync approach as Volume Profile /
  // Footprint: pixel positions are recomputed from the chart's own
  // price/time coordinate functions on every pan/zoom/resize, so the
  // heatmap can never drift from the candles (spec section 11).
  const recomputeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const containerHeight = containerRef.current?.clientHeight ?? height;
      if (!chart || !series) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (!liquidityMap || liquidityMap.columns.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setBubbles([]);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(containerWidth * dpr));
      const targetH = Math.max(1, Math.round(containerHeight * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      // Raw cells drawn crisp onto a reused offscreen buffer first, then
      // composited onto the visible canvas through one blurred drawImage —
      // a soft continuous field instead of hard rectangle edges, without
      // paying for thousands of individually-blurred shapes.
      if (!offscreenCanvasRef.current) offscreenCanvasRef.current = document.createElement("canvas");
      const off = offscreenCanvasRef.current;
      if (off.width !== targetW || off.height !== targetH) {
        off.width = targetW;
        off.height = targetH;
      }
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.clearRect(0, 0, containerWidth, containerHeight);

      // Bin y-spans are shared by every column (fixed price boundaries),
      // so compute them once per redraw instead of per column.
      const binYs = liquidityMap.bins.map((bin) => {
        const yTop = series.priceToCoordinate(bin.priceHigh);
        const yBottom = series.priceToCoordinate(bin.priceLow);
        if (yTop === null || yBottom === null) return null;
        return { top: Number(yTop), h: Math.max(1, Number(yBottom) - Number(yTop)) };
      });

      const barSpacing = chart.timeScale().options().barSpacing ?? 6;
      // For the snapshot-driven matrices (real order-book columns, one per
      // captured timestamp — both historical-real and live), each column
      // is drawn as a fixed-width strip anchored at its own real
      // timestamp's x-coordinate, wide enough to stay visible even when
      // there are few snapshots yet (e.g. right after a symbol switch).
      // For the candle-proxy fallback, columns line up 1:1 with candles
      // and use the existing LOD grouping so dense candle counts don't
      // overdraw.
      const isSnapshotDriven = source === "live" || usingRealSnapshots;
      const groupSize = isSnapshotDriven ? 1 : barSpacing < 2.5 ? 4 : barSpacing < 4 ? 2 : 1;
      const colWidth = isSnapshotDriven ? Math.max(10, barSpacing * 1.4) : Math.max(2, barSpacing * groupSize);

      const peaks: { x: number; y: number; ratio: number; confidence: number }[] = [];

      for (let g = 0; g < liquidityMap.columns.length; g += groupSize) {
        const group = liquidityMap.columns.slice(g, g + groupSize);
        const anchor = group[group.length - 1];
        const xCoord = chart.timeScale().timeToCoordinate((Math.floor(anchor.time / 1000)) as UTCTimestamp);
        if (xCoord === null) continue;
        const x = Number(xCoord);
        if (x < -colWidth || x > containerWidth + colWidth) continue; // skip off-screen groups

        let peakRatio = 0;
        let peakBin = -1;
        let peakTouch = 0;
        for (let i = 0; i < liquidityMap.bins.length; i++) {
          let v = 0;
          for (const col of group) v += col.values[i];
          if (v <= 0) continue;
          const yInfo = binYs[i];
          if (!yInfo) continue;
          const ratio = v / (liquidityMap.maxValue * group.length);
          offCtx.fillStyle = intensityColor(ratio).fill;
          offCtx.fillRect(x - colWidth / 2, yInfo.top, colWidth + 0.5, yInfo.h);
          if (ratio > peakRatio) {
            peakRatio = ratio;
            peakBin = i;
            peakTouch = group.reduce((s, c) => s + c.touch[i], 0) / group.length;
          }
        }
        // One bubble candidate per column-group, kept only if it clears
        // the "very high/extreme" tier — same real threshold the color
        // ramp uses, not placed randomly.
        if (peakBin >= 0 && peakRatio >= 0.72 && binYs[peakBin]) {
          peaks.push({
            x,
            y: binYs[peakBin]!.top + binYs[peakBin]!.h / 2,
            ratio: peakRatio,
            confidence: isSnapshotDriven ? 1 : Math.min(1, peakTouch / ROLLING_WINDOW),
          });
        }
      }

      // Composite the raw field through a soft blur — one filtered draw
      // call, not one blur per rectangle. Snapshot-driven matrices use a
      // lighter blur so real, distinct price levels stay legible instead
      // of smearing together (spec section 8: "avoid excessive blur that
      // destroys price-level information").
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = `blur(${((isSnapshotDriven ? 1.2 : 2) * dpr).toFixed(1)}px)`;
      ctx.drawImage(off, 0, 0);
      ctx.filter = "none";

      // Bubbles drawn crisp on top, back in CSS-pixel coordinate space —
      // secondary to the field, never obscuring the candles above them.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nextBubbles: BubbleLayout[] = peaks.map((peak) => ({
        x: peak.x,
        y: peak.y,
        size: 3 + (peak.ratio - 0.72) * 18,
        color: intensityColor(peak.ratio).dot,
        price: 0,
        qty: 0,
      }));
      for (const peak of peaks) {
        const { dot } = intensityColor(peak.ratio);
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, 1.5 + (peak.ratio - 0.72) * 9, 0, Math.PI * 2);
        ctx.fillStyle = dot;
        ctx.globalAlpha = 0.5 + peak.confidence * 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      setBubbles(nextBubbles);
    };
    recomputeRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liquidityMap, source, usingRealSnapshots]);

  const status = candleStatus === "error" ? "error" : candleStatus === "loading" && candles.length === 0 ? "loading" : "ready";
  const historyLabel = formatHistoryLabel(getLiquidityHistoryMs(interval));
  const modeLabel =
    source === "historical"
      ? usingRealSnapshots
        ? `order book historis (real snapshot, ${mergedHistorical.length}x) · window ${historyLabel}`
        : snapshotStatus === "loading"
          ? `proxy volume-at-price (dari candle) · mengecek snapshot real…`
          : `proxy volume-at-price (dari candle, bukan order-book asli) · window ${historyLabel}`
      : liveDepthStatus === "error"
        ? "order book tidak tersedia"
        : liveBuffer.length === 0
          ? "memuat order book live…"
          : `live order book · ${liveBuffer.length} snapshot · sampling 12s`;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      {/* Heatmap layer — sits BEHIND the candlestick canvas. The candle
          series background is transparent, so the heatmap shows through
          the gaps between candles while candle bodies still paint on top
          (z-order via DOM order, not opacity tricks). */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {bubbles.map((bub, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: bub.x, top: bub.y, width: bub.size, height: bub.size, backgroundColor: bub.color, opacity: 0.85, boxShadow: `0 0 ${bub.size}px ${bub.color}` }}
          />
        ))}
      </div>

      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 z-20 flex animate-pulse items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Memuat candle {symbol}/USDT…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Data candle tidak tersedia saat ini.
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col items-start gap-1">
        <div className="pointer-events-auto flex overflow-hidden rounded border border-line text-[9px] font-semibold">
          <button
            type="button"
            onClick={() => setSource("historical")}
            className={clsx("px-2 py-1 transition-colors", source === "historical" ? "bg-signal-glow/25 text-ink" : "bg-bg-raised/90 text-ink-faint")}
          >
            Historis
          </button>
          <button
            type="button"
            onClick={() => setSource("live")}
            className={clsx("px-2 py-1 transition-colors", source === "live" ? "bg-signal-glow/25 text-ink" : "bg-bg-raised/90 text-ink-faint")}
          >
            Live Book
          </button>
        </div>
        <div className="rounded bg-bg-raised/90 px-2 py-1">
          <p className="text-[10px] font-semibold text-ink-muted">Liquidity Heatmap</p>
          <p className="mt-0.5 text-[9px] text-ink-faint">{modeLabel}</p>
        </div>
      </div>
    </div>
  );
}
