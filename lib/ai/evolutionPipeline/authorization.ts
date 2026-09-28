// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, HUMAN AUTHORIZATION gate (2026-09-28)
//
// The ONLY code path in this repository that merges a generated patch into
// the production branch. It is reachable exclusively from a Telegram button
// press ("pa:<hash>") by the ONE configured approver, in their own private
// chat, for a patch run that is CURRENTLY in AWAITING_HUMAN_AUTHORIZATION —
// a status only checks.ts can set, and only after CI reported SUCCESS for
// the exact pushed commit. The autonomous system has no code path that
// calls this function's merge branch: there is no cron/tick/pipeline caller,
// and the database additionally refuses to record a merge unless
// authorized_by/authorized_at are stamped
// (evolution_patch_runs_require_authorization_for_merge()).
//
// Runs BEFORE handleTelegramWebhook in the Telegram route and returns `null`
// for anything that is not a "pa:"/"pd:" press, so the original
// APPROVE/REJECT path (webhook.ts, service.ts — untouched) sees exactly the
// same traffic it always did. It reuses the same primitives for the same
// checks, in the same order: config -> constant-time secret -> body cap +
// JSON -> approver numeric id + private chat.
//
// FAIL CLOSED: an unverifiable CI result, a moved branch HEAD, a status that
// isn't exactly AWAITING_HUMAN_AUTHORIZATION, a lost race, or an
// unconfigured Git client all end in "nothing merged".
// ---------------------------------------------------------------------------

import { getBranchHeadSha, getCombinedCheckStatus, readGitConfig } from "@/lib/ai/evolutionGit/githubClient";
import { mergeApprovedBranch } from "@/lib/ai/evolutionGit/pushChange";
import type { GitEnvInput } from "@/lib/ai/evolutionGit/contracts";
import { findDeploymentByCommitSha, readVercelConfig } from "@/lib/ai/evolutionDeploy/vercelClient";
import type { VercelEnvInput } from "@/lib/ai/evolutionDeploy/contracts";
import { isAuthorizedApprover, readTelegramConfig, verifyWebhookSecret } from "@/lib/ai/evolutionApproval/security";
import type { TelegramEnvInput } from "@/lib/ai/evolutionApproval/security";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import { decodeAuthCallbackData, isPrivateChatWithUser, parseTelegramUpdate } from "@/lib/ai/evolutionApproval/telegramPayload";
import { PATCH_AUTHORIZATION_ANSWER_TEXT_ID } from "@/lib/ai/evolutionApproval/wording";
import { MAX_WEBHOOK_BODY_BYTES } from "@/lib/ai/evolutionApproval/webhook";
import { appendPatchEvent, claimPatchAuthorization, getPatchRunByRecordHashPrefix, getPatchRunsByStatus, transitionPatchRunIfStatus, upsertPatchRun } from "./repository";
import type { PatchRun } from "./contracts";
import { getRequiredCheckName, getTimeoutMinutes } from "./loadControlPolicy";
import { formatAuthorizationRejectedMessage, formatAuthorizationTimeoutMessage, formatDeploySuccessMessage, formatPipelineFailureMessage, formatPushPendingMessage } from "./resultMessages";

export type AuthorizationEnvInput = GitEnvInput & VercelEnvInput & TelegramEnvInput;

export interface AuthorizationResponse {
  readonly status: number;
  readonly body: { readonly ok: boolean; readonly outcome: string };
}

const DEFAULT_AUTHORIZATION_TIMEOUT_MINUTES = 1440;
const INLINE_DEPLOY_CHECK_ATTEMPTS = 2;
const INLINE_DEPLOY_CHECK_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pure — exported for fixtures. `undefined`/unparseable timestamps are treated as expired (fail closed). */
export function isAuthorizationExpired(awaitingSinceIso: string, timeoutMinutes: number, nowMs: number): boolean {
  const since = Date.parse(awaitingSinceIso);
  if (!Number.isFinite(since)) return true;
  return nowMs - since > timeoutMinutes * 60_000;
}

/**
 * Returns `null` if this request is not a patch-authorization button press
 * (or fails an earlier, generic check) so the caller falls through to the
 * original handler unchanged. Returns a response only for a press that is
 * definitively "pa:"/"pd:" AND passed config + secret + body checks.
 */
