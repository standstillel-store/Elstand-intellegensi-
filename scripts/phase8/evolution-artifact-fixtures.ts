// ---------------------------------------------------------------------------
// P4 Step 2 — Controlled Change Artifact fixtures (dev-only). Pure/offline.
//
// Everything below runs against the REAL pure builders (create.ts) with NO
// database and NO network. Persistence (repository.ts, upsert semantics,
// the append-only DB trigger) is NOT exercised here — this container has no
// network access and no Learning DB credentials, so DB round-trips are
// BLOCKED, not PASS; see the P4 final report for that distinction. What IS
// tested here for real: deterministic identity, the affected-files
// extraction, lineage (proposalId/candidateId propagate unchanged from the
// record), determinism (same record -> byte-identical artifact every time),
// and the independent AWAITING_HUMAN_PATCH / VALIDATION_FAILED recheck.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-artifact-fixtures.ts
// ---------------------------------------------------------------------------

import { checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison } from "@/lib/ai/evolutionCandidate/replay";
import { buildEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";
import { buildChangeArtifact, extractAffectedFiles, artifactIdFor } from "@/lib/ai/evolutionArtifact/create";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";
import type { GapCategory } from "@/lib/ai/evolutionCandidate/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Real record construction, same pattern as evolution-approval-fixtures.ts
// ---------------------------------------------------------------------------

let idCounter = 0;
function row(decisionTimestamp: string, tagged: boolean): DecisionMemoryJoinedRow {
  idCounter++;
  const experience: DecisionExperienceRecord = {
    id: `exp-${String(idCounter).padStart(5, "0")}`,
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId: `sig-${String(idCounter).padStart(5, "0")}`,
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp,
    learningContext: null,
    createdAt: decisionTimestamp,
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: decisionTimestamp },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: experience.sourceSignalId,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: (tagged ? ["CONFLICTED_STATE_PRESENT"] : []) as never,
    evaluatedAt: decisionTimestamp,
  };
  return { experience, evaluation };
}
const day = (d: number) => new Date(Date.UTC(2026, 7, d)).toISOString();
function window(startDay: number, n: number, tagged: number): DecisionMemoryJoinedRow[] {
  return Array.from({ length: n }, (_, i) => row(day(startDay + i), i < tagged));
}

function proposal(gapCategory: GapCategory = "CONTRADICTION_GAP"): EvolutionProposalWithoutTimestamp {
  return {
    proposalId: `ELVOID_PRO_ORACLE:BTCUSDT:${gapCategory}`,
    proposalVersion: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    currentSystemVersion: "phase-8.6.4",
    gapCategory,
    gapSeverity: "HIGH",
    evidence: { occurrenceCount: 8, evaluatedCount: 40, triggeringTags: [] },
    hypothesis: "Repeated unresolved contradiction observed for this source/symbol.",
    proposedChange:
      "Investigate the bounded negative-memory evaluation (lib/ai/decisionQualification/qualify.ts's evaluateNegativeMemorySignal()) and lib/ai/decisionPopulation for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol"],
    status: "DRAFT",
  };
}

function recordFor(p: EvolutionProposalWithoutTimestamp, rows: readonly DecisionMemoryJoinedRow[]): EvolutionValidationRecordWithoutTimestamp {
  const replay = buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, checkCandidateScope(p.hypothesis, p.proposedChange), replay);
  const record = buildEvolutionValidationRecord(p, candidate);
  if (record === null) throw new Error("fixture record could not be built");
  return record;
}

const VALID_ROWS = [...window(1, 20, 8), ...window(21, 20, 3)];
const validRecord = recordFor(proposal(), VALID_ROWS);
check("setup: fixture validRecord.result is VALID", validRecord.result === "VALID", validRecord.result);

// ---------------------------------------------------------------------------
// 1. extractAffectedFiles — deterministic, sorted, de-duplicated, honest-empty
// ---------------------------------------------------------------------------

{
  const files = extractAffectedFiles(validRecord.snapshot.proposal.hypothesis, validRecord.snapshot.proposal.proposedChange);
  check("1a. extractAffectedFiles finds the real file paths in the proposal's own text", files.includes("lib/ai/decisionQualification/qualify.ts"), JSON.stringify(files));
  check("1b. extractAffectedFiles is sorted", JSON.stringify(files) === JSON.stringify([...files].sort()), JSON.stringify(files));
  const noPathText = extractAffectedFiles("no file paths mentioned here", "nor here either");
  check("1c. extractAffectedFiles returns [] (not null, not fabricated) when the text names nothing", Array.isArray(noPathText) && noPathText.length === 0, JSON.stringify(noPathText));
  const dupeText = extractAffectedFiles("lib/ai/foo/bar.ts and again lib/ai/foo/bar.ts", "");
  check("1d. extractAffectedFiles de-duplicates a path mentioned twice", dupeText.length === 1, JSON.stringify(dupeText));
}

// ---------------------------------------------------------------------------
// 2. artifactIdFor — deterministic identity
// ---------------------------------------------------------------------------

