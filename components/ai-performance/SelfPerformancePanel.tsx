"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import type { EvaluationCoverageStatus, SelfPerformanceReport } from "@/lib/ai/selfPerformance/contracts";
import type { NoveltyClassification, NoveltyAssessment } from "@/lib/ai/noveltyDetection/contracts";
import type { GapCategory, GapSeverity, CognitiveGapReport } from "@/lib/ai/cognitiveGap/contracts";
import type { EvolutionNeed, EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp, CandidateStatus } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp, ValidationResult } from "@/lib/ai/evolutionValidation/contracts";

// ---------------------------------------------------------------------------
// Phase 8.6.1 Part 7+8 — Self Performance + Novelty observation panel.
//
// Additive section on the AI PERFORMANCE page (per Phase 8.6.1's own
// instruction: "do not redesign the page, add only the minimum UI
// required"). Reads the SAME /api/ai-performance/cognitive endpoint
// CognitiveMapSection.tsx already polls — Phase 8.6.1 only extended that
// route's JSON response with `selfPerformance` / `novelty` /
// `learningDbConfigured`, nothing here re-reads the Learning DB
// directly. Fetched once on mount rather than polled: coverage and
// evaluation distributions change slowly relative to the Live
// Intelligence Graph's 20s cycle-by-cycle poll, so a one-shot fetch is
// the minimum needed to make this observable. A page refresh re-fetches.
//
// This panel shows CURRENT_RETRIEVAL state only — novelty here reflects
// this moment's Decision Memory query, never a historical record of how
// novel a past decision looked at the time it was made (that form does
// not exist yet; see lib/ai/noveltyDetection/contracts.ts's own header).
// This panel never claims "AI is improving" or "self-evolving" — Phase
// 8.6.1 observes and measures only.
//
// Phase 8.6.2-8.6.4 addition: also renders `cognitiveGaps` (0-or-more
// deterministic, evidence-gated gaps per symbol) and `evolution` (the
// NO_EVOLUTION_NEEDED/INSUFFICIENT_EVIDENCE/MONITOR/EVOLUTION_WARRANTED
// gate plus any DRAFT proposals). Language throughout is deliberately
// "candidate" / "observed" / "proposed" / "awaiting validation" — never
// "AI improved itself" or a fake self-evolving badge. A proposal here is
// always DRAFT: nothing on this page can move a proposal to a later
// status, let alone apply it.
// Phase 8.6.5-8.6.6 addition: also renders `evolution[].candidates`
// (0-or-more `{candidate, validation}` pairs per symbol). A candidate is
// a split-history replication check, never executable code — see
// lib/ai/evolutionCandidate/contracts.ts's own header. Language here is
// deliberately "Validated candidate — awaiting human approval" /
// "Blocked" / "Insufficient evidence" / "Inconclusive" — never "AI
// EVOLVED", "SELF-IMPROVED", or "SUPER AI". Nothing on this page can
// move a candidate past DRAFT/REPLAY_PASSED/VALID; there is no control
// here that applies, approves, or promotes anything.
// ---------------------------------------------------------------------------

interface CognitiveGapEntry {
  readonly symbol: string;
  readonly report: CognitiveGapReport | null;
}

interface EvolutionCandidateEntry {
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  readonly validation: EvolutionValidationWithoutTimestamp;
}

interface EvolutionEntry {
  readonly symbol: string;
  readonly evolutionNeed: EvolutionNeedAssessment | null;
  readonly proposals: readonly EvolutionProposalWithoutTimestamp[];
  readonly candidates: readonly EvolutionCandidateEntry[];
}

// Matches app/api/ai-performance/cognitive/route.ts's Phase 8.6.1 addition
// exactly: `selfPerformance` is `{symbol, report}[]` (report is `null`
// only when the Learning DB isn't configured — see
// lib/ai/selfPerformance/repository.ts), `novelty` is a plain
// `NoveltyAssessment[]` (classifyNovelty()'s own output already carries
// `symbol`). Both real exported types are imported directly rather than
// re-declared here, so this panel can never silently drift from what the
// route actually returns.
interface SelfPerformanceEntry {
  readonly symbol: string;
  readonly report: SelfPerformanceReport | null;
}

interface CognitiveRoutePayload {
  readonly selfPerformance?: readonly SelfPerformanceEntry[];
  readonly novelty?: readonly NoveltyAssessment[];
  readonly learningDbConfigured?: boolean;
  readonly cognitiveGaps?: readonly CognitiveGapEntry[];
  readonly evolution?: readonly EvolutionEntry[];
}

const COVERAGE_LABEL: Record<EvaluationCoverageStatus, string> = {
  COMPLETE: "Complete",
  PARTIAL: "Partial",
  INSUFFICIENT_DATA: "Insufficient data",
};

