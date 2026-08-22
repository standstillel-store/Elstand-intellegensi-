"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Activity, ShieldOff, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import type { InsightEngineResult, InsightPattern } from "@/lib/ai/insights/types";

const REGIME_LABEL: Record<string, string> = {
  TRENDING: "TRENDING",
  RANGING: "RANGING",
  ACCUMULATION: "ACCUMULATION",
  DISTRIBUTION: "DISTRIBUTION",
  BREAKOUT: "BREAKOUT",
  ABSORPTION: "ABSORPTION",
  HIGH_VOLATILITY: "HIGH VOLATILITY",
  LOW_LIQUIDITY: "LOW LIQUIDITY",
  UNAVAILABLE: "UNAVAILABLE",
};

const SOURCE_LABEL: Record<string, string> = {
  market_structure: "Market Structure",
  smc_ict: "SMC/ICT",
  tpo: "TPO",
  footprint: "Footprint",
  orderbook: "Order Book",
  liquidity: "Liquidity",
  microstructure: "Microstructure",
  macro: "Macro",
};

function InsightCard({ pattern }: { pattern: InsightPattern }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-line bg-bg-raised/40 p-2.5">
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink">{pattern.label}</span>
          {pattern.dataQuality === "proxy" && <span className="rounded bg-amber-400/15 px-1 py-0.5 text-[8px] font-bold text-amber-400">PROXY</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="mono-num text-[10px] text-ink-muted">{pattern.confidence}%</span>
          {expanded ? <ChevronUp size={12} className="text-ink-faint" /> : <ChevronDown size={12} className="text-ink-faint" />}
        </span>
      </button>
      <div className="mt-1 h-1 rounded-full bg-bg-surface">
        <div className="h-1 rounded-full bg-signal" style={{ width: `${pattern.confidence}%` }} />
      </div>
      {expanded && (
        <div className="mt-2 space-y-2 text-[10px] leading-relaxed">
          <p className="text-ink-muted">{pattern.interpretation}</p>
          <div>
            <p className="mb-0.5 font-medium text-ink-faint">EVIDENCE</p>
            <ul className="space-y-0.5 text-ink-faint">
              {pattern.evidence.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1">
            {pattern.confirmingSources.map((s) => (
              <span key={s} className="rounded border border-line px-1.5 py-0.5 text-[9px] text-ink-muted">
                ✓ {SOURCE_LABEL[s] ?? s}
              </span>
            ))}
          </div>
          <p className="text-down/80">
            <span className="text-ink-muted">Risk:</span> {pattern.risk}
          </p>
        </div>
      )}
    </div>
  );
}

export function InsightsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<InsightEngineResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/elvoid-pro/insights?symbol=${encodeURIComponent(symbol)}&interval=15m`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(json.error ?? "Gagal memuat AI Insights.");
          setStatus("error");
          return;
        }
        setData(json as InsightEngineResult);
        setStatus("ready");
      })
      .catch(() => !cancelled && (setErrorMsg("Gagal memuat AI Insights."), setStatus("error")));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    // Debounce: symbol switches fire immediately on unmount/mount, but this
    // avoids a burst of calls if the parent re-renders `symbol` rapidly
    // (spec §8 — debounce/throttle, don't recalculate on every tick).
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Activity size={13} className="text-signal" /> AI INSIGHTS & PATTERNS
        </p>
        {data && data.regime !== "UNAVAILABLE" && (
          <span className="rounded border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-[9px] font-bold text-signal">{REGIME_LABEL[data.regime]}</span>
        )}
      </div>

      {status === "loading" && !data && <p className="mt-4 animate-pulse text-[11px] text-ink-faint">Menganalisis market…</p>}

      {status === "error" && (
        <div className="mt-3 flex flex-col items-center gap-1.5 py-4 text-center">
          <ShieldOff size={18} className="text-ink-faint" />
          <p className="text-[11px] text-ink-faint">{errorMsg}</p>
        </div>
      )}

      {data && data.regime === "UNAVAILABLE" && (
        <p className="mt-3 text-[11px] text-ink-faint">{data.regimeEvidence}</p>
      )}

      {data && data.regime !== "UNAVAILABLE" && (
        <div className="mt-3 space-y-3">
          <div>
            <p
              className={clsx(
                "text-[11px] font-semibold",
                data.marketState.bias === "BULLISH" ? "text-up" : data.marketState.bias === "BEARISH" ? "text-down" : "text-ink-muted"
              )}
            >
              {data.marketState.flowLabel} · {data.marketState.confirmationStrength}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">{data.marketState.interpretation}</p>
            {data.marketState.but.length > 0 && (
              <p className="mt-1 text-[10px] leading-relaxed text-amber-400/80">But: {data.marketState.but.slice(0, 2).join(" · ")}</p>
            )}
          </div>

          {data.topInsights.length === 0 && (
            <p className="text-[10px] text-ink-faint">Belum ada pattern dengan evidence yang cukup kuat saat ini.</p>
          )}

          {data.topInsights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-medium uppercase tracking-wide text-ink-faint">Top Insights</p>
              {data.topInsights.slice(0, 5).map((p) => (
                <InsightCard key={p.kind} pattern={p} />
              ))}
            </div>
          )}

          {data.history.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-ink-faint">Pattern History</p>
              <ul className="space-y-0.5">
                {data.history.slice(0, 6).map((h, i) => (
                  <li key={i} className="flex items-center justify-between text-[10px] text-ink-faint">
                    <span>{h.label}</span>
                    <span className="mono-num">{new Date(h.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
