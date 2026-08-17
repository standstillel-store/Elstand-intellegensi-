"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import { buildLiquidityVolumeMap, buildLiquidityMapFromSnapshots, type LiquidityVolumeMap } from "@/lib/elvoid/liquidityVolumeMap";
import type { StoredLiquiditySnapshot } from "@/lib/marketHistory/store";
import { getLiquidityHistoryMs } from "@/lib/market-data/liquidityHistory";
import { formatUsd } from "@/lib/format";

type Source = "historical" | "live";

interface Level {
  price: number;
  qty: number;
}

interface Bucket {
  priceLow: number;
  priceHigh: number;
  qty: number;
}

interface BandLayout {
  y: number;
  h: number;
  color: string;
}

interface BubbleLayout {
  x: number;
  y: number;
  size: number;
  color: string;
  price: number;
  qty: number;
}

const PRICE_ROWS = 28; // live order-book bucket count — unchanged, live mode wasn't asked to change
const HIST_PRICE_ROWS = 36; // finer row count for historical mode only, for a smoother vertical gradient
const REFRESH_MS = 5000; // live-book poll interval, matches the depth endpoint's own 10s server-side cache
const ROLLING_WINDOW = 15; // candles of lookback per historical column — smooths the flow without blending unrelated eras together
const MIN_HISTORY_CANDLES = 10; // floor so a very sparse time-window still renders *something* real, never fabricated
// How many real, persisted order-book snapshots must fall inside the
// window before the chart trusts them enough to replace the candle-derived
// proxy. Snapshots are captured opportunistically (throttled, ~1 per 5min
// per symbol whenever the live order-book endpoint is hit — see
// persistLiquiditySnapshotThrottled), so freshly-added symbols/timeframes
// will genuinely have zero coverage at first; this is expected, not a bug,
// and the UI is honest about which source is actually showing.
const MIN_REAL_SNAPSHOTS = 5;

