"use client";
import { useEffect, useState, useCallback } from "react";
import { Crown, ArrowUpRight, ArrowDownRight, ShieldOff, Radar, CheckCircle2, CircleDashed, XCircle, Clock } from "lucide-react";
import clsx from "clsx";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { OracleInsight } from "@/lib/ai/oracle/insight";
import type { MtfContext } from "@/lib/ai/oracle/mtf";
import type { LiquidityOrderFlowContext } from "@/lib/ai/oracle/liquidityOrderFlow";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { Candle } from "@/lib/elvoid/types";
import { useAutonomousRuntimeTick } from "@/lib/hooks/useAutonomousRuntimeTick";
import { OracleDecisionChart } from "./OracleDecisionChart";
import { OracleWhySection } from "./OracleWhySection";

interface AutonomousStatusResponse {
  symbol: string;
  latestDecision: { outcome: "EXECUTE" | "WAIT" | "REJECT" | "EXPIRE"; side: "LONG" | "SHORT" | null; decisionTimestamp: string; sourceSignalId: string | null } | null;
  validatedLearningActive: boolean;
}

const AUTONOMOUS_STATUS_POLL_MS = 20_000;

/**
 * Phase 8.2.9 — replaces the old manual "Execute Signal" button. The
 * ELVOID Pro autonomous runtime (app/api/elvoid-pro/autonomous/tick,
 * ticked in the background by useAutonomousRuntimeTick below) is the sole
 * authority over whether a Paper Trade gets created; this component only
 * OBSERVES the most recent decision it already produced for this symbol
 * — it never triggers execution itself.
 *
 * Also the accurate home for a genuine EXECUTE/WAIT/REJECT/EXPIRE reading:
 * the Oracle assessment above (OracleAssessment) only ever carries a
 * grade (NO_TRADE/B+/A/A+) + side, it has no REJECT/EXPIRE state of its
 * own — those are outcomes of the separate autonomous decision engine,
 * surfaced here rather than invented on the assessment header.
 */
