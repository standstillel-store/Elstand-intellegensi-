// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, TEST -> REGRESSION gate (2026-09-28)
//
// Polls every patch run sitting in BRANCH_PUSHED_AWAITING_CHECKS and asks
// GitHub what the repo's own CI (.github/workflows/phase9-patch-check.yml:
// `tsc --noEmit` = TEST, `next build` = REGRESSION) reported for that exact
// commit. Called by app/api/ai-performance/evolution/checks/route.ts, which
// a scheduled GitHub Actions workflow triggers every 15 minutes (same
// pattern, same reason as elvoid-autonomous-tick.yml — Vercel Hobby crons
// are daily-only).
//
// FAIL CLOSED, in every direction:
//   - CI reports FAILURE           -> CHECKS_FAILED (terminal, never merged)
//   - no conclusive result in time -> CHECKS_TIMEOUT (terminal, never merged)
//   - GitHub API error / no runs   -> treated as "not yet", re-polled next
//                                     tick, and subject to the SAME timeout —
//                                     an unverifiable result is never PASS.
//   - CI reports SUCCESS           -> AWAITING_HUMAN_AUTHORIZATION only.
//                                     This file NEVER merges and has no import
//                                     of mergeApprovedBranch. Passing checks
//                                     earns the human a question, not a merge.
//
// Never throws out of pollPendingChecks(); per-run failures are isolated.
// ---------------------------------------------------------------------------

import { readGitConfig, getCombinedCheckStatus } from "@/lib/ai/evolutionGit/githubClient";
import type { GitEnvInput } from "@/lib/ai/evolutionGit/contracts";
import { readTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import type { TelegramEnvInput } from "@/lib/ai/evolutionApproval/security";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import { buildAuthorizationKeyboard } from "@/lib/ai/evolutionApproval/telegramPayload";
import { AUTHORIZATION_MEANING_ID } from "@/lib/ai/evolutionApproval/wording";
import { appendPatchEvent, getPatchRunsByStatus, upsertPatchRun } from "./repository";
import type { PatchRun } from "./contracts";
import { getRequiredCheckName, getTimeoutMinutes } from "./loadControlPolicy";
import { formatAuthorizationRequestMessage, formatChecksFailedMessage, formatChecksTimeoutMessage } from "./resultMessages";

export type ChecksEnvInput = GitEnvInput & TelegramEnvInput;

const DEFAULT_CHECKS_TIMEOUT_MINUTES = 60;

export interface ChecksPollSummary {
  readonly configured: boolean;
  readonly examined: number;
  readonly passedToAuthorization: number;
  readonly failed: number;
  readonly timedOut: number;
  readonly stillPending: number;
}

export function isPastTimeout(startedAtIso: string, timeoutMinutes: number, nowMs: number): boolean {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return true; // an unparseable start time can never prove "still within window" — fail closed
  return nowMs - started > timeoutMinutes * 60_000;
}

async function notify(env: ChecksEnvInput, text: string, recordHashForKeyboard: string | null): Promise<void> {
  const cfg = readTelegramConfig(env);
  if (!cfg) return;
  const client = createTelegramClient(cfg);
  await client.sendMessage(cfg.approverId, text, recordHashForKeyboard ? buildAuthorizationKeyboard(recordHashForKeyboard) : null);
}

function toRow(run: PatchRun, patch: Partial<PatchRun>): PatchRun {
  return { ...run, ...patch, updatedAt: new Date().toISOString() };
}

export async function pollPendingChecks(env: ChecksEnvInput, nowMs: number = Date.now()): Promise<ChecksPollSummary> {
  const gitConfig = readGitConfig(env);
  if (!gitConfig) return { configured: false, examined: 0, passedToAuthorization: 0, failed: 0, timedOut: 0, stillPending: 0 };

  const timeoutMinutes = getTimeoutMinutes("TEST_REGRESSION", DEFAULT_CHECKS_TIMEOUT_MINUTES);
  const runs = await getPatchRunsByStatus("BRANCH_PUSHED_AWAITING_CHECKS");
  let passedToAuthorization = 0;
  let failed = 0;
  let timedOut = 0;
  let stillPending = 0;

  for (const run of runs) {
    try {
      if (!run.commitSha || !run.branch) {
        // Cannot verify anything without the exact commit — unverifiable, fail closed.
        await upsertPatchRun(toRow(run, { status: "CHECKS_FAILED", failedStage: "CHECKS", errorSummary: "patch run has no commit SHA to check" }));
        await appendPatchEvent(run.recordHash, run.patchRunId, "CHECKS", "CHECKS_FAILED", "no commit SHA recorded — cannot verify");
        failed += 1;
        continue;
      }

      // Checked against the EXACT commit that was pushed, never the branch
      // name — a later push to the same branch can't launder an old result.
      const status = await getCombinedCheckStatus(gitConfig, run.commitSha, getRequiredCheckName());

      if (status.state === "SUCCESS") {
        const next = toRow(run, { status: "AWAITING_HUMAN_AUTHORIZATION", checksRunUrl: status.url, failedStage: null, errorSummary: null });
        await upsertPatchRun(next);
        await appendPatchEvent(run.recordHash, run.patchRunId, "CHECKS", "AWAITING_HUMAN_AUTHORIZATION", "CI checks passed on the pushed commit — awaiting human authorization");
        await notify(env, formatAuthorizationRequestMessage(next, AUTHORIZATION_MEANING_ID), run.recordHash);
        passedToAuthorization += 1;
        continue;
      }

      if (status.state === "FAILURE") {
        const next = toRow(run, { status: "CHECKS_FAILED", checksRunUrl: status.url, failedStage: "CHECKS", errorSummary: "CI reported failure (tsc --noEmit and/or next build)" });
        await upsertPatchRun(next);
        await appendPatchEvent(run.recordHash, run.patchRunId, "CHECKS", "CHECKS_FAILED", "CI reported failure on the pushed commit");
        await notify(env, formatChecksFailedMessage(next), null);
        failed += 1;
        continue;
      }

      // PENDING or ERROR — never success. Only time can end this state.
      if (isPastTimeout(run.startedAt, timeoutMinutes, nowMs)) {
        const next = toRow(run, { status: "CHECKS_TIMEOUT", failedStage: "CHECKS", errorSummary: `no conclusive CI result within ${timeoutMinutes} minutes` });
        await upsertPatchRun(next);
        await appendPatchEvent(run.recordHash, run.patchRunId, "CHECKS", "CHECKS_TIMEOUT", `no conclusive CI result within ${timeoutMinutes} minutes (last poll state: ${status.state})`);
        await notify(env, formatChecksTimeoutMessage(next, timeoutMinutes), null);
        timedOut += 1;
      } else {
        stillPending += 1;
      }
    } catch {
      // one run's failure must never stop the others, and never becomes a PASS.
      stillPending += 1;
    }
  }

  return { configured: true, examined: runs.length, passedToAuthorization, failed, timedOut, stillPending };
}
