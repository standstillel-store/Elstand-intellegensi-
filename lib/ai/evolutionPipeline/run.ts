// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, pipeline orchestrator (Step 4)
//
// The ONE function that turns a HUMAN_APPROVED ChangeArtifact into a real
// code change: generate -> push (branch/commit/merge) -> best-effort inline
// deploy check -> Telegram result. Called from
// app/api/ai-performance/approvals/telegram/route.ts, synchronously, in the
// SAME place the (fast, pure) Change Artifact block already runs — every
// step through "merge" here is itself just a handful of HTTPS calls and is
// expected to finish in a few seconds, same order of magnitude as that
// existing block.
//
// It deliberately does NOT wait for Vercel's build to fully finish inline:
// a real Next.js production build can take minutes, far past what a
// serverless function invocation should hold open. After a merge succeeds
// it makes a small, BOUNDED number of quick checks (Section L: "Automatic
// retry hanya untuk operation yang idempotent dan jumlah retry kecil/
// deterministic") and otherwise leaves the run as
// PUSH_SUCCESS_DEPLOY_PENDING — the Vercel deployment webhook
// (app/api/ai-performance/approvals/deployment-webhook/route.ts) reports
// the eventual real DEPLOY_SUCCESS / DEPLOY_FAILED for the common case
// where the build is still running when this function returns.
//
// NEVER throws out of this function — every stage is wrapped so a bug here
// can never affect the Telegram approval response already computed by the
// caller, exactly like the existing Change Artifact block's own comment.
// ---------------------------------------------------------------------------

