"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import type { FootprintCell } from "@/lib/elvoid/footprint";

interface CellLayout {
  candleTime: number;
  x: number;
  cells: { y: number; h: number; cell: FootprintCell }[];
}

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
  const [footprintByTime, setFootprintByTime] = useState<Record<number, { cells: FootprintCell[] }>>({});
  const [oldestTradeTime, setOldestTradeTime] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [layout, setLayout] = useState<CellLayout[]>([]);

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

    const recompute = () => recomputeLayoutRef.current?.();
    chart.timeScale().subscribeVisibleTimeRangeChange(recompute);
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      recompute();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(recompute);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Push real candle data into the chart.
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
    chartRef.current?.timeScale().fitContent();
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
      const barSpacing = chart.timeScale().options().barSpacing ?? 6;
      const next: CellLayout[] = [];
      for (const candle of candles) {
        const fp = footprintByTime[candle.time];
        if (!fp) continue;
        const xCoord = chart.timeScale().timeToCoordinate((candle.time / 1000) as UTCTimestamp);
        if (xCoord === null) continue;
        const x = Number(xCoord);
        const cells = fp.cells
          .map((cell) => {
            const yTop = series.priceToCoordinate(cell.priceHigh);
            const yBottom = series.priceToCoordinate(cell.priceLow);
            if (yTop === null || yBottom === null) return null;
            return { y: Number(yTop), h: Math.max(10, Number(yBottom) - Number(yTop)), cell };
          })
          .filter((c): c is { y: number; h: number; cell: FootprintCell } => c !== null);
        next.push({ candleTime: candle.time, x, cells });
      }
      setLayout(next);
      lastBarSpacingRef.current = barSpacing;
    };
    recomputeLayoutRef.current();
  }, [candles, footprintByTime]);

  const lastBarSpacingRef = useRef(6);
  const cellWidth = Math.max(34, lastBarSpacingRef.current * 5);

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
      <div className="pointer-events-none absolute inset-0">
        {layout.map((col) => (
          <div key={col.candleTime} className="absolute top-0" style={{ left: col.x - cellWidth / 2, width: cellWidth }}>
            {col.cells.map((c, i) => (
              <div
                key={i}
                className="absolute flex items-center justify-center gap-0.5 overflow-hidden rounded-[2px] text-[8px] font-mono leading-none"
                style={{ top: c.y, height: c.h, width: cellWidth }}
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
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-1 left-2 text-[9px] text-ink-faint">
        {oldestTradeTime
          ? `Footprint real sejak ${new Date(oldestTradeTime).toLocaleTimeString("id-ID")} (cakupan sample trade terkini)`
          : "Menunggu data trade…"}
      </div>
    </div>
  );
}
