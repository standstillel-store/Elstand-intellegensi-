"use client";

import { useState } from "react";
import type { Reading } from "@/lib/intelligence/premium";
import type { MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";
import { LiveDot } from "@/components/ui/LiveDot";
import { MacroScorecard } from "./MacroScorecard";
import { EventSelector } from "./EventSelector";
import { ReleaseComparison } from "./ReleaseComparison";
import { ElvoidMacroConclusion } from "./ElvoidMacroConclusion";
import { toneFor, humanize, TONE_TEXT } from "./toneMap";

// ---------------------------------------------------------------------------
// EconomicIntelligenceEngine — top-level Macro Intelligence section.
//
// READ ONLY over the existing pipeline: this file and everything it
// renders consumes `macroIntelligence` (a Reading<MacroIntelligenceContext>,
// exactly what lib/intelligence/premium.ts's getPremiumIntelligenceSnapshot()
// already produces via composeMacroContext() — Phase G). Nothing here
// calls Alpha Vantage, ForexFactory, Supabase, or re-runs interpret.ts/
// clusters.ts/regime.ts. Selection state (which event is expanded in
// ReleaseComparison) is the only local state in this whole feature.
// ---------------------------------------------------------------------------

interface EconomicIntelligenceEngineProps {
  macroIntelligence: Reading<MacroIntelligenceContext>;
}

function SectionStatus({ state }: { state: "real" | "proxy" | "unavailable" }) {
  if (state === "real") return <LiveDot tone="up" label="LIVE DATA" />;
  if (state === "proxy") return <LiveDot tone="amber" label="PARTIAL DATA" />;
  return <span className="eyebrow text-[10px] uppercase tracking-wider text-ink-faint">DATA UNAVAILABLE</span>;
}

// ---- Secondary panel 1: Economic Pressure Map (current-state only) -------
function EconomicPressureMap({ data }: { data?: MacroIntelligenceContext }) {
  const rows = data?.clusters
    ? [
        { label: "Inflation Pressure", state: data.clusters.inflation, tone: toneFor.inflationCluster(data.clusters.inflation) },
        { label: "Labor Strength", state: data.clusters.labor, tone: toneFor.laborCluster(data.clusters.labor) },
        { label: "Growth Momentum", state: data.clusters.growth, tone: toneFor.growthCluster(data.clusters.growth) },
        { label: "Policy Pressure", state: data.clusters.monetaryPolicy, tone: toneFor.monetaryPolicyCluster(data.clusters.monetaryPolicy) },
      ]
    : [];

  return (
    <div className="panel p-4">
      <p className="eyebrow text-[11px] text-ink-faint">Economic Pressure Map</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">Current reading only — no fabricated historical periods.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Unavailable — no cluster data stored yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-muted">{r.label}</span>
              <span className={`flex items-center gap-1.5 font-medium ${TONE_TEXT[r.tone]}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-current`} />
                {humanize(r.state)}
              </span>
            </div>
          ))}
          <div className="mt-2 flex gap-3 border-t border-line pt-2 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-up" /> Positive</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-ink-faint" /> Neutral</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-down" /> Negative</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Secondary panel 2: Liquidity & Policy Impact -------------------------
function LiquidityPolicyImpact({ data }: { data?: MacroIntelligenceContext }) {
  const policyTone = toneFor.monetaryPolicyCluster(data?.clusters?.monetaryPolicy);
  const riskTone = toneFor.riskEnvironment(data?.riskEnvironment);

  const rows: { label: string; value: string; tone?: ReturnType<typeof toneFor.inflationCluster>; note?: string }[] = [
    {
      label: "Policy Stance",
      value: data?.clusters?.monetaryPolicy ? humanize(data.clusters.monetaryPolicy) : "Unavailable",
      tone: data?.clusters?.monetaryPolicy ? policyTone : undefined,
    },
    {
      label: "Risk Appetite",
      value: data?.riskEnvironment ? humanize(data.riskEnvironment) : "Unavailable",
      tone: data?.riskEnvironment ? riskTone : undefined,
    },
    {
      label: "Liquidity Conditions",
      value: data?.riskEnvironment ? humanize(data.riskEnvironment) : "Unavailable",
      tone: data?.riskEnvironment ? riskTone : undefined,
      note: "Inferred macro condition — not a measured liquidity series.",
    },
    {
      label: "Credit Conditions",
      value: "Unavailable",
      note: "No credit-spread data source is integrated in this pass.",
    },
  ];

  return (
    <div className="panel p-4">
      <p className="eyebrow text-[11px] text-ink-faint">Liquidity & Policy Impact</p>
      <div className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">{r.label}</span>
              <span className={`font-medium ${r.tone ? TONE_TEXT[r.tone] : "text-ink-faint"}`}>{r.value}</span>
            </div>
            {r.note && <p className="mt-0.5 text-[10px] text-ink-faint">{r.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Secondary panel 3: Historical Context --------------------------------
function HistoricalContext() {
  // Phase A-G's calculation pipeline does not implement a "similar past
  // cases" comparison — repository.ts can query recent releases/
  // observations, but nothing computes a historical-similarity match.
  // Per this feature's standing honesty rule, this renders the honest
  // unavailable state rather than a fabricated "8 similar cases" list.
  return (
    <div className="panel p-4">
      <p className="eyebrow text-[11px] text-ink-faint">Historical Context</p>
      <p className="mt-3 text-sm text-ink-muted">Historical comparison unavailable — insufficient stored historical observations.</p>
      <p className="mt-1 text-[11px] text-ink-faint">Historical context will populate as observation history accumulates.</p>
    </div>
  );
}

export function EconomicIntelligenceEngine({ macroIntelligence }: EconomicIntelligenceEngineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = macroIntelligence.data;
  const releases = data?.recentReleases ?? [];
  const selectedEntry = releases.find((r) => r.release.id === selectedId) ?? releases[0] ?? null;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow text-sm text-ink">ELVOID MACRO INTELLIGENCE</p>
          <p className="text-[11px] text-ink-faint">Economic Relationship Analysis &amp; Event Calculation</p>
        </div>
        <SectionStatus state={macroIntelligence.state} />
      </div>

      {!data ? (
        <p className="mt-4 text-sm text-ink-muted">
          Macro intelligence is unavailable right now. This does not affect the rest of the dashboard — check back shortly.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="order-2 sm:order-none sm:col-span-2 lg:col-span-1">
              <EventSelector releases={releases} selectedId={selectedEntry?.release.id ?? null} onSelect={setSelectedId} />
              <ReleaseComparison entry={selectedEntry} />
            </div>
            <div className="order-1 sm:order-none">
              <MacroScorecard data={data} />
            </div>
            <div className="order-3 sm:order-none">
              <ElvoidMacroConclusion data={data} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EconomicPressureMap data={data} />
            <LiquidityPolicyImpact data={data} />
            <HistoricalContext />
          </div>
        </>
      )}
    </section>
  );
}
