"use client";

import { useMemo, useState } from "react";
import type { RsiHeatmapData } from "@/lib/intelligence/rsiHeatmap";

const INTERVALS = [
  { value: "15m", label: "15M" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

function zoneFor(value: number): { label: string; className: string } {
  if (value >= 70) return { label: "STRONG BUY", className: "text-up" };
  if (value >= 60) return { label: "BUY", className: "text-up" };
  if (value >= 40) return { label: "NEUTRAL", className: "text-ink-muted" };
  if (value >= 30) return { label: "SELL", className: "text-down" };
  return { label: "STRONG SELL", className: "text-down" };
}

/** Deterministic 0..1 spread so the same symbol always lands at the same
 *  x position — no reshuffling on every refresh, and nothing that reads
 *  as "market data" should come from Math.random(). */
function hash01(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function RsiHeatmap({ data }: { data: RsiHeatmapData }) {
  const [current, setCurrent] = useState(data);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  async function changeInterval(interval: string) {
    if (interval === current.interval || loading) return;
    setLoading(true);
    setErrored(false);
    try {
      const res = await fetch(`/api/rsi-heatmap?interval=${interval}&symbols=${data.symbols.join(",")}`);
      if (!res.ok) throw new Error("request failed");
      const next = (await res.json()) as RsiHeatmapData;
      setCurrent(next);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  const points = useMemo(
    () =>
      current.entries.map((e) => ({
        ...e,
        top: Math.min(96, Math.max(2, 100 - e.rsi)),
        left: 4 + hash01(e.symbol) * 92,
      })),
    [current.entries]
  );

  const overallZone = current.avgRsi !== undefined ? zoneFor(current.avgRsi) : undefined;

  return (
    <div className="glow-card ambient-glow ambient-glow-gold overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="live-dot bg-up" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink">RSI Heatmap</h2>
          <span className="text-[10px] text-ink-faint">
            {current.entries.length} pairs · Binance Futures
          </span>
        </div>
        <div className="flex items-center gap-1">
          {INTERVALS.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => changeInterval(tf.value)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                current.interval === tf.value ? "bg-gold/15 text-gold" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {!current.connected ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          DATA UNAVAILABLE — Binance klines tidak terjangkau
        </div>
      ) : (
        <div className="relative h-56 overflow-hidden rounded-lg border border-line bg-bg-surface sm:h-64 lg:h-72">
          <div className="absolute inset-x-0 top-0 h-[30%] bg-up/[0.06]" />
          <div className="absolute inset-x-0 bottom-0 h-[30%] bg-down/[0.06]" />
          <div className="absolute inset-x-0 border-t border-dashed border-line/60" style={{ top: "50%" }} />

          <div className="absolute left-1.5 text-[9px] text-ink-faint" style={{ top: "30%" }}>
            70
          </div>
          <div className="absolute left-1.5 -translate-y-1/2 text-[9px] text-ink-faint" style={{ top: "50%" }}>
            50
          </div>
          <div className="absolute left-1.5 text-[9px] text-ink-faint" style={{ top: "70%" }}>
            30
          </div>

          {points.map((p) => (
            <div
              key={p.symbol}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${p.top}%`, left: `${p.left}%` }}
              onMouseEnter={() => setHovered(p.symbol)}
              onMouseLeave={() => setHovered((h) => (h === p.symbol ? null : h))}
            >
              <span
                className={`block h-1.5 w-1.5 cursor-pointer rounded-full ${
                  p.rsi >= 70 ? "bg-up" : p.rsi < 30 ? "bg-down" : "bg-ink-faint"
                }`}
              />
              <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[8px] text-ink-faint">
                {p.symbol}
              </span>

              {hovered === p.symbol && (
                <div className="absolute left-1/2 top-full z-10 mt-3 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-bg-raised px-2 py-1 text-[10px] shadow-lg">
                  <span className="mono-num font-semibold text-ink">{p.symbol}</span>{" "}
                  <span className={`mono-num ${zoneFor(p.rsi).className}`}>RSI {p.rsi.toFixed(1)}</span>
                  {p.price !== undefined && (
                    <div className="mono-num text-ink-muted">
                      $
                      {p.price < 1
                        ? p.price.toPrecision(3)
                        : p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/70 text-[11px] text-ink-faint">
              Memuat {current.interval}…
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-faint">
          AVG RSI <span className="mono-num font-semibold text-ink">{current.avgRsi?.toFixed(1) ?? "—"}</span>
        </span>
        {overallZone && <span className={`font-semibold ${overallZone.className}`}>{overallZone.label}</span>}
        {errored && <span className="text-down">Gagal memuat interval baru — data sebelumnya ditampilkan.</span>}
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">Kondisi momentum teknikal (RSI-14), bukan sinyal beli/jual.</p>
    </div>
  );
}
