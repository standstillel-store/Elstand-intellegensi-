"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon, Brain, CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import { formatUsd, timeAgo } from "@/lib/format";
import { generateTradeReview } from "@/lib/elvoid/review";
import type { JournalWithSignal } from "@/lib/elvoid/types";

const RESULT_STYLE: Record<string, string> = {
  win: "bg-up/15 text-up border-up/30",
  loss: "bg-down/15 text-down border-down/30",
  breakeven: "bg-ink-faint/10 text-ink-muted border-line",
};

export function JournalView({ entries }: { entries: JournalWithSignal[] }) {
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "loss" | "breakeven">("all");
  const [coinFilter, setCoinFilter] = useState("all");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const coins = useMemo(() => {
    const set = new Set(entries.map((e) => e.signal?.coin).filter(Boolean) as string[]);
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const strategies = useMemo(() => {
    const set = new Set(entries.map((e) => e.signal?.strategy).filter(Boolean) as string[]);
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const timeframes = useMemo(() => {
    const set = new Set(entries.map((e) => e.signal?.timeframe).filter(Boolean) as string[]);
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (resultFilter !== "all" && e.result !== resultFilter) return false;
    if (coinFilter !== "all" && e.signal?.coin !== coinFilter) return false;
    if (strategyFilter !== "all" && e.signal?.strategy !== strategyFilter) return false;
    if (timeframeFilter !== "all" && e.signal?.timeframe !== timeframeFilter) return false;
    return true;
  });

  if (!entries.length) {
    return (
      <div className="glow-card p-6 text-center text-sm text-ink-muted">
        Belum ada trade yang ditutup. Eksekusi sinyal di halaman <strong className="text-ink">AI Signal</strong>, lalu Sync di{" "}
        <strong className="text-ink">Paper Trader</strong> untuk mulai mengisi journal ini.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "win", "loss", "breakeven"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setResultFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${
              resultFilter === f ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            {f}
          </button>
        ))}
        <select
          value={coinFilter}
          onChange={(e) => setCoinFilter(e.target.value)}
          className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-ink-muted outline-none"
        >
          {coins.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "Semua Coin" : c}
            </option>
          ))}
        </select>
        <select
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
          className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-ink-muted outline-none"
        >
          {strategies.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "Semua Strategi" : s}
            </option>
          ))}
        </select>
        <select
          value={timeframeFilter}
          onChange={(e) => setTimeframeFilter(e.target.value)}
          className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-ink-muted outline-none"
        >
          {timeframes.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "Semua Timeframe" : t}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-ink-faint">{filtered.length} entri</span>
      </div>

      <div className="glow-card divide-y divide-line p-0">
        {!filtered.length && <p className="p-6 text-center text-sm text-ink-muted">Tidak ada trade yang cocok dengan filter ini.</p>}
        {filtered.map((e) => {
          const expanded = expandedId === e.id;
          return (
            <div key={e.id}>
              <button
                onClick={() => setExpandedId(expanded ? null : e.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-bg-raised/40"
              >
                <span
                  className={`mono-num inline-flex h-6 w-16 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium uppercase ${RESULT_STYLE[e.result]}`}
                >
                  {e.result}
                </span>
                <span className="w-14 shrink-0 font-medium">{e.signal?.coin ?? "?"}</span>
                <span className={`mono-num w-12 shrink-0 text-xs ${e.signal?.side === "LONG" ? "text-up" : "text-down"}`}>
                  {e.signal?.side}
                </span>
                <span className="hidden flex-1 truncate text-xs text-ink-faint sm:block">{e.signal?.strategy}</span>
                <span className={`mono-num shrink-0 text-xs ${e.profit_percent >= 0 ? "text-up" : "text-down"}`}>
                  {e.profit_percent >= 0 ? "+" : ""}
                  {e.profit_percent.toFixed(2)}%
                </span>
                <span className="mono-num hidden w-14 shrink-0 text-right text-xs text-ink-faint sm:block">{e.rr.toFixed(2)}R</span>
                {e.screenshot_url && <ImageIcon size={12} className="shrink-0 text-ink-faint" />}
                <span className="hidden w-16 shrink-0 text-right text-[11px] text-ink-faint md:block">{timeAgo(e.closed_at)}</span>
                {expanded ? (
                  <ChevronUp size={14} className="shrink-0 text-ink-faint" />
                ) : (
                  <ChevronDown size={14} className="shrink-0 text-ink-faint" />
                )}
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-line bg-bg/40 px-4 py-3 text-xs text-ink-muted">
                  {e.signal && (
                    <p>
                      Entry sinyal: <span className="mono-num text-ink">{formatUsd(e.signal.entry)}</span> · Confidence saat
                      sinyal dibuat: <span className="mono-num text-ink">{e.signal.confidence}%</span>
                    </p>
                  )}
                  {e.signal?.reason && <p className="leading-relaxed">{e.signal.reason}</p>}
                  {e.notes && <p className="italic text-ink-faint">Catatan penutupan: {e.notes}</p>}
                  {e.duration_minutes !== null && (
                    <p>
                      Durasi posisi:{" "}
                      {e.duration_minutes < 60 ? `${e.duration_minutes} menit` : `${(e.duration_minutes / 60).toFixed(1)} jam`}
                    </p>
                  )}
                  {e.screenshot_url && (
                    <a href={e.screenshot_url} target="_blank" rel="noopener noreferrer" className="block pt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.screenshot_url}
                        alt={`Screenshot trade ${e.signal?.coin ?? ""}`}
                        className="max-h-48 rounded-md border border-line object-cover"
                      />
                    </a>
                  )}

                  {(() => {
                    const review = generateTradeReview(e);
                    return (
                      <div className="space-y-2 rounded-md border border-line bg-bg-raised/50 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                          <Brain size={12} className="text-signal-glow" /> AI Review: {review.verdict}
                        </p>
                        {review.points.map((p, i) => (
                          <p key={`p-${i}`} className="flex items-start gap-1.5">
                            <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-up" /> {p}
                          </p>
                        ))}
                        {review.mistakes.map((m, i) => (
                          <p key={`m-${i}`} className="flex items-start gap-1.5">
                            <XCircle size={12} className="mt-0.5 shrink-0 text-down" /> {m}
                          </p>
                        ))}
                        {review.recommendations.map((r, i) => (
                          <p key={`r-${i}`} className="flex items-start gap-1.5">
                            <Lightbulb size={12} className="mt-0.5 shrink-0 text-amber" /> {r}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
