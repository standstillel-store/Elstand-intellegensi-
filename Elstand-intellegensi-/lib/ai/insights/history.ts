// ---------------------------------------------------------------------------
// Pattern history — in-memory only, per spec §12 ("jangan membuat tabel DB
// baru hanya untuk fitur ini tanpa alasan kuat"). Module-level Map, capped
// length, best-effort: a cold start or serverless instance recycle clears
// it, which is an acceptable degrade (history just restarts empty) rather
// than something requiring a schema change to solve properly.
// ---------------------------------------------------------------------------

import type { InsightHistoryEntry, InsightPattern } from "./types";

const MAX_HISTORY_PER_SYMBOL = 20;
const store = new Map<string, InsightHistoryEntry[]>();

export function recordPatterns(symbol: string, patterns: InsightPattern[]): InsightHistoryEntry[] {
  const key = symbol.toUpperCase();
  const existing = store.get(key) ?? [];
  const lastLabel = existing[0]?.label;

  // Only append entries for patterns that weren't already the most recent
  // entry — otherwise every poll of an unchanged market spams the history
  // with duplicate back-to-back rows.
  const newEntries = patterns
    .filter((p) => p.label !== lastLabel)
    .map((p) => ({ time: p.detectedAt, label: p.label }));

  const merged = [...newEntries, ...existing].slice(0, MAX_HISTORY_PER_SYMBOL);
  store.set(key, merged);
  return merged;
}

export function getHistory(symbol: string): InsightHistoryEntry[] {
  return store.get(symbol.toUpperCase()) ?? [];
}
