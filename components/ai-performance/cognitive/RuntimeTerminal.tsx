"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useRuntimeEvents, type RuntimeEvent, type RuntimeEventComponent, type RuntimeEventStatus } from "./useRuntimeEvents";

// ---------------------------------------------------------------------------
// Phase 8.5 — Runtime Observability Terminal (180° redesign)
//
// Every row here is a real public.runtime_events record, emitted by
// lib/ai/autonomousRuntime/orchestrator.ts at the instant a real
// operation actually completed (see emitRuntimeEvent() call sites) — not
// a snapshot re-synthesized into log-shaped lines on every poll, which is
// what the previous version of this file did (that's why it looked like
// a repeating static dump: the same handful of "events" were rebuilt
// from the same unchanged snapshot row every 20s). See CHANGES.md.
//
// This component does not invent statuses, timestamps, durations,
// providers, or URLs. Every field rendered below is read verbatim from
// the event's own `status`/`message`/`metadata` — if a field wasn't in
// the event, nothing is shown for it.
// ---------------------------------------------------------------------------

const COMPONENT_META: Record<RuntimeEventComponent, { label: string; nodeId: string | null }> = {
  CYCLE: { label: "Cycle", nodeId: null },
  MARKET_DATA: { label: "Market data", nodeId: "market" },
  INTELLIGENCE: { label: "Intelligence", nodeId: "pattern" },
  ORACLE: { label: "Oracle", nodeId: "oracle" },
  RISK: { label: "Risk", nodeId: "risk" },
  EXTERNAL_INTELLIGENCE: { label: "External intelligence", nodeId: "oracle" },
  CONFLICT: { label: "Conflict", nodeId: "oracle" },
  QUALIFICATION: { label: "Qualification", nodeId: "decision" },
  PRE_ENTRY: { label: "Pre-entry validation", nodeId: "decision" },
  DECISION: { label: "Decision", nodeId: "decision" },
  EXECUTION: { label: "Execution", nodeId: "execution" },
  LEARNING: { label: "Learning", nodeId: "learning" },
};

const STATUS_META: Record<RuntimeEventStatus, { label: string; color: string; glow: boolean }> = {
  RUNNING: { label: "RUNNING", color: "#22d3ee", glow: true },
  SUCCESS: { label: "SUCCESS", color: "#00E676", glow: false },
  WARNING: { label: "WARNING", color: "#fbbf24", glow: false },
  ERROR: { label: "ERROR", color: "#FF5252", glow: false },
  SKIPPED: { label: "SKIPPED", color: "#7d8794", glow: false },
  WAIT: { label: "WAIT", color: "#fbbf24", glow: false },
  REJECT: { label: "REJECT", color: "#FF5252", glow: false },
  UNAVAILABLE: { label: "UNAVAILABLE", color: "#5b6472", glow: false },
};

