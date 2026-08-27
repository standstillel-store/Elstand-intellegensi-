"use client";
import { useEffect, useState, useCallback } from "react";
import { Crown, ArrowUpRight, ArrowDownRight, ShieldOff, Loader2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import type { ConfluenceResult } from "@/lib/ai/oracle/confluenceTypes";
import type { OracleAssessment, OracleRiskPlan } from "@/lib/ai/oracle/gradingTypes";
import type { OracleInsight } from "@/lib/ai/oracle/insight";
import type { MtfContext } from "@/lib/ai/oracle/mtf";

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

export function OraclePanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OracleResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [executeState, setExecuteState] = useState<"idle" | "executing" | "done" | "error">("idle");
  const [executeMsg, setExecuteMsg] = useState<string>("");

  const load = useCallback(() => {
    let cancelled = false;
    setStatus("loading");
    setExecuteState("idle");
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

  async function handleExecute() {
    if (!data || data.assessment.grade === "NO_TRADE" || !data.risk) return;
    setExecuteState("executing");
    setExecuteMsg("");
    try {
      const res = await fetch("/api/elvoid-pro/execute-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment: data.assessment, risk: data.risk, confluence: data.confluence }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setExecuteState("error");
        setExecuteMsg(json.error ?? "Gagal mengeksekusi sinyal.");
        return;
      }
      setExecuteState("done");
      setExecuteMsg(json.alreadyExecuted ? "Sinyal ini sudah pernah dieksekusi sebelumnya." : "Berhasil dibuat sebagai PaperTrade — cek AI Performance.");
    } catch {
      setExecuteState("error");
      setExecuteMsg("Gagal mengeksekusi sinyal.");
    }
  }

  const grade = data?.assessment.grade;
  const side = data?.assessment.side;
  const gradeStyle = grade ? GRADE_STYLE[grade] : GRADE_STYLE.NO_TRADE;

  return (
    <div className="rounded-lg border border-gold/20 bg-bg-surface/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Crown size={13} className="text-gold" /> ELVOID PRO ORACLE
        </p>
        {grade && <span className={clsx("rounded border px-1.5 py-0.5 text-[9px] font-bold", gradeStyle)}>{grade}</span>}
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

      {status === "ready" && data && data.assessment.grade === "NO_TRADE" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium text-ink-muted">NO_TRADE</p>
          <p className="text-[10px] leading-relaxed text-ink-faint">{data.assessment.gradeReason}</p>
        </div>
      )}

      {status === "ready" && data && data.assessment.grade !== "NO_TRADE" && side && (
        <div className="mt-3 space-y-3">
          <div className={clsx("flex items-center gap-1.5 text-lg font-bold", side === "LONG" ? "text-up" : "text-down")}>
            {side}
            {side === "LONG" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
          </div>

          {data.insight.patterns.length > 0 && (
            <p className="text-[11px] text-ink-muted">{data.insight.patterns.join(" · ")}</p>
          )}

          <div>
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>Confidence</span>
              <span className="mono-num text-ink">{data.assessment.confidence}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-bg-raised">
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, data.assessment.confidence))}%` }} />
            </div>
          </div>

          <div className="space-y-1.5 text-[10px] leading-relaxed text-ink-faint">
            <p><span className="text-ink-muted">Regime:</span> {data.insight.marketRegime}</p>
            <p><span className="text-ink-muted">Skenario:</span> {data.insight.primaryScenario}</p>
            {data.assessment.contradictingEvidence.length > 0 && (
              <p><span className="text-ink-muted">Alternatif:</span> {data.insight.alternativeScenario}</p>
            )}
            <p className="text-down/80"><span className="text-ink-muted">Risk:</span> {data.insight.risk}</p>
          </div>

          <button
            onClick={handleExecute}
            disabled={executeState === "executing" || executeState === "done" || !data.risk}
            className={clsx(
              "flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold transition-colors",
              executeState === "done" ? "border-up/30 bg-up/10 text-up" : "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 disabled:opacity-50"
            )}
          >
            {executeState === "executing" && <Loader2 size={13} className="animate-spin" />}
            {executeState === "done" && <CheckCircle2 size={13} />}
            {executeState === "executing" ? "Mengeksekusi…" : executeState === "done" ? "Tereksekusi" : !data.risk ? "Risk plan tidak tersedia" : "Execute Signal"}
          </button>
          {executeMsg && (
            <p className={clsx("text-[10px]", executeState === "error" ? "text-down" : "text-ink-faint")}>{executeMsg}</p>
          )}
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
          <p className="text-ink-faint">{MTF_RELATIONSHIP_LABEL[data.mtf.relationship] ?? data.mtf.relationship}</p>
        </div>
      )}
    </div>
  );
}
