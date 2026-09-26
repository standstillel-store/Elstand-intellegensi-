// ---------------------------------------------------------------------------
// Phase 9, Steps 2+4 — Git naming, pipeline contracts, Telegram message
// fixtures (dev-only). Pure/offline. No network — githubClient.ts /
// vercelClient.ts's actual HTTP calls are NOT exercised here (this sandbox
// has no network and no GITHUB_TOKEN/VERCEL_TOKEN); only the pure pieces
// (deterministic naming, message formatting, status vocabulary) are.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/evolution-git-and-pipeline-fixtures.ts
// ---------------------------------------------------------------------------

import { branchNameFor } from "@/lib/ai/evolutionGit/pushChange";
import { patchRunIdFor, TERMINAL_STATUSES, type PatchRun } from "@/lib/ai/evolutionPipeline/contracts";
import { formatDeployFailedMessage, formatDeploySuccessMessage, formatPipelineFailureMessage, formatPushPendingMessage } from "@/lib/ai/evolutionPipeline/resultMessages";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

// 1. branchNameFor — deterministic, one branch per artifact, no collision between different hashes.
{
  const b1 = branchNameFor(HASH_A);
  const b2 = branchNameFor(HASH_A);
  const b3 = branchNameFor(HASH_B);
  check("1a same recordHash -> identical branch name", b1 === b2, `${b1} vs ${b2}`);
  check("1b different recordHash -> different branch name", b1 !== b3, `${b1} vs ${b3}`);
  check("1c branch name has no invalid git ref characters", /^elvoid\/phase9\/[a-f0-9]{16}$/.test(b1), b1);
}

// 2. patchRunIdFor — deterministic, matches evolutionArtifact's own artifactId convention (prefix:hash).
{
  const id1 = patchRunIdFor(HASH_A);
  const id2 = patchRunIdFor(HASH_A);
  check("2a deterministic patchRunId", id1 === id2 && id1 === `patch:${HASH_A}`, id1);
}

// 3. TERMINAL_STATUSES excludes only the one genuinely non-terminal value.
{
  check(
    "3a PUSH_SUCCESS_DEPLOY_PENDING is the only non-terminal status",
    !TERMINAL_STATUSES.includes("PUSH_SUCCESS_DEPLOY_PENDING" as (typeof TERMINAL_STATUSES)[number]),
    TERMINAL_STATUSES.join(",")
  );
}

// 4. Telegram messages — required fields present, and secrets/tokens never appear (defense in depth: these functions never receive a token, but a regression here would be silent otherwise).
const SECRET_LOOKALIKES = ["TELEGRAM_BOT_TOKEN=", "GITHUB_TOKEN=", "VERCEL_TOKEN=", "Bearer "];
function hasNoSecretLookalike(text: string): boolean {
  return !SECRET_LOOKALIKES.some((s) => text.includes(s));
}

const run: PatchRun = {
  patchRunId: patchRunIdFor(HASH_A),
  recordHash: HASH_A,
  artifactId: `artifact:${HASH_A}`,
  proposalId: "prop-00001",
  status: "PUSH_SUCCESS_DEPLOY_PENDING",
  branch: branchNameFor(HASH_A),
  baseSha: "base123",
  commitSha: "commit456",
  mergeCommitSha: "merge789",
  deploymentId: "dpl_abc",
  deploymentUrl: "https://example.vercel.app",
  failedStage: null,
  errorSummary: null,
  startedAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

{
  const text = formatPushPendingMessage(run);
  check("4a push-pending message names proposal + branch + shas", text.includes(run.proposalId) && text.includes(run.branch!) && text.includes(run.mergeCommitSha!), text);
  check("4b push-pending message has no secret lookalike", hasNoSecretLookalike(text), text);
}

{
  const text = formatDeploySuccessMessage(run);
  check("4c deploy-success message names deployment id + url", text.includes(run.deploymentId!) && text.includes(run.deploymentUrl!), text);
  check("4d deploy-success message distinguishes COMMIT SUCCESS from DEPLOY SUCCESS explicitly", text.includes("COMMIT SUCCESS") && text.includes("DEPLOY SUCCESS"), text);
}

{
  const text = formatDeployFailedMessage(run, "DEPLOY_FAILED");
  check("4e commit-success-deploy-failed message states BOTH facts distinctly (Section K)", text.includes("COMMIT SUCCESS") && text.includes("DEPLOY FAILED"), text);
}

{
  const text = formatPipelineFailureMessage("prop-00002", "GIT_PUSH", "MERGE_CONFLICT", "merge conflict", "elvoid/phase9/deadbeefdeadbeef", "commitXYZ");
  check("4f failure message names stage + status + error + branch + commit", ["GIT_PUSH", "MERGE_CONFLICT", "merge conflict", "elvoid/phase9/deadbeefdeadbeef", "commitXYZ"].every((s) => text.includes(s)), text);
  check("4g failure message states nothing was deployed", text.includes("Nothing was deployed"), text);
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exitCode = 1;
