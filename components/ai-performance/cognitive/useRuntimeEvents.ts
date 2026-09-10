"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type RuntimeEventStatus = "RUNNING" | "SUCCESS" | "WARNING" | "ERROR" | "SKIPPED" | "WAIT" | "REJECT" | "UNAVAILABLE";
export type RuntimeEventComponent = "CYCLE" | "MARKET_DATA" | "INTELLIGENCE" | "ORACLE" | "RISK" | "EXTERNAL_INTELLIGENCE" | "CONFLICT" | "QUALIFICATION" | "PRE_ENTRY" | "DECISION" | "EXECUTION" | "LEARNING";

export interface RuntimeEvent {
  readonly id: string;
  readonly cycleId: string;
  readonly symbol: string;
  readonly component: RuntimeEventComponent;
  readonly operation: string;
  readonly status: RuntimeEventStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly sequence: number | null;
  readonly message: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
}

// Phase 8.5 — deliberately a few seconds, not sub-second: real cycles are
// sparse (the autonomous tick runs on a ~15min external cron), so most
// polls return zero new rows. This is a cursor-based `since=` query
// (cheap, indexed) — not a re-fetch-and-redraw of the same window, and
// nothing here can trigger a cycle (see the route's own header).
const POLL_MS = 4000;
const MAX_BUFFERED_EVENTS = 500;

export interface UseRuntimeEventsResult {
  readonly events: readonly RuntimeEvent[];
  readonly connected: boolean;
  readonly lastPolledAt: string | null;
}

/** Polls /api/elvoid-pro/runtime-events with a cursor, appending only genuinely new rows (deduped by id) — never re-synthesizing or fabricating events client-side. */
export function useRuntimeEvents(symbol?: string): UseRuntimeEventsResult {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [connected, setConnected] = useState(true);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (cursorRef.current) params.set("since", cursorRef.current);
      if (symbol) params.set("symbol", symbol);
      const res = await fetch(`/api/elvoid-pro/runtime-events?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setConnected(false);
        return;
      }
      setConnected(true);
      const body = (await res.json()) as { events: RuntimeEvent[]; cursor: string | null };
      if (body.cursor) cursorRef.current = body.cursor;
      setLastPolledAt(new Date().toISOString());

      if (body.events.length === 0) return;
      const genuinelyNew = body.events.filter((e) => !seenIdsRef.current.has(e.id));
      if (genuinelyNew.length === 0) return;
      for (const e of genuinelyNew) seenIdsRef.current.add(e.id);

      setEvents((prev) => {
        const next = [...prev, ...genuinelyNew];
        if (next.length > MAX_BUFFERED_EVENTS) {
          const dropped = next.slice(0, next.length - MAX_BUFFERED_EVENTS);
          for (const d of dropped) seenIdsRef.current.delete(d.id);
          return next.slice(-MAX_BUFFERED_EVENTS);
        }
        return next;
      });
    } catch {
      setConnected(false);
    }
  }, [symbol]);

  useEffect(() => {
    // Reset on symbol-filter change — a fresh cursor means "give me the
    // most recent page for this filter", not "nothing since forever".
    cursorRef.current = null;
    seenIdsRef.current = new Set();
    setEvents([]);
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  return { events, connected, lastPolledAt };
}
