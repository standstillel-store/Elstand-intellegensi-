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

// Chronological order across the WHOLE stream (not just within one
// cycle): primarily by real startedAt, falling back to the same
// sequence/createdAt tiebreak groupIntoCycles used for same-cycle
// ordering before this redesign flattened cycle boxes into one
// continuous terminal log (see CHANGES.md).
function compareEvents(a: RuntimeEvent, b: RuntimeEvent): number {
  const byTime = Date.parse(a.startedAt) - Date.parse(b.startedAt);
  if (byTime !== 0) return byTime;
  if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

// ELVOID RUNTIME TERMINAL log line — [HH:MM:SS] [COMPONENT] message
// [STATUS] [SYMBOL], every bracketed field read verbatim from the real
// public.runtime_events row (see this file's own header). No line here is
// synthesized: component/status/symbol are the row's own closed-enum
// fields, message falls back to the row's own `operation` only when
// `message` itself is null — never a fabricated string.
function EventLine({ event, onSelectNode }: { event: RuntimeEvent; onSelectNode: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = COMPONENT_META[event.component];
  const statusMeta = STATUS_META[event.status];
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
        className="flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5 px-2 py-1 text-left font-mono text-[10.5px] leading-relaxed"
      >
        <span className="shrink-0 text-ink-faint">[{formatTime(event.startedAt)}]</span>
        <span className="shrink-0 text-cyan">[{event.component.replace(/_/g, " ")}]</span>
        <span className="min-w-0 flex-1 truncate text-ink">{event.message ?? event.operation}</span>
        {duration && <span className="shrink-0 tabular-nums text-ink-faint">{duration}</span>}
        <span className="shrink-0 font-semibold" style={{ color: statusMeta.color }}>
          [{statusMeta.label}]
        </span>
        <span className="shrink-0 text-signal-glow">[{event.symbol}]</span>
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
          <dl className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
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

  const ordered = useMemo(() => [...filtered].sort(compareEvents), [filtered]);

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
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">ELVOID RUNTIME TERMINAL</span>
        <div className="flex items-center gap-1.5">
          <span className={clsx("h-1.5 w-1.5 rounded-full", connected ? "bg-up animate-pulse" : "bg-down")} />
          <span className="text-[9px] font-semibold uppercase text-ink-faint">{connected ? "LIVE" : "DISCONNECTED"}</span>
        </div>
      </div>
      {lastPolledAt && <div className="border-b border-line px-2 py-1 text-right text-[9px] text-ink-faint">polled {formatTime(lastPolledAt)}</div>}

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

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 py-1.5">
        {ordered.length === 0 ? (
          <p className="py-6 text-center text-ink-muted">
            UNAVAILABLE — no runtime events recorded yet.
            <br />
            This terminal never fabricates log lines; it populates the instant a real market cycle emits one.
          </p>
        ) : (
          ordered.map((e) => <EventLine key={e.id} event={e} onSelectNode={onSelectNode} />)
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
