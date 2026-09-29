// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, isolated branch + commit + merge (Step 2)
//
// Section E of the Phase 9 brief: "buat isolated branch/change context untuk
// setiap approved improvement... capture base commit SHA... setelah menulis,
// capture diff... pastikan diff hanya berada dalam approved scope." Scope
// itself is already enforced upstream (lib/ai/evolutionCoding/scopeGuard.ts)
// before this file is ever called — this file's job is purely mechanical:
// create the branch, write exactly the files it is given, merge to
// production. It never re-derives or widens scope itself.
//
// Files are written SEQUENTIALLY (never Promise.all) — the Contents API
// commits on top of the branch's current HEAD, so parallel writes would
// race and could silently drop a commit.
// ---------------------------------------------------------------------------

import type { GeneratedFile } from "@/lib/ai/evolutionCoding/contracts";
import { createBranch, getBranchHeadSha, getFileContent, mergeBranch, putFileContents } from "./githubClient";
import type { GitConfig, GitPushResult, GitMergeResult } from "./contracts";

/** Deterministic, one branch per artifact — a redelivered/retried run reuses the same name rather than piling up branches. Git ref names may not contain `:`; recordHash is 64 lowercase hex so no further sanitizing is needed. */
export function branchNameFor(recordHash: string): string {
  return `elvoid/phase9/${recordHash.slice(0, 16)}`;
}

/**
 * Stage 2 of 3, as of 2026-09-28 (Controlled Autonomous Self-Coding
 * upgrade): branch + commit ONLY — this function no longer merges.
 * Merging now requires: (1) this branch's CI check-runs to report SUCCESS
 * (see checks.ts), THEN (2) a human to explicitly authorize the merge on a
 * second, distinct Telegram message (see authorization.ts, which is the
 * ONLY caller of mergeApprovedBranch() below). This fixes the confirmed-
 * live finding that the approval message promised "no deploy" while this
 * function previously merged unconditionally right after commit.
 */
export async function pushGeneratedBranch(config: GitConfig, recordHash: string, proposalId: string, files: readonly GeneratedFile[]): Promise<GitPushResult> {
  const branch = branchNameFor(recordHash);

  const baseSha = await getBranchHeadSha(config, config.baseBranch);
  if (baseSha === null) {
    return { outcome: "BRANCH_FAILED", reason: `could not read HEAD of base branch "${config.baseBranch}"`, branch };
  }

  // Branch may already exist from a prior, partially-completed attempt for
  // the SAME artifact (e.g. one file committed, the next failed) — creating
  // it again is allowed to fail with 422 "already exists"; that is not
  // treated as BRANCH_FAILED here, only a genuine inability to read/create is.
  const existingHead = await getBranchHeadSha(config, branch);
  if (existingHead === null) {
    const created = await createBranch(config, branch, baseSha);
    if (!created) return { outcome: "BRANCH_FAILED", reason: `could not create branch "${branch}" from base SHA ${baseSha}`, branch, baseSha };
  }

  let lastCommitSha: string | null = null;
  for (const file of files) {
    const existing = await getFileContent(config, file.filePath, branch);
    const result = await putFileContents(
      config,
      branch,
      file.filePath,
      file.content,
      `Phase 9: ${proposalId} — ${file.filePath}`,
      existing?.sha ?? null
    );
    if (!result.ok) {
      return { outcome: "COMMIT_FAILED", reason: result.reason, branch, baseSha, commitSha: lastCommitSha ?? undefined };
    }
    lastCommitSha = result.commitSha;
  }

  if (lastCommitSha === null) {
    return { outcome: "COMMIT_FAILED", reason: "no files were written", branch, baseSha };
  }

  return { outcome: "BRANCH_PUSHED", branch, baseSha, commitSha: lastCommitSha };
}

/**
 * Stage 3 — the ONLY place `mergeBranch` (githubClient.ts) is called from.
 * Callers (authorization.ts) MUST have already verified: CI check-runs on
 * `branch` reported SUCCESS, AND a human explicitly authorized this exact
 * patch run. This function itself does not and cannot verify either — it
 * is a thin, honestly-named wrapper, not a second safety boundary; the
 * database-level trigger `evolution_patch_runs_require_authorization_for_merge()`
 * is the actual backstop if a caller ever gets this wrong.
 */
export async function mergeApprovedBranch(config: GitConfig, recordHash: string, proposalId: string, branch: string, pinnedCommitSha: string): Promise<GitMergeResult> {
  // Phase 9 (pinned-SHA fix): merge the EXACT commit CI checked and the human
  // authorized — never the mutable branch name. If the branch moved after the
  // check, the branch tip is no longer what gets merged. `branch` is kept only
  // for the caller's own reporting.
  if (!/^[0-9a-f]{40}$/i.test(pinnedCommitSha)) {
    return { outcome: "MERGE_FAILED", reason: "refusing to merge: pinned commit SHA is missing or malformed" };
  }
  const merge = await mergeBranch(config, config.baseBranch, pinnedCommitSha, `Phase 9: merge ${proposalId} (${recordHash.slice(0, 12)}) from ${branch}@${pinnedCommitSha.slice(0, 12)}`);
  if (!merge.ok) {
    return { outcome: merge.conflict ? "MERGE_CONFLICT" : "MERGE_FAILED", reason: merge.reason };
  }
  return { outcome: "MERGE_SUCCESS", mergeCommitSha: merge.mergeCommitSha };
}
