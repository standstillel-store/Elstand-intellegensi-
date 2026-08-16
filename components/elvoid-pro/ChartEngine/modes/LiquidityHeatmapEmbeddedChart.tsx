"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import { formatUsd } from "@/lib/format";

interface Level {
  price: number;
  qty: number;
}

interface Bucket {
  priceLow: number;
  priceHigh: number;
  qty: number;
  side: "bid" | "ask" | "mixed";
}

interface BandLayout {
  y: number;
  h: number;
  intensity: number; // 0..1, relative to the snapshot's own max bucket
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

const BUCKET_COUNT = 28; // enough rows to look like a heatmap gradient, not discrete lines
const REFRESH_MS = 5000; // matches the depth endpoint's own 10s server-side cache, avoids hammering it

// Five-level intensity ramp, driven purely by each bucket's qty relative to
// the snapshot's own max — never assigned randomly (rule 3 in the spec).
function intensityColor(ratio: number): { fill: string; dot: string } {
  if (ratio < 0.12) return { fill: `rgba(120,120,140,${0.03 + ratio * 0.25})`, dot: "#6b7280" };
  if (ratio < 0.32) return { fill: `rgba(168,85,247,${0.08 + ratio * 0.35})`, dot: "#a855f7" }; // purple — medium
  if (ratio < 0.52) return { fill: `rgba(59,130,246,${0.1 + ratio * 0.4})`, dot: "#3b82f6" }; // blue — medium/high
  if (ratio < 0.72) return { fill: `rgba(34,197,94,${0.12 + ratio * 0.42})`, dot: "#22c55e" }; // green — high
  if (ratio < 0.88) return { fill: `rgba(234,179,8,${0.14 + ratio * 0.45})`, dot: "#eab308" }; // yellow — very high
  return { fill: `rgba(239,68,68,${0.16 + ratio * 0.48})`, dot: "#ef4444" }; // red — extreme
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
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);
  const [candleStatus, setCandleStatus] = useState<"loading" | "ready" | "error">("loading");
  const [depthStatus, setDepthStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bands, setBands] = useState<BandLayout[]>([]);
  const [bubbles, setBubbles] = useState<BubbleLayout[]>([]);

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

  // Real order-book depth — the same public endpoint LiquidityMode uses.
  // Binance only exposes a CURRENT depth snapshot (no historical order-book
  // REST endpoint), so this polls the live book rather than pretending to
  // have a time-series of past liquidity.
  useEffect(() => {
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
  }, [symbol]);

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

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: (c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    chartRef.current?.timeScale().fitContent();
    recomputeRef.current?.();
  }, [candles]);

  // Recompute band + bubble pixel positions from the chart's own
  // price/time coordinate functions — same coordinate-sync approach as
  // Volume Profile/Footprint, so panning/zoom/resize never desyncs it.
  const recomputeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      if (!chart || !series || (bids.length === 0 && asks.length === 0)) {
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

      // Bucket real levels into evenly-spaced price bins across the
      // snapshot's own price range — real qty summed per bin, nothing invented.
      const step = (maxPrice - minPrice) / BUCKET_COUNT;
      const buckets: Bucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
        priceLow: minPrice + i * step,
        priceHigh: minPrice + (i + 1) * step,
        qty: 0,
        side: "mixed",
      }));
      for (const level of allLevels) {
        let idx = Math.floor((level.price - minPrice) / step);
        idx = Math.max(0, Math.min(BUCKET_COUNT - 1, idx));
        buckets[idx].qty += level.qty;
      }
      const maxBucketQty = Math.max(...buckets.map((b) => b.qty), 1e-9);

      const nextBands: BandLayout[] = buckets
        .filter((b) => b.qty > 0)
        .map((b) => {
          const yTop = series.priceToCoordinate(b.priceHigh);
          const yBottom = series.priceToCoordinate(b.priceLow);
          if (yTop === null || yBottom === null) return null;
          const ratio = b.qty / maxBucketQty;
          const { fill } = intensityColor(ratio);
          return { y: Number(yTop), h: Math.max(2, Number(yBottom) - Number(yTop)), intensity: ratio, color: fill };
        })
        .filter((b): b is BandLayout => b !== null);
      setBands(nextBands);

      // Bubbles/markers only on genuinely significant levels — same "wall"
      // definition as LiquidityMode: size well above this book's own average.
      const avgQty = allLevels.reduce((s, l) => s + l.qty, 0) / (allLevels.length || 1);
      const wallThreshold = avgQty * 2.5;
      const significant = allLevels.filter((l) => l.qty >= wallThreshold);
      const maxQty = Math.max(...allLevels.map((l) => l.qty), 1e-9);

      // Scatter each significant level across a few x positions within the
      // visible time range (never off the real price coordinate) so it
      // reads as a heatmap cluster rather than a single edge marker — this
      // is a live snapshot, not per-candle history, so the same current
      // level is honestly shown spanning the visible width.
      const bubbleXs = [0.12, 0.32, 0.52, 0.72, 0.9].map((f) => f * containerWidth);
      const nextBubbles: BubbleLayout[] = [];
      significant.forEach((l, i) => {
        const yCoord = series.priceToCoordinate(l.price);
        if (yCoord === null) return;
        const ratio = l.qty / maxQty;
        const { dot } = intensityColor(ratio);
        const size = 4 + ratio * 10;
        const x = bubbleXs[i % bubbleXs.length];
        nextBubbles.push({ x, y: Number(yCoord), size, color: dot, price: l.price, qty: l.qty });
      });
      setBubbles(nextBubbles);
    };
    recomputeRef.current();
  }, [bids, asks]);

  const status = candleStatus === "error" ? "error" : candleStatus === "loading" && candles.length === 0 ? "loading" : "ready";
  const depthLabel = depthStatus === "error" ? "order book tidak tersedia" : depthStatus === "loading" && bids.length === 0 ? "memuat order book…" : "live order book snapshot";

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      {/* Heatmap layer — sits BEHIND the candlestick canvas. The candle
          series background is transparent, so bands/bubbles show through
          the gaps between candles while the candle bodies still paint on
          top of them (z-order via DOM order, not opacity tricks). */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {bands.map((b, i) => (
          <div key={i} className="absolute inset-x-0" style={{ top: b.y, height: b.h, backgroundColor: b.color }} />
        ))}
        {bubbles.map((bub, i) => (
          <div
            key={i}
            title={`${formatUsd(bub.price)} · ${bub.qty.toFixed(3)} ${symbol}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: bub.x,
              top: bub.y,
              width: bub.size,
              height: bub.size,
              backgroundColor: bub.color,
              opacity: 0.85,
              boxShadow: `0 0 ${bub.size}px ${bub.color}`,
            }}
          />
        ))}
      </div>

      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 z-20 flex animate-pulse items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Memuat candle & order book {symbol}/USDT…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Data candle tidak tersedia saat ini.
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-bg-raised/90 px-2 py-1 text-[10px]">
        <p className="font-semibold text-ink-muted">Liquidity Heatmap</p>
        <p className="mt-0.5 text-[9px] text-ink-faint">{depthLabel} · refresh {REFRESH_MS / 1000}s</p>
      </div>
    </div>
  );
}
