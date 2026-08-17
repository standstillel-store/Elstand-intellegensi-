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

// Real executed-trade cluster from /api/liquidity-trades (aggTrades,
// server-side time x price bucketed — see that route's own comment for why
// clustering happens server-side). Never fabricated: qty/buyQty/sellQty are
// always real summed trade quantities.
interface TradeCluster {
  time: number; // ms epoch
  price: number;
  qty: number;
  buyQty: number;
  sellQty: number;
}

const ROLLING_WINDOW = 20; // candles of lookback per historical column, candle-proxy fallback only
const MIN_HISTORY_CANDLES = 10; // floor so a very sparse time-window still renders *something* real, never fabricated
// How many real, persisted+live order-book snapshots must fall inside the
// window before the chart trusts them enough to replace the candle-derived
// proxy. Snapshots accumulate continuously via the shared depth WebSocket
// (lib/elvoid/depthStream.ts) — see useLiveLiquiditySnapshots — so coverage
// grows as soon as ANY client has this symbol open.
const MIN_REAL_SNAPSHOTS = 5;

// Adaptive price-bin count (spec section 7 / 17): denser on a tall
// desktop panel, still readable on a short mobile card — computed from the
// actual rendered height instead of one hardcoded row count regardless of
// market/viewport.
function adaptivePriceRows(panelHeight: number): number {
  const target = Math.round(panelHeight / 6.5); // ~6.5px per row is the densest that stays legible
  return Math.max(36, Math.min(110, target));
}

// Continuous colormap — near-black -> deep blue -> cyan -> green -> yellow
// -> orange -> red, interpolated (not stepped), matching the reference's
// intensity hierarchy. Driven purely by each cell's normalized value —
// never random — color encodes liquidity intensity only, never a buy/sell
// signal (bid/ask direction is never re-labeled as executed volume).
const HEAT_STOPS: [number, number, number][] = [
  [4, 7, 16], // 0.00 near-black background
  [13, 30, 90], // 0.14 dark navy
  [30, 80, 200], // 0.28 deep blue
  [34, 170, 235], // 0.44 cyan-blue
  [45, 220, 200], // 0.56 cyan-green
  [80, 210, 90], // 0.68 green
  [230, 220, 60], // 0.8 yellow
  [250, 150, 30], // 0.9 orange
  [235, 40, 40], // 1.00 hot red
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
  const alpha = Math.min(0.97, 0.05 + r * 0.85);
  return { fill: `rgba(${red},${green},${blue},${alpha.toFixed(3)})`, dot: `rgb(${red},${green},${blue})` };
}

// Percentile-based, log-compressed normalization (spec section 4): a
// simple value/max ratio lets one extreme wall wash out the rest of the
// field. Using the real P95 of the dataset's own nonzero cells as the
// "reference strong level" instead of the true max keeps that one extreme
// print from flattening everything else's contrast, and log1p keeps a
// modest liquidity bump from reading as near-zero next to a true wall.
// This changes ONLY how a real value maps to a color — no value is
// invented, reordered, or removed.
function computeP95(map: LiquidityVolumeMap): number {
  const values: number[] = [];
  for (const col of map.columns) {
    for (const v of col.values) if (v > 0) values.push(v);
  }
  if (values.length === 0) return map.maxValue || 1e-9;
  values.sort((a, b) => a - b);
  const idx = Math.min(values.length - 1, Math.floor(values.length * 0.95));
  return Math.max(values[idx], 1e-9);
}

