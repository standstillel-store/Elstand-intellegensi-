// ---------------------------------------------------------------------------
// ELVOID Intelligence — Controlled Change Artifact, persistence-aware
// adapters (P4 Step 2)
//
// Persistence-aware adapters ONLY — zero construction logic here (that is
// entirely in create.ts's pure `buildChangeArtifact()`). Writes to the SAME
// isolated ELVOID Learning Database every other evolution_* table lives in
// (lib/ai/learning/db.ts) — never Main Supabase.
//
// Recompute-and-upsert on `artifact_id` (deterministic, `artifact:<recordHash>`)
// — mirrors evolutionCandidate/repository.ts's and evolutionProposal/
// repository.ts's own convention exactly: re-deriving the same artifact
// twice (e.g. a redelivered Telegram webhook) safely overwrites the same
// row, never duplicates it.
//
// CALLER, TODAY: app/api/ai-performance/approvals/telegram/route.ts, ONLY
// after handleTelegramWebhook() itself has returned outcome "APPROVED" (a
// human decision already durably recorded in evolution_approvals) — see
// that route's own header for the exact call order and its try/catch
// isolation. Nothing in the trading lifecycle, no cron, no autonomous tick
// calls this.
// ---------------------------------------------------------------------------

import { getLearningSupabase } from "@/lib/ai/learning/db";
import type { ChangeArtifact, ChangeArtifactWithoutTimestamp } from "./contracts";

export type PersistChangeArtifactResult = { persisted: true } | { persisted: false; reason: "not_configured" | "error"; error?: string };

export async function persistChangeArtifact(artifact: ChangeArtifactWithoutTimestamp): Promise<PersistChangeArtifactResult> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return { persisted: false, reason: "not_configured" };

  const row = {
    artifact_id: artifact.artifactId,
    record_hash: artifact.recordHash,
    approval_record_hash: artifact.approvalRecordHash,
    proposal_id: artifact.proposalId,
    candidate_id: artifact.candidateId,
    source: artifact.source,
    symbol: artifact.symbol,
    gap_category: artifact.gapCategory,
    affected_files: artifact.affectedFiles,
    proposed_change: artifact.proposedChange,
    patch_status: artifact.patchStatus,
    patch_reference: artifact.patchReference,
    regression_check: artifact.regressionCheck,
    gates: artifact.gates,
    artifact_status: artifact.artifactStatus,
    status_reason: artifact.statusReason,
  };

  // NOTE: unlike evolutionProposal/evolutionCandidate's own persist
  // functions, this is `ignoreDuplicates: true`, never a content update on
  // conflict — evolution_change_artifacts is append-only (DB trigger
  // rejects UPDATE outright, matching evolution_approvals' own convention).
  // This is safe specifically because artifactId is deterministic from an
  // IMMUTABLE recordHash: re-deriving the same artifact for the same
  // recordHash always yields byte-identical content, so "do nothing on
  // conflict" and "overwrite with identical content" are indistinguishable
  // in effect — a redelivered Telegram webhook is a safe no-op, not silently
  // dropped data.
  const { error } = await learningDb.from("evolution_change_artifacts").upsert(row, { onConflict: "artifact_id", ignoreDuplicates: true });
  if (error) return { persisted: false, reason: "error", error: error.message };
  return { persisted: true };
}

/** Read-only lookup by the artifact's own record_hash. `null` only when the Learning DB is not configured. */
export async function getChangeArtifactByRecordHash(recordHash: string): Promise<ChangeArtifact | null> {
  const learningDb = getLearningSupabase();
  if (!learningDb) return null;

  const { data, error } = await learningDb.from("evolution_change_artifacts").select("*").eq("record_hash", recordHash).maybeSingle();
  if (error || !data) return null;

  return {
    artifactId: data.artifact_id,
    recordHash: data.record_hash,
    approvalRecordHash: data.approval_record_hash,
    proposalId: data.proposal_id,
    candidateId: data.candidate_id,
    source: data.source,
    symbol: data.symbol,
    gapCategory: data.gap_category,
    affectedFiles: data.affected_files ?? [],
    proposedChange: data.proposed_change,
    patchStatus: data.patch_status,
    patchReference: data.patch_reference,
    regressionCheck: data.regression_check,
    gates: data.gates,
    artifactStatus: data.artifact_status,
    statusReason: data.status_reason,
    generatedAt: data.generated_at,
  };
}
