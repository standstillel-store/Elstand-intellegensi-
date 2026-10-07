// ---------------------------------------------------------------------------
// Evolution post-deploy loop — sweep (the only I/O-performing module here).
//
// Called by GET /api/ai-performance/evolution/verify (cron, every 15 min —
// same cadence as the existing checks poller) and is safe to call manually
// any number of times: everything downstream is append-only and
// database-guarded, so a repeat sweep either inserts nothing new (a VERIFIED
// or terminal-outcome/learning row already exists) or makes exactly the next
// legitimate attempt.
//
// For every DEPLOY_SUCCESS patch run:
//   1. no VERIFIED verification yet, under the attempt cap -> run one
//      verification attempt (real Vercel read + real HTTP probes).
//   2. VERIFIED, no terminal outcome yet -> evaluate the real gap outcome
//      against real decision_evaluations rows and persist it if terminal.
//   3. terminal outcome (or FAILED verification at the attempt cap) with no
//      learning yet -> derive and persist the learning.
// Nothing is approved, merged, deployed, or retried beyond the stated cap —
// this module reads what already happened and measures it.
// ---------------------------------------------------------------------------

import { getPatchRunsByStatus } from "@/lib/ai/evolutionPipeline/repository";
import { getChangeArtifactByRecordHash } from "@/lib/ai/evolutionArtifact/repository";
import { readVercelConfig } from "@/lib/ai/evolutionDeploy/vercelClient";
import { getDeploymentFacts } from "@/lib/ai/evolutionDeploy/vercelClient";
import type { VercelEnvInput } from "@/lib/ai/evolutionDeploy/contracts";
import { getDecisionMemoryJoinedExperiences } from "@/lib/ai/decisionMemory/repository";
import { evaluateProductionVerification, deriveAffectedEndpoints } from "./verify";
import type { RuntimeProbe, BuildInfoResponse } from "./contracts";
import { MAX_VERIFICATION_ATTEMPTS, verificationFailureIsTerminal } from "./contracts";
import { insertVerification, listVerificationsForRun, pickVerified, appendLineageEvent } from "./repository";
import { evaluateGapOutcome } from "@/lib/ai/evolutionOutcome/evaluate";
import { outcomeIdFor } from "@/lib/ai/evolutionOutcome/contracts";
import { isTerminalOutcome } from "@/lib/ai/evolutionOutcome/contracts";
import { deriveLearningFromOutcome, deriveLearningFromFailedVerification } from "@/lib/ai/evolutionOutcome/learning";
import { insertOutcome, insertLearning, listOutcomesForRun, getLearningForRun } from "@/lib/ai/evolutionOutcome/repository";
import type { EvolutionOutcomeRecord } from "@/lib/ai/evolutionOutcome/contracts";

const PROBE_TIMEOUT_MS = 8_000;

export interface SweepOneResult {
  readonly patchRunId: string;
  readonly recordHash: string;
  readonly actions: readonly string[];
}

export interface SweepResult {
  readonly runsConsidered: number;
  readonly results: readonly SweepOneResult[];
  readonly vercelConfigured: boolean;
}

