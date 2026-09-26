// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Telegram result messages (Step 4)
//
// Pure, deterministic, synchronous. Plain text (no parse mode), same
// convention as lib/ai/evolutionApproval/telegramPayload.ts and for the
// same reason: nothing in a proposal's own text can be interpreted as
// markup. Every field interpolated here already comes from this pipeline's
// own deterministic values (recordHash, branch, SHAs, closed enum values) or
// from client wrappers that already strip secrets/upstream bodies from
// their own `reason` strings (see githubClient.ts / vercelClient.ts) — never
// a raw upstream error body.
// ---------------------------------------------------------------------------

import type { PatchRun } from "./contracts";

function header(title: string): string {
  return `ELVOID SELF-IMPROVEMENT ${title}\n`;
}

export function formatPushPendingMessage(run: PatchRun): string {
  return (
    header("PUSHED — DEPLOY PENDING") +
    `Proposal: ${run.proposalId}\n` +
    `Branch: ${run.branch}\n` +
    `Base commit: ${run.baseSha}\n` +
    `Commit: ${run.commitSha}\n` +
    `Merge commit: ${run.mergeCommitSha}\n` +
    `Status: COMMIT SUCCESS — awaiting Vercel deployment.`
  );
}

export function formatDeploySuccessMessage(run: PatchRun): string {
  return (
    header("SUCCESS") +
    `Proposal: ${run.proposalId}\n` +
    `Branch: ${run.branch}\n` +
    `Base commit: ${run.baseSha}\n` +
    `Merge commit: ${run.mergeCommitSha}\n` +
    `Deployment ID: ${run.deploymentId ?? "unknown"}\n` +
    `Deployment URL: ${run.deploymentUrl ?? "unknown"}\n` +
    `Status: COMMIT SUCCESS — DEPLOY SUCCESS.`
  );
}

export function formatDeployFailedMessage(run: PatchRun, terminalStatus: "DEPLOY_FAILED" | "DEPLOY_TIMEOUT" | "DEPLOY_UNKNOWN"): string {
  const label = terminalStatus === "DEPLOY_FAILED" ? "DEPLOY FAILED" : terminalStatus === "DEPLOY_TIMEOUT" ? "DEPLOY TIMEOUT" : "DEPLOY STATUS UNKNOWN";
  return (
    header("FAILED") +
    `Proposal: ${run.proposalId}\n` +
    `Branch: ${run.branch}\n` +
    `Merge commit: ${run.mergeCommitSha}\n` +
    `Deployment ID: ${run.deploymentId ?? "unknown"}\n` +
    `Status: COMMIT SUCCESS — ${label}.\n` +
    `The merged code did NOT verify as live. Manual review of the merge commit is recommended.`
  );
}

export function formatPipelineFailureMessage(proposalId: string, failedStage: string, status: string, reason: string, branch?: string | null, commitSha?: string | null): string {
  return (
    header("FAILED") +
    `Proposal: ${proposalId}\n` +
    `Stage failed: ${failedStage}\n` +
    `Status: ${status}\n` +
    `Error: ${reason}\n` +
    (branch ? `Branch: ${branch}\n` : "") +
    (commitSha ? `Commit (if any): ${commitSha}\n` : "") +
    `No further action was taken. Nothing was deployed.`
  );
}
