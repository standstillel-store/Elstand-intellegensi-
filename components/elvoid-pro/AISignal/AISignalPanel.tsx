"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, ShieldOff } from "lucide-react";
import clsx from "clsx";
import type { AiSignal } from "@/lib/elvoid/types";

export function AISignalPanel({ symbol }: { symbol: string }) {
  const [signal, setSignal] = useState<AiSignal | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/ai-signals?status=new,pending,open&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const signals: AiSignal[] = data.signals ?? [];
        const match = signals.find((s) => s.coin.toUpperCase() === symbol.toUpperCase()) ?? null;
        setSignal(match);
        setStatus(match ? "ready" : "empty");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">ELVOID AI Signal</p>
        {signal?.trade_grade && (
          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold">{signal.trade_grade}</span>
        )}
      </div>

      {status === "loading" && <p className="mt-4 animate-pulse text-[11px] text-ink-faint">Memuat sinyal…</p>}

      {status === "error" && <p className="mt-4 text-[11px] text-ink-faint">Gagal memuat sinyal AI.</p>}

      {status === "empty" && (
        <div className="mt-3 flex flex-col items-center gap-1.5 py-4 text-center">
          <ShieldOff size={18} className="text-ink-faint" />
          <p className="text-[11px] font-medium text-ink-muted">AI SIGNAL UNAVAILABLE</p>
          <p className="text-[10px] text-ink-faint">Belum ada sinyal aktif untuk {symbol}/USDT.</p>
        </div>
      )}

      {status === "ready" && signal && (
        <div className="mt-3 space-y-3">
          <div className={clsx("flex items-center gap-1.5 text-lg font-bold", signal.side === "LONG" ? "text-up" : "text-down")}>
            {signal.side}
            {signal.side === "LONG" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
          </div>
          <p className="text-[11px] text-ink-muted">{signal.strategy}</p>

          <div>
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>Confidence</span>
              <span className="mono-num text-ink">{signal.confidence}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-bg-raised">
              <div
                className="h-1.5 rounded-full bg-signal"
                style={{ width: `${Math.min(100, Math.max(0, signal.confidence))}%` }}
              />
            </div>
          </div>

          <dl className="mono-num grid grid-cols-2 gap-y-2 text-[11px]">
            <dt className="text-ink-faint">Entry</dt>
            <dd className="text-right text-ink">
              {signal.ideal_entry_low && signal.ideal_entry_high
                ? `${signal.ideal_entry_low.toLocaleString()} – ${signal.ideal_entry_high.toLocaleString()}`
                : signal.entry.toLocaleString()}
            </dd>

            <dt className="text-ink-faint">Take Profit</dt>
            <dd className="text-right text-up">
              {[signal.tp1, signal.tp2, signal.tp3].filter(Boolean).map((t) => t!.toLocaleString()).join(" / ")}
            </dd>

            <dt className="text-ink-faint">Stop Loss</dt>
            <dd className="text-right text-down">{signal.sl.toLocaleString()}</dd>

            <dt className="text-ink-faint">Timeframe</dt>
            <dd className="text-right text-ink">{signal.timeframe}</dd>

            {signal.confluence_count !== null && signal.confluence_total !== null && (
              <>
                <dt className="text-ink-faint">Confluence</dt>
                <dd className="text-right text-ink">
                  {signal.confluence_count}/{signal.confluence_total}
                </dd>
              </>
            )}
          </dl>

          <p className="line-clamp-3 text-[10px] leading-relaxed text-ink-faint">{signal.reason}</p>
        </div>
      )}
    </div>
  );
}
