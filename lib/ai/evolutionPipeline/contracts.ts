// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, pipeline contracts (Step 4)
//
// TYPES ONLY.
//
// One `PatchRun` per approved `ChangeArtifact` (keyed by the artifact's own
// `recordHash`, deterministic `patchRunId = "patch:" + recordHash` — same
// convention as `artifactId`). `status` is the ONE closed vocabulary the
// whole of Phase 9 reports through — Telegram, the DB row, and this file's
// own JSDoc all describe the identical set, so a state that is not in this
// union cannot be reported anywhere.
//
// Section K of the brief requires COMMIT_SUCCESS + DEPLOY_FAILED to remain
// two distinguishable facts even though they happen in sequence — that is
// why this is a sequence of terminal-or-pending states on ONE row rather
// than a single boolean: `PUSH_SUCCESS_DEPLOY_PENDING` already IS commit
// success, independently of whatever `DEPLOY_*` value follows it later.
// ---------------------------------------------------------------------------

export type PatchRunStatus =
  /** No AI Core provider configured, or the model call itself failed/returned invalid JSON. */
  | "CODE_GENERATION_FAILED"
  /** Artifact names no affected files — nothing to generate into. */
  | "NO_AFFECTED_FILES_SCOPE"
  /** Generated files failed scopeGuard (out-of-scope path, denylisted path, or forbidden content). */
  | "SCOPE_VIOLATION"
  | "BRANCH_FAILED"
  | "COMMIT_FAILED"
  | "MERGE_CONFLICT"
  | "MERGE_FAILED"
  /** Merge succeeded — this IS commit+push success, independently of deploy. */
  | "PUSH_SUCCESS_DEPLOY_PENDING"
  | "DEPLOY_SUCCESS"
  | "DEPLOY_FAILED"
  | "DEPLOY_TIMEOUT"
  | "DEPLOY_UNKNOWN"
  /** GitHub and/or Vercel env is not configured — Phase 9 stays off, same fail-closed rule as Phase 8.6.7's Telegram config. */
  | "NOT_CONFIGURED";

export const TERMINAL_STATUSES: readonly PatchRunStatus[] = [
  "CODE_GENERATION_FAILED",
  "NO_AFFECTED_FILES_SCOPE",
  "SCOPE_VIOLATION",
  "BRANCH_FAILED",
  "COMMIT_FAILED",
  "MERGE_CONFLICT",
  "MERGE_FAILED",
  "DEPLOY_SUCCESS",
  "DEPLOY_FAILED",
  "DEPLOY_TIMEOUT",
  "DEPLOY_UNKNOWN",
  "NOT_CONFIGURED",
];

export interface PatchRunWithoutTimestamp {
  readonly patchRunId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly proposalId: string;
  readonly status: PatchRunStatus;
  readonly branch: string | null;
  readonly baseSha: string | null;
  readonly commitSha: string | null;
  readonly mergeCommitSha: string | null;
  readonly deploymentId: string | null;
  readonly deploymentUrl: string | null;
  readonly failedStage: string | null;
  readonly errorSummary: string | null;
}

export interface PatchRun extends PatchRunWithoutTimestamp {
  readonly startedAt: string;
  readonly updatedAt: string;
}

export function patchRunIdFor(recordHash: string): string {
  return `patch:${recordHash}`;
}
