import { NextResponse } from "next/server";
import { hasActiveMembership } from "@/lib/membership";
import { getChangeArtifactByRecordHash } from "@/lib/ai/evolutionArtifact/repository";
import { getPatchRunByRecordHashPrefix } from "@/lib/ai/evolutionPipeline/repository";
import { listVerificationsForRun } from "@/lib/ai/evolutionVerification/repository";
import { listOutcomesForRun, getLearningForRun } from "@/lib/ai/evolutionOutcome/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/ai-performance/evolution/lifecycle?recordHash=<64 hex>   (2026-10-04)
//
// READ-ONLY trace of one approved change end to end:
//   proposal -> candidate -> recordHash -> artifact -> patch run (commit,
//   deployment) -> production verification attempts -> outcome evaluations
//   -> learning (+ the next evolution state it names).
// Every field is a stored row, joined by the ids each record already carries.
// Nothing here is computed, inferred or written. Membership-gated like the
// Command Center it complements.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!(await hasActiveMembership())) return NextResponse.json({ error: "Membership required." }, { status: 403 });
  const recordHash = new URL(req.url).searchParams.get("recordHash") ?? "";
  if (!/^[0-9a-f]{64}$/.test(recordHash)) return NextResponse.json({ error: "recordHash must be a full 64-hex hash." }, { status: 400 });

  const [artifact, patchRun] = await Promise.all([getChangeArtifactByRecordHash(recordHash), getPatchRunByRecordHashPrefix(recordHash)]);
  const [verifications, outcomes, learning] = patchRun ? await Promise.all([listVerificationsForRun(patchRun.patchRunId), listOutcomesForRun(patchRun.patchRunId), getLearningForRun(patchRun.patchRunId)]) : [[], [], null];

  return NextResponse.json({
    recordHash,
    proposalId: artifact?.proposalId ?? null,
    candidateId: artifact?.candidateId ?? null,
    artifact: artifact ? { artifactId: artifact.artifactId, artifactStatus: artifact.artifactStatus, affectedFiles: artifact.affectedFiles, generatedAt: artifact.generatedAt } : null,
    patchRun: patchRun ? { patchRunId: patchRun.patchRunId, status: patchRun.status, branch: patchRun.branch, commitSha: patchRun.commitSha, mergeCommitSha: patchRun.mergeCommitSha, deploymentId: patchRun.deploymentId, deploymentUrl: patchRun.deploymentUrl } : null,
    verifications,
    outcomes,
    learning,
    nextEvolutionState: learning?.nextEvolutionState ?? null,
  });
}
