"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import type { EvaluationCoverageStatus, SelfPerformanceReport } from "@/lib/ai/selfPerformance/contracts";
import type { NoveltyClassification, NoveltyAssessment } from "@/lib/ai/noveltyDetection/contracts";
import type { GapCategory, GapSeverity, CognitiveGapReport } from "@/lib/ai/cognitiveGap/contracts";
import type { EvolutionNeed, EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp, CandidateStatus, ValidationMode, ReplaySlice } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationWithoutTimestamp, ValidationResult } from "@/lib/ai/evolutionValidation/contracts";
import { APPROVAL_MEANING, APPROVAL_STATUS_LABEL, OBSERVATIONAL_EVIDENCE_ONLY, OBSERVATIONAL_VALIDATION_PASSED, VALID_MEANING } from "@/lib/ai/evolutionApproval/wording";
import type { ApprovalStatus } from "@/lib/ai/evolutionApproval/wording";
import type { EvolutionApprovalView } from "@/lib/ai/evolutionApproval/contracts";

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
// lib/ai/evolutionCandidate/contracts.ts's own header.
// Phase 8.6.5b wording rule: a result here is OBSERVATIONAL evidence — an
// older window compared with a newer window of recorded outcomes — and is
// never presented as counterfactual validation or as evidence that a
// proposed change works. Language is deliberately "Observational
// evidence" / "Observed split-history result" / "Not counterfactual
// validation" / "Blocked" / "Insufficient evidence" / "Inconclusive" /
// "Not applicable" — never "Validated candidate", "AI EVOLVED",
// "SELF-IMPROVED", or "SUPER AI". Nothing on this page can move a
// candidate past DRAFT/REPLAY_PASSED/VALID; there is no control here that
// applies, approves, or promotes anything.
// Phase 8.6.7: the ONE control is "Send approval request to approver", which
// asks the human approver to decide, in Telegram. It decides nothing itself.
// Approval status is a RECORDED HUMAN DECISION ONLY (see
// lib/ai/evolutionApproval/wording.ts) and never means deployed, active, or
// production.
// ---------------------------------------------------------------------------

interface CognitiveGapEntry {
  readonly symbol: string;
  readonly report: CognitiveGapReport | null;
}

interface EvolutionCandidateEntry {
  readonly candidate: EvolutionCandidateWithoutTimestamp;
  /** Phase 8.6.7 — read-only approval status; absent on a payload from before 8.6.7. Never carries an approver id. */
  readonly approval?: EvolutionApprovalView;
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
  // Phase 8.6 P1 — evidence source is the full decision population
  // (lib/ai/decisionPopulation), not decision_evaluations like every
  // category above. Never actually looked up via `gaps.map()` below
  // (that array's categories still only ever come from the unchanged
  // detectCognitiveGaps()) — this entry exists so the type stays
  // exhaustive, and so it's ready if a future pass renders
  // `report.populationGaps` here too.
  REJECT_DOMINANCE_GAP: "Reject dominance",
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

// Phase 8.6.5b: REPLAY_PASSED / REPLAY_FAILED only ever meant "both
// windows had enough recorded data" / "a window did not" — the labels now
// say exactly that instead of implying a pass/fail verdict on the proposal.
const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  CANDIDATE_CREATED: "Candidate created (replay not run)",
  REPLAYING: "Replaying",
  REPLAY_PASSED: "Both windows had sufficient data",
  REPLAY_FAILED: "Insufficient data in a window",
  VALIDATION_BLOCKED: "Blocked (out of scope)",
};

const VALIDATION_MODE_LABEL: Record<ValidationMode, string> = {
  OBSERVATIONAL_SPLIT_HISTORY: "Observed split-history result",
};

function describeSlice(label: string, slice: ReplaySlice): string {
  const accounting = slice.sampleAccounting;
  if (accounting === null) return `${label}: accounting not recorded`;
  return `${label}: ${accounting.eligible} eligible / ${accounting.excluded} excluded of ${accounting.scopedTotal}`;
}

/**
 * Deliberately NOT "AI EVOLVED" / "SELF-IMPROVED" / "SUPER AI" anywhere
 * — see this file's header. VALID (the enum value is unchanged) reads as
 * observational evidence only: every validation gate — engineering
 * thresholds, not statistical significance — was met when an older window
 * was compared with a newer one (Phase 8.6.6b). It does not say the
 * candidate was validated, and nothing here implies it was applied, that it
 * would work, or that it may be promoted.
 */
const VALIDATION_RESULT_LABEL: Record<ValidationResult, string> = {
  VALID: "Observational evidence — met every validation gate",
  INVALID: "Invalid",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  INCONCLUSIVE: "Inconclusive",
  NOT_APPLICABLE: "Not applicable — outside executed-only replay",
};

const VALIDATION_RESULT_COLOR: Record<ValidationResult, string> = {
  VALID: "text-cyan",
  INVALID: "text-down",
  INSUFFICIENT_EVIDENCE: "text-ink-faint",
  INCONCLUSIVE: "text-amber",
  NOT_APPLICABLE: "text-ink-faint",
};

// Phase 8.6.7 — human approval status. The wording comes from ONE shared
// module (lib/ai/evolutionApproval/wording.ts) so this panel and the Telegram
// message can never say different things. Approval is a RECORDED HUMAN
// DECISION ONLY: nothing on this page deploys, activates or promotes
// anything, and the decision itself is made only by the approver, in
// Telegram — the single button here just asks the approver to decide.
const APPROVAL_STATUS_COLOR: Record<ApprovalStatus, string> = {
  AWAITING_HUMAN_APPROVAL: "text-amber",
  HUMAN_APPROVED: "text-cyan",
  HUMAN_REJECTED: "text-down",
  INELIGIBLE: "text-ink-faint",
};