const COVERAGE_COLOR: Record<EvaluationCoverageStatus, string> = {
  COMPLETE: "text-up",
  PARTIAL: "text-amber",
  INSUFFICIENT_DATA: "text-ink-faint",
};

const NOVELTY_LABEL: Record<NoveltyClassification, string> = {
  FAMILIAR: "Familiar",
  PARTIALLY_FAMILIAR: "Partially familiar",
  NOVEL: "Novel",
  INSUFFICIENT_MEMORY: "Insufficient memory",
  UNAVAILABLE: "Unavailable",
};

const NOVELTY_COLOR: Record<NoveltyClassification, string> = {
  FAMILIAR: "text-up",
  PARTIALLY_FAMILIAR: "text-amber",
  NOVEL: "text-cyan",
  INSUFFICIENT_MEMORY: "text-ink-faint",
  UNAVAILABLE: "text-ink-faint",
};

const GAP_SEVERITY_COLOR: Record<GapSeverity, string> = {
  LOW: "text-ink-muted",
  MEDIUM: "text-amber",
  HIGH: "text-cyan",
};

const GAP_CATEGORY_LABEL: Record<GapCategory, string> = {
  CONTRADICTION_GAP: "Contradiction",
  CONTEXT_GAP: "Context",
  REASONING_CONSISTENCY_GAP: "Reasoning consistency",
  CONFIDENCE_ALIGNMENT_GAP: "Confidence alignment",
  EVIDENCE_GAP: "Evidence resolution",
  PATTERN_GAP: "Recurring pattern",
};

const EVOLUTION_NEED_LABEL: Record<EvolutionNeed, string> = {
  NO_EVOLUTION_NEEDED: "No evolution needed",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  MONITOR: "Monitoring — not yet warranted",
  EVOLUTION_WARRANTED: "Evolution candidate observed",
};

const EVOLUTION_NEED_COLOR: Record<EvolutionNeed, string> = {
  NO_EVOLUTION_NEEDED: "text-up",
  INSUFFICIENT_EVIDENCE: "text-ink-faint",
  MONITOR: "text-amber",
  EVOLUTION_WARRANTED: "text-cyan",
};

const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  CANDIDATE_CREATED: "Candidate created",
  REPLAYING: "Replaying",
  REPLAY_PASSED: "Replay passed",
  REPLAY_FAILED: "Replay failed",
  VALIDATION_BLOCKED: "Blocked (out of scope)",
};

/**
 * Deliberately NOT "AI EVOLVED" / "SELF-IMPROVED" / "SUPER AI" anywhere
 * — see this file's header. VALID reads as "Validated candidate —
 * awaiting human approval", matching the Phase 8.6.6 brief's required
 * vocabulary exactly; nothing here implies the candidate was applied.
 */
const VALIDATION_RESULT_LABEL: Record<ValidationResult, string> = {
  VALID: "Validated candidate — awaiting human approval",
  INVALID: "Invalid",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  INCONCLUSIVE: "Inconclusive",
};

const VALIDATION_RESULT_COLOR: Record<ValidationResult, string> = {
  VALID: "text-cyan",
  INVALID: "text-down",
  INSUFFICIENT_EVIDENCE: "text-ink-faint",
  INCONCLUSIVE: "text-amber",
};

