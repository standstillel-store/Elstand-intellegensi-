"use client";

import { useEffect, useState } from "react";
import { Rocket, CheckCircle2, XCircle, Send } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { EVOLUTION_STAGE_ORDER, type EvolutionCandidateView, type EvolutionCommandCenterView, type EvolutionStageId } from "@/lib/ai/evolutionCommandCenter/contracts";
import { LinearGauge } from "./gauges";

// ---------------------------------------------------------------------------
// Evolution Command Center (2026-10-02) — replaces EvolutionCharge.tsx's
// single "% of gates passed" bar with the full, real 11-stage lifecycle:
// OBSERVE -> GAP -> EVIDENCE -> PROPOSAL -> PERSIST -> CANDIDATE ->
// VALIDATION -> REGRESSION -> READY -> HUMAN_APPROVAL -> CHANGE_ARTIFACT.
//
// Every stage, the progress %, the audit trail, and the "Send approval
// request" button all come from one read-only fetch
// (/api/ai-performance/evolution/command-center — see that route's own
// header). This component computes NOTHING about whether a stage is
// reached; it only renders what deriveStage.ts already decided. The one
// action available — "Send approval request to Telegram" — calls the SAME
// POST /api/ai-performance/approvals/request SelfPerformancePanel.tsx
// already uses; approving or rejecting happens ONLY on the Telegram
// message's own inline buttons (lib/ai/evolutionApproval/telegramPayload.ts)
// — there is deliberately no Approve/Reject control anywhere in this UI.
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<EvolutionStageId, string> = {
  OBSERVE: "Observe",
  GAP: "Gap",
  EVIDENCE: "Evidence",
  PROPOSAL: "Proposal",
  PERSIST: "Persist",
  CANDIDATE: "Candidate",
  VALIDATION: "Validation",
  REGRESSION: "Regression",
  READY: "100% Ready",
  HUMAN_APPROVAL: "Human Approval",
  CHANGE_ARTIFACT: "Change Artifact",
};

