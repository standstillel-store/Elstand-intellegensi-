"use client";
import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { formatUsd } from "@/lib/format";
import { LETTERS, type TpoSession } from "@/lib/elvoid/tpo";

const BLOCK_SIZES = ["5m", "10m", "15m", "30m", "1H", "2H", "4H"];
const PERIODS = ["1D", "5D", "1W", "1M"];

// Bracket color bands — cycling every BAND_SIZE consecutive letters, so
// each block-group reads as its own color the way the TradingView
// reference screenshots do (a run of purple, then teal, then green, as the
// session moves forward through time), instead of one flat color per row.
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

export function TPOLetterChart({
  symbol,
  height,
  chartInterval,
}: {
  symbol: string;
  height: number;
  /** The main chart's own candlestick timeframe (e.g. "5m", "1h") — a
   * separate concept from the TPO bracket size below, but it's what
   * decides the real candle interval the TPO engine pulls traversal data
   * from, so it must be threaded all the way to the API request. */
  chartInterval: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<TpoSession[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [compact, setCompact] = useState(false);

  // Settings — kept local to this mode (no shared indicator-settings system
  // exists yet in Elvoid Pro), matches rule 20's minimum control set.
  const [blockSize, setBlockSize] = useState("30m");
  const [period, setPeriod] = useState("1D");
  const [valueAreaPct, setValueAreaPct] = useState(70);
  const [showLetters, setShowLetters] = useState(true);
  const [showIbr, setShowIbr] = useState(true);
  const [showSinglePrint, setShowSinglePrint] = useState(true);
  const [showPoorHL, setShowPoorHL] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const measure = () => setCompact((containerRef.current?.clientWidth ?? 500) < 480);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Re-fetches (and shows the loading state, clearing stale rows) whenever
  // ANY of symbol / chart timeframe / TPO bracket / profile period /
  // value-area% changes — this is what was missing before: chartInterval
  // wasn't even a prop, so switching the chart's own timeframe couldn't
  // possibly invalidate anything here.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSessions([]); // don't keep showing the previous setting's stale profile while the new one loads
    Promise.all([
      fetch(
        `/api/tpo-sessions?symbol=${symbol}&days=5&blockSize=${blockSize}&period=${period}&va=${valueAreaPct}&chartInterval=${chartInterval}`
      ).then((r) => r.json()),
      fetch(`/api/market-24h?symbol=${symbol}`).then((r) => r.json()),
    ])
      .then(([tpoData, tickerData]) => {
        if (cancelled) return;
        if (tpoData.error || !Array.isArray(tpoData.sessions)) {
          setStatus("error");
          return;
        }
        // eslint-disable-next-line no-console
        console.log("TPO DEBUG", {
          chartTimeframe: chartInterval,
          profilePeriod: period,
          bracketInterval: blockSize,
          candleCount: tpoData.debug?.sourceCandlesFetched ?? null,
          sourceInterval: tpoData.debug?.sourceInterval ?? null,
          bracketCount: tpoData.sessions.reduce((s: number, sess: TpoSession) => s + sess.blockCount, 0),
          profileCount: tpoData.sessions.length,
        });
        setSessions(tpoData.sessions);
        setLastPrice(tickerData?.ticker?.lastPrice ?? null);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, chartInterval, blockSize, period, valueAreaPct]);

  if (status === "loading" || sessions.length === 0) {
    return (
      <div ref={containerRef} style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        {status === "error" ? "TPO tidak tersedia saat ini." : `Membangun TPO sessions ${symbol}/USDT…`}
      </div>
    );
  }

  const globalHigh = Math.max(...sessions.map((s) => s.high));
  const globalLow = Math.min(...sessions.map((s) => s.low));
  const globalSpan = globalHigh - globalLow || 1;
  const canvasHeight = height - 64; // reserve space: ~36px top padding for the settings bar, ~28px bottom for date labels
  const toY = (price: number) => ((globalHigh - price) / globalSpan) * canvasHeight;

  const cellWidth = compact ? 11 : 16;
  const sessionGap = compact ? 14 : 26;

  // Pixel-based session layout: each session's width is driven by its own
  // widest row (max letters-in-a-row), not an equal percentage slice of
  // the container. This is what actually fixes "1-2 narrow columns with a
  // huge empty area" — a quiet session gets a narrow column, a busy one
  // gets a wide one, and the container scrolls to fit all of them.
  let cursorX = 8;
  const sessionLayout = sessions.map((session) => {
    const maxLetters = Math.max(1, ...session.rows.map((r) => r.letters.length));
    const width = maxLetters * cellWidth;
    const xStart = cursorX;
    cursorX += width + sessionGap;
    return { session, xStart, width };
  });
  const totalWidth = cursorX + 40;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-line bg-bg-surface/40">
      {/* Compact settings disclosure — rule 20's control set, kept out of the way until opened. */}
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

      <div ref={containerRef} className="h-full w-full overflow-x-auto overflow-y-hidden pt-9">
        <div className="relative" style={{ height: canvasHeight, minWidth: totalWidth }}>
          {/* Current price line, spans the whole visible width. */}
          {lastPrice !== null && lastPrice <= globalHigh && lastPrice >= globalLow && (
            <div className="absolute left-0 right-0 border-t border-dashed border-signal-glow/70" style={{ top: toY(lastPrice) }}>
              <span className="absolute right-0 -translate-y-1/2 rounded bg-signal-glow px-1 text-[9px] font-semibold text-bg">
                {formatUsd(lastPrice)}
              </span>
            </div>
          )}

          {sessionLayout.map(({ session, xStart, width }) => {
            const pocRow = session.rows.find((r) => r.isPoc);
            return (
              <div key={session.sessionStart} className="absolute top-0" style={{ left: xStart, width }}>
                {/* POC / VAH / VAL — horizontal levels spanning this session's profile width, labeled at the left edge. */}
                {pocRow && (
                  <div className="absolute -left-7 flex items-center gap-0.5 text-[7px] font-semibold text-[#22D3EE]" style={{ top: toY((pocRow.priceHigh + pocRow.priceLow) / 2) - 4 }}>
                    POC
                  </div>
                )}
                {session.tvah !== null && (
                  <div className="absolute left-0 border-t border-dashed border-ink-faint/60" style={{ top: toY(session.tvah), width }}>
                    <span className="absolute -left-7 -top-2 text-[7px] text-ink-faint">VAH</span>
                  </div>
                )}
                {session.tval !== null && (
                  <div className="absolute left-0 border-t border-dashed border-ink-faint/60" style={{ top: toY(session.tval), width }}>
                    <span className="absolute -left-6 top-0.5 text-[7px] text-ink-faint">VAL</span>
                  </div>
                )}

                {/* Initial Balance Range — vertical marker just left of the profile, per rule 12. */}
                {showIbr && session.ibrHigh !== null && session.ibrLow !== null && (
                  <div
                    className="absolute -left-1.5 border-l border-dashed border-[#A78BFA]/60"
                    style={{ top: toY(session.ibrHigh), height: Math.max(2, toY(session.ibrLow) - toY(session.ibrHigh)) }}
                    title="Initial Balance Range"
                  />
                )}

                {/* Each row renders as individual fixed-size cells — one per TPO
                    letter, left-aligned — instead of one long text string. This
                    is what makes the profile actually widen/narrow by price
                    level and read as a real horizontal Market Profile shape. */}
                {session.rows.map((row, rIdx) => {
                  const y = toY(row.priceHigh);
                  const h = Math.max(4, toY(row.priceLow) - y);
                  const fontSize = Math.min(h - 1, compact ? 7 : 9);
                  return (
                    <div key={rIdx} className="absolute left-0 flex" style={{ top: y, height: h, width }}>
                      {[...row.letters].map((letter, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex items-center justify-center overflow-hidden font-mono font-semibold leading-none text-white"
                          style={{
                            width: cellWidth,
                            height: h,
                            fontSize: fontSize > 3 ? fontSize : 0,
                            backgroundColor: colorForLetter(letter),
                            opacity: row.inValueArea ? 1 : 0.4, // TradingView's documented "opacity outside VA"
                            outline: row.isPoc ? "1px solid #fff" : row.isSinglePrint && showSinglePrint ? "1px solid rgba(250,204,21,0.85)" : "1px solid rgba(0,0,0,0.35)",
                            outlineOffset: -1,
                          }}
                          title={row.isSinglePrint ? "Single Print" : row.isPoc ? "POC" : undefined}
                        >
                          {showLetters ? letter : ""}
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* Poor High / Poor Low — labeled, not signaled, per rule 14. */}
                {showPoorHL && session.poorHigh && (
                  <div className="absolute left-0 -translate-y-full text-[7px] font-semibold text-[#F59E0B]" style={{ top: toY(session.high) }}>
                    Poor High
                  </div>
                )}
                {showPoorHL && session.poorLow && (
                  <div className="absolute left-0 text-[7px] font-semibold text-[#F59E0B]" style={{ top: toY(session.low) + 1 }}>
                    Poor Low
                  </div>
                )}

                <div className="absolute left-0 truncate text-[9px] text-ink-faint" style={{ width, top: canvasHeight + 4 }}>
                  {new Date(session.sessionStart).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
