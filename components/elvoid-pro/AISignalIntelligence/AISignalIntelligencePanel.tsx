"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, RefreshCw, ShieldOff } from "lucide-react";
import clsx from "clsx";

// ---------------------------------------------------------------------------
// ELVOID Intelligence — AI Signal Intelligence UI (Phase 8.3.0.1, Module 4)
//
// READ-ONLY OBSERVATION WINDOW. This component calls
// `GET /api/elvoid-pro/autonomous/snapshots` and NOTHING else — no
// `/api/elvoid-pro/oracle`, no Oracle call, no scoring, no execution. It
// renders whatever `runAutonomousBatch()` already computed on its own
// schedule (background cron / GitHub Actions tick — see README.md's
// "AI Signal Intelligence & Background Autonomous Runtime" section).
// Opening this tab must never trigger a fresh analysis cycle.
//
// Uses ELVOID Pro Oracle grades only (`OracleGrade` — NO_TRADE/B+/A/A+).
// This is deliberately NOT the separate 7-tier AI Signal engine scale —
// per spec §11, the two grading engines are never merged.
// ---------------------------------------------------------------------------

type OracleGrade = "NO_TRADE" | "B+" | "A" | "A+";
type AutonomousDecision = "EXECUTE" | "WAIT" | "REJECT";

interface Snapshot {
  symbol: string;
  generatedAt: string;
  decision: AutonomousDecision;
  side: "LONG" | "SHORT" | null;
  grade: OracleGrade;
  confidence: number;
  riskStatus: "unavailable" | "valid" | "invalid";
  entry: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  sparkline: number[] | null;
  liquidityEvidence: string | null;
  structureEvidence: string | null;
  volumeEvidence: string | null;
  macroState: string | null;
  eventState: string | null;
  reasoningSummary: string | null;
  invalidation: string | null;
  learningInfluence: string | null;
  dedupApplied: boolean;
  executionOutcome: string | null;
  paperTradeId: string | null;
  updatedAt: string;
}

const SNAPSHOT_POLL_MS = 30_000;

const GRADE_STYLE: Record<OracleGrade, string> = {
  "A+": "bg-gold/20 text-gold border-gold/40",
  A: "bg-up/15 text-up border-up/30",
  "B+": "bg-signal/15 text-signal border-signal/30",
  NO_TRADE: "bg-bg-raised text-ink-faint border-line",
};

const DECISION_STYLE: Record<AutonomousDecision, string> = {
  EXECUTE: "bg-up/15 text-up border-up/30",
  WAIT: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  REJECT: "bg-down/15 text-down border-down/30",
};

type FilterKey = "all" | "long" | "short" | "high_confidence" | "a_plus" | "a" | "b_plus";
type SortKey = "best_opportunity" | "confidence" | "symbol";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "long", label: "Only Long" },
  { key: "short", label: "Only Short" },
  { key: "high_confidence", label: "High Confidence" },
  { key: "a_plus", label: "A+" },
  { key: "a", label: "A" },
  { key: "b_plus", label: "B+" },
];

function formatPrice(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}d lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j lalu`;
}

/**
 * Phase 8.3.0.1 §6 (Mini Chart, Option A) — renders the real, bounded
 * closing-price array already persisted on the snapshot (verbatim from
 * OracleContext.candles at cycle time — see orchestrator.ts's
 * buildSparkline()). This component fetches NOTHING of its own; it is
 * pure SVG over whatever `points` it's given. Returns null (renders
 * nothing, never a placeholder/decorative line) when there's too little
 * real data to draw.
 */
function Sparkline({ points, color }: { points: number[] | null; color: string }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SnapshotCard({ snapshot, rank }: { snapshot: Snapshot; rank: number }) {
  const side = snapshot.side;
  const sideColor = side === "LONG" ? "text-up" : side === "SHORT" ? "text-down" : "text-ink-faint";

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold text-ink-faint">#{rank}</span>
          <span className="truncate text-sm font-bold text-ink">{snapshot.symbol}/USDT</span>
        </div>
        <span className={clsx("shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold", DECISION_STYLE[snapshot.decision])}>{snapshot.decision}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className={clsx("flex items-center gap-1 text-xs font-semibold", sideColor)}>
          {side ?? "NEUTRAL"}
          {side === "LONG" && <ArrowUpRight size={13} />}
          {side === "SHORT" && <ArrowDownRight size={13} />}
        </div>
        <span className={clsx("rounded border px-1.5 py-0.5 text-[10px] font-bold", GRADE_STYLE[snapshot.grade])}>{snapshot.grade}</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-ink-faint">
          <span>Confidence</span>
          <span className="mono-num text-ink">{snapshot.confidence}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-bg-raised">
          <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, snapshot.confidence))}%` }} />
        </div>
      </div>

      <Sparkline points={snapshot.sparkline} color={side === "SHORT" ? "#FF5252" : "#00E676"} />

      <dl className="mono-num grid grid-cols-2 gap-y-1 text-[10px]">
        <dt className="text-ink-faint">Entry</dt>
        <dd className="text-right text-ink">{formatPrice(snapshot.entry)}</dd>
        <dt className="text-ink-faint">TP</dt>
        <dd className="text-right text-up">{formatPrice(snapshot.takeProfit)}</dd>
        <dt className="text-ink-faint">SL</dt>
        <dd className="text-right text-down">{formatPrice(snapshot.stopLoss)}</dd>
      </dl>

      <div className="grid grid-cols-3 gap-1.5 border-t border-line pt-2 text-center text-[9px]">
        <div>
          <p className="text-ink-faint">Liquidity</p>
          <p className="mt-0.5 truncate text-ink-muted" title={snapshot.liquidityEvidence ?? undefined}>{snapshot.liquidityEvidence ? "Ada" : "N/A"}</p>
        </div>
        <div>
          <p className="text-ink-faint">Structure</p>
          <p className="mt-0.5 truncate text-ink-muted" title={snapshot.structureEvidence ?? undefined}>{snapshot.structureEvidence ? "Ada" : "N/A"}</p>
        </div>
        <div>
          <p className="text-ink-faint">Volume</p>
          <p className="mt-0.5 truncate text-ink-muted" title={snapshot.volumeEvidence ?? undefined}>{snapshot.volumeEvidence ? "Ada" : "N/A"}</p>
        </div>
      </div>

      {(snapshot.macroState || snapshot.eventState) && (
        <p className="truncate text-[9px] text-ink-faint">
          {snapshot.macroState} {snapshot.eventState ? `· ${snapshot.eventState}` : ""}
        </p>
      )}

      {snapshot.reasoningSummary && <p className="line-clamp-2 text-[10px] leading-relaxed text-ink-faint">Reason: {snapshot.reasoningSummary}</p>}

      <p className="text-[9px] text-ink-faint">{timeAgo(snapshot.updatedAt)}</p>
    </div>
  );
}

