// ---------------------------------------------------------------------------
// Evolution post-deploy loop — PRODUCTION_VERIFICATION contracts.
//
// TYPES + CONSTANTS ONLY. DEPLOY_SUCCESS (lib/ai/evolutionPipeline) only
// means Vercel reported a READY deployment. It does not prove that the code
// now answering requests is the approved change. This stage turns that into
// evidence: the deployment is re-read from Vercel by id, its commit is
// compared with the merge commit this run recorded, and the RUNNING
// deployment is asked (over HTTP) which commit and deployment it is.
//
// Result vocabulary is deliberately two-valued. There is no "probably ok":
// anything that could not be positively confirmed is FAILED, with the
// reason recorded — fail-closed.
// ---------------------------------------------------------------------------

import type { DeploymentState } from "@/lib/ai/evolutionDeploy/contracts";

/** After this many FAILED attempts the run stops being retried and is learned from as CHANGE_UNVERIFIED. */
export const MAX_VERIFICATION_ATTEMPTS = 5;

export type VerificationStatus = "VERIFIED" | "FAILED";

export type VerificationCheckId =
  | "RUN_IS_DEPLOY_SUCCESS"
  | "ARTIFACT_BINDING"
  | "DEPLOYMENT_READY"
  | "DEPLOYMENT_TARGET_PRODUCTION"
  | "DEPLOYED_SHA_MATCHES_EXPECTED"
  | "RUNTIME_BUILD_INFO_MATCHES"
  | "AFFECTED_ENDPOINTS_HEALTHY";

export interface VerificationCheck {
  readonly id: VerificationCheckId;
  readonly passed: boolean;
  /** One real observed fact, never a restatement of the check's name. */
  readonly detail: string;
}

/** What Vercel's own API says about the deployment, read fresh at verification time. */
export interface DeploymentFacts {
  readonly state: DeploymentState;
  readonly deploymentId: string | null;
  readonly commitSha: string | null;
  readonly target: string | null;
  /** Milliseconds since epoch at which Vercel marked the deployment ready; null when unknown. */
  readonly readyAtMs: number | null;
  readonly url: string | null;
  readonly aliases: readonly string[];
}

export type RuntimeProbeKind = "BUILD_INFO" | "AFFECTED_ENDPOINT";

/** One real HTTP request made to the running deployment, and exactly what came back. */
export interface RuntimeProbe {
  readonly kind: RuntimeProbeKind;
  readonly url: string;
  readonly httpStatus: number | null;
  readonly ok: boolean;
  readonly observedCommitSha: string | null;
  readonly observedDeploymentId: string | null;
  readonly error: string | null;
  readonly durationMs: number;
}

export interface ProductionVerificationEvidence {
  readonly verificationId: string;
  readonly patchRunId: string;
  readonly recordHash: string;
  readonly artifactId: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly attemptNo: number;
  readonly status: VerificationStatus;
  readonly deploymentId: string | null;
  readonly deploymentState: DeploymentState | null;
  readonly deploymentTarget: string | null;
  /** ISO timestamp derived from Vercel's own `ready` time; null when Vercel did not report one. */
  readonly deploymentReadyAt: string | null;
  readonly expectedCommitSha: string;
  readonly deployedCommitSha: string | null;
  readonly affectedEndpoints: readonly string[];
  readonly runtimeProbes: readonly RuntimeProbe[];
  readonly checks: readonly VerificationCheck[];
  readonly failureReasons: readonly string[];
  readonly verifiedAt: string;
}

export function verificationIdFor(patchRunId: string, attemptNo: number): string {
  return `verify:${patchRunId}:${attemptNo}`;
}

/** Shape returned by the build-info endpoint the verifier probes (see app/api/ai-performance/evolution/build-info/route.ts). */
export interface BuildInfoResponse {
  readonly commitSha: string | null;
  readonly deploymentId: string | null;
  readonly environment: string | null;
  readonly capabilities: readonly string[];
}

export function verificationFailureIsTerminal(failedAttempts: number): boolean {
  return failedAttempts >= MAX_VERIFICATION_ATTEMPTS;
}