// Continuous 5-stop colormap — blue -> cyan -> green -> purple -> red,
// interpolated (not stepped), so intensity reads as a smooth density field
// instead of discrete colored blocks. Shared by both modes so the color
// language means the same thing everywhere. Driven purely by each cell's
// value relative to its own dataset's max — never random (rule 3 in the
// spec) — and color encodes intensity only, never a buy/sell signal.
const HEAT_STOPS: [number, number, number][] = [
  [37, 99, 235], // 0.00 blue
  [34, 211, 238], // 0.25 cyan
  [34, 197, 94], // 0.50 green
  [168, 85, 247], // 0.75 purple
  [239, 68, 68], // 1.00 red / magenta
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
  const alpha = Math.min(0.92, 0.04 + r * 0.72);
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
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [depthStatus, setDepthStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bands, setBands] = useState<BandLayout[]>([]);
  const [bubbles, setBubbles] = useState<BubbleLayout[]>([]);
  const [snapshots, setSnapshots] = useState<StoredLiquiditySnapshot[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<"loading" | "ready" | "error">("loading");

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

  // Real order-book depth — only polled in "live" mode. Binance exposes a
  // CURRENT depth snapshot only (no historical order-book REST endpoint),
  // so this is genuinely live, not a synthesized time series.
  useEffect(() => {
    if (source !== "live") return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/orderbook-depth?symbol=${symbol}&limit=50`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setDepthStatus("error");
          return;
        }
        setBids(data.bids ?? []);
        setAsks(data.asks ?? []);
        setDepthStatus("ready");
      } catch {
        if (!cancelled) setDepthStatus("error");
      }
    }
    setDepthStatus("loading");
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, source]);

  // Real, previously-persisted order-book snapshots for this symbol's
  // window — only fetched in historical mode. Separate network source from
  // candles/depth on purpose (see loadStoredLiquiditySnapshots), never
  // blended with the candle-derived proxy.
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

  // Real historical volume-at-price, windowed per the spec's timeframe
  // table. Pure client-side computation over candles already fetched above
  // — no extra network request.
  const windowedCandles = useMemo(() => sliceToHistoryWindow(candles, interval), [candles, interval]);
  // Prefer REAL order-book history once enough real snapshots exist for
  // this window (spec section G: never falsely label the proxy as real
  // order-book liquidity — so this only switches when there's genuinely
  // enough real coverage, not as soon as a single snapshot exists).
  const usingRealSnapshots = source === "historical" && snapshots.length >= MIN_REAL_SNAPSHOTS;
  const liquidityMap: LiquidityVolumeMap | null = useMemo(() => {
    if (source !== "historical") return null;
    if (usingRealSnapshots) return buildLiquidityMapFromSnapshots(snapshots, HIST_PRICE_ROWS);
    if (windowedCandles.length === 0) return null;
    return buildLiquidityVolumeMap(windowedCandles, HIST_PRICE_ROWS, ROLLING_WINDOW);
  }, [source, usingRealSnapshots, snapshots, windowedCandles]);

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
  // on screen matches what the heatmap actually covers); live mode keeps
  // the previous fit-everything-fetched behavior.
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

  // Recompute overlay pixel positions/canvas paint from the chart's own
  // price/time coordinate functions — same coordinate-sync approach as
  // Volume Profile/Footprint, so panning/zoom/resize never desyncs it.
  const recomputeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const containerHeight = containerRef.current?.clientHeight ?? height;
      if (!chart || !series) return;

      if (source === "historical") {
        setBands([]);
        setBubbles([]);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        if (!liquidityMap || liquidityMap.columns.length === 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.max(1, Math.round(containerWidth * dpr));
        const targetH = Math.max(1, Math.round(containerHeight * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        // Raw cells are drawn crisp onto a reused offscreen buffer first,
        // then composited onto the visible canvas through a single blurred
        // drawImage — a soft continuous field instead of hard rectangle
        // edges, without paying for thousands of individually-blurred
        // shapes (rule 5/10: fade boundaries, but stay mobile-cheap).
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
        // LOD: zoomed out enough that individual candle-columns would be
        // sub-pixel-thin anyway, so group several real columns into one
        // drawn block (summed, still real data) rather than overdrawing —
        // rule 10. Zoomed in, every column renders individually.
        const groupSize = barSpacing < 2.5 ? 4 : barSpacing < 4 ? 2 : 1;
        const colWidth = Math.max(2, barSpacing * groupSize);

        const peaks: { x: number; y: number; ratio: number; confidence: number }[] = [];

        for (let g = 0; g < liquidityMap.columns.length; g += groupSize) {
          const group = liquidityMap.columns.slice(g, g + groupSize);
          const anchor = group[group.length - 1];
          const xCoord = chart.timeScale().timeToCoordinate((anchor.time / 1000) as UTCTimestamp);
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
          // ramp uses, not placed randomly (rule 6).
          if (peakBin >= 0 && peakRatio >= 0.72 && binYs[peakBin]) {
            peaks.push({
              x,
              y: binYs[peakBin]!.top + binYs[peakBin]!.h / 2,
              ratio: peakRatio,
              confidence: Math.min(1, peakTouch / ROLLING_WINDOW), // real evidence count -> bubble opacity, per rule 6
            });
          }
        }

        // Composite the raw field through a soft blur — one filtered draw
        // call, not one blur per rectangle.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = `blur(${(2 * dpr).toFixed(1)}px)`;
        ctx.drawImage(off, 0, 0);
        ctx.filter = "none";

        // Bubbles drawn crisp on top, back in CSS-pixel coordinate space —
        // secondary to the field, never obscuring the candles above them.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const peak of peaks) {
          const { dot } = intensityColor(peak.ratio);
          ctx.beginPath();
          ctx.arc(peak.x, peak.y, 1.5 + (peak.ratio - 0.72) * 9, 0, Math.PI * 2);
          ctx.fillStyle = dot;
          ctx.globalAlpha = 0.5 + peak.confidence * 0.4;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        return;
      }

      // source === "live": clear the historical canvas, compute real-time bands/bubbles.
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (bids.length === 0 && asks.length === 0) {
        setBands([]);
        setBubbles([]);
        return;
      }

      const allLevels: (Level & { side: "bid" | "ask" })[] = [
        ...bids.map((b) => ({ ...b, side: "bid" as const })),
        ...asks.map((a) => ({ ...a, side: "ask" as const })),
      ];
      const minPrice = Math.min(...allLevels.map((l) => l.price));
      const maxPrice = Math.max(...allLevels.map((l) => l.price));
      if (!(maxPrice > minPrice)) {
        setBands([]);
        setBubbles([]);
        return;
      }

      const step = (maxPrice - minPrice) / PRICE_ROWS;
      const buckets: Bucket[] = Array.from({ length: PRICE_ROWS }, (_, i) => ({
        priceLow: minPrice + i * step,
        priceHigh: minPrice + (i + 1) * step,
        qty: 0,
      }));
      for (const level of allLevels) {
        let idx = Math.floor((level.price - minPrice) / step);
        idx = Math.max(0, Math.min(PRICE_ROWS - 1, idx));
        buckets[idx].qty += level.qty;
      }
      const maxBucketQty = Math.max(...buckets.map((b) => b.qty), 1e-9);

      const nextBands: BandLayout[] = buckets
        .filter((b) => b.qty > 0)
        .map((b) => {
          const yTop = series.priceToCoordinate(b.priceHigh);
          const yBottom = series.priceToCoordinate(b.priceLow);
          if (yTop === null || yBottom === null) return null;
          const { fill } = intensityColor(b.qty / maxBucketQty);
          return { y: Number(yTop), h: Math.max(2, Number(yBottom) - Number(yTop)), color: fill };
        })
        .filter((b): b is BandLayout => b !== null);
      setBands(nextBands);

      const avgQty = allLevels.reduce((s, l) => s + l.qty, 0) / (allLevels.length || 1);
      const wallThreshold = avgQty * 2.5;
      const significant = allLevels.filter((l) => l.qty >= wallThreshold);
      const maxQty = Math.max(...allLevels.map((l) => l.qty), 1e-9);

      const bubbleXs = [0.12, 0.32, 0.52, 0.72, 0.9].map((f) => f * containerWidth);
      const nextBubbles: BubbleLayout[] = [];
      significant.forEach((l, i) => {
        const yCoord = series.priceToCoordinate(l.price);
        if (yCoord === null) return;
        const ratio = l.qty / maxQty;
        const { dot } = intensityColor(ratio);
        nextBubbles.push({ x: bubbleXs[i % bubbleXs.length], y: Number(yCoord), size: 4 + ratio * 10, color: dot, price: l.price, qty: l.qty });
      });
      setBubbles(nextBubbles);
    };
    recomputeRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, asks, liquidityMap, source]);

  const status = candleStatus === "error" ? "error" : candleStatus === "loading" && candles.length === 0 ? "loading" : "ready";
  const historyLabel = formatHistoryLabel(getLiquidityHistoryMs(interval));
  const modeLabel =
    source === "historical"
      ? usingRealSnapshots
        ? `order book historis (real snapshot, ${snapshots.length}x) · window ${historyLabel}`
        : snapshotStatus === "loading"
          ? `proxy volume-at-price (dari candle) · mengecek snapshot real…`
          : `proxy volume-at-price (dari candle, bukan order-book asli) · window ${historyLabel}`
      : depthStatus === "error"
        ? "order book tidak tersedia"
        : depthStatus === "loading" && bids.length === 0
          ? "memuat order book…"
          : `live order book snapshot · refresh ${REFRESH_MS / 1000}s`;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      {/* Heatmap layer — sits BEHIND the candlestick canvas. The candle
          series background is transparent, so bands/canvas cells show
          through the gaps between candles while candle bodies still paint
          on top (z-order via DOM order, not opacity tricks). */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {bands.map((b, i) => (
          <div key={i} className="absolute inset-x-0" style={{ top: b.y, height: b.h, backgroundColor: b.color }} />
        ))}
        {bubbles.map((bub, i) => (
          <div
            key={i}
            title={`${formatUsd(bub.price)} · ${bub.qty.toFixed(3)} ${symbol}`}
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