const FILTERS: readonly ("ALL" | RuntimeEventComponent | "ERROR")[] = ["ALL", "MARKET_DATA", "INTELLIGENCE", "ORACLE", "RISK", "EXTERNAL_INTELLIGENCE", "DECISION", "EXECUTION", "LEARNING", "ERROR"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--.---";
  return d.toLocaleTimeString(undefined, { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** A cycle groups every event sharing one cycleId, in the real order they arrived. */
interface Cycle {
  readonly cycleId: string;
  readonly symbol: string;
  readonly events: readonly RuntimeEvent[];
  readonly startedAt: string;
  readonly stillRunning: boolean;
}

function groupIntoCycles(events: readonly RuntimeEvent[]): Cycle[] {
  const byId = new Map<string, RuntimeEvent[]>();
  for (const e of events) {
    const list = byId.get(e.cycleId) ?? [];
    list.push(e);
    byId.set(e.cycleId, list);
  }
  const cycles: Cycle[] = [];
  for (const [cycleId, list] of byId) {
    const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const cycleMarker = sorted.find((e) => e.component === "CYCLE" && e.status !== "RUNNING");
    cycles.push({ cycleId, symbol: sorted[0].symbol, events: sorted, startedAt: sorted[0].startedAt, stillRunning: cycleMarker === undefined });
  }
  return cycles.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

function StatusPill({ status }: { status: RuntimeEventStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={clsx("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", meta.glow && "animate-pulse")}
      style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
    >
      {meta.label}
    </span>
  );
}

function EventRow({ event, onSelectNode }: { event: RuntimeEvent; onSelectNode: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = COMPONENT_META[event.component];
  const duration = formatDuration(event.durationMs);
  const hasDetail = event.metadata !== null && Object.keys(event.metadata ?? {}).length > 0;

  return (
    <div className="rounded border border-transparent hover:border-line hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => {
          if (hasDetail) setExpanded((v) => !v);
          if (meta.nodeId) onSelectNode(meta.nodeId);
        }}
        className="flex w-full items-start gap-2 px-2 py-1 text-left"
      >
        <span className="mt-0.5 shrink-0 text-ink-faint">{formatTime(event.startedAt)}</span>
        <span className="mt-0.5 w-[168px] shrink-0 truncate text-ink-muted">{meta.label}</span>
        <span className="min-w-0 flex-1 truncate text-ink">{event.message ?? event.operation}</span>
        {duration && <span className="mt-0.5 shrink-0 tabular-nums text-ink-faint">{duration}</span>}
        <StatusPill status={event.status} />
      </button>

      {expanded && hasDetail && (
        <div className="mx-2 mb-1.5 rounded border border-line bg-black/30 px-2.5 py-2 text-[10px] leading-relaxed">
          <div className="mb-1 flex items-center justify-between text-ink-faint">
            <span>{event.operation}</span>
            <span>cycle #{event.cycleId.slice(0, 8)}</span>
          </div>
          {/* External Intelligence gets its own real-source presentation (Step 4/17) — provider name only when the gate actually returned satisfied evidence; never a fabricated URL. */}
          {event.component === "EXTERNAL_INTELLIGENCE" && event.metadata && (
            <div className="mb-1.5 space-y-0.5 border-b border-line/50 pb-1.5">
              <div className="flex justify-between"><span className="text-ink-faint">Capability</span><span className="text-ink">{Array.isArray(event.metadata.requestedCapabilities) ? (event.metadata.requestedCapabilities as string[]).join(", ") : "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink-faint">Evidence satisfied</span><span className="text-ink">{String(event.metadata.evidenceSatisfied ?? "—")}</span></div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Source</span>
                <span className="text-ink">{event.metadata.provider ? String(event.metadata.provider) : "UNAVAILABLE"}</span>
              </div>
            </div>
          )}
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {Object.entries(event.metadata ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 truncate">
                <dt className="shrink-0 text-ink-faint">{k}</dt>
                <dd className="truncate text-ink">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function CycleGroup({ cycle, onSelectNode }: { cycle: Cycle; onSelectNode: (id: string) => void }) {
  const finalEvent = cycle.events.find((e) => e.component === "CYCLE" && e.status !== "RUNNING");
  return (
    <div className="rounded border border-line/60">
      <div className="flex items-center justify-between gap-2 border-b border-line/60 bg-white/[0.02] px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan">{cycle.symbol}</span>
          <span className="text-[9px] text-ink-faint">cycle #{cycle.cycleId.slice(0, 8)}</span>
        </div>
        {cycle.stillRunning ? <StatusPill status="RUNNING" /> : finalEvent && <StatusPill status={finalEvent.status} />}
      </div>
      <div className="divide-y divide-line/30 px-0.5 py-0.5">
        {cycle.events
          .filter((e) => e.component !== "CYCLE")
          .map((e) => (
            <EventRow key={e.id} event={e} onSelectNode={onSelectNode} />
          ))}
      </div>
    </div>
  );
}

export function RuntimeTerminal({ onSelectNode }: { onSelectNode: (id: string) => void }) {
  const { events, connected, lastPolledAt } = useRuntimeEvents();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const symbols = useMemo(() => Array.from(new Set(events.map((e) => e.symbol))).sort(), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (symbolFilter) list = list.filter((e) => e.symbol === symbolFilter);
    if (filter === "ERROR") list = list.filter((e) => e.status === "ERROR" || e.status === "WARNING" || e.status === "REJECT");
    else if (filter !== "ALL") list = list.filter((e) => e.component === filter);
    return list;
  }, [events, filter, symbolFilter]);

  const cycles = useMemo(() => groupIntoCycles(filtered), [filtered]);

  // Auto-scroll: follow new events by default; stop the instant the user
  // scrolls up to read history, resume when they explicitly return to
  // the bottom (Step 8) — never force-scroll while they're reading.
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = events.length;
  }, [events.length, autoScroll]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  }

  const newSinceScrollStop = !autoScroll ? Math.max(0, events.length - prevCountRef.current) : 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col rounded border border-line bg-[#070a10]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className={clsx("h-1.5 w-1.5 rounded-full", connected ? "bg-up animate-pulse" : "bg-down")} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">ELVOID Runtime {connected ? "LIVE" : "DISCONNECTED"}</span>
        </div>
        <span className="text-[9px] text-ink-faint">{lastPolledAt ? `polled ${formatTime(lastPolledAt)}` : ""}</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={clsx("rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide", filter === f ? "bg-cyan/20 text-cyan" : "bg-white/5 text-ink-muted hover:text-ink")}
          >
            {f.replace("_", " ")}
          </button>
        ))}
        {symbols.length > 0 && (
          <select
            value={symbolFilter ?? ""}
            onChange={(e) => setSymbolFilter(e.target.value || null)}
            className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted"
          >
            <option value="">ALL SYMBOLS</option>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1.5 py-1.5 text-[10.5px] leading-relaxed">
        {cycles.length === 0 ? (
          <p className="py-6 text-center text-ink-muted">IDLE — waiting for the next real market cycle.</p>
        ) : (
          cycles.map((c) => <CycleGroup key={c.cycleId} cycle={c} onSelectNode={onSelectNode} />)
        )}
      </div>

      {!autoScroll && newSinceScrollStop > 0 && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan/40 bg-[#0b1017] px-3 py-1 text-[10px] font-medium text-cyan shadow-glow-cyan"
        >
          ↓ {newSinceScrollStop} new event{newSinceScrollStop === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
