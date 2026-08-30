// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Outcome Capture (Phase 8.1.0)
//
// Persistence-aware adapters ONLY. No domain transformation logic lives
// here — that's entirely in capture.ts's pure functions. This file:
//   - reads (never writes) `ai_signals`/`ai_journal` from the Main
//     Supabase project (lib/supabase.ts) — same read-only convention as
//     every other Main DB reader in this repo.
//   - writes to `decision_experiences` in the SEPARATE, isolated ELVOID
//     Learning Database (lib/ai/learning/db.ts) — idempotent insert for
//     the decision snapshot, and an at-most-once conditional UPDATE for
//     the outcome patch (mirrors lib/bugHunter/store.ts's
//     `WHERE used_at IS NULL` one-time-use pattern).
//
// Both DB clients independently return null when unconfigured; every
// function here degrades gracefully (returns a typed failure/no-op, never
// throws, never blocks Main DB trading flow) — same rule as
// lib/elvoid/paperTrader.ts's getWallet()/getStatistics().
// ---------------------------------------------------------------------------

import { getSupabase } from "@/lib/supabase";
import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { AiSignal, AiJournalEntry } from "@/lib/elvoid/types";
import { buildDecisionExperienceInput, buildDecisionExperienceOutcome } from "./capture";
import type { DecisionExperienceInput, DecisionExperienceOutcomePatch, LearningContextSnapshot } from "./contracts";

// ---------------------------------------------------------------------------
// Main DB — read-only
// ---------------------------------------------------------------------------

/** Read-only. Returns null if Main Supabase isn't configured or the row doesn't exist. Never writes. */
export async function getSignalById(signalId: string): Promise<AiSignal | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("ai_signals").select("*").eq("id", signalId).maybeSingle();
  return (data as AiSignal) ?? null;
}

/** Read-only. Returns null if Main Supabase isn't configured or no journal entry exists yet (position not closed). Never writes. */
export async function getJournalEntryBySignalId(signalId: string): Promise<AiJournalEntry | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("ai_journal").select("*").eq("signal_id", signalId).maybeSingle();
  return (data as AiJournalEntry) ?? null;
}

// ---------------------------------------------------------------------------
// Learning DB — isolated, idempotent writes only
// ---------------------------------------------------------------------------

export type PersistDecisionExperienceResult = { persisted: true; alreadyExisted: boolean } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * Idempotent insert into the isolated Learning Database's
 * `decision_experiences` table. Uses `upsert(..., { onConflict:
 * "source_signal_id", ignoreDuplicates: true })` — a single atomic
 * operation, not a check-then-insert race (no invented distributed lock
 * needed; the table's own UNIQUE(source_signal_id) constraint plus
 * `ignoreDuplicates` does the idempotency work, same principle as the
 * Main DB's own `oracle_signal_id` unique-index pattern in
 * lib/ai/oracle/execute.ts). A repeated capture attempt for the same
 * `sourceSignalId` never creates a duplicate row and never overwrites the
 * already-frozen decision snapshot.
 *
 * Never falls back to the Main Supabase client. Returns a typed
 * not-configured result rather than throwing when the Learning DB env
 * vars are absent — callers (execute.ts) must treat this as best-effort
 * and never let it fail the underlying trade execution.
 */
export async function persistDecisionExperience(input: DecisionExperienceInput): Promise<PersistDecisionExperienceResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("decision_experiences")
    .upsert(
      {
        source: input.source,
        source_signal_id: input.sourceSignalId,
        symbol: input.symbol,
        side: input.side,
        grade: input.grade,
        confidence: input.confidence,
        decision_timestamp: input.decisionTimestamp,
        learning_context: input.learningContext,
      },
      { onConflict: "source_signal_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) return { persisted: false, reason: "error", error: error.message };
  // `data` is null when `ignoreDuplicates` skipped an existing row — that's
  // a successful idempotent no-op, not a failure.
  return { persisted: true, alreadyExisted: data === null };
}

export type PersistOutcomeResult = { persisted: true; updated: boolean } | { persisted: false; reason: "not_configured" | "error"; error?: string };

/**
 * At-most-once conditional UPDATE of the outcome fields — `WHERE
 * source_signal_id = ... AND outcome_result IS NULL`, mirroring
 * lib/bugHunter/store.ts's `WHERE used_at IS NULL` one-time-use pattern.
 * A repeated call for an already-resolved experience matches zero rows
 * (`updated: false`) rather than overwriting the frozen outcome — this is
 * the idempotency guarantee for outcome capture, enforced by the database
 * itself, not by an application-level check-then-set race.
 */
export async function persistDecisionOutcome(sourceSignalId: string, outcome: DecisionExperienceOutcomePatch): Promise<PersistOutcomeResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const { data, error } = await learningDb
    .from("decision_experiences")
    .update({
      outcome_result: outcome.outcomeResult,
      outcome_rr: outcome.outcomeRr,
      outcome_profit_percent: outcome.outcomeProfitPercent,
      outcome_duration_minutes: outcome.outcomeDurationMinutes,
      outcome_closed_at: outcome.outcomeClosedAt,
    })
    .eq("source_signal_id", sourceSignalId)
    .is("outcome_result", null)
    .select("id");

  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true, updated: (data?.length ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Orchestration helpers — compose the pure functions above with the DB
// adapters above them. No domain logic lives in these two functions beyond
// calling capture.ts's pure builders and the adapters in this file.
// ---------------------------------------------------------------------------

/**
 * Reads the outcome for an already-captured decision from the Main DB and,
 * if a journal entry exists, writes it to the Learning DB exactly once.
 * Best-effort: any failure (Main DB unavailable, Learning DB unavailable,
 * no journal entry yet) resolves to a typed non-throwing result. Not
 * wired into any automatic trigger in this phase — see CHANGES.md's
 * "known limitations" for why (paperTrader.ts's close event is a
 * protected file in this phase).
 */
export async function captureAndPersistOutcome(signalId: string): Promise<PersistOutcomeResult | { persisted: false; reason: "no_outcome_yet" }> {
  const journal = await getJournalEntryBySignalId(signalId);
  if (!journal) return { persisted: false, reason: "no_outcome_yet" };
  const outcome = buildDecisionExperienceOutcome(journal);
  return persistDecisionOutcome(signalId, outcome);
}

/**
 * Convenience wrapper used by execute.ts: given an already-persisted
 * `AiSignal` row and its already-normalized `LearningContextSnapshot` (or
 * null), builds and idempotently persists the decision experience. Never
 * throws — callers should treat this as fire-and-forget best effort.
 */
export async function captureDecisionExperience(signal: AiSignal, learningContext: LearningContextSnapshot | null): Promise<PersistDecisionExperienceResult> {
  const input = buildDecisionExperienceInput(signal, learningContext);
  return persistDecisionExperience(input);
}
