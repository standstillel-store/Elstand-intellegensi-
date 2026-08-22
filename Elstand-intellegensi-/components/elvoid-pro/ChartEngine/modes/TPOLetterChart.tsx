"use client";
import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { LETTERS, TPO_PROFILE_PERIODS_MS, defaultBlockSizeForChartInterval, type TpoSession } from "@/lib/elvoid/tpo";
import type { Candle } from "@/lib/elvoid/types";
import { getMaxHistoryDays } from "@/lib/market-data/timeframeHistory";

const BLOCK_SIZES = ["1m", "5m", "10m", "15m", "30m", "1H", "2H", "4H", "1D"];
const PERIODS = ["1D", "5D", "1W", "1M"];

// Bracket color bands — cycling every BAND_SIZE consecutive letters, so each
// block-group reads as its own color the way the TradingView reference
// screenshots do, instead of one flat color per row.
const BAND_SIZE = 4;
const PALETTE_UPPER = ["#F43F5E", "#FB923C", "#FACC15", "#4ADE80", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6"];
const PALETTE_LOWER = ["#FDA4AF", "#FDBA74", "#FDE047", "#86EFAC", "#67E8F9", "#93C5FD", "#C4B5FD", "#F9A8D4"];

function colorForLetter(letter: string): string {
  const idx = LETTERS.indexOf(letter);
  if (idx < 0) return "#8A8F98";
  const isLower = idx >= 26;
  const within = isLower ? idx - 26 : idx;
  const bandIdx = Math.floor(within / BAND_SIZE) % PALETTE_UPPER.length;
  return isLower ? PALETTE_LOWER[bandIdx] : PALETTE_UPPER[bandIdx];
}

interface SessionLayout {
  session: TpoSession;
  x: number; // real chart pixel x — start of this session's time slot
  cellWidth: number; // adapted so the whole profile fits inside the session's real time width
  cellHeightByRow: { y: number; h: number }[];
  tvahY: number | null;
  tvalY: number | null;
}

export function TPOLetterChart({
  symbol,
  height,
  chartInterval,
}: {
  symbol: string;
  height: number;
  /** The main chart's own candlestick timeframe — drives which real candles
   * render in the background AND which source data the TPO engine builds
   * blocks from. Threading this through is what makes the profile actually
   * move/zoom/pan together with real candles instead of floating on its
   * own detached coordinate grid. */
  chartInterval: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [sessions, setSessions] = useState<TpoSession[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [layout, setLayout] = useState<SessionLayout[]>([]);
  const [compact, setCompact] = useState(false);

  // Settings — kept local to this mode (no shared indicator-settings system
  // exists yet in Elvoid Pro), matches rule 20's minimum control set.
  const [blockSize, setBlockSize] = useState(() => defaultBlockSizeForChartInterval(chartInterval));
  const [period, setPeriod] = useState("1D");
  const [valueAreaPct, setValueAreaPct] = useState(70);
  const [showLetters, setShowLetters] = useState(true);
  const [showIbr, setShowIbr] = useState(true);
  const [showSinglePrint, setShowSinglePrint] = useState(true);
  const [showPoorHL, setShowPoorHL] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Root cause of "TPO count stays the same when timeframe changes": blockSize
  // used to be a hardcoded "30m" default that nothing ever revisited. This
  // re-derives it every time the chart's own timeframe changes, so switching
  // 1m -> 1H -> 1D actually changes the TPO bracket/period count, not just
  // the background candles. A manual override via the settings dropdown
  // below is respected until the user changes chartInterval again.
  useEffect(() => {
    setBlockSize(defaultBlockSizeForChartInterval(chartInterval));
  }, [chartInterval]);

  // Real candles for the background chart — a SEPARATE fetch from TPO
  // session data, same endpoint the plain candlestick mode uses, so the
  // price/time context the user sees matches the actual chart.
  useEffect(() => {
    let cancelled = false;
    const days = Math.min(10, getMaxHistoryDays(chartInterval));
    fetch(`/api/klines?symbol=${symbol}&interval=${chartInterval}&days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.error || !Array.isArray(data.candles)) return;
        setCandles(data.candles);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, chartInterval]);

  // TPO session data — re-fetches (and clears stale rows) whenever symbol /
  // chart timeframe / TPO bracket / profile period / value-area% changes.
  // Debounced: valueAreaPct in particular is a live number input, so typing
  // would otherwise fire a request per keystroke.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSessions([]);
    const debounceId = setTimeout(() => {
      fetch(`/api/tpo-sessions?symbol=${symbol}&days=6&blockSize=${blockSize}&period=${period}&va=${valueAreaPct}&chartInterval=${chartInterval}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error || !Array.isArray(data.sessions)) {
            setStatus("error");
            return;
          }
          // eslint-disable-next-line no-console
          console.log("TPO DEBUG", {
            chartTimeframe: chartInterval,
            profilePeriod: period,
            bracketInterval: blockSize,
            candleCount: data.debug?.sourceCandlesFetched ?? null,
            sourceInterval: data.debug?.sourceInterval ?? null,
            bracketCount: data.sessions.reduce((s: number, sess: TpoSession) => s + sess.blockCount, 0),
            profileCount: data.sessions.length,
            historyBacked: data.debug?.historyBacked ?? false,
            storedSessionsUsed: data.debug?.storedSessionsUsed ?? 0,
          });
          setSessions(data.sessions);
          setStatus("ready");
        })
        .catch(() => !cancelled && setStatus("error"));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounceId);
    };
  }, [symbol, chartInterval, blockSize, period, valueAreaPct]);

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
    seriesRef.current = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });

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
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
        setCompact(containerRef.current.clientWidth < 480);
      }
      scheduleRecompute();
    };
    onResize();
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

  // Push real candle data + fit the view to the TPO session range so the
  // profiles are visible on load.
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: (c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    chartRef.current?.timeScale().fitContent();
    recomputeRef.current?.();
  }, [candles]);

  // Recompute session pixel positions from the chart's OWN coordinate
  // functions — this is the actual fix: TPO x comes from
  // timeScale.timeToCoordinate(sessionStart), TPO y comes from
  // series.priceToCoordinate(row price), the exact same transforms the
  // candlesticks use. Panning/zooming the chart moves both together
  // because they're derived from the same live chart state every frame.
  const recomputeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recomputeRef.current = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || sessions.length === 0) return;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const sessionMs = TPO_PROFILE_PERIODS_MS[period] ?? TPO_PROFILE_PERIODS_MS["1D"];
      const desiredCellWidth = compact ? 9 : 14;

      const next: SessionLayout[] = [];
      for (const session of sessions) {
        const xStart = chart.timeScale().timeToCoordinate((session.sessionStart / 1000) as UTCTimestamp);
        const xEnd = chart.timeScale().timeToCoordinate(((session.sessionStart + sessionMs) / 1000) as UTCTimestamp);
        if (xStart === null) continue;
        const x = Number(xStart);
        if (x < -400 || x > containerWidth + 400) continue; // skip far off-screen sessions

        // Fit the whole profile inside this session's real time width so it
        // stays visually attached to that session's candles at any zoom
        // level — the ask was "TPO bergerak searah candle".
        const sessionPixelWidth = xEnd !== null ? Math.max(20, Number(xEnd) - x) : 120;
        const maxLetters = Math.max(1, ...session.rows.map((r) => r.letters.length));
        const cellWidth = Math.max(2, Math.min(desiredCellWidth, sessionPixelWidth / maxLetters));

        const cellHeightByRow = session.rows.map((row) => {
          const yTop = series.priceToCoordinate(row.priceHigh);
          const yBottom = series.priceToCoordinate(row.priceLow);
          return { y: yTop !== null ? Number(yTop) : 0, h: yTop !== null && yBottom !== null ? Math.max(3, Number(yBottom) - Number(yTop)) : 3 };
        });

        next.push({
          session,
          x,
          cellWidth,
          cellHeightByRow,
          tvahY: session.tvah !== null ? (series.priceToCoordinate(session.tvah) as number | null) : null,
          tvalY: session.tval !== null ? (series.priceToCoordinate(session.tval) as number | null) : null,
        });
      }
      setLayout(next);
    };
    recomputeRef.current();
  }, [sessions, period, compact]);

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      <div ref={containerRef} className="h-full w-full" />

      {(status === "loading" && sessions.length === 0) && (
        <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          Membangun TPO sessions {symbol}/USDT…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/60 text-xs text-ink-faint">
          TPO tidak tersedia saat ini.
        </div>
      )}

      {/* Compact settings disclosure — rule 20's control set. */}
      <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1 rounded border border-line bg-bg-raised/90 px-1.5 py-0.5 text-[9px] text-ink-faint hover:text-ink"
        >
          <Settings2 size={10} /> TPO {period} {blockSize} {valueAreaPct}%
        </button>
      </div>

      {settingsOpen && (
        <div className="absolute left-2 top-8 z-30 flex w-fit flex-wrap gap-3 rounded-md border border-line bg-bg-raised/95 p-2 text-[10px] text-ink-muted shadow-xl">
          <label className="flex flex-col gap-0.5">
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded border border-line bg-bg-surface px-1 py-0.5 text-ink">
              {PERIODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Block Size
            <select value={blockSize} onChange={(e) => setBlockSize(e.target.value)} className="rounded border border-line bg-bg-surface px-1 py-0.5 text-ink">
              {BLOCK_SIZES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Value Area %
            <input
              type="number"
              min={10}
              max={95}
              value={valueAreaPct}
              onChange={(e) => setValueAreaPct(Math.min(95, Math.max(10, Number(e.target.value) || 70)))}
              className="w-14 rounded border border-line bg-bg-surface px-1 py-0.5 text-ink"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-ink-faint">Overlay</span>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1"><input type="checkbox" checked={showLetters} onChange={(e) => setShowLetters(e.target.checked)} />Letters</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showIbr} onChange={(e) => setShowIbr(e.target.checked)} />IBR</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showSinglePrint} onChange={(e) => setShowSinglePrint(e.target.checked)} />Single Print</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showPoorHL} onChange={(e) => setShowPoorHL(e.target.checked)} />Poor High/Low</label>
            </div>
          </div>
        </div>
      )}

      {/* Overlay layer — pure positioning, no chart logic; every coordinate comes from the real lightweight-charts transform above. */}
      <div className="pointer-events-none absolute inset-0">
        {layout.map(({ session, x, cellWidth, cellHeightByRow, tvahY, tvalY }) => {
          const pocRow = session.rows.find((r) => r.isPoc);
          const pocLayoutIdx = session.rows.findIndex((r) => r.isPoc);
          const profileWidth = cellWidth * Math.max(1, ...session.rows.map((r) => r.letters.length));
          return (
            <div key={session.sessionStart} className="absolute top-0" style={{ left: x }}>
              {pocRow && pocLayoutIdx >= 0 && (
                <div
                  className="absolute -left-7 text-[7px] font-semibold text-[#22D3EE]"
                  style={{ top: cellHeightByRow[pocLayoutIdx].y + cellHeightByRow[pocLayoutIdx].h / 2 - 4 }}
                >
                  POC
                </div>
              )}
              {tvahY !== null && (
                <div className="absolute left-0 border-t border-dashed border-ink-faint/60" style={{ top: tvahY, width: profileWidth }}>
                  <span className="absolute -left-7 -top-2 text-[7px] text-ink-faint">VAH</span>
                </div>
              )}
              {tvalY !== null && (
                <div className="absolute left-0 border-t border-dashed border-ink-faint/60" style={{ top: tvalY, width: profileWidth }}>
                  <span className="absolute -left-6 top-0.5 text-[7px] text-ink-faint">VAL</span>
                </div>
              )}

              {/* Initial Balance Range — vertical marker just left of the profile, per rule 12. */}
              {showIbr && session.ibrHigh !== null && session.ibrLow !== null && (
                <div className="absolute -left-1 border-l border-dashed border-[#A78BFA]/60" style={{ top: 0, height: height - 30 }} title="Initial Balance Range" />
              )}

              {/* Each row renders as individual fixed-size cells — one per TPO
                  letter, left-aligned — so the profile actually widens/narrows
                  by price level and reads as a real horizontal Market Profile. */}
              {session.rows.map((row, rIdx) => {
                const { y, h } = cellHeightByRow[rIdx] ?? { y: 0, h: 3 };
                const fontSize = Math.min(h - 1, cellWidth - 3);
                const lettersVisible = showLetters && cellWidth >= 7 && fontSize > 3;
                return (
                  <div key={rIdx} className="absolute left-0 flex" style={{ top: y, height: h }}>
                    {[...row.letters].map((letter, cIdx) => (
                      <div
                        key={cIdx}
                        className="flex items-center justify-center overflow-hidden font-mono font-semibold leading-none text-white"
                        style={{
                          width: cellWidth,
                          height: h,
                          fontSize: lettersVisible ? fontSize : 0,
                          backgroundColor: colorForLetter(letter),
                          opacity: row.inValueArea ? 1 : 0.4, // TradingView's documented "opacity outside VA"
                          outline: row.isPoc ? "1px solid #fff" : row.isSinglePrint && showSinglePrint ? "1px solid rgba(250,204,21,0.85)" : "1px solid rgba(0,0,0,0.35)",
                          outlineOffset: -1,
                        }}
                        title={row.isSinglePrint ? "Single Print" : row.isPoc ? "POC" : undefined}
                      >
                        {lettersVisible ? letter : ""}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Poor High / Poor Low — labeled, not signaled, per rule 14. */}
              {showPoorHL && session.poorHigh && cellHeightByRow[0] && (
                <div className="absolute left-0 -translate-y-full text-[7px] font-semibold text-[#F59E0B]" style={{ top: cellHeightByRow[0].y }}>
                  Poor High
                </div>
              )}
              {showPoorHL && session.poorLow && cellHeightByRow.length > 0 && (
                <div className="absolute left-0 text-[7px] font-semibold text-[#F59E0B]" style={{ top: cellHeightByRow[cellHeightByRow.length - 1].y + cellHeightByRow[cellHeightByRow.length - 1].h + 1 }}>
                  Poor Low
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