function StageStepper({ candidate }: { candidate: EvolutionCandidateView }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {candidate.stages.map((s, i) => {
        const rejected = candidate.terminalOutcome === "HUMAN_REJECTED" && s.id === "HUMAN_APPROVAL";
        return (
          <li
            key={s.id}
            title={s.detail}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              rejected
                ? "border-down/40 bg-down/10 text-down"
                : s.reached
                  ? "border-up/40 bg-up/10 text-up"
                  : "border-white/10 bg-white/[0.04] text-ink-faint"
            }`}
          >
            {i + 1}. {STAGE_LABEL[s.id]}
          </li>
        );
      })}
    </ol>
  );
}

function CandidateCard({ candidate, headline }: { candidate: EvolutionCandidateView; headline: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const ready = candidate.currentStage === "READY" && candidate.approvalStatus === "AWAITING_HUMAN_APPROVAL";

  async function sendApprovalRequest() {
    setRequesting(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/ai-performance/approvals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: candidate.symbol, proposalId: candidate.proposalId }),
      });
      const json = (await res.json()) as { outcome?: string; failure?: string | null };
      setOutcome(json.outcome ? `${json.outcome}${json.failure ? ` (${json.failure})` : ""}` : `HTTP ${res.status}`);
    } catch {
      setOutcome("Request failed — network or server error.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${headline ? "border-signal/30 bg-signal/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="mono-num text-sm font-semibold text-ink">{candidate.symbol}</div>
          <div className="text-[11px] text-ink-faint">{candidate.candidateId}</div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-ink-faint">{candidate.stagesReached}/{EVOLUTION_STAGE_ORDER.length} stages</span>
          <span className="mono-num font-semibold text-ink">{candidate.progressPercent}%</span>
        </div>
      </div>

      <div className="mt-2">
        <LinearGauge percent={candidate.progressPercent} color={candidate.terminalOutcome === "HUMAN_REJECTED" ? "#F2555A" : "#22D3EE"} />
      </div>

      <div className="mt-3">
        <StageStepper candidate={candidate} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
        <div>
          <dt className="text-ink-faint">Gap</dt>
          <dd className="text-ink">{candidate.gapCategory ?? "—"} {candidate.gapSeverity ? `(${candidate.gapSeverity})` : ""}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Evidence</dt>
          <dd className="text-ink">{candidate.gapOccurrenceCount ?? "—"}/{candidate.gapEvaluatedCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Validation</dt>
          <dd className="text-ink">{candidate.validationResult}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Regression</dt>
          <dd className="text-ink">{candidate.regressionEvaluated ? (candidate.regressionDetected ? "Detected" : "Clean") : "Not evaluated"}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Approval</dt>
          <dd className="text-ink">{candidate.approvalStatus}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Artifact</dt>
          <dd className="text-ink">{candidate.artifactStatus ?? "—"}</dd>
        </div>
      </dl>

      {candidate.auditTrail.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Audit trail</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-ink">
            {candidate.auditTrail.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="mono-num shrink-0 text-ink-faint">{e.at}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate.priorLearning && (
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] p-2 text-[11px]">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Prior learning for this gap — {candidate.priorLearning.nextEvolutionState}</div>
          <div className="mt-0.5 text-ink">{candidate.priorLearning.summary}</div>
        </div>
      )}

      {ready && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-signal/40 bg-signal/10 p-2">
          <Rocket size={14} className="shrink-0 text-signal-glow" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-signal-glow">EVOLUTION READY — HUMAN APPROVAL REQUIRED</span>
          <button
            type="button"
            onClick={sendApprovalRequest}
            disabled={requesting}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/20 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-signal/30 disabled:opacity-50"
          >
            <Send size={12} /> {requesting ? "Sending…" : "Send approval request to Telegram"}
          </button>
        </div>
      )}
      {outcome && <div className="mt-2 text-[11px] text-ink-faint">Request result: {outcome}</div>}

      {candidate.terminalOutcome === "HUMAN_APPROVED" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-up/40 bg-up/10 p-2 text-[11px] font-semibold text-up">
          <CheckCircle2 size={14} /> Human approved on Telegram{candidate.artifactStatus ? " — change artifact generated" : " — awaiting change artifact"}
        </div>
      )}
      {candidate.terminalOutcome === "HUMAN_REJECTED" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-down/40 bg-down/10 p-2 text-[11px] font-semibold text-down">
          <XCircle size={14} /> Human rejected on Telegram — pipeline stops here, by design
        </div>
      )}
    </div>
  );
}

export function EvolutionCommandCenter() {
  const [data, setData] = useState<EvolutionCommandCenterView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-performance/evolution/command-center", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as EvolutionCommandCenterView;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not reach the Evolution Command Center endpoint.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-panel/60 p-4">
      <SectionHeader code="EVOLUTION" title="Evolution Command Center" hint="OBSERVE → … → CHANGE ARTIFACT, real pipeline state only" />

      {error && <div className="mt-2 text-xs text-down">{error}</div>}

      {!data && !error && <div className="mt-2 text-xs text-ink-faint">Loading…</div>}

      {data && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span>Last cycle: <span className="mono-num text-ink">{data.lastCycleAt ?? "—"}</span></span>
            <span>Symbols observed: <span className="mono-num text-ink">{data.symbolsObserved}</span></span>
            <span>Learning DB: <span className="text-ink">{data.learningDbConfigured ? "configured" : "not configured"}</span></span>
            <span>Telegram: <span className="text-ink">{data.telegramConfigured ? "configured" : "not configured"}</span></span>
          </div>

          {data.leadCandidate === null ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-ink-faint">
              No candidate has reached PROPOSAL yet across {data.symbolsObserved} observed symbol(s) — evolution starts at OBSERVE/GAP for every symbol every cycle, but nothing here is invented ahead of real state.
            </div>
          ) : (
            <CandidateCard candidate={data.leadCandidate} headline />
          )}

          {data.otherCandidates.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-ink-faint">{data.otherCandidates.length} other candidate(s) in flight</summary>
              <div className="mt-2 space-y-2">
                {data.otherCandidates.map((c) => (
                  <CandidateCard key={`${c.symbol}:${c.candidateId}`} candidate={c} headline={false} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
