import type { MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";
import { humanize, toneFor, TONE_TEXT, TONE_BORDER } from "./toneMap";

// ---------------------------------------------------------------------------
// ElvoidMacroConclusion — "MACRO -> CRYPTO OUTLOOK (ELVOID AI)".
//
// Reuses GlobalRiskRegimePanel.tsx's deterministic-narrative philosophy:
// every sentence here is built from already-computed closed enums
// (economicRegime/riskEnvironment/clusters/clusterEvidence) — NO LLM call,
// NO second AI pipeline, NO fabricated evidence. If the underlying data
// is insufficient, this panel says so plainly instead of forcing a
// conclusion — never "BTC will..." language, per this feature's
// standing rule since the very first spec.
// ---------------------------------------------------------------------------

interface ElvoidMacroConclusionProps {
  data: MacroIntelligenceContext;
}

const RISK_EXPLANATION: Record<string, string> = {
  RISK_ON_SUPPORTIVE: "Current evidence suggests a macro backdrop generally more supportive of risk assets.",
  RISK_OFF_PRESSURE: "Current evidence suggests macro conditions that may pressure risk assets.",
  CAUTIOUS: "Current evidence points to a mixed backdrop that warrants caution rather than a clear directional read.",
  MIXED: "Evidence across clusters is currently mixed, without a clear directional read.",
  TRANSITIONING: "The macro environment appears to be in transition between regimes — the picture may become clearer as more data arrives.",
  INSUFFICIENT_DATA: "There isn't enough economic data yet to form a macro-to-crypto read.",
};

export function ElvoidMacroConclusion({ data }: ElvoidMacroConclusionProps) {
  const { economicRegime, riskEnvironment, clusters, clusterEvidence, dataCompleteness } = data;

  // BUG FOUND DURING PHASE H RUNTIME VALIDATION (documented, not silently
  // fixed): composeMacroContext() always sets economicRegime/
  // riskEnvironment/clusters to a defined value whenever the pipeline
  // runs at all — "not enough evidence" is represented as the STRING
  // "INSUFFICIENT_DATA", never as an absent/undefined field (regime.ts's
  // assessRegime() always returns a concrete EconomicRegime). A guard
  // that only checked for `undefined` was therefore unreachable in real
  // usage, and the brief's explicitly requested "INSUFFICIENT MACRO DATA"
  // banner would never have shown. Fixed by also checking for the
  // INSUFFICIENT_DATA value itself.
  if (!economicRegime || !riskEnvironment || !clusters || economicRegime === "INSUFFICIENT_DATA") {
    return (
      <div className="panel p-4">
        <p className="eyebrow text-[11px] text-signal">Macro → Crypto Outlook (ELVOID AI)</p>
        <p className="mt-3 text-lg font-semibold text-ink-faint">Insufficient Macro Data</p>
        <p className="mt-2 text-sm text-ink-muted">
          The current conclusion cannot be reliably formed yet — the cluster/regime pipeline hasn&apos;t received enough stored economic data. This is an
          honest state, not an error; it resolves as daily ingestion accumulates more releases.
        </p>
      </div>
    );
  }

  const riskTone = toneFor.riskEnvironment(riskEnvironment);
  const explanation = RISK_EXPLANATION[riskEnvironment] ?? RISK_EXPLANATION.MIXED;

  const supporting: string[] = [];
  const conflicting: string[] = [];
  const clusterList: { label: string; state: string; tone: ReturnType<typeof toneFor.inflationCluster>; evidence: string[] }[] = [
    { label: "Inflation", state: clusters.inflation, tone: toneFor.inflationCluster(clusters.inflation), evidence: [...(clusterEvidence?.inflation ?? [])] },
    { label: "Labor", state: clusters.labor, tone: toneFor.laborCluster(clusters.labor), evidence: [...(clusterEvidence?.labor ?? [])] },
    { label: "Growth", state: clusters.growth, tone: toneFor.growthCluster(clusters.growth), evidence: [...(clusterEvidence?.growth ?? [])] },
    {
      label: "Monetary Policy",
      state: clusters.monetaryPolicy,
      tone: toneFor.monetaryPolicyCluster(clusters.monetaryPolicy),
      evidence: [...(clusterEvidence?.monetaryPolicy ?? [])],
    },
  ];
  for (const c of clusterList) {
    const line = `${c.label}: ${humanize(c.state)}`;
    if (c.tone === "up") supporting.push(line);
    else if (c.tone === "down") conflicting.push(line);
  }

  const invalidation =
    riskEnvironment === "RISK_ON_SUPPORTIVE"
      ? "A reacceleration in inflation or a renewed hawkish policy shift could invalidate this read."
      : riskEnvironment === "RISK_OFF_PRESSURE"
        ? "Cooling inflation alongside resilient growth and a dovish policy shift could invalidate this read."
        : "This read is inherently provisional given mixed evidence — new releases in either direction could change it.";

  return (
    <div className="panel p-4">
      <p className="eyebrow text-[11px] text-signal">Macro → Crypto Outlook (ELVOID AI)</p>
      <p className={`mt-3 text-xl font-semibold leading-tight ${TONE_TEXT[riskTone]}`}>{humanize(riskEnvironment)}</p>
      <p className="mt-1 text-[11px] text-ink-faint">
        Data completeness: {humanize(dataCompleteness)} — reflects available data, not certainty of market direction.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{explanation}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="eyebrow text-[10px] text-up">Key Evidence</p>
          <ul className="mt-1.5 space-y-1 text-xs text-ink-muted">
            {supporting.length > 0 ? supporting.map((s) => <li key={s}>• {s}</li>) : <li className="text-ink-faint">No clearly supportive signals yet.</li>}
          </ul>
        </div>
        <div>
          <p className="eyebrow text-[10px] text-down">Conflicting Signals</p>
          <ul className="mt-1.5 space-y-1 text-xs text-ink-muted">
            {conflicting.length > 0 ? conflicting.map((s) => <li key={s}>• {s}</li>) : <li className="text-ink-faint">No clearly conflicting signals yet.</li>}
          </ul>
        </div>
      </div>

      <div className={`mt-4 rounded-md border ${TONE_BORDER.muted} bg-bg-raised p-3`}>
        <p className="eyebrow text-[10px] text-ink-faint">Invalidation</p>
        <p className="mt-1 text-xs text-ink-muted">{invalidation}</p>
      </div>
    </div>
  );
}
