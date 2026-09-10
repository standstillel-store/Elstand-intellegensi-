"use client";

import { useMemo } from "react";
import { useRuntimeEvents } from "./cognitive/useRuntimeEvents";

// ---------------------------------------------------------------------------
// Phase 8.5 — "External Intelligence" panel (AI Performance redesign).
//
// Reads the most recent EXTERNAL_INTELLIGENCE component event from the
// same real runtime_events stream the terminal uses. Every field below is
// read verbatim from that event's own metadata (set in
// lib/ai/autonomousRuntime/orchestrator.ts at the instant the real gate
// call resolved) — Provider is only ever "Binance" when the event's own
// metadata says evidence was actually satisfied; otherwise the panel
// shows UNAVAILABLE rather than implying a provider was used.
// ---------------------------------------------------------------------------

export function ExternalIntelligencePanel() {
  const { events } = useRuntimeEvents();

  const latest = useMemo(() => {
    const extIntel = events.filter((e) => e.component === "EXTERNAL_INTELLIGENCE");
    if (extIntel.length === 0) return null;
    return extIntel.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a));
  }, [events]);

  if (!latest) {
    return (
      <div className="glow-card p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">External Intelligence</p>
        <p className="py-4 text-center text-[11px] text-ink-muted">No external intelligence activity recorded yet this session.</p>
      </div>
    );
  }

  const capabilities = Array.isArray(latest.metadata?.requestedCapabilities) ? (latest.metadata!.requestedCapabilities as string[]) : [];
  const provider = latest.metadata?.provider ? String(latest.metadata.provider) : null;
  const duration = latest.durationMs !== null ? (latest.durationMs >= 1000 ? `${(latest.durationMs / 1000).toFixed(1)}s` : `${latest.durationMs}ms`) : "—";

  const statusColor = latest.status === "SUCCESS" ? "text-up" : latest.status === "RUNNING" ? "text-cyan" : latest.status === "ERROR" || latest.status === "REJECT" ? "text-down" : "text-ink-faint";

  return (
    <div className="glow-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">External Intelligence</p>
        <span className={`text-[10px] font-semibold uppercase ${statusColor}`}>{latest.status}</span>
      </div>
      <dl className="space-y-1 text-[11px]">
        <div className="flex justify-between"><dt className="text-ink-faint">Symbol</dt><dd className="text-ink">{latest.symbol}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-faint">Capability</dt><dd className="truncate text-ink">{capabilities.length > 0 ? capabilities.join(", ") : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-faint">Duration</dt><dd className="mono-num text-ink">{duration}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-faint">Source</dt><dd className="text-ink">{provider ?? "UNAVAILABLE"}</dd></div>
      </dl>
    </div>
  );
}
