"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Activity } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import type { RsiHeatmapData, RsiHeatmapEntry } from "@/lib/intelligence/rsiHeatmap";

const INTERVALS = [
  { value: "15m", label: "15M" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

// Zone thresholds — identical semantics to the buy/neutral/sell counts
// shown in the header pills below, so the dashed 50-line, the header
// counts, and each dot's color always agree on the same three buckets.
const BUY_THRESHOLD = 60;
const SELL_THRESHOLD = 40;

function zoneFor(value: number): { label: string; tone: "up" | "down" | "neutral" } {
  if (value >= 70) return { label: "STRONG BUY", tone: "up" };
  if (value >= BUY_THRESHOLD) return { label: "BUY", tone: "up" };
  if (value >= SELL_THRESHOLD) return { label: "NEUTRAL", tone: "neutral" };
  if (value >= 30) return { label: "SELL", tone: "down" };
  return { label: "STRONG SELL", tone: "down" };
}

/** Deterministic 0..1 spread so the same symbol always lands at the same
 *  x position — no reshuffling on every refresh, and nothing that reads
 *  as "market data" should come from Math.random(). Two independent
 *  hashes (different seed) give x and a small y-jitter so same-RSI dots
 *  don't stack in a perfectly straight line, matching the reference's
 *  organic scatter. */
function hash01(input: string, seed = 0): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

interface PlottedEntry extends RsiHeatmapEntry {
  top: number;
  left: number;
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

  const points = useMemo<PlottedEntry[]>(
    () =>
      current.entries.map((e) => ({
        ...e,
        // 6%..94% vertical range keeps every dot's label inside the band
        // even at RSI 0 or 100, rather than clipping at the card edge.
        top: 6 + (1 - Math.min(100, Math.max(0, e.rsi)) / 100) * 88,
        left: 3 + hash01(e.symbol, 1) * 94,
      })),
    [current.entries]
  );

  // Real counts derived from the same entries the dots are plotted from —
  // not a separate fabricated figure. Mirrors the thresholds in zoneFor().
  const counts = useMemo(() => {
    let buy = 0;
    let neutral = 0;
    let sell = 0;
    for (const e of current.entries) {
      if (e.rsi >= BUY_THRESHOLD) buy += 1;
      else if (e.rsi < SELL_THRESHOLD) sell += 1;
      else neutral += 1;
    }
    return { buy, neutral, sell };
  }, [current.entries]);

  const overallZone = current.avgRsi !== undefined ? zoneFor(current.avgRsi) : undefined;
  // Dashed reference line sits at the live average, not a hardcoded 50% —
  // reads as "where the market actually sits right now" like the reference.
  const avgTop = current.avgRsi !== undefined ? 6 + (1 - Math.min(100, Math.max(0, current.avgRsi)) / 100) * 88 : 50;

  return (
    <div className="glow-card ambient-glow ambient-glow-gold overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <LiveDot tone="up" />
          <SectionHeader
            code="RSI"
            title="RSI Heatmap"
            hint={`Futures · ${current.interval.toUpperCase()}`}
            icon={<Activity size={13} />}
            accent="up"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-up/30 bg-up/10 px-2 py-0.5 text-[10px] font-semibold text-up">
            <span className="h-1.5 w-1.5 rounded-full bg-up" />
            {counts.buy} Buy
          </span>
          <span className="flex items-center gap-1 rounded-full border border-line bg-bg-raised px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
            {counts.neutral} Neutral
          </span>
          <span className="flex items-center gap-1 rounded-full border border-down/30 bg-down/10 px-2 py-0.5 text-[10px] font-semibold text-down">
            <span className="h-1.5 w-1.5 rounded-full bg-down" />
            {counts.sell} Sell
          </span>
          <span className="hidden text-[10px] text-ink-faint sm:inline">{current.entries.length} pairs</span>

          <div className="ml-1 flex items-center gap-0.5 rounded-md border border-line p-0.5">
            {INTERVALS.map((tf) => (
              <button
                key={tf.value}
                type="button"
                onClick={() => changeInterval(tf.value)}
                className={clsx(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  current.interval === tf.value ? "bg-up/15 text-up" : "text-ink-faint hover:text-ink-muted"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!current.connected ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          DATA UNAVAILABLE — Binance klines tidak terjangkau
        </div>
      ) : (
        <div className="relative h-56 overflow-hidden rounded-lg border border-line bg-bg sm:h-64 lg:h-72">
          {/* Full-height strong-buy / strong-sell bands, like the reference —
              green fading in from the top, red fading in from the bottom,
              with the boundary zones (buy/neutral/sell) as flat washes so
              the whole card reads as a gradient rather than three hard bars. */}
          <div className="absolute inset-x-0 top-0 h-[12%] bg-up/[0.14]" />
          <div className="absolute inset-x-0 top-[12%] h-[18%] bg-up/[0.05]" />
          <div className="absolute inset-x-0 bottom-[12%] top-[70%] bg-down/[0.05]" />
          <div className="absolute inset-x-0 bottom-0 h-[12%] bg-down/[0.14]" />

          {/* Zone labels — right-aligned like the TapeDelta reference */}
          <span className="absolute right-2.5 top-1.5 text-[9px] font-semibold uppercase tracking-wide text-up/70">
            Strong Buy
          </span>
          <span className="absolute bottom-1.5 right-2.5 text-[9px] font-semibold uppercase tracking-wide text-down/70">
            Strong Sell
          </span>

          {/* Live average-RSI line, not a fixed midpoint */}
          <div
            className="absolute inset-x-0 border-t border-dashed border-gold/50"
            style={{ top: `${avgTop}%` }}
          />
          <div
            className="absolute left-1.5 -translate-y-1/2 rounded bg-bg-raised px-1 text-[9px] font-semibold text-gold"
            style={{ top: `${avgTop}%` }}
          >
            AVG {current.avgRsi?.toFixed(1) ?? "—"}
          </div>

          <div className="absolute left-1.5 text-[9px] text-ink-faint" style={{ top: "12%" }}>
            70
          </div>
          <div className="absolute left-1.5 text-[9px] text-ink-faint" style={{ top: "88%" }}>
            30
          </div>

          {points.map((p) => {
            const zone = zoneFor(p.rsi);
            return (
              <div
                key={p.symbol}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ top: `${p.top}%`, left: `${p.left}%` }}
                onMouseEnter={() => setHovered(p.symbol)}
                onMouseLeave={() => setHovered((h) => (h === p.symbol ? null : h))}
              >
                <span
                  className={clsx(
                    "block h-1.5 w-1.5 cursor-pointer rounded-full transition-transform hover:scale-150",
                    zone.tone === "up" ? "bg-up" : zone.tone === "down" ? "bg-down" : "bg-ink-faint"
                  )}
                />
                <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[8px] text-ink-faint">
                  {p.symbol}
                </span>

                {hovered === p.symbol && (
                  <div className="absolute left-1/2 top-full z-10 mt-3 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-bg-raised px-2 py-1 text-[10px] shadow-lg">
                    <span className="mono-num font-semibold text-ink">{p.symbol}</span>{" "}
                    <span
                      className={clsx(
                        "mono-num",
                        zone.tone === "up" ? "text-up" : zone.tone === "down" ? "text-down" : "text-ink-muted"
                      )}
                    >
                      RSI {p.rsi.toFixed(1)}
                    </span>
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
            );
          })}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/70 text-[11px] text-ink-faint">
              Memuat {current.interval}…
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-faint">
          AVG RSI <span className="mono-num font-semibold text-gold">{current.avgRsi?.toFixed(1) ?? "—"}</span>
        </span>
        {overallZone && (
          <span
            className={clsx(
              "font-semibold",
              overallZone.tone === "up" ? "text-up" : overallZone.tone === "down" ? "text-down" : "text-ink-muted"
            )}
          >
            {overallZone.label}
          </span>
        )}
        {errored && <span className="text-down">Gagal memuat interval baru — data sebelumnya ditampilkan.</span>}
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">Kondisi momentum teknikal (RSI-14), bukan sinyal beli/jual.</p>
    </div>
  );
}