export async function tryHandlePatchAuthorizationCallback(input: { secretHeader: string | null; bodyText: string; env: AuthorizationEnvInput }): Promise<AuthorizationResponse | null> {
  const config = readTelegramConfig(input.env);
  if (config === null) return null; // original handler reports not_configured exactly as before
  if (!verifyWebhookSecret(input.secretHeader, config.webhookSecret)) return null; // original handler reports 401 exactly as before
  if (typeof input.bodyText !== "string" || input.bodyText.length === 0 || Buffer.byteLength(input.bodyText, "utf8") > MAX_WEBHOOK_BODY_BYTES) return null;

  let json: unknown;
  try {
    json = JSON.parse(input.bodyText);
  } catch {
    return null;
  }
  const parsed = parseTelegramUpdate(json);
  if (parsed.kind !== "CALLBACK") return null;
  const update = parsed.update;
  const decoded = decodeAuthCallbackData(update.data);
  if (decoded === null) return null; // not a "pa:"/"pd:" press — not ours

  const telegram = createTelegramClient(config);
  const answer = (text: string) => telegram.answerCallbackQuery(update.callbackQueryId, text);
  const clearKeyboard = async () => {
    if (update.chatId !== null && update.messageId !== null) await telegram.clearInlineKeyboard(update.chatId, update.messageId);
  };

  // Same approver rule as the first gate: numeric id + their own private chat.
  if (!isAuthorizedApprover(update.fromId, config.approverId) || !isPrivateChatWithUser(update)) {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.UNAUTHORIZED);
    return { status: 403, body: { ok: false, outcome: "UNAUTHORIZED" } };
  }

  const run = await getPatchRunByRecordHashPrefix(decoded.reference);
  if (run === null) {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.INVALID_REQUEST);
    return { status: 400, body: { ok: false, outcome: "INVALID_REQUEST" } };
  }
  if (run.status !== "AWAITING_HUMAN_AUTHORIZATION") {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.NOT_AWAITING);
    await clearKeyboard();
    return { status: 200, body: { ok: false, outcome: "NOT_AWAITING" } };
  }

  // ---- DECLINE ----------------------------------------------------------
  if (decoded.action === "DECLINE") {
    const won = await transitionPatchRunIfStatus(run.patchRunId, "AWAITING_HUMAN_AUTHORIZATION", "AUTHORIZATION_REJECTED", { failedStage: "AUTHORIZATION", errorSummary: "human declined authorization" });
    if (!won) {
      await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.NOT_AWAITING);
      return { status: 200, body: { ok: false, outcome: "NOT_AWAITING" } };
    }
    await appendPatchEvent(run.recordHash, run.patchRunId, "AUTHORIZATION", "AUTHORIZATION_REJECTED", "human declined the merge authorization");
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.DECLINED);
    await clearKeyboard();
    await telegram.sendMessage(config.approverId, formatAuthorizationRejectedMessage(run), null);
    return { status: 200, body: { ok: true, outcome: "AUTHORIZATION_REJECTED" } };
  }

  // ---- AUTHORIZE --------------------------------------------------------
  const gitConfig = readGitConfig(input.env);
  if (gitConfig === null || !run.branch || !run.commitSha) {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.CHECKS_NOT_CONFIRMED);
    return { status: 200, body: { ok: false, outcome: "CHECKS_NOT_CONFIRMED" } };
  }

  // Re-verify at decision time, not only at poll time: (1) CI is STILL
  // green for the exact commit, (2) the branch HEAD is STILL that commit
  // (nothing was pushed after CI passed). Anything else — including a
  // GitHub API error — refuses. Nothing is claimed or merged on refusal.
  const [ci, headSha] = await Promise.all([getCombinedCheckStatus(gitConfig, run.commitSha, getRequiredCheckName()), getBranchHeadSha(gitConfig, run.branch)]);
  if (ci.state !== "SUCCESS" || headSha !== run.commitSha) {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.CHECKS_NOT_CONFIRMED);
    await appendPatchEvent(run.recordHash, run.patchRunId, "AUTHORIZATION", "AWAITING_HUMAN_AUTHORIZATION", `authorization refused: CI state=${ci.state}, branch head ${headSha === run.commitSha ? "matches" : "does not match"} the checked commit`);
    return { status: 200, body: { ok: false, outcome: "CHECKS_NOT_CONFIRMED" } };
  }

  // Atomic claim — exactly one concurrent/redelivered press can win.
  const claimed = await claimPatchAuthorization(run.patchRunId, update.fromId);
  if (!claimed) {
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.NOT_AWAITING);
    return { status: 200, body: { ok: false, outcome: "NOT_AWAITING" } };
  }
  const authorizedAt = new Date().toISOString();
  await appendPatchEvent(run.recordHash, run.patchRunId, "AUTHORIZATION", "AWAITING_HUMAN_AUTHORIZATION", `human authorized merge (telegram user ${update.fromId})`);
  await clearKeyboard();

  const merge = await mergeApprovedBranch(gitConfig, run.recordHash, run.proposalId, run.branch);
  if (merge.outcome !== "MERGE_SUCCESS") {
    await upsertPatchRun({ ...run, status: merge.outcome, failedStage: "GIT_PUSH", errorSummary: merge.reason, authorizedBy: update.fromId, authorizedAt });
    await appendPatchEvent(run.recordHash, run.patchRunId, "GIT_PUSH", merge.outcome, merge.reason);
    await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.MERGE_FAILED);
    await telegram.sendMessage(config.approverId, formatPipelineFailureMessage(run.proposalId, "GIT_PUSH", merge.outcome, merge.reason, run.branch, run.commitSha), null);
    return { status: 200, body: { ok: false, outcome: merge.outcome } };
  }

  let merged: PatchRun = {
    ...run,
    status: "PUSH_SUCCESS_DEPLOY_PENDING",
    mergeCommitSha: merge.mergeCommitSha,
    failedStage: null,
    errorSummary: null,
    authorizedBy: update.fromId,
    authorizedAt,
    updatedAt: new Date().toISOString(),
  };
  await upsertPatchRun(merged);
  await appendPatchEvent(run.recordHash, run.patchRunId, "GIT_PUSH", "PUSH_SUCCESS_DEPLOY_PENDING", `merged ${run.branch} into base at ${merge.mergeCommitSha} after human authorization`);
  await answer(PATCH_AUTHORIZATION_ANSWER_TEXT_ID.AUTHORIZED);
  await telegram.sendMessage(config.approverId, formatPushPendingMessage(merged), null);

  // Best-effort, bounded inline deploy check (moved here from run.ts, which
  // no longer merges). Anything not terminal is left to the deployment webhook.
  const vercelConfig = readVercelConfig(input.env);
  if (!vercelConfig) {
    await appendPatchEvent(run.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_UNKNOWN", "VERCEL_TOKEN/VERCEL_PROJECT_ID not configured — relying on the deployment webhook only, if it is registered");
    return { status: 200, body: { ok: true, outcome: "PUSH_SUCCESS_DEPLOY_PENDING" } };
  }
  for (let attempt = 0; attempt < INLINE_DEPLOY_CHECK_ATTEMPTS; attempt += 1) {
    await sleep(INLINE_DEPLOY_CHECK_INTERVAL_MS);
    const snapshot = await findDeploymentByCommitSha(vercelConfig, merge.mergeCommitSha);
    if (snapshot.state === "READY") {
      merged = { ...merged, status: "DEPLOY_SUCCESS", deploymentId: snapshot.deploymentId, deploymentUrl: snapshot.url, updatedAt: new Date().toISOString() };
      await upsertPatchRun(merged);
      await appendPatchEvent(run.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_SUCCESS", `deployment ${snapshot.deploymentId ?? "unknown"} is READY`);
      await telegram.sendMessage(config.approverId, formatDeploySuccessMessage(merged), null);
      return { status: 200, body: { ok: true, outcome: "DEPLOY_SUCCESS" } };
    }
    if (snapshot.state === "ERROR" || snapshot.state === "CANCELED") {
      merged = { ...merged, status: "DEPLOY_FAILED", deploymentId: snapshot.deploymentId, deploymentUrl: snapshot.url, failedStage: "DEPLOY_VERIFY", errorSummary: `Vercel deployment ended in state ${snapshot.state}`, updatedAt: new Date().toISOString() };
      await upsertPatchRun(merged);
      await appendPatchEvent(run.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_FAILED", `deployment ${snapshot.deploymentId ?? "unknown"} ended in state ${snapshot.state}`);
      await telegram.sendMessage(config.approverId, formatPipelineFailureMessage(run.proposalId, "DEPLOY_VERIFY", "DEPLOY_FAILED", `Vercel deployment ended in state ${snapshot.state}. COMMIT SUCCESS, DEPLOY FAILED.`, run.branch, merge.mergeCommitSha), null);
      return { status: 200, body: { ok: true, outcome: "DEPLOY_FAILED" } };
    }
  }
  await appendPatchEvent(run.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_UNKNOWN", "deployment not yet terminal after inline check budget — awaiting the deployment webhook");
  return { status: 200, body: { ok: true, outcome: "PUSH_SUCCESS_DEPLOY_PENDING" } };
}

/**
 * Expires runs that have waited too long for the human — fail closed
 * (AUTHORIZATION_TIMEOUT, never merged). Called from the same scheduled
 * poll as checks.ts. Uses updated_at (= when the run entered
 * AWAITING_HUMAN_AUTHORIZATION), not started_at.
 */
export async function expireStaleAuthorizations(env: TelegramEnvInput, nowMs: number = Date.now()): Promise<number> {
  const timeoutMinutes = getTimeoutMinutes("HUMAN_AUTHORIZATION", DEFAULT_AUTHORIZATION_TIMEOUT_MINUTES);
  const runs = await getPatchRunsByStatus("AWAITING_HUMAN_AUTHORIZATION");
  const cfg = readTelegramConfig(env);
  let expired = 0;
  for (const run of runs) {
    if (!isAuthorizationExpired(run.updatedAt, timeoutMinutes, nowMs)) continue;
    const won = await transitionPatchRunIfStatus(run.patchRunId, "AWAITING_HUMAN_AUTHORIZATION", "AUTHORIZATION_TIMEOUT", { failedStage: "AUTHORIZATION", errorSummary: `no authorization within ${timeoutMinutes} minutes` });
    if (!won) continue;
    expired += 1;
    await appendPatchEvent(run.recordHash, run.patchRunId, "AUTHORIZATION", "AUTHORIZATION_TIMEOUT", `no authorization within ${timeoutMinutes} minutes`);
    if (cfg) await createTelegramClient(cfg).sendMessage(cfg.approverId, formatAuthorizationTimeoutMessage(run, timeoutMinutes), null);
  }
  return expired;
}
