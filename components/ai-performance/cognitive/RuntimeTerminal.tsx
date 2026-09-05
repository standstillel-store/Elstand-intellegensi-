"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { CognitiveEvent, EventSource } from "@/lib/ai/cognitiveMap/contracts";
import { EVENT_SEVERITY_COLOR } from "./status";

const FILTERS: readonly ("ALL" | EventSource | "ERROR")[] = ["ALL", "MARKET", "MACRO", "PATTERN", "ORACLE", "RISK", "EXECUTION", "LEARNING", "ERROR"];

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function RuntimeTerminal({ events, onSelectNode }: { events: readonly CognitiveEvent[]; onSelectNode: (id: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [paused, setPaused] = useState(false);
  const [frozenAt, setFrozenAt] = useState<readonly CognitiveEvent[] | null>(null);
  const [cleared, setCleared] = useState<string | null>(null); // ISO — hide events at/older than this (view-only, not a delete)

  const live = paused ? frozenAt ?? events : events;
  const visible = useMemo(() => {
    let list = live;
    if (cleared) list = list.filter((e) => new Date(e.timestamp).getTime() > new Date(cleared).getTime());
    if (filter === "ALL") return list;
    if (filter === "ERROR") return list.filter((e) => e.severity === "ERROR" || e.severity === "WARNING");
    return list.filter((e) => e.source === filter);
  }, [live, filter, cleared]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-line bg-[#070a10]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">ELVOID Runtime</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setPaused((p) => {
                if (!p) setFrozenAt(events);
                return !p;
              });
            }}
            className={clsx("rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide", paused ? "bg-up/15 text-up" : "bg-white/5 text-ink-muted hover:text-ink")}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => setCleared(new Date().toISOString())}
            className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
            title="Clears this view only — no persisted event is deleted."
          >
            Clear view
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={clsx("rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide", filter === f ? "bg-cyan/20 text-cyan" : "bg-white/5 text-ink-muted hover:text-ink")}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 font-mono text-[10.5px] leading-relaxed">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-ink-muted">
            {events.length === 0 ? "NO SIGNAL — waiting for the next real intelligence cycle." : "No events match this filter."}
          </p>
        ) : (
          visible.map((e) => (
            <div key={e.id} className="cursor-pointer whitespace-pre-wrap break-words py-0.5 hover:bg-white/5" onClick={() => e.nodeId && onSelectNode(e.nodeId)}>
              <span className="text-ink-muted">[{formatTime(e.timestamp)}]</span> <span style={{ color: EVENT_SEVERITY_COLOR[e.severity] }}>[{e.source}]</span>{" "}
              <span className="text-ink">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
