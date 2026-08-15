"use client";
import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/format";
import type { TpoSession } from "@/lib/elvoid/tpo";

export function TPOLetterChart({ symbol, height }: { symbol: string; height: number }) {
  const [sessions, setSessions] = useState<TpoSession[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([
      fetch(`/api/tpo-sessions?symbol=${symbol}&days=5`).then((r) => r.json()),
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
  }, [symbol]);

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
      <div className="relative" style={{ height: canvasHeight, minWidth: sessions.length * 160 }}>
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
                <span className="absolute -top-3 left-0 text-[7px] text-ink-faint">TVAH</span>
              </div>
            )}
            {session.tval !== null && (
              <div className="absolute left-0 border-t border-dashed border-ink-faint/50" style={{ top: toY(session.tval), width: "90%" }}>
                <span className="absolute top-0.5 left-0 text-[7px] text-ink-faint">TVAL</span>
              </div>
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
                    border: !row.inValueArea && !row.isPoc ? "1px solid rgba(255,255,255,0.08)" : undefined,
                  }}
                >
                  {row.letters}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-1 flex text-[9px] text-ink-faint" style={{ minWidth: sessions.length * 160 }}>
        {sessions.map((s) => (
          <div key={s.sessionStart} style={{ width: `${columnWidth}%` }} className="truncate">
            {new Date(s.sessionStart).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "2-digit" })}
          </div>
        ))}
      </div>
    </div>
  );
}
