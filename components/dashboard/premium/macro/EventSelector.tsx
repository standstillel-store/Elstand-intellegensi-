"use client";

import type { EconomicReleaseWithInterpretation } from "@/lib/ai/macroIntelligence/contracts";
import { getIndicatorDefinition } from "@/lib/economicData/indicatorDefinitions";
import { humanize } from "./toneMap";

// ---------------------------------------------------------------------------
// EventSelector — dense terminal-style event table (Recent Economic Events).
//
// READ-ONLY: `releases` is exactly `MacroIntelligenceContext.recentReleases`
// (see composeMacroContext.ts) — no provider call, no interpretation, no
// recomputation happens in this file. Selection state is local (a single
// `selectedId` string lifted to EconomicIntelligenceEngine.tsx, per the
// brief's "keep selection state local unless an obvious better pattern
// exists" instruction — there's exactly one consumer of the selection,
// ReleaseComparison.tsx, so lifting one level up is already the simplest
// option).
// ---------------------------------------------------------------------------

interface EventSelectorProps {
  releases: readonly EconomicReleaseWithInterpretation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function fmt(value: string | null): string {
  return value ?? "—";
}

export function EventSelector({ releases, selectedId, onSelect }: EventSelectorProps) {
  if (releases.length === 0) {
    return (
      <div className="panel p-4">
        <p className="eyebrow text-[11px] text-ink-faint">Recent Economic Events</p>
        <p className="mt-2 text-sm text-ink-muted">No stored releases yet — the daily ingestion snapshot hasn&apos;t populated this indicator set. This is not an error; check back after the next scheduled run.</p>
      </div>
    );
  }

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="p-4 pb-2">
        <p className="eyebrow text-[11px] text-ink-faint">Recent Economic Events</p>
      </div>
      {/* Controlled horizontal overflow ONLY inside this table container, per the mobile contract — the panel itself never causes viewport overflow. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-y border-line text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-2 py-2 font-medium mono-num">Actual</th>
              <th className="px-2 py-2 font-medium mono-num hidden sm:table-cell">Forecast</th>
              <th className="px-2 py-2 font-medium mono-num hidden sm:table-cell">Previous</th>
              <th className="px-2 py-2 font-medium">Surprise</th>
              <th className="px-4 py-2 font-medium">Impact</th>
            </tr>
          </thead>
          <tbody>
            {releases.map(({ release, interpretation }) => {
              const def = getIndicatorDefinition(release.indicatorId);
              const isSelected = selectedId === release.id;
              return (
                <tr
                  key={release.id}
                  onClick={() => onSelect(release.id)}
                  className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-bg-raised ${isSelected ? "bg-bg-raised" : ""}`}
                >
                  <td className="px-4 py-2 font-medium text-ink">{def.displayName}</td>
                  <td className="px-2 py-2 mono-num text-ink">{fmt(release.actual)}</td>
                  <td className="px-2 py-2 mono-num text-ink-muted hidden sm:table-cell">{fmt(release.forecast)}</td>
                  <td className="px-2 py-2 mono-num text-ink-muted hidden sm:table-cell">{fmt(release.previous)}</td>
                  <td className="px-2 py-2 text-ink-muted">{humanize(interpretation.surprise)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`eyebrow rounded border px-1.5 py-0.5 text-[9px] ${
                        release.impact === "high" ? "border-down/30 text-down" : release.impact === "medium" ? "border-amber/30 text-amber" : "border-line text-ink-faint"
                      }`}
                    >
                      {release.impact.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