const REQUEST_OUTCOME_MESSAGE: Record<string, string> = {
  REQUEST_SENT: "Approval request sent to the approver on Telegram.",
  ALREADY_DECIDED: "A decision already exists for this record.",
  INELIGIBLE: "This record is not eligible for approval.",
  RECORD_STORE_UNAVAILABLE: "The record store is unavailable. Nothing was sent.",
  TELEGRAM_UNAVAILABLE: "Telegram could not be reached. Nothing was decided.",
};

function ApprovalBlock({ symbol, candidate, validation, approval }: { symbol: string; candidate: EvolutionCandidateWithoutTimestamp; validation: EvolutionValidationWithoutTimestamp; approval: EvolutionApprovalView | undefined }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (approval === undefined) return null;

  async function requestApproval() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai-performance/approvals/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, proposalId: candidate.proposalId }),
      });
      const json: { outcome?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.status === 401) setMessage("Only the admin can send approval requests.");
      else if (json.error === "not_configured") setMessage("Telegram approval is not configured.");
      else setMessage((json.outcome && REQUEST_OUTCOME_MESSAGE[json.outcome]) || "The request could not be sent.");
    } catch {
      setMessage("The request could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const canRequest = validation.result === "VALID" && approval.status === "AWAITING_HUMAN_APPROVAL";
  return (
    <div className="mt-1 rounded border border-line/60 bg-black/10 p-1.5">
      <p className="text-ink-muted">
        Approval: <span className={APPROVAL_STATUS_COLOR[approval.status]}>{APPROVAL_STATUS_LABEL[approval.status]}</span>
        {approval.decidedAt !== null && <span className="text-ink-faint"> · {approval.decidedAt}</span>}
      </p>
      {validation.result === "VALID" && (
        <p className="mt-0.5 text-ink-faint">
          {OBSERVATIONAL_VALIDATION_PASSED}. {OBSERVATIONAL_EVIDENCE_ONLY}
        </p>
      )}
      {approval.failure !== null && <p className="mt-0.5 text-ink-faint">Not eligible: {approval.failure}</p>}
      {approval.recordHash !== null && (
        <details className="mt-0.5 text-ink-faint">
          <summary className="cursor-pointer">Record hash {approval.recordHash.slice(0, 16)}…</summary>
          <p className="break-all font-mono">{approval.recordHash}</p>
        </details>
      )}
      <details className="mt-0.5 text-ink-faint">
        <summary className="cursor-pointer">What this means</summary>
        <p>{VALID_MEANING}</p>
        <p className="mt-0.5">{APPROVAL_MEANING}</p>
      </details>
      <p className="mt-0.5 text-ink-faint">Decisions are made only by the approver, in Telegram.</p>
      {canRequest && (
        <button type="button" disabled={sending} onClick={requestApproval} className="mt-1 rounded border border-line/60 px-2 py-0.5 text-ink-muted disabled:opacity-50">
          {sending ? "Sending…" : "Send approval request to approver"}
        </button>
      )}
      {message !== null && <p className="mt-0.5 text-ink-muted">{message}</p>}
    </div>
  );
}

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
          <p className="text-[10px] text-ink-faint">Observed split-history results only — not counterfactual validation, and nothing below shows what a proposed change would do. Human approval has not occurred; nothing below has been applied.</p>
          <ul className="mt-1.5 space-y-3">
            {evolution.map(({ symbol, candidates }) =>
              candidates.map(({ candidate, validation, approval }) => (
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
                  <p className="mt-0.5 text-ink-faint">
                    {VALIDATION_MODE_LABEL[validation.validationMode]} · {validation.counterfactualAvailable ? "Counterfactual available" : "Not counterfactual validation"}
                  </p>
                  <p className="mt-0.5 text-ink-muted">
                    Data: <span className={candidate.status === "REPLAY_PASSED" ? "text-up" : "text-ink-faint"}>{candidate.replayApplicability.applicable ? CANDIDATE_STATUS_LABEL[candidate.status] : "Replay not applicable to this gap"}</span> · Regression:{" "}
                    {!validation.regressionCheck.evaluated ? (
                      <span className="text-ink-faint">Not evaluated</span>
                    ) : (
                      <span className={validation.regressionCheck.regressionDetected ? "text-down" : "text-up"}>{validation.regressionCheck.regressionDetected ? "Detected" : "None"}</span>
                    )}
                  </p>
                  {validation.gates.length > 0 && (
                    <p className="mt-0.5 text-ink-faint">
                      Validation gates passed: {validation.gates.filter((g) => g.passed).length} of {validation.gates.length} · engineering thresholds, not statistical significance
                    </p>
                  )}
                  {candidate.replay !== null && (
                    <p className="mt-0.5 text-ink-faint">
                      Samples — {describeSlice("older window", candidate.replay.baseline)} · {describeSlice("newer window", candidate.replay.candidate)}
                    </p>
                  )}
                  {validation.evidence.length > 0 && <p className="mt-0.5 text-ink-faint">Evidence: {validation.evidence.join(" ")}</p>}
                  <details className="mt-0.5 text-ink-faint">
                    <summary className="cursor-pointer">Missing for counterfactual replay ({validation.missingCounterfactualInputs.length})</summary>
                    <ul className="ml-3 list-disc">
                      {validation.missingCounterfactualInputs.map((input) => (
                        <li key={input.code}>{input.description}</li>
                      ))}
                    </ul>
                  </details>
                  <ApprovalBlock symbol={symbol} candidate={candidate} validation={validation} approval={approval} />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