{
  const a = artifactIdFor(validRecord.recordHash);
  const b = artifactIdFor(validRecord.recordHash);
  check("2a. artifactIdFor is deterministic for the same recordHash", a === b, `${a} vs ${b}`);
  check("2b. artifactIdFor is namespaced (not the bare hash)", a === `artifact:${validRecord.recordHash}`, a);
  const differentRecord = recordFor(proposal("CONTEXT_GAP"), VALID_ROWS);
  check("2c. artifactIdFor differs for a different recordHash", artifactIdFor(differentRecord.recordHash) !== a, "collision");
}

// ---------------------------------------------------------------------------
// 3. buildChangeArtifact — happy path, lineage, determinism
// ---------------------------------------------------------------------------

{
  const artifact = buildChangeArtifact(validRecord, validRecord.recordHash);
  check("3a. buildChangeArtifact succeeds for a VALID, self-consistent record", artifact !== null, "returned null");
  if (artifact !== null) {
    check("3b. artifactStatus is AWAITING_HUMAN_PATCH for a clean VALID record", artifact.artifactStatus === "AWAITING_HUMAN_PATCH", artifact.artifactStatus);
    check("3c. patchStatus is NOT_EXECUTED — no exec/branch/diff capability exists", artifact.patchStatus === "NOT_EXECUTED", artifact.patchStatus);
    check("3d. patchReference is null — nothing was ever generated", artifact.patchReference === null, String(artifact.patchReference));
    check("3e. lineage: artifact.proposalId === record.proposalId", artifact.proposalId === validRecord.proposalId, artifact.proposalId);
    check("3f. lineage: artifact.candidateId === record.candidateId", artifact.candidateId === validRecord.candidateId, artifact.candidateId);
    check("3g. artifactId is the deterministic id, not random/timestamp-based", artifact.artifactId === artifactIdFor(validRecord.recordHash), artifact.artifactId);

    const again = buildChangeArtifact(validRecord, validRecord.recordHash);
    check("3h. buildChangeArtifact is deterministic — same record -> byte-identical artifact", JSON.stringify(again) === JSON.stringify(artifact), "mismatch across two calls");
  }
}

// ---------------------------------------------------------------------------
// 4. buildChangeArtifact — refuses out-of-order / mismatched calls
// ---------------------------------------------------------------------------

{
  const wrongHash = "0".repeat(64);
  const mismatched = buildChangeArtifact(validRecord, wrongHash);
  check("4a. buildChangeArtifact refuses a mismatched approvalRecordHash", mismatched === null, "did not refuse");

  const notApplicableGap: GapCategory[] = [];
  void notApplicableGap;
  // A record whose validation.result is not VALID must never produce an artifact.
  const invalidRecord: EvolutionValidationRecordWithoutTimestamp = {
    ...validRecord,
    result: "INVALID",
    snapshot: { ...validRecord.snapshot, validation: { ...validRecord.snapshot.validation, result: "INVALID" } },
  };
  const refused = buildChangeArtifact(invalidRecord, invalidRecord.recordHash);
  check("4b. buildChangeArtifact refuses a non-VALID record.result", refused === null, "did not refuse");
}

// ---------------------------------------------------------------------------
// 5. buildChangeArtifact — independent recheck: VALIDATION_FAILED branch
//
// SYNTHETIC records only, hand-built (not through the real pipeline), to
// exercise this defensive branch. Per validate.ts's own header, the real
// pipeline is designed so `result: "VALID"` and `regressionDetected: true`
// can never coexist — this is deliberately testing THIS layer's own
// independent, redundant recheck in isolation, not simulating a real
// production state.
// ---------------------------------------------------------------------------

{
  const syntheticRegressed: EvolutionValidationRecordWithoutTimestamp = {
    ...validRecord,
    snapshot: {
      ...validRecord.snapshot,
      validation: {
        ...validRecord.snapshot.validation,
        regressionCheck: { ...validRecord.snapshot.validation.regressionCheck, evaluated: true, regressionDetected: true },
      },
    },
  };
  const artifact = buildChangeArtifact(syntheticRegressed, syntheticRegressed.recordHash);
  check("5a. independent recheck: regressionDetected=true forces VALIDATION_FAILED even on a nominally VALID record", artifact !== null && artifact.artifactStatus === "VALIDATION_FAILED", JSON.stringify(artifact?.artifactStatus));
  check("5b. VALIDATION_FAILED still refuses to offer a patch", artifact !== null && artifact.patchStatus === "NOT_EXECUTED" && artifact.patchReference === null, "patch offered on a failed recheck");

  const syntheticGateFailed: EvolutionValidationRecordWithoutTimestamp = {
    ...validRecord,
    snapshot: {
      ...validRecord.snapshot,
      validation: {
        ...validRecord.snapshot.validation,
        gates: validRecord.snapshot.validation.gates.map((g, i) => (i === 0 ? { ...g, passed: false } : g)),
      },
    },
  };
  const artifact2 = buildChangeArtifact(syntheticGateFailed, syntheticGateFailed.recordHash);
  check("5c. independent recheck: one failed gate forces VALIDATION_FAILED", artifact2 !== null && artifact2.artifactStatus === "VALIDATION_FAILED", JSON.stringify(artifact2?.artifactStatus));
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} P4 Step 2 Controlled Change Artifact fixtures passed.`);
if (failures > 0) process.exitCode = 1;
