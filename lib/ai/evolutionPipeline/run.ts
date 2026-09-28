// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, pipeline orchestrator (Step 4)
//
// The ONE function that turns a HUMAN_APPROVED ChangeArtifact into a real
// code change PROPOSAL: generate -> push to an isolated branch -> Telegram
// notice. Called from app/api/ai-performance/approvals/telegram/route.ts,
// synchronously, in the SAME place the (fast, pure) Change Artifact block
// already runs.
//
// CHANGED 2026-09-28 (Controlled Autonomous Self-Coding upgrade): this
// function NO LONGER MERGES. It used to go generate -> push -> MERGE to the
// production branch immediately, while the approval message promised nothing
// would be deployed (confirmed-live finding, Final Master Audit). It now
// stops at BRANCH_PUSHED_AWAITING_CHECKS. The rest of the chain lives
// elsewhere, each stage independently gated:
//   PATCH (here, bounded by scopeGuard)
//     -> TEST / REGRESSION  checks.ts   (CI: tsc --noEmit + next build on the
//                                        exact pushed commit; fail closed)
//     -> HUMAN AUTHORIZATION authorization.ts (second Telegram decision; the
//                                        only caller of the merge)
//     -> MERGE / DEPLOY     authorization.ts (Vercel's Git integration turns
//                                        the merge into a deployment)
// Stage order and timeouts are declared in controlPolicy.yaml (data only).
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
import { pushGeneratedBranch } from "@/lib/ai/evolutionGit/pushChange";
import type { VercelEnvInput } from "@/lib/ai/evolutionDeploy/contracts";
import { readTelegramConfig } from "@/lib/ai/evolutionApproval/security";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import type { TelegramEnvInput } from "@/lib/ai/evolutionApproval/security";
import { appendPatchEvent, upsertPatchRun } from "./repository";
import { patchRunIdFor, type PatchRun, type PatchRunStatus, type PatchRunWithoutTimestamp } from "./contracts";
import { formatAwaitingChecksMessage, formatPipelineFailureMessage } from "./resultMessages";

export type Phase9EnvInput = GitEnvInput & VercelEnvInput & TelegramEnvInput;

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

    // --- Stage 2: isolated branch + commit ONLY (no merge) ----------------
    await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "GIT_PUSH", "STARTED", "creating branch and committing generated files (no merge — checks + human authorization come first)");
    const push = await pushGeneratedBranch(gitConfig, artifact.recordHash, artifact.proposalId, generation.files);

    if (push.outcome !== "BRANCH_PUSHED") {
      await upsertPatchRun({ ...baseRun(artifact), status: push.outcome, branch: push.branch ?? null, baseSha: push.baseSha ?? null, commitSha: push.commitSha ?? null, mergeCommitSha: null, deploymentId: null, deploymentUrl: null, failedStage: "GIT_PUSH", errorSummary: push.reason });
      await appendPatchEvent(artifact.recordHash, patchRunIdFor(artifact.recordHash), "GIT_PUSH", push.outcome, push.reason);
      await notifyApprover(env, formatPipelineFailureMessage(artifact.proposalId, "GIT_PUSH", push.outcome, push.reason, push.branch, push.commitSha));
      return;
    }

    const run: PatchRun = {
      ...baseRun(artifact),
      status: "BRANCH_PUSHED_AWAITING_CHECKS",
      branch: push.branch,
      baseSha: push.baseSha,
      commitSha: push.commitSha,
      mergeCommitSha: null,
      deploymentId: null,
      deploymentUrl: null,
      failedStage: null,
      errorSummary: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertPatchRun(run);
    await appendPatchEvent(artifact.recordHash, run.patchRunId, "GIT_PUSH", "BRANCH_PUSHED_AWAITING_CHECKS", `pushed ${push.branch} at ${push.commitSha} — NOT merged; awaiting CI checks`);
    await notifyApprover(env, formatAwaitingChecksMessage(run));
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
