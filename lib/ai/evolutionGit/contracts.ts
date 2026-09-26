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

/** Closed outcome for the whole "write approved files, commit, merge" operation. */
export type GitPushOutcome =
  | "NOT_CONFIGURED"
  | "BRANCH_FAILED"
  | "COMMIT_FAILED"
  | "MERGE_CONFLICT"
  | "MERGE_FAILED"
  | "MERGE_SUCCESS";

export type GitPushResult =
  | {
      readonly outcome: "MERGE_SUCCESS";
      readonly branch: string;
      readonly baseSha: string;
      readonly commitSha: string;
      readonly mergeCommitSha: string;
    }
  | {
      readonly outcome: Exclude<GitPushOutcome, "MERGE_SUCCESS">;
      readonly reason: string;
      readonly branch?: string;
      readonly baseSha?: string;
      readonly commitSha?: string;
    };
