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
import { createBranch, getBranchHeadSha, getFileContent, mergeBranch, putFileContents, type GitConfig } from "./githubClient";
import type { GitPushResult } from "./contracts";

/** Deterministic, one branch per artifact — a redelivered/retried run reuses the same name rather than piling up branches. Git ref names may not contain `:`; recordHash is 64 lowercase hex so no further sanitizing is needed. */
export function branchNameFor(recordHash: string): string {
  return `elvoid/phase9/${recordHash.slice(0, 16)}`;
}

export async function pushGeneratedChange(config: GitConfig, recordHash: string, proposalId: string, files: readonly GeneratedFile[]): Promise<GitPushResult> {
  const branch = branchNameFor(recordHash);

  const baseSha = await getBranchHeadSha(config, config.baseBranch);
  if (baseSha === null) {
    return { outcome: "BRANCH_FAILED", reason: `could not read HEAD of base branch "${config.baseBranch}"`, branch };
  }

  // Branch may already exist from a prior, partially-completed attempt for
  // the SAME artifact (e.g. commit succeeded, merge did not) — creating it
  // again is allowed to fail with 422 "already exists"; that is not treated
  // as BRANCH_FAILED here, only a genuine inability to read/create is.
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

  const merge = await mergeBranch(config, config.baseBranch, branch, `Phase 9: merge ${proposalId} (${recordHash.slice(0, 12)})`);
  if (!merge.ok) {
    return { outcome: merge.conflict ? "MERGE_CONFLICT" : "MERGE_FAILED", reason: merge.reason, branch, baseSha, commitSha: lastCommitSha };
  }

  return { outcome: "MERGE_SUCCESS", branch, baseSha, commitSha: lastCommitSha, mergeCommitSha: merge.mergeCommitSha };
}
