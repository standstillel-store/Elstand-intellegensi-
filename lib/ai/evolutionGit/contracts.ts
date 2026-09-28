// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Git integration contracts (Step 2)
//
// TYPES ONLY.
//
// WHY THE GITHUB REST API AND NOT A LOCAL `git` PROCESS: this application
// runs as Vercel serverless functions — there is no persistent working
// directory, no local clone, and no `git` binary at runtime. The GitHub
// Contents/Git/Merges REST API is the ONLY mechanism available to this
// running process for creating a branch, writing a commit, or merging one —
// it is also the API-equivalent of the "GitHub web UI upload" this project
// already deploys through by hand (see delivery convention notes), so this
// is not a new deployment mechanism, only an automated version of the
// existing one (Section I: "jangan membuat deployment mechanism baru").
// ---------------------------------------------------------------------------

export interface GitEnvInput {
  readonly GITHUB_TOKEN?: string | undefined;
  readonly GITHUB_OWNER?: string | undefined;
  readonly GITHUB_REPO?: string | undefined;
  readonly GITHUB_BASE_BRANCH?: string | undefined;
}

export interface GitConfig {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
}

/**
 * Closed outcome for "write approved files to an isolated branch" ONLY.
 *
 * CHANGED 2026-09-28: this used to also cover the merge (MERGE_SUCCESS /
 * MERGE_CONFLICT / MERGE_FAILED lived here). Merging is now its own later
 * stage, gated by CI checks + a second human authorization — see
 * GitMergeOutcome/GitMergeResult below and pushChange.ts's header.
 */
export type GitPushOutcome = "NOT_CONFIGURED" | "BRANCH_FAILED" | "COMMIT_FAILED" | "BRANCH_PUSHED";

export type GitPushResult =
  | {
      readonly outcome: "BRANCH_PUSHED";
      readonly branch: string;
      readonly baseSha: string;
      readonly commitSha: string;
    }
  | {
      readonly outcome: Exclude<GitPushOutcome, "BRANCH_PUSHED">;
      readonly reason: string;
      readonly branch?: string;
      readonly baseSha?: string;
      readonly commitSha?: string;
    };

/** Closed outcome for the separate, later "merge an already-pushed, already-authorized branch" operation — see pushChange.ts::mergeApprovedBranch(). */
export type GitMergeOutcome = "MERGE_CONFLICT" | "MERGE_FAILED" | "MERGE_SUCCESS";

export type GitMergeResult =
  | { readonly outcome: "MERGE_SUCCESS"; readonly mergeCommitSha: string }
  | { readonly outcome: Exclude<GitMergeOutcome, "MERGE_SUCCESS">; readonly reason: string };
