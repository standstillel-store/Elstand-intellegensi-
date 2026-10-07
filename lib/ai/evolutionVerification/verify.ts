// ---------------------------------------------------------------------------
// Evolution post-deploy loop — PRODUCTION_VERIFICATION, pure part.
//
// Takes facts ALREADY gathered from the real world (the patch run row, the
// change artifact row, Vercel's deployment record, the HTTP probes' actual
// responses) and decides VERIFIED or FAILED. It performs no I/O, reads no
// clock, calls nothing. Every check records the one observed fact it is
// based on, so a stored verification can be audited without re-running it.
//
// FAIL-CLOSED: a missing deployment, a missing artifact, an unreachable
// probe, a commit that cannot be read — all are a failed check, never a
// skipped one. VERIFIED requires EVERY check to pass. The database enforces
// the same rule again (evolution_production_verifications_guard_insert).
//
// A READY deployment alone is deliberately not enough: the checks require
// the RUNNING code to report the expected commit and deployment id.
// ---------------------------------------------------------------------------

import { patchRunIdFor } from "@/lib/ai/evolutionPipeline/contracts";
import type { PatchRun } from "@/lib/ai/evolutionPipeline/contracts";
import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";
import { verificationIdFor } from "./contracts";
import type { DeploymentFacts, ProductionVerificationEvidence, RuntimeProbe, VerificationCheck } from "./contracts";

export interface EvaluateVerificationInput {
  readonly run: PatchRun;
  readonly artifact: ChangeArtifact | null;
  readonly deployment: DeploymentFacts | null;
  readonly probes: readonly RuntimeProbe[];
  readonly affectedEndpoints: readonly string[];
  readonly attemptNo: number;
  readonly nowIso: string;
}

/**
 * Maps affected FILE paths to the HTTP endpoints that can be probed. Only
 * `app/api/<...>/route.ts` files with no dynamic segment map to an endpoint
 * (a dynamic segment has no single canonical URL to probe). Everything else
 * is a module-level change, proven by the runtime build-info check instead.
 * Route groups `(name)` do not appear in the URL. Pure, sorted, de-duplicated.
 */
export function deriveAffectedEndpoints(affectedFiles: readonly string[]): readonly string[] {
  const out = new Set<string>();
  for (const file of affectedFiles) {
    const m = /^app\/(api\/.+)\/route\.(?:ts|js)$/.exec(file);
    if (!m) continue;
    const segments = (m[1] as string).split("/").filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    if (segments.some((s) => s.startsWith("[") || s.startsWith("@"))) continue;
    out.add(`/${segments.join("/")}`);
  }
  return [...out].sort();
}

function check(id: VerificationCheck["id"], passed: boolean, detail: string): VerificationCheck {
  return { id, passed, detail };
}

