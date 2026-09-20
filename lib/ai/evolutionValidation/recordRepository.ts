// ---------------------------------------------------------------------------
// ELVOID Intelligence — Append-only validation record, persistence-aware
// adapter (Phase 8.6.6b)
//
// Persistence-aware adapter ONLY — zero validation logic lives here
// (validate.ts / record.ts). Writes to `evolution_validation_records` in the
// isolated ELVOID Learning Database.
//
// INSERT-ONLY, BY CONSTRUCTION AND BY THE DATABASE:
//   - This file contains exactly one write, a plain insert. It has no update,
//     no upsert and no delete, and this is asserted by a static fixture.
//   - The table itself rejects UPDATE, DELETE and TRUNCATE with a trigger
//     (supabase/learning/schema.sql), so a different caller — or a mistake
//     here later — cannot rewrite history either.
//   - Recording the same content twice is not an error and not a second row:
//     `record_hash` is UNIQUE, and a duplicate is reported as
//     `already_recorded`. Identical hash means identical content.
//
// NOTHING CALLS appendEvolutionValidationRecord() AUTOMATICALLY. It is not
// called from any GET route (the AI Performance route stays compute-only), by
// the tick, or by any cron. Phase 8.6.7 will be its first caller, and only
// from an explicit, human-initiated action.
//
// Every record is verified (record.ts) before it is written and again when
// it is read back, so a record whose hash or snapshot has been tampered with
// is reported as failing verification rather than trusted.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import { verifyEvolutionValidationRecord } from "./record";
import type { EvolutionValidationRecord, EvolutionValidationRecordWithoutTimestamp } from "./contracts";

export type AppendEvolutionValidationRecordResult =
  | { appended: true }
  | { appended: false; reason: "already_recorded" }
  | { appended: false; reason: "not_configured" | "invalid_record" | "error"; error?: string };

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** Insert one record. Never updates, never deletes, never overwrites. */
export async function appendEvolutionValidationRecord(record: EvolutionValidationRecordWithoutTimestamp): Promise<AppendEvolutionValidationRecordResult> {
  const verification = verifyEvolutionValidationRecord(record);
  if (!verification.valid) return { appended: false, reason: "invalid_record", error: verification.problems.join(" ") };

  const learningDb = getLearningSupabase();
  if (!learningDb) return { appended: false, reason: "not_configured" };

  const row = {
    record_hash: record.recordHash,
    record_schema_version: record.recordSchemaVersion,
    proposal_id: record.proposalId,
    candidate_id: record.candidateId,
    source: record.source,
    symbol: record.symbol,
    gap_category: record.gapCategory,
    result: record.result,
    validation_mode: record.validationMode,
    counterfactual_available: record.counterfactualAvailable,
    snapshot: record.snapshot,
  };

  const { error } = await learningDb.from("evolution_validation_records").insert(row);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { appended: false, reason: "already_recorded" };
    return { appended: false, reason: "error", error: error.message };
  }
  return { appended: true };
}

export interface StoredEvolutionValidationRecord {
  readonly record: EvolutionValidationRecord;
  /** Result of `verifyEvolutionValidationRecord` on what was read back — a record that fails must not be relied on. */
  readonly integrity: { readonly valid: boolean; readonly problems: readonly string[] };
}

/** Read-only lookup by `recordHash`. `null` when the Learning DB is not configured or no such record exists. */
export async function getEvolutionValidationRecordByHash(recordHash: string): Promise<StoredEvolutionValidationRecord | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("evolution_validation_records").select("*").eq("record_hash", recordHash).maybeSingle();
  if (error || !data) return null;

  const record: EvolutionValidationRecord = {
    recordHash: data.record_hash,
    recordSchemaVersion: data.record_schema_version,
    proposalId: data.proposal_id,
    candidateId: data.candidate_id,
    source: data.source,
    symbol: data.symbol,
    gapCategory: data.gap_category,
    result: data.result,
    validationMode: data.validation_mode,
    counterfactualAvailable: data.counterfactual_available,
    snapshot: data.snapshot,
    recordedAt: data.recorded_at,
  };
  return { record, integrity: verifyEvolutionValidationRecord(record) };
}
