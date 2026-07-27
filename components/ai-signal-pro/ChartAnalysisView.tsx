"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Loader2, Target, TrendingUp, TrendingDown, Minus, Save, Check } from "lucide-react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge, SideBadge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { IntelligenceRail } from "./IntelligenceRail";
import { formatUsd } from "@/lib/format";
import type { Candle, ScanResult, OrderType, TradeGrade } from "@/lib/elvoid/types";
import type { ChartLevels } from "./TradingChart";

// lightweight-charts touches the DOM/canvas directly and has no reason to
// render on the server — dynamic + ssr:false keeps it out of the initial
// server-rendered bundle entirely (perf requirement from the brief).
const TradingChart = dynamic(() => import("./TradingChart").then((m) => m.TradingChart), {
  ssr: false,
  loading: () => (
    <div className="flex h-[440px] w-full items-center justify-center">
      <SkeletonCard lines={4} className="w-full" />
    </div>
  ),
});

const TIMEFRAMES = [
  { key: "1m", label: "1m" },
  { key: "5m", label: "5m" },
  { key: "15m", label: "15m" },
  { key: "1h", label: "1H" },
  { key: "4h", label: "4H" },
  { key: "1d", label: "1D" },
] as const;

interface AnalyzeSignal {
  coin: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  timeframe: string;
  confidence: number;
  risk_percent: number;
  reason: string;
  strategy: string;
  scans: ScanResult[];
  extraReasoning: ScanResult[];
  riskLevel: "low" | "medium" | "high";
  tradeGrade: TradeGrade;
  probabilityTp: number;
  probabilitySl: number;
}

const GRADE_TONE: Record<TradeGrade, "up" | "signal" | "amber"> = {
  "A++": "up",
  "A+": "up",
  A: "up",
  "B+": "signal",
  B: "signal",
  "C+": "amber",
  C: "amber",
};

function rr(entry: number, sl: number, tp: number): string {
  const risk = Math.abs(entry - sl) || 1e-9;
  return `${(Math.abs(tp - entry) / risk).toFixed(2)}R`;
}

