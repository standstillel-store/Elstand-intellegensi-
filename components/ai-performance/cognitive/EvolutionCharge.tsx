"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import type { EvolutionNeed, EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionApprovalView } from "@/lib/ai/evolutionApproval/contracts";
import { LinearGauge } from "./gauges";

// ---------------------------------------------------------------------------
// Evolution Charge — one honest progress readout for the Phase 8.6.3-8.6.7
// evolution pipeline, built ONLY from fields /api/ai-performance/cognitive
// already returns (the same endpoint SelfPerformancePanel.tsx polls; this
// component polls it independently, same established pattern as every
// other panel on this page). This is presentation over already-computed
// data, never a new score:
//   - When at least one evolution candidate has recorded validation gates,
//     the fill is exactly (gates passed / gates evaluated) across every
//     candidate currently observed — see
//     lib/ai/evolutionValidation/contracts.ts's ValidationGateOutcome.
//   - With no candidate yet, the bar stays empty (no invented number) and
//     the status line names the real EvolutionNeed gate instead
//     (NO_EVOLUTION_NEEDED / INSUFFICIENT_EVIDENCE / MONITOR /
//     EVOLUTION_WARRANTED — lib/ai/evolutionNeed/contracts.ts).
// Never claims "AI evolved" or "self-improved" — same wording discipline
// as SelfPerformancePanel.tsx.
// ---------------------------------------------------------------------------

interface EvolutionCandidateEntry {
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  readonly approval?: EvolutionApprovalView;
  readonly validation: EvolutionValidationWithoutTimestamp;
}

interface EvolutionEntry {
  readonly symbol: string;
  readonly evolutionNeed: EvolutionNeedAssessment | null;
  readonly proposals: readonly EvolutionProposalWithoutTimestamp[];
  readonly candidates: readonly EvolutionCandidateEntry[];
}

interface MonitorRow { readonly candidateId: string; readonly proposalId: string; readonly symbol: string; readonly gapPattern: string; readonly occurrenceCount: number | null; readonly confidence: number | null; readonly status: string; readonly createdAt: string | null; readonly validationState: string; readonly nextGate: string }
interface EvolutionRoutePayload {
  readonly candidateMonitoring?: { readonly status: "ACTIVE_CANDIDATES" | "NO_ACTIVE_CANDIDATE" | "MONITORING_UNAVAILABLE"; readonly candidates: readonly MonitorRow[] };
  readonly evolution?: readonly EvolutionEntry[];
  readonly learningDbConfigured?: boolean;
  readonly core?: { readonly lastCycleAt: string | null };
}

const NEED_LABEL: Record<EvolutionNeed, string> = {
  NO_EVOLUTION_NEEDED: "No evolution needed",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  MONITOR: "Monitoring — not yet warranted",
  EVOLUTION_WARRANTED: "Evolution candidate observed",
};

const NEED_COLOR: Record<EvolutionNeed, string> = {
  NO_EVOLUTION_NEEDED: "#00E676",
  INSUFFICIENT_EVIDENCE: "#5b6472",
  MONITOR: "#F5B942",
  EVOLUTION_WARRANTED: "#22D3EE",
};

// Priority for picking ONE headline status across every tracked symbol —
// the most advanced real gate wins, it's never averaged/invented.
const NEED_PRIORITY: Record<EvolutionNeed, number> = {
  EVOLUTION_WARRANTED: 3,
  MONITOR: 2,
  NO_EVOLUTION_NEEDED: 1,
  INSUFFICIENT_EVIDENCE: 0,
};

function mostAdvancedNeed(evolution: readonly EvolutionEntry[]): EvolutionNeed | null {
  let best: EvolutionNeed | null = null;
  for (const e of evolution) {
    const need = e.evolutionNeed?.need;
    if (!need) continue;
    if (best === null || NEED_PRIORITY[need] > NEED_PRIORITY[best]) best = need;
  }
  return best;
}

export function EvolutionCharge() {
  const [data, setData] = useState<EvolutionRoutePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-performance/cognitive", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as EvolutionRoutePayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not reach ELVOID evolution telemetry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const evolution = data?.evolution ?? [];
  let totalGates = 0;
  let passedGates = 0;
  let candidateCount = 0;
  for (const e of evolution) {
    for (const c of e.candidates) {
      candidateCount += 1;
      totalGates += c.validation.gates.length;
      passedGates += c.validation.gates.filter((g) => g.passed).length;
    }
  }
  const percent = totalGates > 0 ? Math.round((passedGates / totalGates) * 100) : null;
  const need = mostAdvancedNeed(evolution);
  const statusLabel = need ? NEED_LABEL[need] : evolution.length > 0 ? "Awaiting assessment" : "No tracked symbols";
  const statusColor = need ? NEED_COLOR[need] : "#5b6472";
  const detail =
    totalGates > 0
      ? `${passedGates}/${totalGates} validation gates passed across ${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`
      : candidateCount > 0
      ? `${candidateCount} candidate${candidateCount === 1 ? "" : "s"} observed — no validation gates recorded yet`
      : "No evolution candidates generated yet";

  return (
    <div className="glow-card p-3 sm:p-4">
      <SectionHeader code="EVC" title="Evolution Charge" icon={<Gauge size={13} />} accent="up" />

      {data?.learningDbConfigured === false ? (
        <p className="py-4 text-center text-xs text-ink-muted">Learning DB is not configured — evolution telemetry unavailable.</p>
      ) : !data && !error ? (
        <p className="py-4 text-center text-xs text-ink-muted">Loading…</p>
      ) : error ? (
        <p className="py-4 text-center text-xs text-down">{error}</p>
      ) : (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="mono-num text-2xl font-semibold text-ink">{percent === null ? "—" : `${percent}%`}</span>
            <span className="text-right text-[11px] font-medium" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-2">
            <LinearGauge percent={percent} color={statusColor} />
          </div>
          <p className="mt-2 text-[10.5px] text-ink-faint">{detail}</p>
          {data?.candidateMonitoring && data.candidateMonitoring.status !== "ACTIVE_CANDIDATES" && (
            <p className="mt-1 text-[10.5px] text-ink-faint">{data.candidateMonitoring.status}</p>
          )}
          {data?.candidateMonitoring?.candidates.map((m) => (
            <div key={m.candidateId} className="mt-2 rounded border border-white/5 p-2 text-[10px] text-ink-faint">
              <div className="mono-num text-ink">{m.candidateId}</div>
              <div>proposal {m.proposalId} · {m.symbol} · {m.gapPattern}</div>
              <div>occurrences {m.occurrenceCount ?? "—"} · confidence {m.confidence ?? "—"} · {m.status}</div>
              <div>created {m.createdAt ?? "—"} · validation {m.validationState} · next: {m.nextGate}</div>
            </div>
          ))}
          {data?.core?.lastCycleAt && (
            <p className="mt-1 text-[10px] text-ink-faint">Last cycle observed {new Date(data.core.lastCycleAt).toLocaleTimeString(undefined, { hour12: false })}</p>
          )}
        </>
      )}
    </div>
  );
}