export function evaluateProductionVerification(input: EvaluateVerificationInput): ProductionVerificationEvidence {
  const { run, artifact, deployment, probes, affectedEndpoints, attemptNo, nowIso } = input;
  const expected = run.mergeCommitSha ?? "";
  const checks: VerificationCheck[] = [];

  // 1. The run is genuinely a deployed, human-authorized one with the fields verification needs.
  const runOk = run.status === "DEPLOY_SUCCESS" && expected.length > 0 && typeof run.deploymentId === "string" && run.deploymentId.length > 0 && typeof run.authorizedBy === "number" && typeof run.authorizedAt === "string";
  checks.push(check("RUN_IS_DEPLOY_SUCCESS", runOk, runOk ? `Run ${run.patchRunId} is DEPLOY_SUCCESS, authorized by ${run.authorizedBy} at ${run.authorizedAt}, merge commit ${expected.slice(0, 12)}` : `Run status ${run.status}; mergeCommitSha=${expected || "none"}; deploymentId=${run.deploymentId ?? "none"}; authorizedBy=${String(run.authorizedBy ?? "none")}`));

  // 2. recordHash / artifact / proposal binding — the deployed change is the approved one.
  const bindingOk = artifact !== null && artifact.recordHash === run.recordHash && artifact.artifactId === run.artifactId && artifact.proposalId === run.proposalId && run.patchRunId === patchRunIdFor(run.recordHash) && artifact.artifactStatus === "AWAITING_HUMAN_PATCH";
  checks.push(check("ARTIFACT_BINDING", bindingOk, artifact === null ? `No change artifact found for recordHash ${run.recordHash.slice(0, 12)}…` : bindingOk ? `Artifact ${artifact.artifactId} bound to recordHash ${artifact.recordHash.slice(0, 12)}…, proposal ${artifact.proposalId}` : `Artifact/run mismatch (artifact.recordHash=${artifact.recordHash.slice(0, 12)}…, run.recordHash=${run.recordHash.slice(0, 12)}…, artifact.proposalId=${artifact.proposalId}, run.proposalId=${run.proposalId})`));

  // 3-5. Vercel's own record of the deployment.
  const readyOk = deployment !== null && deployment.state === "READY" && deployment.deploymentId === run.deploymentId;
  checks.push(check("DEPLOYMENT_READY", readyOk, deployment === null ? "Deployment could not be read from Vercel" : `Vercel reports state ${deployment.state} for deployment ${deployment.deploymentId ?? "unknown"} (run recorded ${run.deploymentId ?? "none"})`));

  const targetOk = deployment !== null && deployment.target === "production";
  checks.push(check("DEPLOYMENT_TARGET_PRODUCTION", targetOk, deployment === null ? "Deployment target unknown" : `Deployment target is ${deployment.target ?? "unknown"}`));

  const shaOk = deployment !== null && deployment.commitSha !== null && expected.length > 0 && deployment.commitSha === expected;
  checks.push(check("DEPLOYED_SHA_MATCHES_EXPECTED", shaOk, deployment === null ? "Deployed commit unknown" : `Vercel built commit ${deployment.commitSha ?? "unknown"}; expected merge commit ${expected || "none"}`));

  // 6. The RUNNING code answers with the expected commit AND deployment id — not just a READY label.
  const buildInfoProbes = probes.filter((p) => p.kind === "BUILD_INFO");
  const matching = buildInfoProbes.find((p) => p.ok && p.observedCommitSha === expected && expected.length > 0 && p.observedDeploymentId === run.deploymentId);
  checks.push(
    check(
      "RUNTIME_BUILD_INFO_MATCHES",
      matching !== undefined,
      matching
        ? `Runtime at ${matching.url} reported commit ${matching.observedCommitSha} and deployment ${matching.observedDeploymentId}`
        : buildInfoProbes.length === 0
          ? "No build-info probe was made"
          : `No build-info probe matched: ${buildInfoProbes.map((p) => `${p.url} -> HTTP ${p.httpStatus ?? "none"} commit=${p.observedCommitSha ?? "none"} deployment=${p.observedDeploymentId ?? "none"}${p.error ? ` error=${p.error}` : ""}`).join("; ")}`
    )
  );

  // 7. Every probe-able affected endpoint answers and is not missing/broken (401/403 = alive and gated, which is correct for admin routes).
  const endpointProbes = probes.filter((p) => p.kind === "AFFECTED_ENDPOINT");
  const unhealthy = endpointProbes.filter((p) => p.httpStatus === null || p.httpStatus >= 500 || p.httpStatus === 404);
  const covered = affectedEndpoints.every((e) => endpointProbes.some((p) => p.url.endsWith(e)));
  const endpointsOk = covered && unhealthy.length === 0;
  checks.push(
    check(
      "AFFECTED_ENDPOINTS_HEALTHY",
      endpointsOk,
      affectedEndpoints.length === 0
        ? "No HTTP endpoint among the affected files — module-level change, proven by RUNTIME_BUILD_INFO_MATCHES"
        : endpointsOk
          ? `${endpointProbes.length} endpoint probe(s) answered without 404/5xx: ${endpointProbes.map((p) => `${p.url} -> ${p.httpStatus}`).join(", ")}`
          : !covered
            ? `Not every affected endpoint was probed (affected: ${affectedEndpoints.join(", ")})`
            : `Unhealthy endpoint(s): ${unhealthy.map((p) => `${p.url} -> ${p.httpStatus ?? "no response"}${p.error ? ` (${p.error})` : ""}`).join(", ")}`
    )
  );

  const failureReasons = checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.detail}`);
  const status = failureReasons.length === 0 ? "VERIFIED" : "FAILED";

  return {
    verificationId: verificationIdFor(run.patchRunId, attemptNo),
    patchRunId: run.patchRunId,
    recordHash: run.recordHash,
    artifactId: run.artifactId,
    proposalId: run.proposalId,
    candidateId: artifact?.candidateId ?? `candidate:${run.proposalId}`,
    attemptNo,
    status,
    deploymentId: deployment?.deploymentId ?? run.deploymentId,
    deploymentState: deployment?.state ?? null,
    deploymentTarget: deployment?.target ?? null,
    deploymentReadyAt: deployment?.readyAtMs != null ? new Date(deployment.readyAtMs).toISOString() : null,
    expectedCommitSha: expected,
    deployedCommitSha: deployment?.commitSha ?? null,
    affectedEndpoints,
    runtimeProbes: probes,
    checks,
    failureReasons,
    verifiedAt: nowIso,
  };
}
