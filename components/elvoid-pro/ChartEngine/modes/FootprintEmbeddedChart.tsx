"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import type { FootprintCell } from "@/lib/elvoid/footprint";

interface CellLayout {
  candleTime: number;
  x: number;
  cells: { y: number; h: number; cell: FootprintCell; isPoc: boolean }[];
  delta: number;
}

// Below this many pixels between candles there isn't room to render two
// legible numbers per cell — Kiyotaka/TapeDelta both hide the footprint
// grid at that zoom level too and just show plain candles instead of
// squishing unreadable text (that squish is what was reading as "buggy").
const MIN_BAR_SPACING_FOR_FOOTPRINT = 20;

export function FootprintEmbeddedChart({
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
  const [footprintByTime, setFootprintByTime] = useState<Record<number, { cells: FootprintCell[]; poc: FootprintCell | null; delta: number }>>({});
  const [oldestTradeTime, setOldestTradeTime] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [layout, setLayout] = useState<CellLayout[]>([]);
  const [barSpacing, setBarSpacing] = useState(6);

  // Fetch real candles + real per-candle footprint together.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/footprint-candles?symbol=${symbol}&interval=${interval}&limit=80`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.candles)) {
          setStatus("error");
          return;
        }
        setCandles(data.candles);
        setFootprintByTime(data.footprintByTime ?? {});
        setOldestTradeTime(data.oldestTradeTime ?? null);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    const id = setInterval(() => {
      fetch(`/api/footprint-candles?symbol=${symbol}&interval=${interval}&limit=80`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || data.error) return;
          setCandles(data.candles);
          setFootprintByTime(data.footprintByTime ?? {});
          setOldestTradeTime(data.oldestTradeTime ?? null);
        })
        .catch(() => {});
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval]);

  // Mount the real candlestick chart once.
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

    // rAF-throttled — subscribeVisibleLogicalRangeChange fires on every
    // frame of a pinch/drag, so recomputing synchronously each time is what
    // made panning feel stiff. One pending frame at a time keeps it smooth.
    let rafId: number | null = null;
    const scheduleRecompute = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputeLayoutRef.current?.();
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

  // Push real candle data into the chart. Default view is zoomed to the
  // most recent ~24 candles (not fitContent's full 80) so the footprint
  // grid is already visible on load instead of requiring the user to zoom
  // in first — matching how Kiyotaka/TapeDelta default their footprint view.
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    const total = candles.length;
    // Sized so a typical ~380px mobile chart width still clears
    // MIN_BAR_SPACING_FOR_FOOTPRINT by default (380 / 14 ≈ 27px/candle) —
    // previously defaulted to 24 candles, which on a phone-width chart
    // landed *below* the threshold, so footprint never showed even after
    // the user manually zoomed in further.
    const visibleCount = Math.min(14, total);
    chartRef.current?.timeScale().setVisibleLogicalRange({ from: total - visibleCount - 1, to: total + 1 });
    recomputeLayoutRef.current?.();
  }, [candles]);

  // Recompute overlay pixel positions from the chart's own coordinate
  // functions — this is what actually syncs the footprint cells to the
  // real candle positions (price scale + time scale), not guesswork.
  const recomputeLayoutRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeLayoutRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const currentBarSpacing = chart.timeScale().options().barSpacing ?? 6;
      setBarSpacing(currentBarSpacing);

      if (currentBarSpacing < MIN_BAR_SPACING_FOR_FOOTPRINT) {
        setLayout([]);
        return;
      }

      const next: CellLayout[] = [];
      for (const candle of candles) {
        const fp = footprintByTime[candle.time];
        if (!fp) continue;
        const xCoord = chart.timeScale().timeToCoordinate((candle.time / 1000) as UTCTimestamp);
        if (xCoord === null) continue;
        const x = Number(xCoord);
        if (x < -60 || x > containerWidth + 60) continue; // skip off-screen candles
        const cells = fp.cells
          .map((cell) => {
            const yTop = series.priceToCoordinate(cell.priceHigh);
            const yBottom = series.priceToCoordinate(cell.priceLow);
            if (yTop === null || yBottom === null) return null;
            const isPoc = fp.poc !== null && fp.poc.priceLow === cell.priceLow && fp.poc.priceHigh === cell.priceHigh;
            return { y: Number(yTop), h: Math.max(10, Number(yBottom) - Number(yTop)), cell, isPoc };
          })
          .filter((c): c is { y: number; h: number; cell: FootprintCell; isPoc: boolean } => c !== null);
        next.push({ candleTime: candle.time, x, cells, delta: fp.delta ?? 0 });
      }
      setLayout(next);
    };
    recomputeLayoutRef.current();
  }, [candles, footprintByTime]);

  const cellWidth = Math.min(64, Math.max(30, barSpacing * 0.92));
  const zoomedOut = barSpacing < MIN_BAR_SPACING_FOR_FOOTPRINT;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      <div ref={containerRef} className="h-full w-full" />

      {status === "loading" && candles.length === 0 && (
        <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Membaca trade tape & candle {symbol}/USDT…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Footprint tidak tersedia saat ini.
        </div>
      )}

      {/* Overlay layer — pure positioning, no chart logic; real coordinates come from lightweight-charts itself. */}
      {!zoomedOut && (
        <div className="pointer-events-none absolute inset-0">
          {layout.map((col) => (
            <div key={col.candleTime} className="absolute top-0" style={{ left: col.x - cellWidth / 2, width: cellWidth }}>
              {col.cells.map((c, i) => (
                <div
                  key={i}
                  className={clsx(
                    "absolute flex items-center justify-center gap-0.5 overflow-hidden rounded-[2px] text-[8px] font-mono font-semibold leading-none text-white",
                    // POC: this candle's highest-volume price level — subtle purple
                    // outline so it reads as "the level that mattered" without a
                    // large label per rule 10 ("only show labels when useful").
                    c.isPoc && "ring-1 ring-inset ring-[#A78BFA]",
                    // Bid/Ask imbalance (3x+ stacked dominance, computed in
                    // lib/elvoid/footprint.ts) — a brighter glow, never a signal claim.
                    c.cell.imbalance && "shadow-[0_0_0_1px_rgba(250,204,21,0.55)_inset]"
                  )}
                  style={{ top: c.y, height: c.h, width: cellWidth }}
                  title={c.cell.imbalance ? "Bid/Ask Imbalance" : undefined}
                >
                  <span
                    className="flex h-full flex-1 items-center justify-center"
                    style={{ backgroundColor: `rgba(239,68,68,${Math.min(0.75, 0.15 + (c.cell.sellVolume / (c.cell.sellVolume + c.cell.buyVolume + 0.0001)) * 0.5)})` }}
                  >
                    {c.cell.sellVolume > 0.001 ? c.cell.sellVolume.toFixed(2) : ""}
                  </span>
                  <span
                    className="flex h-full flex-1 items-center justify-center"
                    style={{ backgroundColor: `rgba(34,197,94,${Math.min(0.75, 0.15 + (c.cell.buyVolume / (c.cell.sellVolume + c.cell.buyVolume + 0.0001)) * 0.5)})` }}
                  >
                    {c.cell.buyVolume > 0.001 ? c.cell.buyVolume.toFixed(2) : ""}
                  </span>
                </div>
              ))}

              {/* Candle-level delta badge, pinned just above the ladder top. */}
              {col.cells.length > 0 && (
                <div
                  className={clsx(
                    "absolute -translate-x-1/2 whitespace-nowrap rounded-[2px] px-1 text-[8px] font-mono font-bold leading-tight",
                    col.delta >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                  )}
                  style={{ left: cellWidth / 2, top: Math.min(...col.cells.map((c) => c.y)) - 12 }}
                >
                  {col.delta >= 0 ? "+" : ""}
                  {col.delta.toFixed(2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {zoomedOut && candles.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <span className="rounded bg-bg-raised/90 px-2 py-0.5 text-[9px] text-ink-faint">Zoom in untuk lihat footprint per-candle</span>
        </div>
      )}

      {!zoomedOut && oldestTradeTime && (
        <div className="pointer-events-none absolute bottom-1 left-2 rounded bg-bg-raised/80 px-1.5 py-0.5 text-[9px] text-ink-faint">
          Footprint sejak {new Date(oldestTradeTime).toLocaleTimeString("id-ID")}
        </div>
      )}
    </div>
  );
}