function normalizedRatio(value: number, p95Reference: number): number {
  if (value <= 0) return 0;
  const r = Math.log1p(value) / Math.log1p(p95Reference || value);
  return Math.max(0, Math.min(1, r));
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
// into one chronological series — the right edge of stored history flows
// straight into the live trail without a gap or a duplicate-timestamp seam.
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
  const [snapshots, setSnapshots] = useState<StoredLiquiditySnapshot[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tradeClusters, setTradeClusters] = useState<TradeCluster[]>([]);

  // Real, live order-book snapshots sampled every ~12s from the SHARED
  // depth WebSocket (lib/elvoid/depthStream.ts) — the same connection the
  // Order Book panel reads from. Always subscribed (both sub-modes) so
  // persistence/coverage keeps growing regardless of which tab is active,
  // and so Historical mode can merge in the freshest trail.
  const { buffer: liveBuffer, status: liveDepthStatus } = useLiveLiquiditySnapshots(symbol, true);

  const priceRows = useMemo(() => adaptivePriceRows(height), [height]);

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
  // candles on purpose, merged with the live buffer below.
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

  // Real executed-trade clusters (Binance aggTrades, server-clustered) for
  // the order-flow bubble overlay (spec section 9-12). Independent request
  // from Footprint's own aggTrades usage — this never touches
  // buildFootprintByCandle or Footprint's persistence, it's a separate
  // route/consumer of the same public Binance endpoint. Refreshed
  // periodically so live mode's bubble trail keeps moving.
  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`/api/liquidity-trades?symbol=${symbol}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data.clusters)) setTradeClusters(data.clusters);
        })
        .catch(() => {
          // best-effort overlay — heatmap still renders without bubbles
        });
    }
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  const windowedCandles = useMemo(() => sliceToHistoryWindow(candles, interval), [candles, interval]);

  // Merge DB history with the live trail, windowed to this timeframe's
  // history span.
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

  // REAL order-book data is preferred whenever there's enough coverage —
  // the candle-volume proxy is only ever the fallback, and the UI label
  // below always says which one is actually on screen (spec section 14).
  const liquidityMap: LiquidityVolumeMap | null = useMemo(() => {
    if (source === "live") {
      if (liveBuffer.length === 0) return null;
      return buildLiquidityMapFromSnapshots(liveBuffer, priceRows);
    }
    if (usingRealSnapshots) return buildLiquidityMapFromSnapshots(mergedHistorical, priceRows);
    if (windowedCandles.length === 0) return null;
    return buildLiquidityVolumeMap(windowedCandles, priceRows, ROLLING_WINDOW);
  }, [source, usingRealSnapshots, mergedHistorical, windowedCandles, liveBuffer, priceRows]);

  const p95Reference = useMemo(() => (liquidityMap ? computeP95(liquidityMap) : 1e-9), [liquidityMap]);

  // Mount the real candlestick chart once — identical setup to
  // ProfileEmbeddedChart/FootprintEmbeddedChart. Candle body/wick colors
  // use reduced alpha (spec section 8/13: "heatmap is the primary layer,
  // price is secondary") so the liquidity field underneath stays legible
  // through the candles instead of being hidden by opaque bodies.
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
      upColor: "rgba(34,197,94,0.55)",
      downColor: "rgba(239,68,68,0.55)",
      borderVisible: true,
      borderUpColor: "rgba(74,222,128,0.85)",
      borderDownColor: "rgba(248,113,113,0.85)",
      wickUpColor: "rgba(74,222,128,0.7)",
      wickDownColor: "rgba(248,113,113,0.7)",
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
  // historical mode zooms to roughly the spec's history window; live mode
  // fits everything fetched, since the live matrix rides on real time (ms)
  // that lands inside the same recent candles.
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

  // Single, shared matrix renderer for BOTH sub-modes (historical and
  // live) — pixel positions recomputed from the chart's own price/time
  // coordinate functions on every pan/zoom/resize, so the heatmap can
  // never drift from the candles. Compositing order: heatmap matrix (this
  // canvas, z-0, drawn first) -> liquidity-wall highlight cores (same
  // canvas) -> candles (chart's own canvas, z-10, painted by
  // lightweight-charts) -> trade-flow bubbles (this canvas again, drawn
  // LAST so they sit visually on top, still behind the DOM candle labels).
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

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(containerWidth * dpr));
      const targetH = Math.max(1, Math.round(containerHeight * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      if (!liquidityMap || liquidityMap.columns.length === 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
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
      const isSnapshotDriven = source === "live" || usingRealSnapshots;
      const groupSize = isSnapshotDriven ? 1 : barSpacing < 2.5 ? 4 : barSpacing < 4 ? 2 : 1;

      // x-coordinate for every column up front. For snapshot-driven data
      // this lets each column's fill WIDTH stretch to meet its neighbor —
      // spec section 5/6 ("persistent liquidity walls", "decay/
      // interpolation between snapshots"): a real value that's still the
      // same in the next real snapshot should read as one continuous band,
      // not a series of disconnected narrow strips. This only changes how
      // far an existing real value's rectangle extends on screen — no
      // price/liquidity value is invented between two snapshots.
      const columnXs: (number | null)[] = [];
      for (let g = 0; g < liquidityMap.columns.length; g += groupSize) {
        const group = liquidityMap.columns.slice(g, g + groupSize);
        const anchor = group[group.length - 1];
        const xCoord = chart.timeScale().timeToCoordinate(Math.floor(anchor.time / 1000) as UTCTimestamp);
        columnXs.push(xCoord === null ? null : Number(xCoord));
      }

      const peaks: { x: number; y: number; ratio: number }[] = [];
      let colIdx = 0;

      for (let g = 0; g < liquidityMap.columns.length; g += groupSize, colIdx++) {
        const group = liquidityMap.columns.slice(g, g + groupSize);
        const x = columnXs[colIdx];
        if (x === null) continue;

        let colWidth: number;
        if (isSnapshotDriven) {
          // Extend to the midpoint with the next real column (or to the
          // right edge for the newest column, so "now" reaches the live
          // edge of the chart rather than stopping short).
          let nextX: number | null = null;
          for (let n = colIdx + 1; n < columnXs.length; n++) {
            if (columnXs[n] !== null) {
              nextX = columnXs[n];
              break;
            }
          }
          const forwardSpan = nextX !== null ? nextX - x : Math.max(barSpacing * 1.4, containerWidth - x);
          colWidth = Math.max(6, Math.min(forwardSpan, containerWidth * 0.25));
        } else {
          colWidth = Math.max(2, barSpacing * groupSize);
        }
        if (x < -colWidth || x > containerWidth + colWidth) continue; // skip off-screen groups

        let peakRatio = 0;
        let peakBin = -1;
        for (let i = 0; i < liquidityMap.bins.length; i++) {
          let v = 0;
          for (const col of group) v += col.values[i];
          if (v <= 0) continue;
          const yInfo = binYs[i];
          if (!yInfo) continue;
          const ratio = normalizedRatio(v / group.length, p95Reference);
          offCtx.fillStyle = intensityColor(ratio).fill;
          // Snapshot-driven columns paint forward from x (continuous wall
          // fill toward the next real observation); the candle-proxy
          // fallback keeps its original centered strip.
          const drawX = isSnapshotDriven ? x : x - colWidth / 2;
          offCtx.fillRect(drawX, yInfo.top, colWidth + 0.5, yInfo.h);
          if (ratio > peakRatio) {
            peakRatio = ratio;
            peakBin = i;
          }
        }
        // Wall-highlight core: only the strongest cells (spec section 13 —
        // "bright core" for extreme liquidity), kept visually distinct
        // (small, no glow-dominant look) from the trade-flow bubbles drawn
        // afterward.
        if (peakBin >= 0 && peakRatio >= 0.82 && binYs[peakBin]) {
          peaks.push({ x: isSnapshotDriven ? x + colWidth / 2 : x, y: binYs[peakBin]!.top + binYs[peakBin]!.h / 2, ratio: peakRatio });
        }
      }

      // Composite the raw field through a soft blur — one filtered draw
      // call, not one blur per rectangle. Snapshot-driven matrices use a
      // lighter blur so real, distinct price levels stay legible.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = `blur(${((isSnapshotDriven ? 1 : 2) * dpr).toFixed(1)}px)`;
      ctx.drawImage(off, 0, 0);
      ctx.filter = "none";

      // Liquidity-wall highlight cores — crisp, small, on top of the blur.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const peak of peaks) {
        const { dot } = intensityColor(peak.ratio);
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, 1 + (peak.ratio - 0.82) * 7, 0, Math.PI * 2);
        ctx.fillStyle = dot;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Real executed-trade bubbles (spec section 9-12) — drawn LAST so
      // they sit visually on top of the liquidity field. Green = real net
      // aggressive buying in that cluster, red = real net aggressive
      // selling; size ~ sqrt(real qty), never a fixed/random size. Only
      // clusters whose real timestamp/price land inside the currently
      // visible chart area are drawn.
      if (tradeClusters.length > 0) {
        const maxClusterQty = Math.max(...tradeClusters.map((c) => c.qty), 1e-9);
        for (const c of tradeClusters) {
          const xCoord = chart.timeScale().timeToCoordinate(Math.floor(c.time / 1000) as UTCTimestamp);
          const yCoord = series.priceToCoordinate(c.price);
          if (xCoord === null || yCoord === null) continue;
          const x = Number(xCoord);
          const y = Number(yCoord);
          if (x < -20 || x > containerWidth + 20) continue;
          const sizeRatio = Math.sqrt(c.qty / maxClusterQty);
          const radius = Math.max(1.5, Math.min(11, 1.5 + sizeRatio * 9.5));
          const isBuyDominant = c.buyQty >= c.sellQty;
          const dominantFrac = c.qty > 0 ? Math.max(c.buyQty, c.sellQty) / c.qty : 0.5;
          const color = isBuyDominant ? "34,197,94" : "239,68,68";
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color},${(0.18 + dominantFrac * 0.32).toFixed(3)})`;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(${color},0.65)`;
          ctx.stroke();
        }
      }
    };
    recomputeRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liquidityMap, source, usingRealSnapshots, p95Reference, tradeClusters]);

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
      {/* Heatmap + bubble layer — sits BEHIND the candlestick canvas in DOM
          order (z-0 vs z-10), but is drawn to include the bubble layer on
          top of the matrix WITHIN this single canvas, so bubbles read as
          "on the liquidity field" rather than fighting the candle chart's
          own z-order. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
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
