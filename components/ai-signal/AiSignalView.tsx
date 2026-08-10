"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Radar, Loader2, LineChart, ListChecks } from "lucide-react";
import clsx from "clsx";
import { SignalCardPro } from "@/components/ai-signal-pro/SignalCardPro";
import { ChartAnalysisView } from "@/components/ai-signal-pro/ChartAnalysisView";
import { Disclaimer } from "@/components/Disclaimer";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { WatchlistPanel } from "@/components/ai-signal/WatchlistPanel";
import type { AiSignal, OrderType, TradeGrade } from "@/lib/elvoid/types";
import { GRADE_ORDER } from "@/lib/elvoid/types";
import { evaluateEntryConfirmation } from "@/lib/elvoid/confirmation";

type Filter = "all" | "long" | "short" | "high";
type Tab = "chart" | "watchlist";
const GRADE_FILTERS: TradeGrade[] = ["A++", "A+", "A", "B+", "B", "C"];

export function AiSignalView() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "watchlist" ? "watchlist" : "chart");
  const [signals, setSignals] = useState<AiSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [coinQuery, setCoinQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [minGrade, setMinGrade] = useState<TradeGrade | "all">("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-signals?limit=60").then((r) => r.json());
      setSignals(res.signals ?? []);
    } catch {
      // Keep whatever signals are already on screen; don't wipe the list on a transient fetch failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const raw = await fetch("/api/ai-signals/scan", { method: "POST" });
      if (!raw.ok && raw.status >= 500) {
        setError(`Scan gagal (HTTP ${raw.status}) — server tidak merespons dengan benar. Coba lagi sebentar.`);
        return;
      }
      const res = await raw.json();
      if (res.error) {
        setError(res.message ?? res.error);
      } else if (Array.isArray(res.signals) && res.signals.length === 0) {
        setError(
          "Scan selesai tapi 0 sinyal ditemukan. Biasanya ini berarti data candle Binance tidak bisa diakses dari server (Binance memblokir IP asal Amerika Serikat) — pastikan Vercel Function region di-set ke luar AS (mis. sin1), lalu redeploy."
        );
      }
      await load();
    } catch {
      setError("Scan gagal — koneksi ke server terputus atau timeout. Coba lagi sebentar.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAnalyze() {
    const coin = coinQuery.trim();
    if (!coin) return;
    setAnalyzing(true);
    setError(null);
    try {
      const raw = await fetch("/api/ai-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin }),
      });
      if (!raw.ok && raw.status >= 500) {
        setError(`Analyze gagal (HTTP ${raw.status}) — server tidak merespons dengan benar. Coba lagi sebentar.`);
        return;
      }
      const res = await raw.json();
      if (res.error) setError(res.message ?? res.error);
      else await load();
    } catch {
      setError("Analyze gagal — koneksi ke server terputus atau timeout. Coba lagi sebentar.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleExecute(signal: AiSignal, orderType: OrderType) {
    setExecutingId(signal.id);
    setError(null);
    try {
      const raw = await fetch("/api/paper-trader/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id, orderType }),
      });
      // Previously the response here was never checked — if executeSignal()
      // returned { error: "..." } (400), this silently did nothing: the
      // button just stopped spinning with no feedback, so the trade looked
      // like it never happened even though nothing actually failed loudly.
      let res: { error?: string; message?: string } | null = null;
      try {
        res = await raw.json();
      } catch {
        // no/invalid JSON body — fall through to the generic error below
      }
      if (!raw.ok || res?.error) {
        setError(res?.message ?? res?.error ?? `Execute gagal (HTTP ${raw.status}) — coba refresh dan cek lagi status sinyalnya.`);
        return;
      }
      await load();
    } catch {
      setError("Execute gagal — koneksi ke server terputus atau timeout. Coba lagi sebentar.");
    } finally {
      setExecutingId(null);
    }
  }

  const minGradeRank = minGrade === "all" ? 0 : GRADE_ORDER.indexOf(minGrade);
  const todayStr = new Date().toDateString();

  const filtered = signals.filter((s) => {
    if (filter === "long" && s.side !== "LONG") return false;
    if (filter === "short" && s.side !== "SHORT") return false;
    if (filter === "high" && s.confidence < 65) return false;
    if (minGrade !== "all" && (!s.trade_grade || GRADE_ORDER.indexOf(s.trade_grade) < minGradeRank)) return false;
    if (todayOnly && new Date(s.created_at).toDateString() !== todayStr) return false;
    if (confirmedOnly) {
      const confirmed =
        s.scans && s.confirmation_zone_ok !== null && s.confirmation_zone_ok !== undefined
          ? evaluateEntryConfirmation({
              side: s.side,
              scans: s.scans,
              extraReasoning: s.extra_reasoning ?? [],
              zoneOk: s.confirmation_zone_ok,
            }).status === "confirmed"
          : false;
      if (!confirmed) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <Disclaimer />

      <div className="flex gap-2">
        <button
          onClick={() => setTab("chart")}
          className={clsx(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            tab === "chart" ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
          )}
        >
          <LineChart size={13} /> Chart Analysis
        </button>
        <button
          onClick={() => setTab("watchlist")}
          className={clsx(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            tab === "watchlist" ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
          )}
        >
          <ListChecks size={13} /> Watchlist
        </button>
      </div>

      {tab === "chart" && <ChartAnalysisView />}

      {tab === "watchlist" && (
        <div className="space-y-5">
          <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-bg px-3 py-2">
              <Search size={14} className="text-ink-faint" />
              <input
                value={coinQuery}
                onChange={(e) => setCoinQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="Analisa coin, mis. BTC"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !coinQuery.trim()}
                className="shrink-0 rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-glow disabled:opacity-50"
              >
                {analyzing ? "Menganalisa…" : "Analyze"}
              </button>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-signal/40 px-3.5 py-2 text-xs font-medium text-signal-glow hover:border-signal disabled:opacity-50"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
              {scanning ? "Scanning market…" : "Scan Market"}
            </button>
          </div>

          <WatchlistPanel onSignalsChanged={load} />

          {error && <p className="text-sm text-down">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {(["all", "long", "short", "high"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs capitalize",
                  filter === f ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
                )}
              >
                {f === "high" ? "Only High Confidence" : f === "all" ? "All" : `Only ${f === "long" ? "Long" : "Short"}`}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-line" />
            <button
              onClick={() => setMinGrade("all")}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs",
                minGrade === "all" ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
              )}
            >
              Any Grade
            </button>
            {GRADE_FILTERS.map((g) => (
              <button
                key={g}
                onClick={() => setMinGrade(g)}
                title={`${g} atau lebih baik`}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs",
                  minGrade === g ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
                )}
              >
                {g}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-line" />
            <button
              onClick={() => setTodayOnly((v) => !v)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs",
                todayOnly ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
              )}
            >
              Only Today
            </button>
            <button
              onClick={() => setConfirmedOnly((v) => !v)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs",
                confirmedOnly ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted hover:text-ink"
              )}
            >
              Only Confirmed
            </button>
          </div>

          {loading ? (
            <SkeletonGrid count={4} className="sm:grid-cols-1 xl:grid-cols-2" />
          ) : filtered.length ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filtered.map((s) => (
                <SignalCardPro key={s.id} signal={s} onExecute={(orderType) => handleExecute(s, orderType)} executing={executingId === s.id} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">
              Belum ada sinyal. Klik <strong className="text-ink">Scan Market</strong> atau analisa coin tertentu di atas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
