"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/elvoid/types";
import type { FootprintCell } from "@/lib/elvoid/footprint";

interface CellLayout {
  candleTime: number;
  x: number;
  candleHalfWidth: number;
  cells: { y: number; h: number; cell: FootprintCell; isPoc: boolean }[];
  delta: number;
  totalVolume: number;
}

// Three detail tiers instead of a single on/off cutoff — this is what was
// previously collapsing the whole chart down to "2-3 meaningful candles":
// at the old fixed 20px threshold the ladder was either fully-detailed
// centered blocks (which overlapped neighboring candles once cellWidth
// approached barSpacing, visually fusing several candles into one blob) or
// completely invisible. These three tiers let the candle count stay high
// while the footprint gracefully loses detail instead of vanishing.
const LOD_FULL = 46; // enough horizontal room for two-column bid|ask text beside the candle
const LOD_MEDIUM = 20; // enough room for a colored intensity block, no text

// Target spacing used to pick how many candles to show by default. Chosen
// so the *default* view lands in the MEDIUM tier (colored ladder, no text)
// rather than FULL — matching rule 13: "the user controls detail through
// zoom", so the initial view favors showing more candles over full text.
const DEFAULT_TARGET_SPACING = 28;
const MIN_VISIBLE_CANDLES = 15;
const MAX_VISIBLE_CANDLES = 30;

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
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
  // "side": classic mode — ladder drawn in the gap beside each candle,
  // candle body stays fully opaque (spec's NORMAL mode).
  // "replace": spec section C's FOOTPRINT MODE — the real candle body/wick
  // is made transparent (still the same lightweight-charts series, still
  // the same real OHLC geometry as the X/Y anchor, just invisible) and the
  // ladder is drawn full-width centered on the candle's own x position, so
  // the footprint visually becomes the candle instead of sitting next to
  // it. Kept as in-component state (not a prop) so this mode is a
  // self-contained toggle the user controls directly on the chart, no
  // wiring needed from AdvancedChart's mode router.
  const [displayMode, setDisplayMode] = useState<"side" | "replace">("side");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [footprintByTime, setFootprintByTime] = useState<Record<number, { cells: FootprintCell[]; poc: FootprintCell | null; delta: number; totalVolume: number }>>({});
  const [oldestTradeTime, setOldestTradeTime] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [layout, setLayout] = useState<CellLayout[]>([]);
  const [barSpacing, setBarSpacing] = useState(6);

  // Fetch real candles + real per-candle footprint together.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/footprint-candles?symbol=${symbol}&interval=${interval}&limit=150`)
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
      fetch(`/api/footprint-candles?symbol=${symbol}&interval=${interval}&limit=150`)
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

  // Spec section C, FOOTPRINT MODE: candle body/wick becomes transparent so
  // the ladder reads as the candle itself instead of a decoration on top of
  // it. This only touches color — the series keeps computing real geometry
  // (open/high/low/close still drive the price scale and crosshair), it's
  // just not painted, which is why candleHalfWidth/priceToCoordinate below
  // stay correct anchors in both modes.
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.applyOptions(
      displayMode === "replace"
        ? { upColor: "transparent", downColor: "transparent", wickUpColor: "transparent", wickDownColor: "transparent", borderVisible: false }
        : { upColor: "#22C55E", downColor: "#EF4444", wickUpColor: "#22C55E", wickDownColor: "#EF4444", borderVisible: false }
    );
  }, [displayMode]);

  // Push real candle data into the chart. Default candle count is derived
  // from the container's actual pixel width (not a hardcoded 14) so a wide
  // desktop panel gets close to MAX_VISIBLE_CANDLES and a narrow phone
  // screen still clears MIN_VISIBLE_CANDLES — this is what keeps the chart
  // from ever visually collapsing to only a couple of candles on load.
  //
  // hasSetInitialRangeRef guards setVisibleLogicalRange so it only runs
  // ONCE per symbol/interval (on first data arrival), not on every 8s poll.
  // Previously this ran on every `candles` update — meaning every single
  // poll silently snapped the user's zoom/pan back to the default range,
  // which is what looked like the chart "flickering then disappearing"
  // whenever someone zoomed in and waited more than ~8 seconds.
  const hasSetInitialRangeRef = useRef(false);
  useEffect(() => {
    hasSetInitialRangeRef.current = false;
  }, [symbol, interval]);
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
    if (!hasSetInitialRangeRef.current) {
      hasSetInitialRangeRef.current = true;
      const total = candles.length;
      const containerWidth = containerRef.current?.clientWidth ?? 380;
      const byWidth = Math.round(containerWidth / DEFAULT_TARGET_SPACING);
      const visibleCount = Math.min(total, Math.max(MIN_VISIBLE_CANDLES, Math.min(MAX_VISIBLE_CANDLES, byWidth)));
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: total - visibleCount - 1, to: total + 1 });
    }
    recomputeLayoutRef.current?.();
  }, [candles]);

  // Recompute overlay pixel positions from the chart's own coordinate
  // functions — this is what actually syncs the footprint cells to the
  // real candle positions (price scale + time scale), not guesswork. Price
  // rows come from series.priceToCoordinate on the cell's real priceLow/
  // priceHigh, so panning/zooming re-derives them from the same transform
  // the candlestick series itself uses — they can't drift out of alignment.
  const recomputeLayoutRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeLayoutRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const currentBarSpacing = chart.timeScale().options().barSpacing ?? 6;
      setBarSpacing(currentBarSpacing);

      // lightweight-charts renders candle bodies at roughly 60% of bar
      // spacing; used to keep the ladder in the "gap" beside the candle
      // instead of drawn on top of its body/wick.
      const candleHalfWidth = Math.min(7, currentBarSpacing * 0.3);

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
            return { y: Number(yTop), h: Math.max(9, Number(yBottom) - Number(yTop)), cell, isPoc };
          })
          .filter((c): c is { y: number; h: number; cell: FootprintCell; isPoc: boolean } => c !== null);
        next.push({ candleTime: candle.time, x, candleHalfWidth, cells, delta: fp.delta ?? 0, totalVolume: fp.totalVolume ?? 0 });
      }
      setLayout(next);
    };
    recomputeLayoutRef.current();
  }, [candles, footprintByTime]);

  const tier = barSpacing >= LOD_FULL ? "full" : barSpacing >= LOD_MEDIUM ? "medium" : "compact";
  // "side" mode: ladder sits beside the candle (in the gap before the next
  // one), never centered on top of it — this is what stops adjacent
  // footprints from overlapping into a single blob when several candles
  // have real data.
  // "replace" mode: candle body is transparent (see the displayMode effect
  // above), so the ladder is meant to occupy the candle's own footprint —
  // full bar width, centered on the candle's x, no side offset.
  const ladderWidth =
    displayMode === "replace"
      ? Math.max(6, barSpacing - 2)
      : tier === "full"
        ? Math.min(74, barSpacing - 6)
        : Math.max(4, barSpacing - 6);
  const ladderLeftOffset = displayMode === "replace" ? -ladderWidth / 2 : 1;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      <div ref={containerRef} className="h-full w-full" />

      {/* Spec section C toggle — NORMAL (candle + ladder beside it) vs
          FOOTPRINT MODE (candle transparent, ladder becomes the candle). */}
      <div className="pointer-events-auto absolute right-2 top-2 z-10 flex overflow-hidden rounded-md border border-line bg-bg-raised/90 text-[9px] font-medium">
        <button
          type="button"
          onClick={() => setDisplayMode("side")}
          className={clsx("px-2 py-1 transition-colors", displayMode === "side" ? "bg-signal/20 text-ink" : "text-ink-faint hover:text-ink-muted")}
        >
          Normal
        </button>
        <button
          type="button"
          onClick={() => setDisplayMode("replace")}
          className={clsx("px-2 py-1 transition-colors", displayMode === "replace" ? "bg-signal/20 text-ink" : "text-ink-faint hover:text-ink-muted")}
        >
          Footprint Mode
        </button>
      </div>

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
          <div
            key={col.candleTime}
            className="absolute top-0"
            style={{ left: displayMode === "replace" ? col.x + ladderLeftOffset : col.x + col.candleHalfWidth + ladderLeftOffset, width: ladderWidth }}
          >
            {col.cells.map((c, i) => {
              const total = c.cell.buyVolume + c.cell.sellVolume;
              const sellShare = total > 0 ? c.cell.sellVolume / total : 0;
              const buyShare = total > 0 ? c.cell.buyVolume / total : 0;
              return (
                <div
                  key={i}
                  className={clsx(
                    "absolute flex items-center overflow-hidden rounded-[2px] leading-none text-white",
                    tier === "full" ? "gap-0.5 text-[8px] font-mono font-semibold justify-center" : "",
                    // POC: this candle's highest-volume price level — subtle purple
                    // outline so it reads as "the level that mattered" without a
                    // large label per rule 8 ("only show labels when useful").
                    c.isPoc && "ring-1 ring-inset ring-[#A78BFA]",
                    // Bid/Ask imbalance (3x+ stacked dominance, computed in
                    // lib/elvoid/footprint.ts) — a brighter glow, never a signal claim.
                    c.cell.imbalance && "shadow-[0_0_0_1px_rgba(250,204,21,0.6)_inset]"
                  )}
                  style={{ top: c.y, height: c.h, width: ladderWidth }}
                  title={c.cell.imbalance ? "Bid/Ask Imbalance" : undefined}
                >
                  {tier === "full" ? (
                    <>
                      <span
                        className="flex h-full flex-1 items-center justify-center"
                        style={{ backgroundColor: `rgba(239,68,68,${Math.min(0.8, 0.18 + sellShare * 0.55)})` }}
                      >
                        {c.cell.sellVolume > 0.0005 ? formatCompact(c.cell.sellVolume) : ""}
                      </span>
                      <span
                        className="flex h-full flex-1 items-center justify-center"
                        style={{ backgroundColor: `rgba(34,197,94,${Math.min(0.8, 0.18 + buyShare * 0.55)})` }}
                      >
                        {c.cell.buyVolume > 0.0005 ? formatCompact(c.cell.buyVolume) : ""}
                      </span>
                    </>
                  ) : (
                    // MEDIUM/COMPACT tier: no text — a single delta-tinted block
                    // per price level, so the ladder's overall shape (the
                    // "profile silhouette") stays visible across many candles
                    // without squeezing unreadable numbers into a few px.
                    <span
                      className="h-full w-full"
                      style={{
                        backgroundColor:
                          c.cell.delta >= 0
                            ? `rgba(34,197,94,${Math.min(0.7, 0.15 + buyShare * 0.5)})`
                            : `rgba(239,68,68,${Math.min(0.7, 0.15 + sellShare * 0.5)})`,
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Candle-level delta badge — only in the FULL tier; kept small per rule 7. */}
            {tier === "full" && col.cells.length > 0 && (
              <div
                className={clsx(
                  "absolute -translate-x-1/2 whitespace-nowrap rounded-[2px] px-1 text-[8px] font-mono font-bold leading-tight",
                  col.delta >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                )}
                style={{ left: ladderWidth / 2, top: Math.min(...col.cells.map((c) => c.y)) - 11 }}
              >
                Δ{col.delta >= 0 ? "+" : ""}
                {formatCompact(col.delta)}
              </div>
            )}

            {/* Total volume — reused from the same real cells (no extra request), placed under the ladder so it never covers a price row. Rule 8. */}
            {tier === "full" && col.cells.length > 0 && (
              <div
                className="absolute -translate-x-1/2 whitespace-nowrap rounded-[2px] px-1 text-[7px] font-mono text-ink-faint"
                style={{ left: ladderWidth / 2, top: Math.max(...col.cells.map((c) => c.y + c.h)) + 2 }}
              >
                VOL {formatCompact(col.totalVolume)}
              </div>
            )}
          </div>
        ))}
      </div>

      {tier === "compact" && candles.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <span className="rounded bg-bg-raised/90 px-2 py-0.5 text-[9px] text-ink-faint">Zoom in untuk detail bid/ask</span>
        </div>
      )}

      {oldestTradeTime && (
        <div className="pointer-events-none absolute bottom-1 left-2 rounded bg-bg-raised/80 px-1.5 py-0.5 text-[9px] text-ink-faint">
          Footprint real-trade sejak {new Date(oldestTradeTime).toLocaleTimeString("id-ID")} — candle sebelumnya belum ada data tersimpan
        </div>
      )}
    </div>
  );
}
