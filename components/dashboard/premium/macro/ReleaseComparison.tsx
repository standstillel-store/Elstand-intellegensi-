import type { EconomicReleaseWithInterpretation } from "@/lib/ai/macroIntelligence/contracts";
import { getIndicatorDefinition } from "@/lib/economicData/indicatorDefinitions";
import { humanize, toneFor, TONE_TEXT } from "./toneMap";

// ---------------------------------------------------------------------------
// ReleaseComparison — detail panel for the currently selected release.
//
// READ-ONLY over interpret.ts's/revisionEngine.ts's already-computed
// output. This file introduces zero economic semantics of its own — it
// only presents `interpretation.surprise` / `.momentum` / `.revisionImpact`
// / `.dataCompleteness` exactly as those closed enums already read, and
// `interpretation.macroPressure` (the one field that DOES carry resolved
// economic meaning) gets the semantic tone; the raw surprise/momentum/
// revision badges stay neutral — see toneMap.ts's header for why.
//
// Every field (actual/forecast/previous/revisedPrevious) is rendered
// independently — a missing forecast never gets collapsed into "0" or
// hidden; it reads "Unavailable" verbatim.
// ---------------------------------------------------------------------------

interface ReleaseComparisonProps {
  entry: EconomicReleaseWithInterpretation | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  const available = value !== null && value !== undefined;
  return (
    <div className="rounded-md border border-line bg-bg-raised p-2.5">
      <p className="eyebrow text-[10px] text-ink-faint">{label}</p>
      <p className={`mono-num mt-1 text-sm ${available ? "text-ink" : "text-ink-faint"}`}>{available ? value : "Unavailable"}</p>
    </div>
  );
}

export function ReleaseComparison({ entry }: ReleaseComparisonProps) {
  if (!entry) {
    return (
      <div className="panel mt-3 p-4">
        <p className="text-sm text-ink-faint">Select an event above to see its full actual/forecast/previous/revision breakdown.</p>
      </div>
    );
  }

  const { release, interpretation } = entry;
  const def = getIndicatorDefinition(release.indicatorId);
  const pressureTone = toneFor.macroPressure(interpretation.macroPressure);

  return (
    <div className="panel mt-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{def.displayName}</p>
        <span className="eyebrow text-[10px] text-ink-faint">{release.country}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-faint">{def.notes}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Actual" value={release.actual} />
        <Field label="Forecast" value={release.forecast} />
        <Field label="Previous" value={release.previous} />
        <Field label="Revised Previous" value={release.revisedPrevious} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded border border-line px-2 py-1 text-ink-muted">Surprise: {humanize(interpretation.surprise)}</span>
        <span className="rounded border border-line px-2 py-1 text-ink-muted">Momentum: {humanize(interpretation.momentum)}</span>
        <span className="rounded border border-line px-2 py-1 text-ink-muted">Revision: {humanize(interpretation.revisionImpact)}</span>
        <span className={`rounded border px-2 py-1 ${TONE_TEXT[pressureTone]} border-current/30`}>Macro Pressure: {humanize(interpretation.macroPressure)}</span>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-faint">
        Data completeness: {humanize(interpretation.dataCompleteness)} — this reflects how much of the actual/forecast/previous triad was available, not
        how confident ELVOID AI is about market direction.
      </p>
      {interpretation.explanation && <p className="mt-2 text-xs leading-snug text-ink-muted">{interpretation.explanation}</p>}
    </div>
  );
}