async function probe(url: string, kind: RuntimeProbe["kind"]): Promise<RuntimeProbe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const durationMs = Date.now() - started;
    if (kind === "BUILD_INFO") {
      if (!res.ok) return { kind, url, httpStatus: res.status, ok: false, observedCommitSha: null, observedDeploymentId: null, error: null, durationMs };
      try {
        const json = (await res.json()) as BuildInfoResponse;
        return { kind, url, httpStatus: res.status, ok: true, observedCommitSha: json.commitSha ?? null, observedDeploymentId: json.deploymentId ?? null, error: null, durationMs };
      } catch (e) {
        return { kind, url, httpStatus: res.status, ok: false, observedCommitSha: null, observedDeploymentId: null, error: e instanceof Error ? e.message : "invalid JSON body", durationMs };
      }
    }
    return { kind, url, httpStatus: res.status, ok: res.status < 500 && res.status !== 404, observedCommitSha: null, observedDeploymentId: null, error: null, durationMs };
  } catch (e) {
    return { kind, url, httpStatus: null, ok: false, observedCommitSha: null, observedDeploymentId: null, error: e instanceof Error ? e.message : "network error", durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function runEvolutionSweep(env: VercelEnvInput, productionBaseUrl: string): Promise<SweepResult> {
  const runs = await getPatchRunsByStatus("DEPLOY_SUCCESS");
  const vercelConfig = readVercelConfig(env);
  const results: SweepOneResult[] = [];

  for (const run of runs) {
    const actions: string[] = [];
    const existingAttempts = (await listVerificationsForRun(run.patchRunId)) ?? [];
    let verified = pickVerified(existingAttempts);

    // --- Step 1: production verification ---------------------------------
    if (!verified) {
      const failedCount = existingAttempts.filter((a) => a.status === "FAILED").length;
      if (verificationFailureIsTerminal(failedCount)) {
        actions.push(`verification capped at ${MAX_VERIFICATION_ATTEMPTS} failed attempts — not retried`);
      } else if (!vercelConfig) {
        actions.push("VERCEL_TOKEN/VERCEL_PROJECT_ID not configured — verification cannot read the deployment, skipped this sweep");
      } else {
        const artifact = await getChangeArtifactByRecordHash(run.recordHash);
        const deployment = run.deploymentId ? await getDeploymentFacts(vercelConfig, run.deploymentId) : null;
        const affectedEndpoints = artifact ? deriveAffectedEndpoints(artifact.affectedFiles) : [];
        const expectedSha = run.mergeCommitSha ?? "";
        const base = productionBaseUrl.replace(/\/$/, "");
        const probes: RuntimeProbe[] = [await probe(`${base}/api/ai-performance/evolution/build-info`, "BUILD_INFO")];
        for (const endpoint of affectedEndpoints) probes.push(await probe(`${base}${endpoint}`, "AFFECTED_ENDPOINT"));

        const attemptNo = existingAttempts.length + 1;
        const evidence = evaluateProductionVerification({ run, artifact, deployment, probes, affectedEndpoints, attemptNo, nowIso: new Date().toISOString() });
        const insertResult = await insertVerification(evidence);
        if (insertResult.inserted) {
          await appendLineageEvent(run.recordHash, run.patchRunId, "PRODUCTION_VERIFICATION", evidence.status, evidence.status === "VERIFIED" ? `deployment ${evidence.deploymentId} verified live at commit ${evidence.deployedCommitSha}` : evidence.failureReasons.join(" | "));
          actions.push(`verification attempt ${attemptNo}: ${evidence.status}${evidence.status === "FAILED" ? ` (${evidence.failureReasons.join("; ")})` : ""}`);
          if (evidence.status === "VERIFIED") verified = evidence;
        } else {
          actions.push(`verification attempt ${attemptNo} not persisted: ${insertResult.reason}${insertResult.error ? ` — ${insertResult.error}` : ""}`);
        }
      }
    }

    // --- Step 2: outcome (requires VERIFIED) ------------------------------
    let terminalOutcome: EvolutionOutcomeRecord | null = null;
    if (verified) {
      const existingOutcomes = (await listOutcomesForRun(run.patchRunId)) ?? [];
      terminalOutcome = existingOutcomes.find((o) => isTerminalOutcome(o.status)) ?? null;
      if (!terminalOutcome) {
        const artifact = await getChangeArtifactByRecordHash(run.recordHash);
        if (!artifact) {
          actions.push("outcome skipped: change artifact not found for this record hash");
        } else {
          const rows = await getDecisionMemoryJoinedExperiences();
          if (rows === null) {
            actions.push("outcome skipped: Learning DB decision memory unreachable this sweep");
          } else {
            const evaluation = evaluateGapOutcome({ source: artifact.source, symbol: artifact.symbol, gapCategory: artifact.gapCategory, rows, deployedAtIso: verified.deploymentReadyAt });
            const evaluationNo = existingOutcomes.length + 1;
            const record: EvolutionOutcomeRecord = {
              ...evaluation,
              outcomeId: outcomeIdFor(run.patchRunId, evaluationNo),
              patchRunId: run.patchRunId,
              verificationId: verified.verificationId,
              recordHash: run.recordHash,
              artifactId: artifact.artifactId,
              proposalId: artifact.proposalId,
              candidateId: artifact.candidateId,
              source: artifact.source,
              symbol: artifact.symbol,
              gapCategory: artifact.gapCategory,
              commitSha: verified.deployedCommitSha ?? run.mergeCommitSha ?? "",
              deploymentId: verified.deploymentId ?? run.deploymentId ?? "",
              deployedAt: verified.deploymentReadyAt ?? verified.verifiedAt,
              evaluationNo,
              evaluatedAt: new Date().toISOString(),
            };
            const written = await insertOutcome(record);
            if (written.written) {
              await appendLineageEvent(run.recordHash, run.patchRunId, "OUTCOME", record.status, record.reasons.join(" | "));
              actions.push(`outcome evaluation ${evaluationNo}: ${record.status}`);
              if (isTerminalOutcome(record.status)) terminalOutcome = record;
            } else {
              actions.push(`outcome evaluation ${evaluationNo} not persisted: ${written.reason}${written.error ? ` — ${written.error}` : ""}`);
            }
          }
        }
      }
    }

    // --- Step 3: learning --------------------------------------------------
    const existingLearning = await getLearningForRun(run.patchRunId);
    if (!existingLearning) {
      if (terminalOutcome) {
        const learning = deriveLearningFromOutcome(terminalOutcome, terminalOutcome.verificationId, new Date().toISOString());
        if (learning) {
          const written = await insertLearning(learning);
          if (written.written) {
            await appendLineageEvent(run.recordHash, run.patchRunId, "LEARNING", learning.learningKind, learning.summary);
            actions.push(`learning recorded: ${learning.learningKind} -> ${learning.nextEvolutionState}`);
          } else {
            actions.push(`learning not persisted: ${written.reason}${written.error ? ` — ${written.error}` : ""}`);
          }
        }
      } else if (!verified) {
        const failedAttempts = existingAttempts.filter((a) => a.status === "FAILED");
        if (verificationFailureIsTerminal(failedAttempts.length)) {
          const artifact = await getChangeArtifactByRecordHash(run.recordHash);
          if (artifact) {
            const last = failedAttempts[0];
            const learning = deriveLearningFromFailedVerification({
              patchRunId: run.patchRunId,
              recordHash: run.recordHash,
              artifactId: artifact.artifactId,
              proposalId: artifact.proposalId,
              candidateId: artifact.candidateId,
              source: artifact.source,
              symbol: artifact.symbol,
              gapCategory: artifact.gapCategory,
              commitSha: run.mergeCommitSha ?? "",
              deploymentId: run.deploymentId ?? "",
              verificationId: last?.verificationId ?? `verify:${run.patchRunId}:${failedAttempts.length}`,
              failureReasons: last?.failureReasons ?? [],
              attempts: failedAttempts.length,
              nowIso: new Date().toISOString(),
            });
            const written = await insertLearning(learning);
            if (written.written) {
              await appendLineageEvent(run.recordHash, run.patchRunId, "LEARNING", learning.learningKind, learning.summary);
              actions.push(`learning recorded: ${learning.learningKind} -> ${learning.nextEvolutionState} (verification never succeeded)`);
            }
          }
        }
      }
    }

    if (actions.length > 0) results.push({ patchRunId: run.patchRunId, recordHash: run.recordHash, actions });
  }

  return { runsConsidered: runs.length, results, vercelConfigured: vercelConfig !== null };
}