function AutonomousStatusCard({ symbol }: { symbol: string }) {
  const [status, setStatus] = useState<AutonomousStatusResponse | null>(null);

  useAutonomousRuntimeTick(true);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch(`/api/elvoid-pro/autonomous/status?symbol=${encodeURIComponent(symbol)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!cancelled && json) setStatus(json as AutonomousStatusResponse);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, AUTONOMOUS_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  const decision = status?.latestDecision ?? null;

  const outcomeLabel: Record<string, string> = { EXECUTE: "PAPER TRADE CREATED", WAIT: "WAIT — belum ada trade", REJECT: "REJECT — tidak ada trade", EXPIRE: "EXPIRED" };
  const outcomeIcon = decision?.outcome === "EXECUTE" ? <CheckCircle2 size={13} className="text-up" /> : decision?.outcome === "REJECT" ? <XCircle size={13} className="text-down" /> : <CircleDashed size={13} className="text-ink-faint" />;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-gold/20 bg-bg-raised/40 p-2.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
          <Radar size={12} className="animate-pulse" /> Autonomous Mode — Monitoring
        </p>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-faint">Latest Decision</span>
        <span className="flex items-center gap-1 font-semibold text-ink">
          {decision ? decision.outcome : "—"}
          {decision && (decision.outcome === "EXECUTE" ? <ArrowUpRight size={12} className="text-up" /> : null)}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-ink-faint">Execution</span>
        <span className="flex items-center gap-1 text-ink-muted">
          {outcomeIcon}
          {decision ? outcomeLabel[decision.outcome] : "Belum ada siklus autonomous"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-ink-faint">Learning</span>
        <span className={clsx("font-medium", status?.validatedLearningActive ? "text-up" : "text-ink-faint")}>{status?.validatedLearningActive ? "VALIDATED LEARNING ACTIVE" : "Belum ada validated learning"}</span>
      </div>
      <p className="text-[9px] leading-relaxed text-ink-faint">AI menganalisis, memvalidasi, dan mengeksekusi Paper Trade secara otomatis di background — tidak perlu klik apa pun.</p>
    </div>
  );
}

interface OracleResponse {
  assessment: OracleAssessment;
  confluence: ConfluenceResult;
  insight: OracleInsight;
  risk: OracleRiskPlan | null;
  /** Phase 7.2 — context only, never a second decision. Optional/null when the fetch failed; the rest of the panel must render fine without it. */
  mtf?: MtfContext | null;
  /** Already returned by the existing route (see app/api/elvoid-pro/oracle/route.ts) — only now also read by the frontend for the "Why ELVOID Decided" section. No new backend field. */
  liquidityOrderFlow?: LiquidityOrderFlowContext | null;
  contradictions?: ContradictionReport | null;
  riskIntelligence?: RiskIntelligence | null;
}

interface KlinesResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
}

const GRADE_STYLE: Record<string, string> = {
  "A+": "bg-gold/20 text-gold border-gold/40",
  A: "bg-up/15 text-up border-up/30",
  "B+": "bg-signal/15 text-signal border-signal/30",
  NO_TRADE: "bg-bg-raised text-ink-faint border-line",
};

/**
 * Generic "no material risk note beyond normal market risk" sentence from
 * buildMainRisk() (grading.ts) — real backend text, but not worth a line on
 * the card since it says nothing setup-specific. Genuine caveats (proxy
 * data, unavailable source, invalid risk plan) still render as-is; this is
 * the one boilerplate string filtered out, never a fabricated replacement.
 */
const GENERIC_MAIN_RISK = "Tidak ada risiko data spesifik yang teridentifikasi di luar risiko pasar normal.";

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

/** Formats the existing `assessment.timestamp` for display — never generates a new one. */
function formatDecisionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function OraclePanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OracleResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const load = useCallback(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/elvoid-pro/oracle?symbol=${encodeURIComponent(symbol)}&interval=15m`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(json.error ?? "Gagal memuat ELVOID PRO ORACLE.");
          setStatus("error");
          return;
        }
        setData(json as OracleResponse);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg("Gagal memuat ELVOID PRO ORACLE.");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => load(), [load]);

  const assessment = data?.assessment;
  const grade = assessment?.grade;
  const side = assessment?.side;
  const isNoTrade = status === "ready" && !!assessment && assessment.grade === "NO_TRADE";
  const isGraded = status === "ready" && !!assessment && assessment.grade !== "NO_TRADE" && !!side;
  const timeframeLabel = data?.mtf?.mtf.timeframe ?? "15m";

  // Chart candles — from the existing, already-used /api/klines endpoint
  // (same one the rest of ELVOID Pro's charting already calls), at the
  // same timeframe already shown as "Timeframe" below. No new backend
  // route, no synthetic candles: if this fetch fails, the chart area shows
  // a plain unavailable message instead of inventing bars.
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleStatus, setCandleStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setCandleStatus("loading");
    fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframeLabel)}&limit=150`)
      .then((res) => res.json())
      .then((json: KlinesResponse & { error?: string }) => {
        if (cancelled) return;
        if (json.error || !Array.isArray(json.candles)) {
          setCandleStatus("error");
          return;
        }
        setCandles(json.candles);
        setCandleStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setCandleStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframeLabel]);

  // Confluence X/Y — real count from the same factors array the grading
  // engine itself used, never a separate/derived score. X = factors that
  // actually fired (weight > 0) for the dominant side; Y = every factor
  // considered, regardless of quality.
  let confluenceLabel: string | null = null;
  if (isGraded && data) {
    const total = data.confluence.factors.length;
    const firing = data.confluence.factors.filter((f) => (side === "LONG" ? f.longWeight : f.shortWeight) > 0).length;
    confluenceLabel = `${firing}/${total}`;
  }

  const mainRiskNote = data && data.assessment.mainRisk && data.assessment.mainRisk !== GENERIC_MAIN_RISK ? data.assessment.mainRisk : null;

  const chartLevels = data?.risk
    ? { entry: data.risk.entry, takeProfit: data.risk.takeProfit, stopLoss: data.risk.stopLoss }
    : { entry: null, takeProfit: null, stopLoss: null };

  return (
    <div className="rounded-lg border border-gold/20 bg-bg-surface/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Crown size={13} className="text-gold" /> ELVOID PRO ORACLE
        </p>
      </div>

      {status === "loading" && <p className="mt-4 animate-pulse text-[11px] text-ink-faint">Menjalankan analisis Oracle…</p>}

      {status === "error" && (
        <div className="mt-3 flex flex-col items-center gap-1.5 py-4 text-center">
          <ShieldOff size={18} className="text-ink-faint" />
          <p className="text-[11px] text-ink-faint">{errorMsg}</p>
          <button onClick={load} className="mt-1 rounded-md border border-line px-2.5 py-1 text-[10px] text-ink-muted hover:border-gold/40 hover:text-gold">
            Coba lagi
          </button>
        </div>
      )}

      {isNoTrade && assessment && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* Symbol + Decision + Timestamp — same header shape as the graded case below. */}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{symbol}/USDT</span>
            <span className="shrink-0 rounded border border-line bg-bg-raised px-2 py-0.5 text-[11px] font-bold text-ink-faint">WAIT</span>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-ink-faint">
            <Clock size={11} /> Decision • {formatDecisionTime(assessment.timestamp)}
          </p>
          <p className="text-[10px] leading-relaxed text-ink-faint">{assessment.gradeReason}</p>
          <AutonomousStatusCard symbol={symbol} />
        </div>
      )}

      {isGraded && assessment && side && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* 1. Symbol + Decision — the primary decision, one glance. */}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{symbol}/USDT</span>
            <div className={clsx("flex shrink-0 items-center gap-1.5 text-lg font-bold", side === "LONG" ? "text-up" : "text-down")}>
              <span>{side}</span>
              {side === "LONG" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-faint">
            <span className="flex items-center gap-1">
              <Clock size={11} /> Decision • {formatDecisionTime(assessment.timestamp)}
            </span>
            <span className="flex items-center gap-2">
              {grade && <span className={clsx("rounded border px-1.5 py-0.5 text-[10px] font-bold", GRADE_STYLE[grade])}>{grade}</span>}
              <span className="mono-num">Confidence {assessment.confidence}%</span>
            </span>
          </div>
          {data && data.insight.patterns.length > 0 && <p className="text-[11px] text-ink-muted">{data.insight.patterns.join(" · ")}</p>}

          {/* 2. Candlestick chart — real candles from /api/klines, with the
              existing Entry/TP/SL levels overlaid as price lines. This is
              the primary visual; nothing here is computed in the frontend. */}
          {candleStatus === "ready" && candles.length > 0 && <OracleDecisionChart candles={candles} levels={chartLevels} height={260} />}
          {candleStatus === "loading" && (
            <div className="flex h-[260px] items-center justify-center rounded-md border border-line/60 bg-bg/40">
              <p className="animate-pulse text-[11px] text-ink-faint">Memuat chart…</p>
            </div>
          )}
          {candleStatus === "error" && (
            <div className="flex h-[260px] items-center justify-center rounded-md border border-line/60 bg-bg/40">
              <p className="text-[11px] text-ink-faint">Chart tidak tersedia.</p>
            </div>
          )}

          {/* 3. Entry / TP / SL — every value here comes straight from
              buildOracleRiskPlan()'s output (single entry/SL/TP, not a
              tiered TP1-3 or an entry range — this engine doesn't compute
              those, and the UI must not invent them). */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0 rounded-md border border-line/60 bg-bg-raised/40 px-1 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gold">Entry</p>
              <p className="mono-num break-words text-[11px] font-semibold text-ink sm:text-[12px]">{data?.risk ? formatPrice(data.risk.entry) : "—"}</p>
            </div>
            <div className="min-w-0 rounded-md border border-line/60 bg-bg-raised/40 px-1 py-2">
              <p className="text-[9px] uppercase tracking-wide text-up">Take Profit</p>
              <p className="mono-num break-words text-[11px] font-semibold text-up sm:text-[12px]">{data?.risk ? formatPrice(data.risk.takeProfit) : "—"}</p>
            </div>
            <div className="min-w-0 rounded-md border border-line/60 bg-bg-raised/40 px-1 py-2">
              <p className="text-[9px] uppercase tracking-wide text-down">Stop Loss</p>
              <p className="mono-num break-words text-[11px] font-semibold text-down sm:text-[12px]">{data?.risk ? formatPrice(data.risk.stopLoss) : "—"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-ink-faint">
            <span>Timeframe: <span className="text-ink">{timeframeLabel}</span></span>
            {confluenceLabel && <span>Confluence: <span className="text-ink">{confluenceLabel}</span></span>}
            {data?.risk && assessment.riskStatus !== "valid" && <span className="text-amber-400">R:R belum tervalidasi</span>}
          </div>

          {/* 4. Why ELVOID Decided — categorized read of the same evidence
              fields the grading engine used (confluence factors,
              liquidityOrderFlow, mtf, contradictions, riskIntelligence).
              Falls back to "Unavailable" per-row rather than guessing. */}
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">{assessment.gradeReason}</p>
            <OracleWhySection
              side={side}
              factors={data?.confluence.factors ?? []}
              liquidityOrderFlow={data?.liquidityOrderFlow}
              mtf={data?.mtf}
              contradictions={data?.contradictions}
              riskIntelligence={data?.riskIntelligence}
            />
          </div>

          {/* Invalidation / main risk — existing deterministic text fields, unchanged. */}
          <div>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-ink-faint">Invalidation</p>
            <p className="text-[10px] leading-relaxed text-down/80">{assessment.invalidation}</p>
            {mainRiskNote && <p className="mt-1 text-[10px] leading-relaxed text-amber-400/80">{mainRiskNote}</p>}
          </div>

          {/* 5. Metadata / autonomous status footer. */}
          <AutonomousStatusCard symbol={symbol} />
        </div>
      )}
    </div>
  );
}