export function ChartAnalysisView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [symbolInput, setSymbolInput] = useState(searchParams.get("symbol") ?? "BTC");
  const [symbol, setSymbol] = useState((searchParams.get("symbol") ?? "BTC").toUpperCase());
  const [timeframe, setTimeframe] = useState(searchParams.get("timeframe") ?? "4h");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [signal, setSignal] = useState<AnalyzeSignal | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCandles = useCallback(async (sym: string, tf: string) => {
    setCandlesLoading(true);
    try {
      const res = await fetch(`/api/klines?symbol=${sym}&interval=${tf}&limit=300`).then((r) => r.json());
      setCandles(Array.isArray(res.candles) ? res.candles : []);
    } catch {
      setCandles([]);
    } finally {
      setCandlesLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback(async (sym: string, tf: string) => {
    setAnalyzing(true);
    setMessage(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/ai-signals/analyze-chart?symbol=${sym}&timeframe=${tf}`).then((r) => r.json());
      if (res.error) {
        setMessage(res.error);
        setSignal(null);
      } else if (!res.signal) {
        setMessage(res.message ?? "Belum ada setup yang jelas untuk kombinasi ini.");
        setSignal(null);
      } else {
        setSignal(res.signal);
      }
    } catch {
      setMessage("Analisa gagal — koneksi ke server terputus. Coba lagi sebentar.");
      setSignal(null);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    loadCandles(symbol, timeframe);
    loadAnalysis(symbol, timeframe);
  }, [symbol, timeframe, loadCandles, loadAnalysis]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) return;
    setSymbol(sym);
    router.replace(`/ai-signal?tab=chart&symbol=${sym}&timeframe=${timeframe}`);
  }

  function handleTimeframe(tf: string) {
    setTimeframe(tf);
    router.replace(`/ai-signal?tab=chart&symbol=${symbol}&timeframe=${tf}`);
  }

  async function handleSaveSignal() {
    if (!signal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const raw = await fetch("/api/ai-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin: signal.coin, timeframe: signal.timeframe }),
      });
      const res = await raw.json();
      if (res.error) {
        setSaveError(res.error);
      } else {
        setSaved(true);
      }
    } catch {
      setSaveError("Gagal menyimpan signal — coba lagi sebentar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExecute() {
    if (!signal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const raw = await fetch("/api/ai-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin: signal.coin, timeframe: signal.timeframe }),
      });
      const res = await raw.json();
      if (res.error || !res.signal?.id) {
        setSaveError(res.error ?? "Gagal menghasilkan signal untuk dieksekusi.");
        return;
      }
      await fetch("/api/paper-trader/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: res.signal.id, orderType }),
      });
      setSaved(true);
    } catch {
      setSaveError("Gagal eksekusi — coba lagi sebentar.");
    } finally {
      setSaving(false);
    }
  }

  const levels: ChartLevels | null = signal
    ? { side: signal.side, entry: signal.entry, sl: signal.sl, tp1: signal.tp1, tp2: signal.tp2, tp3: signal.tp3 ?? null }
    : null;

  const allReasoning = signal ? [...signal.scans, ...signal.extraReasoning] : [];
  const winningBias = signal?.side === "LONG" ? "bullish" : "bearish";
  const fired = allReasoning.filter((r) => r.bias === winningBias && r.weight > 0).sort((a, b) => b.weight - a.weight);

  return (
    <div className="space-y-4">
      <div className="glow-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2 rounded-md border border-line bg-bg px-3 py-2">
          <Search size={14} className="text-ink-faint" />
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="Simbol, mis. BTC"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
          <button type="submit" className="shrink-0 rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-glow">
            Load Chart
          </button>
        </form>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-line text-xs">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => handleTimeframe(tf.key)}
              className={clsx(
                "px-3 py-2 font-medium transition-colors",
                timeframe === tf.key ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="glow-card overflow-hidden p-2">
          {candlesLoading ? (
            <div className="flex h-[440px] items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" /> Memuat candle {symbol}…
            </div>
          ) : candles.length ? (
            <TradingChart symbol={symbol} interval={timeframe} candles={candles} levels={levels} />
          ) : (
            <div className="flex h-[440px] items-center justify-center text-sm text-ink-muted">
              Data candle tidak tersedia untuk {symbol}USDT di Binance Futures.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-2 pt-2 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "#8B7BFF" }} /> EMA 20
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "#FFB020" }} /> EMA 50
            </span>
            {levels && (
              <>
                <span className="flex items-center gap-1">🟢 Entry</span>
                <span className="flex items-center gap-1">🔴 SL</span>
                <span className="flex items-center gap-1">🟣 TP1</span>
                <span className="flex items-center gap-1">🟡 TP2</span>
                <span className="flex items-center gap-1">🔵 TP3</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {analyzing && <SkeletonCard lines={8} />}

          {!analyzing && !signal && (
            <div className="glow-card flex flex-col items-center gap-2 p-6 text-center">
              <Minus size={20} className="text-ink-faint" />
              <p className="text-sm text-ink-muted">{message ?? "Belum ada setup yang jelas untuk kombinasi ini."}</p>
            </div>
          )}

          {!analyzing && signal && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glow-card space-y-4 p-4">
              <SectionHeader code="AI" title="Market Bias" hint={signal.timeframe} />

              <div className="flex flex-wrap items-center gap-2">
                <SideBadge side={signal.side} size="md" />
                <Badge tone={GRADE_TONE[signal.tradeGrade]} size="md" icon={<Target size={11} />}>
                  Grade {signal.tradeGrade}
                </Badge>
                {signal.side === "LONG" ? (
                  <TrendingUp size={16} className="text-up" />
                ) : (
                  <TrendingDown size={16} className="text-down" />
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-ink-faint">Confidence</span>
                  <span className="mono-num font-semibold text-signal-glow">{signal.confidence}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${signal.confidence}%` }}
                    className="h-full rounded-full bg-signal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="text-ink-faint">Probability TP</span>
                    <span className="mono-num text-up">{signal.probabilityTp}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
                    <div className="h-full rounded-full bg-up" style={{ width: `${signal.probabilityTp}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="text-ink-faint">Probability SL</span>
                    <span className="mono-num text-down">{signal.probabilitySl}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
                    <div className="h-full rounded-full bg-down" style={{ width: `${signal.probabilitySl}%` }} />
                  </div>
                </div>
              </div>

              <div className="mono-num grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">🟢 Entry</p>
                  <p>{formatUsd(signal.entry)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">🔴 SL</p>
                  <p className="text-down">{formatUsd(signal.sl)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">Risk</p>
                  <p>{signal.risk_percent}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">🟣 TP1 · {rr(signal.entry, signal.sl, signal.tp1)}</p>
                  <p className="text-up">{formatUsd(signal.tp1)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">🟡 TP2 · {rr(signal.entry, signal.sl, signal.tp2)}</p>
                  <p className="text-up">{formatUsd(signal.tp2)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-ink-faint">🔵 TP3 · {rr(signal.entry, signal.sl, signal.tp3)}</p>
                  <p className="text-up">{formatUsd(signal.tp3)}</p>
                </div>
              </div>

              <div>
                <p className="eyebrow mb-2 text-[10px] uppercase tracking-wider text-ink-faint">Alasan Analisa</p>
                <ul className="space-y-1.5">
                  {fired.slice(0, 10).map((r) => (
                    <li key={r.key} className="flex items-start gap-1.5 text-[12px] text-ink-muted">
                      <span className={clsx("mt-0.5 shrink-0", signal.side === "LONG" ? "text-up" : "text-down")}>•</span>
                      <span>
                        <span className="font-medium text-ink">{r.label}:</span> {r.detail}
                      </span>
                    </li>
                  ))}
                  {!fired.length && <li className="text-[12px] text-ink-faint">Belum ada kategori yang cukup kuat searah sinyal ini.</li>}
                </ul>
              </div>

              <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-ink-muted">{signal.reason}</p>

              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
                  {(["market", "limit", "stop"] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOrderType(t)}
                      className={clsx(
                        "flex-1 py-1.5 capitalize transition-colors",
                        orderType === t ? "bg-signal/20 text-signal-glow" : "text-ink-faint hover:text-ink"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSignal}
                    disabled={saving || saved}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink disabled:opacity-50"
                  >
                    {saved ? <Check size={13} /> : <Save size={13} />}
                    {saved ? "Tersimpan" : "Simpan Signal"}
                  </button>
                  <button
                    onClick={handleExecute}
                    disabled={saving || saved}
                    className="flex-1 rounded-md bg-signal py-2 text-xs font-medium text-white hover:bg-signal-glow disabled:opacity-50"
                  >
                    {saving ? "Memproses…" : `Execute ${orderType}`}
                  </button>
                </div>
                {saveError && <p className="text-xs text-down">{saveError}</p>}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <IntelligenceRail symbol={symbol} signal={signal} />
    </div>
  );
}