import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";
import { generateCodeForArtifact } from "@/lib/ai/evolutionCoding/generate";
import type { CodeGenerationOutcome } from "@/lib/ai/evolutionCoding/contracts";
import { readGitConfig, getFileContent } from "@/lib/ai/evolutionGit/githubClient";
import type { GitEnvInput } from "@/lib/ai/evolutionGit/contracts";
import { pushGeneratedChange } from "@/lib/ai/evolutionGit/pushChange";
import { readVercelConfig, findDeploymentByCommitSha } from "@/lib/ai/evolutionDeploy/vercelClient";
import type { VercelEnvInput } from "@/lib/ai/evolutionDeploy/contracts";
import { readTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import type { TelegramEnvInput } from "@/lib/ai/evolutionApproval/security";
import { appendPatchEvent, upsertPatchRun } from "./repository";
import { patchRunIdFor, type PatchRun, type PatchRunStatus, type PatchRunWithoutTimestamp } from "./contracts";
import { formatDeploySuccessMessage, formatPipelineFailureMessage, formatPushPendingMessage } from "./resultMessages";

export type Phase9EnvInput = GitEnvInput & VercelEnvInput & TelegramEnvInput;

const INLINE_DEPLOY_CHECK_ATTEMPTS = 2;
const INLINE_DEPLOY_CHECK_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyApprover(env: Phase9EnvInput, text: string): Promise<void> {
  const telegramConfig = readTelegramConfig(env);
  if (!telegramConfig) return; // Telegram not configured — same fail-closed rule as everywhere else; there is no secondary channel.
  const client = createTelegramClient(telegramConfig);
  await client.sendMessage(telegramConfig.approverId, text, null);
}

function baseRun(artifact: ChangeArtifact): Omit<PatchRunWithoutTimestamp, "status" | "branch" | "baseSha" | "commitSha" | "mergeCommitSha" | "deploymentId" | "deploymentUrl" | "failedStage" | "errorSummary"> {
  return {
    patchRunId: patchRunIdFor(artifact.recordHash),
    recordHash: artifact.recordHash,
    artifactId: artifact.artifactId,
    proposalId: artifact.proposalId,
  };
}

function codeGenOutcomeToStatus(outcome: Exclude<CodeGenerationOutcome, "GENERATED">): PatchRunStatus {
  if (outcome === "NO_AFFECTED_FILES_SCOPE") return "NO_AFFECTED_FILES_SCOPE";
  if (outcome === "SCOPE_VIOLATION") return "SCOPE_VIOLATION";
  return "CODE_GENERATION_FAILED"; // NOT_CONFIGURED | INVALID_RESPONSE
}

export async function runPhase9Pipeline(artifact: ChangeArtifact, env: Phase9EnvInput): Promise<void> {
  try {
    if (artifact.artifactStatus !== "AWAITING_HUMAN_PATCH") return; // VALIDATION_FAILED artifacts are never a Phase 9 input — see evolutionArtifact/create.ts.

    const gitConfig = readGitConfig(env);
    const vercelConfig = readVercelConfig(env);
    if (!gitConfig) {
      await upsertPatchRun({ ...baseRun(artifact), status: "NOT_CONFIGURED", branch: null, baseSha: null, commitSha: null, mergeCommitSha: null, deploymentId: null, deploymentUrl: null, failedStage: "CONFIG", errorSummary: "GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO not fully set" });
      await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "CONFIG", "NOT_CONFIGURED", "Git integration is not configured (GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO)."));
      return;
    }

    // --- Stage 1: code generation --------------------------------------
    await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "CODE_GENERATION", "STARTED", "requesting AI Core code generation");
    const generation = await generateCodeForArtifact(artifact, async (filePath) => {
      const file = await getFileContent(gitConfig, filePath, gitConfig.baseBranch);
      return file?.content ?? null;
    });

    if (generation.outcome !== "GENERATED") {
      const status = codeGenOutcomeToStatus(generation.outcome);
      await upsertPatchRun({ ...baseRun(artifact), status, branch: null, baseSha: null, commitSha: null, mergeCommitSha: null, deploymentId: null, deploymentUrl: null, failedStage: "CODE_GENERATION", errorSummary: generation.reason });
      await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "CODE_GENERATION", status, generation.reason);
      await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "CODE_GENERATION", status, generation.reason));
      return;
    }
    await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "CODE_GENERATION", "STARTED", `generated ${generation.files.length} file(s) within approved scope`);

    // --- Stage 2: isolated branch, commit, merge ------------------------
    await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "GIT_PUSH", "STARTED", "creating branch and committing generated files");
    const push = await pushGeneratedChange(gitConfig, artifact.recordHash, artifact.proposalId, generation.files);

    if (push.outcome !== "MERGE_SUCCESS") {
      await upsertPatchRun({ ...baseRun(artifact), status: push.outcome, branch: push.branch ?? null, baseSha: push.baseSha ?? null, commitSha: push.commitSha ?? null, mergeCommitSha: null, deploymentId: null, deploymentUrl: null, failedStage: "GIT_PUSH", errorSummary: push.reason });
      await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "GIT_PUSH", push.outcome, push.reason);
      await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "GIT_PUSH", push.outcome, push.reason, push.branch, push.commitSha));
      return;
    }

    let run: PatchRun = {
      ...baseRun(artifact),
      status: "PUSH_SUCCESS_DEPLOY_PENDING",
      branch: push.branch,
      baseSha: push.baseSha,
      commitSha: push.commitSha,
      mergeCommitSha: push.mergeCommitSha,
      deploymentId: null,
      deploymentUrl: null,
      failedStage: null,
      errorSummary: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertPatchRun(run);
    await appendPatchEvent(artifact.recordHash, run.patchRunId, "GIT_PUSH", "PUSH_SUCCESS_DEPLOY_PENDING", `merged ${push.branch} into base at ${push.mergeCommitSha}`);
    await notifyApprover(env, formatPushPendingMessage(run));

    // --- Stage 3: best-effort inline deploy check (bounded, never blocks long) ---
    if (!vercelConfig) {
      await appendPatchEvent(artifact.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_UNKNOWN", "VERCEL_TOKEN/VERCEL_PROJECT_ID not configured — relying on the deployment webhook only, if it is registered");
      return;
    }

    for (let attempt = 0; attempt < INLINE_DEPLOY_CHECK_ATTEMPTS; attempt += 1) {
      await sleep(INLINE_DEPLOY_CHECK_INTERVAL_MS);
      const snapshot = await findDeploymentByCommitSha(vercelConfig, run.mergeCommitSha!);
      if (snapshot.state === "READY") {
        run = { ...run, status: "DEPLOY_SUCCESS", deploymentId: snapshot.deploymentId, deploymentUrl: snapshot.url, updatedAt: new Date().toISOString() };
        await upsertPatchRun(run);
        await appendPatchEvent(artifact.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_SUCCESS", `deployment ${snapshot.deploymentId ?? "unknown"} is READY`);
        await notifyApprover(env, formatDeploySuccessMessage(run));
        return;
      }
      if (snapshot.state === "ERROR" || snapshot.state === "CANCELED") {
        run = { ...run, status: "DEPLOY_FAILED", deploymentId: snapshot.deploymentId, deploymentUrl: snapshot.url, failedStage: "DEPLOY_VERIFY", errorSummary: `Vercel deployment ended in state ${snapshot.state}`, updatedAt: new Date().toISOString() };
        await upsertPatchRun(run);
        await appendPatchEvent(artifact.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_FAILED", `deployment ${snapshot.deploymentId ?? "unknown"} ended in state ${snapshot.state}`);
        await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "DEPLOY_VERIFY", "DEPLOY_FAILED", `Vercel deployment ended in state ${snapshot.state}. COMMIT SUCCESS, DEPLOY FAILED.`, run.branch, run.mergeCommitSha));
        return;
      }
      // still PENDING/BUILDING/UNKNOWN — keep waiting up to the attempt budget, then leave it to the webhook.
    }
    await appendPatchEvent(artifact.recordHash, run.patchRunId, "DEPLOY_VERIFY", "DEPLOY_UNKNOWN", "deployment not yet terminal after inline check budget — awaiting the deployment webhook");
  } catch (err) {
    // Defense in depth: even a bug in this file must never throw out of a
    // best-effort background pipeline. Best-effort final notification only.
    try {
      await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "PIPELINE", "DEPLOY_UNKNOWN", err instanceof Error ? err.message : "unexpected pipeline error"));
    } catch {
      // never let a notification failure surface either.
    }
  }
}