export function AISignalIntelligencePanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("best_opportunity");

  const load = useCallback(() => {
    let cancelled = false;
    fetch("/api/elvoid-pro/autonomous/snapshots")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(json.error ?? "Gagal memuat AI Signal Intelligence.");
          setStatus("error");
          return;
        }
        setSnapshots((json.snapshots ?? []) as Snapshot[]);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg("Gagal memuat AI Signal Intelligence.");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = load();
    const interval = setInterval(load, SNAPSHOT_POLL_MS);
    return () => {
      cleanup?.();
      clearInterval(interval);
    };
  }, [load]);

  const filtered = useMemo(() => {
    return snapshots.filter((s) => {
      if (filter === "long") return s.side === "LONG";
      if (filter === "short") return s.side === "SHORT";
      if (filter === "high_confidence") return s.grade === "A+";
      if (filter === "a_plus") return s.grade === "A+";
      if (filter === "a") return s.grade === "A";
      if (filter === "b_plus") return s.grade === "B+";
      return true;
    });
  }, [snapshots, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    // Ranking is presentation-only, reusing existing Oracle output — never a
    // second scoring engine (spec §14). "Best Opportunity" orders by
    // confidence, the same deterministic value gradeConfluence() already
    // produced; it never re-ranks by anything computed here.
    if (sort === "confidence" || sort === "best_opportunity") copy.sort((a, b) => b.confidence - a.confidence);
    if (sort === "symbol") copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return copy;
  }, [filtered, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            AI SIGNAL INTELLIGENCE
            <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold">Multi-Market Scanner</span>
          </p>
          <p className="mt-0.5 text-[10px] text-ink-faint">
            Observation window ke autonomous ELVOID intelligence — {snapshots.length} symbol dipantau. Data hanya dibaca dari snapshot terakhir, tidak memicu analisis baru.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] text-ink-muted hover:border-gold/40 hover:text-gold">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors",
                filter === f.key ? "bg-gold/15 text-gold" : "text-ink-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-line bg-bg-raised px-2 py-1 text-[10px] text-ink-muted"
        >
          <option value="best_opportunity">Sort: Best Opportunity</option>
          <option value="symbol">Sort: Symbol</option>
        </select>
      </div>

      {status === "loading" && <p className="animate-pulse py-6 text-center text-[11px] text-ink-faint">Memuat snapshot intelligence terbaru…</p>}

      {status === "error" && (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <ShieldOff size={18} className="text-ink-faint" />
          <p className="text-[11px] text-ink-faint">{errorMsg}</p>
          <button onClick={load} className="mt-1 rounded-md border border-line px-2.5 py-1 text-[10px] text-ink-muted hover:border-gold/40 hover:text-gold">
            Coba lagi
          </button>
        </div>
      )}

      {status === "ready" && sorted.length === 0 && (
        <p className="py-6 text-center text-[11px] text-ink-faint">Belum ada snapshot — autonomous runtime belum menyelesaikan siklus pertama untuk symbol manapun.</p>
      )}

      {status === "ready" && sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((s, i) => (
            <SnapshotCard key={s.symbol} snapshot={s} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
