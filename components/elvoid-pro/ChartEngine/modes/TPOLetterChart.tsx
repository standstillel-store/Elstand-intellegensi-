"use client";
import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { formatUsd } from "@/lib/format";
import type { TpoSession } from "@/lib/elvoid/tpo";

const BLOCK_SIZES = ["5m", "10m", "15m", "30m", "1H", "2H", "4H"];
const PERIODS = ["1D", "5D", "1W", "1M"];

export function TPOLetterChart({ symbol, height }: { symbol: string; height: number }) {
  const [sessions, setSessions] = useState<TpoSession[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
    let cancelled = false;
    setStatus("loading");
    Promise.all([
      fetch(`/api/tpo-sessions?symbol=${symbol}&days=5&blockSize=${blockSize}&period=${period}&va=${valueAreaPct}`).then((r) => r.json()),
      fetch(`/api/market-24h?symbol=${symbol}`).then((r) => r.json()),
    ])
      .then(([tpoData, tickerData]) => {
        if (cancelled) return;
        if (tpoData.error || !Array.isArray(tpoData.sessions)) {
          setStatus("error");
          return;
        }
        setSessions(tpoData.sessions);
        setLastPrice(tickerData?.ticker?.lastPrice ?? null);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol, blockSize, period, valueAreaPct]);

  if (status === "loading") {
    return (
      <div style={{ height }} className="flex animate-pulse items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        Membangun TPO sessions {symbol}/USDT…
      </div>
    );
  }

  if (status === "error" || sessions.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-md border border-line bg-bg-surface/40 text-xs text-ink-faint">
        TPO tidak tersedia saat ini.
      </div>
    );
  }

  const globalHigh = Math.max(...sessions.map((s) => s.high));
  const globalLow = Math.min(...sessions.map((s) => s.low));
  const globalSpan = globalHigh - globalLow || 1;
  const canvasHeight = height - 28; // leave room for the day-label axis
  const toY = (price: number) => ((globalHigh - price) / globalSpan) * canvasHeight;

  const columnWidth = 100 / sessions.length;
  const letterCell = 6.5; // px per letter, matches the reference's dense block look

  return (
    <div style={{ height }} className="relative overflow-x-auto overflow-y-hidden rounded-md border border-line bg-bg-surface/40 px-2 pt-2">
      {/* Compact settings disclosure — rule 20's control set, kept out of the way until opened. */}
      <div className="sticky left-0 top-0 z-20 mb-1 flex items-center gap-1.5">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1 rounded border border-line bg-bg-raised/90 px-1.5 py-0.5 text-[9px] text-ink-faint hover:text-ink"
        >
          <Settings2 size={10} /> TPO {period} {blockSize} {valueAreaPct}%
        </button>
      </div>

      {settingsOpen && (
        <div className="sticky left-0 top-6 z-20 mb-2 flex w-fit flex-wrap gap-3 rounded-md border border-line bg-bg-raised/95 p-2 text-[10px] text-ink-muted shadow-xl">
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

      <div className="relative" style={{ height: canvasHeight, minWidth: sessions.length * 170 }}>
        {/* Current price line, spans the whole session range. */}
        {lastPrice !== null && lastPrice <= globalHigh && lastPrice >= globalLow && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-signal-glow/70"
            style={{ top: toY(lastPrice) }}
          >
            <span className="absolute right-0 -translate-y-1/2 rounded bg-signal-glow px-1 text-[9px] font-semibold text-bg">
              {formatUsd(lastPrice)}
            </span>
          </div>
        )}

        {sessions.map((session, sIdx) => (
          <div key={session.sessionStart} className="absolute top-0" style={{ left: `${sIdx * columnWidth}%`, width: `${columnWidth}%` }}>
            {session.tvah !== null && (
              <div className="absolute left-0 border-t border-dashed border-ink-faint/50" style={{ top: toY(session.tvah), width: "90%" }}>
                <span className="absolute -top-3 left-0 text-[7px] text-ink-faint">VAH</span>
              </div>
            )}
            {session.tval !== null && (
              <div className="absolute left-0 border-t border-dashed border-ink-faint/50" style={{ top: toY(session.tval), width: "90%" }}>
                <span className="absolute top-0.5 left-0 text-[7px] text-ink-faint">VAL</span>
              </div>
            )}

            {/* Initial Balance Range — vertical line just left of the profile, per rule 12. */}
            {showIbr && session.ibrHigh !== null && session.ibrLow !== null && (
              <div
                className="absolute -left-1 border-l border-dashed border-[#A78BFA]/60"
                style={{ top: toY(session.ibrHigh), height: Math.max(2, toY(session.ibrLow) - toY(session.ibrHigh)) }}
                title="Initial Balance Range"
              />
            )}

            {session.rows.map((row, rIdx) => {
              const y = toY(row.priceHigh);
              const h = Math.max(3, toY(row.priceLow) - y);
              const w = Math.min(letterCell * row.letters.length, 90);
              return (
                <div
                  key={rIdx}
                  className="absolute left-0 overflow-hidden whitespace-nowrap font-mono leading-none tracking-tighter"
                  style={{
                    top: y,
                    height: h,
                    width: w,
                    fontSize: Math.min(h, 8),
                    color: row.isPoc ? "#0a0a0f" : row.inValueArea ? "#0f2e2a" : "#c7cad1",
                    backgroundColor: row.isPoc ? "#22D3EE" : row.inValueArea ? "#2DD4BF99" : "transparent",
                    backgroundImage: !row.inValueArea && !row.isPoc
                      ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px)"
                      : undefined,
                    border: row.isSinglePrint && showSinglePrint
                      ? "1px solid rgba(250,204,21,0.75)" // single print: subtle yellow outline, purely structural per rule 13
                      : !row.inValueArea && !row.isPoc
                        ? "1px solid rgba(255,255,255,0.08)"
                        : undefined,
                  }}
                  title={row.isSinglePrint ? "Single Print" : undefined}
                >
                  {showLetters ? row.letters : ""}
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
          </div>
        ))}
      </div>

      <div className="mt-1 flex text-[9px] text-ink-faint" style={{ minWidth: sessions.length * 170 }}>
        {sessions.map((s) => (
          <div key={s.sessionStart} style={{ width: `${columnWidth}%` }} className="truncate">
            {new Date(s.sessionStart).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "2-digit" })}
          </div>
        ))}
      </div>
    </div>
  );
}
