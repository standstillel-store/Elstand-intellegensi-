"use client";
import { useEffect, useState, useCallback } from "react";
import { Crown, ArrowUpRight, ArrowDownRight, ShieldOff, Radar, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import clsx from "clsx";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { OracleInsight } from "@/lib/ai/oracle/insight";
import type { MtfContext } from "@/lib/ai/oracle/mtf";
import { useAutonomousRuntimeTick } from "@/lib/hooks/useAutonomousRuntimeTick";

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
}

const MTF_RELATIONSHIP_LABEL: Record<string, string> = {
  ALIGNED_BULLISH: "HTF & MTF searah bullish",
  ALIGNED_BEARISH: "HTF & MTF searah bearish",
  PULLBACK_IN_UPTREND: "Kemungkinan pullback dalam uptrend",
  PULLBACK_IN_DOWNTREND: "Kemungkinan pullback dalam downtrend",
  CONTINUATION_AFTER_PULLBACK_BULLISH: "Kandidat continuation bullish setelah pullback",
  CONTINUATION_AFTER_PULLBACK_BEARISH: "Kandidat continuation bearish setelah pullback",
  HTF_THESIS_THREATENED_BULLISH: "Tesis HTF bullish terancam",
  HTF_THESIS_THREATENED_BEARISH: "Tesis HTF bearish terancam",
  NEUTRAL_OR_MIXED: "HTF/MTF/LTF campuran",
  INSUFFICIENT_DATA: "Data timeframe tidak lengkap",
};

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

  // Confirmations — real factor labels that actually fired for the
  // dominant side, straight from the confluence packet. Nothing here is a
  // fixed template list; a factor that didn't fire (or wasn't available)
  // simply doesn't produce a row.
  const confirmations =
    isGraded && data
      ? data.confluence.factors.filter((f) => (side === "LONG" ? f.longWeight : f.shortWeight) > 0).map((f) => f.label)
      : [];

  const mainRiskNote = data && data.assessment.mainRisk && data.assessment.mainRisk !== GENERIC_MAIN_RISK ? data.assessment.mainRisk : null;
  const timeframeLabel = data?.mtf?.mtf.timeframe ?? "15m";

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
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <p className="text-base font-bold text-ink-muted">NO_TRADE</p>
          <p className="text-[10px] leading-relaxed text-ink-faint">{assessment.gradeReason}</p>
          <AutonomousStatusCard symbol={symbol} />
        </div>
      )}

      {isGraded && assessment && side && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* Direction + grade — the primary decision, one glance. */}
          <div className="flex items-center justify-between gap-2">
            <div className={clsx("flex min-w-0 items-center gap-1.5 text-lg font-bold", side === "LONG" ? "text-up" : "text-down")}>
              <span className="truncate">{side}</span>
              {side === "LONG" ? <ArrowUpRight size={18} className="shrink-0" /> : <ArrowDownRight size={18} className="shrink-0" />}
            </div>
            {grade && <span className={clsx("shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold", GRADE_STYLE[grade])}>{grade}</span>}
          </div>

          {data && data.insight.patterns.length > 0 && (
            <p className="text-[11px] text-ink-muted">{data.insight.patterns.join(" · ")}</p>
          )}

          {/* Confidence */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>Confidence</span>
              <span className="mono-num text-ink">{assessment.confidence}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-bg-raised">
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, assessment.confidence))}%` }} />
            </div>
          </div>

          {/* Entry / TP / SL / Timeframe / Confluence — every value here comes
              straight from buildOracleRiskPlan()'s output (single entry/SL/TP,
              not a tiered TP1-3 or an entry range — this engine doesn't
              compute those, and the UI must not invent them). */}
          <dl className="mono-num grid grid-cols-2 gap-y-2 text-[11px]">
            <dt className="text-ink-faint">Entry</dt>
            <dd className="break-words text-right text-ink">{data?.risk ? formatPrice(data.risk.entry) : "—"}</dd>

            <dt className="text-ink-faint">Take Profit</dt>
            <dd className="break-words text-right text-up">{data?.risk ? formatPrice(data.risk.takeProfit) : "—"}</dd>

            <dt className="text-ink-faint">Stop Loss</dt>
            <dd className="break-words text-right text-down">{data?.risk ? formatPrice(data.risk.stopLoss) : "—"}</dd>

            <dt className="text-ink-faint">Timeframe</dt>
            <dd className="text-right text-ink">{timeframeLabel}</dd>

            {confluenceLabel && (
              <>
                <dt className="text-ink-faint">Confluence</dt>
                <dd className="text-right text-ink">{confluenceLabel}</dd>
              </>
            )}

            {data?.risk && assessment.riskStatus !== "valid" && (
              <>
                <dt className="text-ink-faint">R:R Status</dt>
                <dd className="text-right text-amber-400">belum tervalidasi</dd>
              </>
            )}
          </dl>

          {/* Reason — the deterministic grade explanation from grading.ts,
              rendered as-is, never rewritten into a generic template. */}
          <div>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-ink-faint">Reason</p>
            <p className="text-[10px] leading-relaxed text-ink-faint">{assessment.gradeReason}</p>
          </div>

          {/* Confirmations — real factor labels that fired for this side. */}
          {confirmations.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-ink-faint">Confirmations</p>
              <div className="flex flex-wrap gap-1.5">
                {confirmations.map((label) => (
                  <span key={label} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-muted">
                    ✓ {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Risk / Invalidation */}
          <div>
            <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-ink-faint">Risk / Invalidation</p>
            <p className="text-[10px] leading-relaxed text-down/80">{assessment.invalidation}</p>
            {mainRiskNote && <p className="mt-1 text-[10px] leading-relaxed text-amber-400/80">{mainRiskNote}</p>}
          </div>

          <AutonomousStatusCard symbol={symbol} />
        </div>
      )}

      {status === "ready" && data && data.mtf && (
        <div className="mt-3 space-y-1 border-t border-line pt-2 text-[10px] leading-relaxed">
          <p className="font-medium text-ink-muted">Multi-Timeframe Context</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-faint">
            <span>HTF ({data.mtf.htf?.timeframe ?? "–"}): {data.mtf.htf?.available ? data.mtf.htf.bias : "n/a"}</span>
            <span>MTF ({data.mtf.mtf.timeframe}): {data.mtf.mtf.bias}</span>
            <span>LTF ({data.mtf.ltf?.timeframe ?? "–"}): {data.mtf.ltf?.available ? data.mtf.ltf.bias : "n/a"}</span>
          </div>
          <p className="text-ink-faint">
            <span className="text-ink-muted">Relationship: </span>
            {MTF_RELATIONSHIP_LABEL[data.mtf.relationship] ?? data.mtf.relationship}
          </p>
        </div>
      )}
    </div>
  );
}