export function SelfPerformancePanel() {
  const [data, setData] = useState<CognitiveRoutePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-performance/cognitive", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CognitiveRoutePayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not reach ELVOID self-performance telemetry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selfPerformance = data?.selfPerformance ?? [];
  const novelty = data?.novelty ?? [];
  const cognitiveGaps = data?.cognitiveGaps ?? [];
  const evolution = data?.evolution ?? [];

  return (
    <div className="glow-card p-3 sm:p-4">
      <SectionHeader code="SPM" title="Self Performance & Novelty" />
      <p className="-mt-1 max-w-xl text-xs text-ink-muted">Phase 8.6.1 — observation layer only. Coverage and evaluation distributions are counted directly from decision_evaluations; novelty reflects the current Decision Memory query, not a historical record.</p>
      {data?.learningDbConfigured === false && <p className="mt-2 text-[10.5px] text-amber">Learning DB is not configured — every value below is structurally empty, not evidence of &quot;no history&quot;.</p>}
      {error && <p className="mt-2 text-[10.5px] text-down">{error}</p>}
      {!data && !error && <p className="py-4 text-center text-xs text-ink-muted">Loading…</p>}
      {data && selfPerformance.length === 0 && novelty.length === 0 && <p className="py-4 text-center text-xs text-ink-muted">No tracked symbols yet.</p>}

      {selfPerformance.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Evaluation Coverage</p>
          <ul className="mt-1.5 space-y-1.5">
            {selfPerformance.map(({ symbol, report }) => (
              <li key={symbol} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-medium text-ink">{symbol}</span>
                {report ? (
                  <span className="text-ink-muted">
                    {report.coverage.evaluatedExperienceCount}/{report.coverage.closedExperienceCount} evaluated (<span className={COVERAGE_COLOR[report.coverage.status]}>{COVERAGE_LABEL[report.coverage.status]}</span>) · {report.performance.totalEvaluated} scored
                  </span>
                ) : (
                  <span className="text-ink-faint">Learning DB unavailable</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {novelty.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Novelty</p>
          <ul className="mt-1.5 space-y-1.5">
            {novelty.map((n) => (
              <li key={n.symbol} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-medium text-ink">{n.symbol}</span>
                <span className="text-ink-muted">
                  <span className={NOVELTY_COLOR[n.classification]}>{NOVELTY_LABEL[n.classification]}</span> · {n.matchedExperienceCount} exp · {n.matchedPatternCount} pattern(s)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cognitiveGaps.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Observed Cognitive Gaps</p>
          <p className="text-[10px] text-ink-faint">Deterministic, evidence-gated — never from a single decision. Absence below means no gap met the evidence bar, not that none could ever exist.</p>
          <ul className="mt-1.5 space-y-1.5">
            {cognitiveGaps.map(({ symbol, report }) => (
              <li key={symbol} className="text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{symbol}</span>
                  <span className="text-ink-faint">{report ? (report.gaps.length === 0 ? "No gap observed" : `${report.gaps.length} gap(s) observed`) : "Learning DB unavailable"}</span>
                </div>
                {report && report.gaps.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-2">
                    {report.gaps.map((gap) => (
                      <li key={gap.category} className="text-ink-muted">
                        {GAP_CATEGORY_LABEL[gap.category]} — <span className={GAP_SEVERITY_COLOR[gap.severity]}>{gap.severity}</span> ({gap.evidence.occurrenceCount}/{gap.evidence.evaluatedCount})
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evolution.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Evolution Need & Candidate Proposals</p>
          <p className="text-[10px] text-ink-faint">Observation and proposal only — nothing here executes, and no proposal moves past DRAFT on this page. 8.6.1-8.6.4 do not prove self-improvement.</p>
          <ul className="mt-1.5 space-y-2">
            {evolution.map(({ symbol, evolutionNeed, proposals }) => (
              <li key={symbol} className="text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{symbol}</span>
                  <span className={evolutionNeed ? EVOLUTION_NEED_COLOR[evolutionNeed.need] : "text-ink-faint"}>{evolutionNeed ? EVOLUTION_NEED_LABEL[evolutionNeed.need] : "Learning DB unavailable"}</span>
                </div>
                {proposals.length > 0 && (
                  <ul className="mt-1 space-y-1 pl-2">
                    {proposals.map((proposal) => (
                      <li key={proposal.proposalId} className="text-ink-muted">
                        <span className="text-ink-faint">Candidate proposal (DRAFT)</span> — {GAP_CATEGORY_LABEL[proposal.gapCategory]}: {proposal.hypothesis}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evolution.some((e) => e.candidates.length > 0) && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Evolution Candidates</p>
          <p className="text-[10px] text-ink-faint">Split-history replication check only — never execution of modified logic. Human approval has not occurred; nothing below has been applied.</p>
          <ul className="mt-1.5 space-y-3">
            {evolution.map(({ symbol, candidates }) =>
              candidates.map(({ candidate, validation }) => (
                <li key={candidate.candidateId} className="rounded border border-line/60 p-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <span className="font-medium text-ink">
                      {symbol} · {candidate.candidateId.replace("candidate:", "#")}
                    </span>
                    <span className={VALIDATION_RESULT_COLOR[validation.result]}>{VALIDATION_RESULT_LABEL[validation.result]}</span>
                  </div>
                  <p className="mt-0.5 text-ink-muted">
                    Gap: {GAP_CATEGORY_LABEL[candidate.gapCategory]} ({candidate.gapSeverity})
                  </p>
                  <p className="mt-0.5 text-ink-muted">Proposal: {candidate.proposedChange}</p>
                  <p className="mt-0.5 text-ink-faint">
                    Baseline: {candidate.baselineVersion} · Candidate: {candidate.candidateVersion}
                  </p>
                  <p className="mt-0.5 text-ink-muted">
                    Replay: <span className={candidate.status === "REPLAY_PASSED" ? "text-up" : "text-down"}>{CANDIDATE_STATUS_LABEL[candidate.status]}</span> · Regression:{" "}
                    <span className={validation.regressionCheck.regressionDetected ? "text-down" : "text-up"}>{validation.regressionCheck.regressionDetected ? "Detected" : "None"}</span>
                  </p>
                  {validation.evidence.length > 0 && <p className="mt-0.5 text-ink-faint">Evidence: {validation.evidence.join(" ")}</p>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
