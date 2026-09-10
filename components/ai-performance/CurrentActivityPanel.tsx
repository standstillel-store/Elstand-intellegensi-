"use client";

import { useMemo } from "react";
import { useRuntimeEvents, type RuntimeEvent, type RuntimeEventComponent, type RuntimeEventStatus } from "./cognitive/useRuntimeEvents";

// ---------------------------------------------------------------------------
// Phase 8.5 — "Current Activity" (AI Performance redesign).
//
// Every row is derived from the same real public.runtime_events stream the
// Runtime Terminal already reads (via the same useRuntimeEvents() hook —
// no second data source, no fake status, no setInterval/random rotation).
// A symbol with no event yet simply isn't listed — it is never shown as
// "Idle" by invention; "Idle" below only appears for a symbol whose most
// recent REAL event says its cycle finished.
// ---------------------------------------------------------------------------

const HUMAN_LABEL: Partial<Record<`${RuntimeEventComponent}:${RuntimeEventStatus}`, string>> = {
  "EXTERNAL_INTELLIGENCE:RUNNING": "Fetching external evidence",
  "CYCLE:RUNNING": "Processing",
  "MARKET_DATA:RUNNING": "Fetching market data",
  "DECISION:WAIT": "Waiting",
  "DECISION:REJECT": "Rejected",
  "DECISION:SUCCESS": "Executing",
  "QUALIFICATION:WARNING": "Evaluating (caution)",
  "PRE_ENTRY:WARNING": "Evaluating (caution)",
  "CYCLE:SUCCESS": "Idle",
  "CYCLE:ERROR": "Error",
  "CYCLE:SKIPPED": "Idle — insufficient data",
};

function labelFor(e: RuntimeEvent): string {
  return HUMAN_LABEL[`${e.component}:${e.status}`] ?? `${e.component.replace("_", " ").toLowerCase()} — ${e.status.toLowerCase()}`;
}

const STATUS_DOT: Record<RuntimeEventStatus, string> = {
  RUNNING: "bg-cyan animate-pulse",
  SUCCESS: "bg-ink-faint",
  WARNING: "bg-amber-400",
  ERROR: "bg-down",
  SKIPPED: "bg-ink-faint",
  WAIT: "bg-amber-400",
  REJECT: "bg-down",
  UNAVAILABLE: "bg-ink-faint",
};

export function CurrentActivityPanel() {
  const { events } = useRuntimeEvents();

  const latestPerSymbol = useMemo(() => {
    const map = new Map<string, RuntimeEvent>();
    for (const e of events) {
      const prev = map.get(e.symbol);
      if (!prev || Date.parse(e.createdAt) > Date.parse(prev.createdAt)) map.set(e.symbol, e);
    }
    return [...map.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [events]);

  return (
    <div className="glow-card p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Current Activity</p>
      {latestPerSymbol.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-ink-muted">No runtime activity yet — waiting for the next market cycle.</p>
      ) : (
        <ul className="space-y-1.5">
          {latestPerSymbol.map((e) => (
            <li key={e.symbol} className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-ink">{e.symbol}</span>
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[e.status]}`} />
                {labelFor(e)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
