import type { MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";
import { toneFor, humanize, TONE_TEXT, TONE_BORDER, TONE_BG } from "./toneMap";

// ---------------------------------------------------------------------------
// MacroScorecard — the regime headline + 4 cluster mini-cards, in one card.
//
// Consolidation note (documented per Phase H's own "distinguish
// implemented vs. structurally verified" honesty requirement, and to be
// upfront about a deliberate interpretation, not a silent deviation): the
// brief's mobile order lists "Macro Regime / Scorecard summary" and
// "Cluster Analysis" as two separate steps. This component renders both
// as ONE unit (regime badge on top, four cluster mini-cards below) —
// matching the reference image's own phone mockup, where the "ELVOID
// MACRO INTELLIGENCE" card shows exactly this: a regime line with a
// confidence gauge, then four compact cluster chips, all inside one
// card. Splitting them into two separately-ordered pieces would work
// against the reference's own visual grouping for no real benefit.
//
// READ-ONLY: renders `data.clusters`/`data.economicRegime`/
// `data.riskEnvironment`/`data.clusterEvidence` exactly as computed by
// composeMacroContext.ts. No calculation happens in this file.
// ---------------------------------------------------------------------------

interface MacroScorecardProps {
  data: MacroIntelligenceContext;
}

function ClusterMiniCard({ label, state, tone, evidence }: { label: string; state: string; tone: ReturnType<typeof toneFor.inflationCluster>; evidence: string[] }) {
  return (
    <div className={`rounded-md border ${TONE_BORDER[tone]} ${TONE_BG[tone]} p-2.5`}>
      <p className="eyebrow text-[10px] text-ink-faint">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${TONE_TEXT[tone]}`}>{humanize(state)}</p>
      {evidence.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-muted">{evidence[0]}</p>
      ) : (
        <p className="mt-1 text-[11px] text-ink-faint">No evidence available yet.</p>
      )}
    </div>
  );
}

export function MacroScorecard({ data }: MacroScorecardProps) {
  const { clusters, economicRegime, riskEnvironment, clusterEvidence, dataCompleteness } = data;

  if (!clusters || !economicRegime || !riskEnvironment) {
    return (
      <div className="panel p-4">
        <p className="eyebrow text-[11px] text-ink-faint">Macro Regime</p>
        <p className="mt-2 text-sm text-ink-muted">
          Insufficient economic data to assess a macro regime yet. Ingestion runs daily — check back after the next scheduled snapshot.
        </p>
      </div>
    );
  }

  const regimeTone = toneFor.economicRegime(economicRegime);
  const riskTone = toneFor.riskEnvironment(riskEnvironment);

  return (
    <div className="panel p-4">
      <p className="eyebrow text-[11px] text-ink-faint">Macro Regime</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className={`text-lg font-semibold leading-tight ${TONE_TEXT[regimeTone]}`}>{humanize(economicRegime)}</p>
        <span className={`eyebrow rounded border ${TONE_BORDER[riskTone]} ${TONE_BG[riskTone]} px-1.5 py-0.5 text-[10px] ${TONE_TEXT[riskTone]}`}>
          {humanize(riskEnvironment)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        Data completeness: <span className="text-ink-muted">{humanize(dataCompleteness) || "Unavailable"}</span> — reflects how much
        actual/forecast/previous data was available, not market-direction confidence.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ClusterMiniCard label="Inflation" state={clusters.inflation} tone={toneFor.inflationCluster(clusters.inflation)} evidence={[...(clusterEvidence?.inflation ?? [])]} />
        <ClusterMiniCard label="Labor" state={clusters.labor} tone={toneFor.laborCluster(clusters.labor)} evidence={[...(clusterEvidence?.labor ?? [])]} />
        <ClusterMiniCard label="Growth" state={clusters.growth} tone={toneFor.growthCluster(clusters.growth)} evidence={[...(clusterEvidence?.growth ?? [])]} />
        <ClusterMiniCard
          label="Monetary Policy"
          state={clusters.monetaryPolicy}
          tone={toneFor.monetaryPolicyCluster(clusters.monetaryPolicy)}
          evidence={[...(clusterEvidence?.monetaryPolicy ?? [])]}
        />
      </div>
    </div>
  );
}
