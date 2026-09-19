// ---------------------------------------------------------------------------
// ELVOID Autonomous Runtime — Runtime Event Repository (Phase 8.5)
//
// Read-only. Returns exactly what's in public.runtime_events — no
// synthesis, no derived/fabricated rows. Cursor-based on `created_at` so
// the terminal can ask for "everything since the last event I already
// have" instead of re-fetching and re-rendering the same window every
// poll (Step 13 — avoid duplicate events, use IDs for dedup: every row
// carries its own `id` and the route below also returns the exact cursor
// to send back next time).
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { RuntimeEventComponent, RuntimeEventStatus } from "./emit";

// Re-exported so any reader of `RuntimeEventRecord` (this file's own
// export) can also name its `component`/`status` field types without a
// second import from the write-side `./emit` module — e.g.
// lib/ai/decisionPopulation/observe.ts (Phase 8.6 P1).
export type { RuntimeEventComponent, RuntimeEventStatus };

export interface RuntimeEventRecord {
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

interface RuntimeEventRow {
  id: string;
  cycle_id: string;
  symbol: string;
  component: RuntimeEventComponent;
  operation: string;
  status: RuntimeEventStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  sequence: number | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function toRecord(row: RuntimeEventRow): RuntimeEventRecord {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    symbol: row.symbol,
    component: row.component,
    operation: row.operation,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    sequence: row.sequence,
    message: row.message,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export interface ListRuntimeEventsInput {
  /** ISO timestamp — only events with created_at strictly after this are returned. Omit for the initial page load (returns the most recent `limit` events). */
  readonly since?: string;
  /** Optional symbol filter — narrows to one symbol's events only. */
  readonly symbol?: string;
  /** Phase 8.6 P1 addition — optional component filter (e.g. `["DECISION"]`). Omit for the original, unfiltered behavior every existing caller still gets. Narrowing server-side (not client-side after fetch) matters because `limit` is a row budget shared across ALL components of a cycle — an unfiltered fetch spends most of that budget on components a component-scoped caller doesn't need. */
  readonly components?: readonly RuntimeEventComponent[];
  /** Bounded — never an unbounded read. */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * Returns `[]` (never throws) if the Learning DB isn't configured or the
 * query itself fails — an observability read failing must never break
 * the page it's rendered on. Ascending by created_at so the terminal can
 * append in true chronological order.
 */
export async function listRuntimeEvents(input: ListRuntimeEventsInput): Promise<readonly RuntimeEventRecord[]> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return [];

  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  try {
    let query = learningDb.from("runtime_events").select("*").order("created_at", { ascending: input.since !== undefined }).limit(limit);
    if (input.since) query = query.gt("created_at", input.since);
    if (input.symbol) query = query.eq("symbol", input.symbol);
    if (input.components && input.components.length > 0) query = query.in("component", input.components);

    const { data, error } = await query;
    if (error || !data) return [];

    const rows = data as unknown as RuntimeEventRow[];
    const records = rows.map(toRecord);
    // Without a cursor (initial load), the query above orders DESC (most
    // recent first) to get the freshest `limit` rows cheaply — flip back
    // to ascending here so callers always receive chronological order.
    return input.since ? records : records.slice().reverse();
  } catch {
    return [];
  }
}
