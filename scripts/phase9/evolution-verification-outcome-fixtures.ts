// ---------------------------------------------------------------------------
// Evolution post-deploy loop fixtures (dev-only, pure/offline).
//
// Exercises the PURE halves of the loop with the real functions production
// uses — evolutionVerification/verify.ts, evolutionOutcome/evaluate.ts,
// evolutionOutcome/learning.ts — plus static guards over the migration and
// the sweep's imports. The persistence adapters (repository.ts) and the
// sweep's HTTP/Vercel calls need a live Learning DB / Vercel and are NOT
// exercised here; the database's own guard triggers are verified separately
// against the real Learning DB (see the handoff report).
//
// Every object below is a hand-built input to a pure function. Nothing is
// inserted anywhere and nothing here can create a candidate, approval, patch
// run or deployment.
//
// Usage:
//   node --experimental-strip-types --no-warnings --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/evolution-verification-outcome-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { evaluateProductionVerification, deriveAffectedEndpoints } from "@/lib/ai/evolutionVerification/verify";
import { verificationFailureIsTerminal, MAX_VERIFICATION_ATTEMPTS, verificationIdFor } from "@/lib/ai/evolutionVerification/contracts";
import type { DeploymentFacts, RuntimeProbe } from "@/lib/ai/evolutionVerification/contracts";
import { evaluateGapOutcome } from "@/lib/ai/evolutionOutcome/evaluate";
import { deriveLearningFromOutcome, deriveLearningFromFailedVerification, OUTCOME_LEARNING_MAP } from "@/lib/ai/evolutionOutcome/learning";
import { isTerminalOutcome, outcomeIdFor, learningIdFor } from "@/lib/ai/evolutionOutcome/contracts";
import type { EvolutionOutcomeRecord } from "@/lib/ai/evolutionOutcome/contracts";
import { VALIDATION_GATE_THRESHOLDS } from "@/lib/ai/evolutionValidation/gates";
import { patchRunIdFor } from "@/lib/ai/evolutionPipeline/contracts";
import type { PatchRun } from "@/lib/ai/evolutionPipeline/contracts";
import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation, EvaluationClass } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail = "") {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}
const src = (p: string) => readFileSync(p, "utf8");

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const RECORD_HASH = "a".repeat(64);
const EXPECTED_SHA = "b".repeat(40);
const DEPLOYMENT_ID = "dpl_real123";
const PATCH_RUN_ID = patchRunIdFor(RECORD_HASH);
const NOW = "2026-10-04T10:00:00.000Z";

function run(overrides: Partial<PatchRun> = {}): PatchRun {
  return {
    patchRunId: PATCH_RUN_ID,
    recordHash: RECORD_HASH,
    artifactId: `artifact:${RECORD_HASH}`,
    proposalId: "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    status: "DEPLOY_SUCCESS",
    branch: "evolution/patch-aaaaaaaaaaaa",
    baseSha: "c".repeat(40),
    commitSha: "d".repeat(40),
    mergeCommitSha: EXPECTED_SHA,
    deploymentId: DEPLOYMENT_ID,
    deploymentUrl: "https://elstand-abc.vercel.app",
    failedStage: null,
    errorSummary: null,
    authorizedBy: 12345,
    authorizedAt: "2026-10-04T09:00:00.000Z",
    startedAt: "2026-10-04T08:00:00.000Z",
    updatedAt: "2026-10-04T09:30:00.000Z",
    ...overrides,
  };
}

function artifact(overrides: Partial<ChangeArtifact> = {}): ChangeArtifact {
  return {
    artifactId: `artifact:${RECORD_HASH}`,
    recordHash: RECORD_HASH,
    approvalRecordHash: RECORD_HASH,
    proposalId: "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    candidateId: "candidate:ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    source: "ELVOID_PRO_ORACLE",
    symbol: "SUI",
    gapCategory: "PATTERN_GAP",
    affectedFiles: ["app/api/elvoid-pro/example/route.ts", "lib/ai/example/module.ts"],
    proposedChange: "example",
    patchStatus: "NOT_GENERATED",
    patchReference: null,
    regressionCheck: { evaluated: true, regressionDetected: false, newlyActiveGapCategories: [], otherActiveGapCountDelta: 0, reasons: [] },
    gates: [],
    artifactStatus: "AWAITING_HUMAN_PATCH",
    statusReason: "ok",
    generatedAt: "2026-10-04T07:00:00.000Z",
    ...overrides,
  } as ChangeArtifact;
}

function deployment(overrides: Partial<DeploymentFacts> = {}): DeploymentFacts {
  return { state: "READY", deploymentId: DEPLOYMENT_ID, commitSha: EXPECTED_SHA, target: "production", readyAtMs: Date.parse("2026-10-04T09:45:00.000Z"), url: "https://elstand-abc.vercel.app", aliases: ["www.example.com"], ...overrides };
}

function buildInfoProbe(overrides: Partial<RuntimeProbe> = {}): RuntimeProbe {
  return { kind: "BUILD_INFO", url: "https://www.example.com/api/ai-performance/evolution/build-info", httpStatus: 200, ok: true, observedCommitSha: EXPECTED_SHA, observedDeploymentId: DEPLOYMENT_ID, error: null, durationMs: 40, ...overrides };
}

function endpointProbe(path: string, httpStatus: number | null): RuntimeProbe {
  return { kind: "AFFECTED_ENDPOINT", url: `https://www.example.com${path}`, httpStatus, ok: httpStatus !== null && httpStatus < 500 && httpStatus !== 404, observedCommitSha: null, observedDeploymentId: null, error: httpStatus === null ? "timeout" : null, durationMs: 30 };
}

const GOOD_ENDPOINTS = ["/api/elvoid-pro/example"] as const;

function verify(overrides: Partial<Parameters<typeof evaluateProductionVerification>[0]> = {}) {
  return evaluateProductionVerification({
    run: run(),
    artifact: artifact(),
    deployment: deployment(),
    probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", 401)],
    affectedEndpoints: GOOD_ENDPOINTS,
    attemptNo: 1,
    nowIso: NOW,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// PRODUCTION VERIFICATION
// ---------------------------------------------------------------------------

{
  const v = verify();
  check("V1. every real fact aligned -> VERIFIED, all 7 checks passed", v.status === "VERIFIED" && v.checks.length === 7 && v.checks.every((c) => c.passed) && v.failureReasons.length === 0, JSON.stringify(v.failureReasons));
  check("V1b. evidence carries deployment id, expected + deployed commit, ready time, recordHash/artifact/proposal binding", v.deploymentId === DEPLOYMENT_ID && v.expectedCommitSha === EXPECTED_SHA && v.deployedCommitSha === EXPECTED_SHA && v.deploymentReadyAt === "2026-10-04T09:45:00.000Z" && v.recordHash === RECORD_HASH && v.artifactId === `artifact:${RECORD_HASH}` && v.proposalId === "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP" && v.candidateId === "candidate:ELVOID_PRO_ORACLE:SUI:PATTERN_GAP", JSON.stringify(v));
  check("V1c. verificationId is deterministic per (patch run, attempt)", v.verificationId === verificationIdFor(PATCH_RUN_ID, 1) && verify({ attemptNo: 3 }).verificationId === verificationIdFor(PATCH_RUN_ID, 3), v.verificationId);
}

{
  const v = verify({ probes: [buildInfoProbe({ observedCommitSha: "e".repeat(40) }), endpointProbe("/api/elvoid-pro/example", 401)] });
  check("V2. deployment READY but the RUNNING code reports a different commit -> FAILED (READY alone is not proof)", v.status === "FAILED" && v.checks.find((c) => c.id === "DEPLOYMENT_READY")?.passed === true && v.checks.find((c) => c.id === "RUNTIME_BUILD_INFO_MATCHES")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ probes: [buildInfoProbe({ observedDeploymentId: "dpl_other" }), endpointProbe("/api/elvoid-pro/example", 401)] });
  check("V2b. right commit but different deployment id at runtime -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "RUNTIME_BUILD_INFO_MATCHES")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ probes: [buildInfoProbe({ observedDeploymentId: null }), endpointProbe("/api/elvoid-pro/example", 401)] });
  check("V2c. runtime reports no deployment id (VERCEL_DEPLOYMENT_ID not exposed) -> FAILED closed, never assumed", v.status === "FAILED" && v.checks.find((c) => c.id === "RUNTIME_BUILD_INFO_MATCHES")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ probes: [endpointProbe("/api/elvoid-pro/example", 401)] });
  check("V3. no build-info probe was made -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "RUNTIME_BUILD_INFO_MATCHES")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ deployment: deployment({ commitSha: "f".repeat(40) }) });
  check("V4. Vercel built a different commit than the merge commit -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "DEPLOYED_SHA_MATCHES_EXPECTED")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ deployment: deployment({ target: "preview" }) });
  check("V5. deployment target is preview, not production -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "DEPLOYMENT_TARGET_PRODUCTION")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ deployment: deployment({ state: "BUILDING" }) });
  check("V5b. deployment not READY -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "DEPLOYMENT_READY")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ deployment: null });
  check("V6. deployment could not be read from Vercel -> FAILED (unknown is never verified)", v.status === "FAILED" && v.deploymentState === null && v.deployedCommitSha === null, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ artifact: null });
  check("V7. no change artifact for the recordHash -> FAILED (binding cannot be proven)", v.status === "FAILED" && v.checks.find((c) => c.id === "ARTIFACT_BINDING")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ artifact: artifact({ recordHash: "9".repeat(64) }) });
  check("V7b. artifact bound to a different recordHash than the run -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "ARTIFACT_BINDING")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ artifact: artifact({ proposalId: "ELVOID_PRO_ORACLE:SUI:EVIDENCE_GAP" }) });
  check("V7c. artifact proposal differs from the run's proposal -> FAILED", v.status === "FAILED" && v.checks.find((c) => c.id === "ARTIFACT_BINDING")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ run: run({ status: "CHECKS_FAILED" }) });
  check("V8. a run that is not DEPLOY_SUCCESS can never verify", v.status === "FAILED" && v.checks.find((c) => c.id === "RUN_IS_DEPLOY_SUCCESS")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ run: run({ authorizedBy: null, authorizedAt: null }) });
  check("V8b. a run with no recorded human authorization can never verify", v.status === "FAILED" && v.checks.find((c) => c.id === "RUN_IS_DEPLOY_SUCCESS")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v404 = verify({ probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", 404)] });
  const v500 = verify({ probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", 500)] });
  const vNone = verify({ probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", null)] });
  const v200 = verify({ probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", 200)] });
  const v403 = verify({ probes: [buildInfoProbe(), endpointProbe("/api/elvoid-pro/example", 403)] });
  check("V9. affected endpoint 404 / 500 / no response -> FAILED; 200 and 401/403 (alive, gated) -> pass", v404.status === "FAILED" && v500.status === "FAILED" && vNone.status === "FAILED" && v200.status === "VERIFIED" && v403.status === "VERIFIED", `${v404.status}/${v500.status}/${vNone.status}/${v200.status}/${v403.status}`);
}

{
  const v = verify({ probes: [buildInfoProbe()] });
  check("V9b. an affected endpoint that was never probed -> FAILED (not silently skipped)", v.status === "FAILED" && v.checks.find((c) => c.id === "AFFECTED_ENDPOINTS_HEALTHY")?.passed === false, JSON.stringify(v.failureReasons));
}

{
  const v = verify({ artifact: artifact({ affectedFiles: ["lib/ai/example/module.ts"] }), affectedEndpoints: [], probes: [buildInfoProbe()] });
  check("V10. module-level change (no HTTP endpoint) is proven by the runtime build-info match alone", v.status === "VERIFIED" && /module-level/.test(v.checks.find((c) => c.id === "AFFECTED_ENDPOINTS_HEALTHY")?.detail ?? ""), JSON.stringify(v.failureReasons));
}

{
  const a = verify();
  const b = verify();
  check("V11. idempotent: identical inputs produce byte-identical evidence", JSON.stringify(a) === JSON.stringify(b));
}

check(
  "V12. deriveAffectedEndpoints maps only static app/api route files; route groups removed; dynamic segments, pages and lib files skipped; sorted + de-duplicated",
  JSON.stringify(deriveAffectedEndpoints(["app/api/b/route.ts", "app/api/a/route.ts", "app/api/(grp)/c/route.ts", "app/api/x/[id]/route.ts", "app/page.tsx", "lib/x.ts", "app/api/a/route.ts"])) === JSON.stringify(["/api/a", "/api/b", "/api/c"]),
  JSON.stringify(deriveAffectedEndpoints(["app/api/b/route.ts", "app/api/a/route.ts", "app/api/(grp)/c/route.ts", "app/api/x/[id]/route.ts", "app/page.tsx", "lib/x.ts"]))
);

check("V13. verification retry is capped: terminal at MAX_VERIFICATION_ATTEMPTS failed attempts, not before", !verificationFailureIsTerminal(MAX_VERIFICATION_ATTEMPTS - 1) && verificationFailureIsTerminal(MAX_VERIFICATION_ATTEMPTS), String(MAX_VERIFICATION_ATTEMPTS));

// ---------------------------------------------------------------------------
// OUTCOME EVALUATION — real evaluateGapOutcome over hand-built decision rows
// ---------------------------------------------------------------------------

let idCounter = 0;
function row(day: string, evaluationClass: EvaluationClass, extra: { evidence?: string[]; symbol?: string } = {}): DecisionMemoryJoinedRow {
  idCounter++;
  const experience: DecisionExperienceRecord = {
    id: `exp-${idCounter}`,
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId: `sig-${idCounter}`,
    symbol: extra.symbol ?? "SUI",
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp: `${day}T00:00:00.000Z`,
    learningContext: null,
    createdAt: `${day}T00:00:00.000Z`,
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2, outcomeDurationMinutes: 60, outcomeClosedAt: `${day}T01:00:00.000Z` },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: `sig-${idCounter}`,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass,
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: (extra.evidence ?? []) as DecisionEvaluation["evidence"],
    evaluatedAt: `${day}T02:00:00.000Z`,
  };
  return { experience, evaluation };
}

const MIN = VALIDATION_GATE_THRESHOLDS.minEligibleSamplesPerWindow;
const DEPLOYED_AT = "2026-09-15T00:00:00.000Z";
const BAD: EvaluationClass = "GOOD_DECISION_BAD_OUTCOME";
const GOOD: EvaluationClass = "GOOD_DECISION_GOOD_OUTCOME";

function day(base: number, i: number): string {
  // base 1 => 2026-09-01.., spread so every row has a valid, ordered date inside the month
  return `2026-09-${String(base + (i % 14)).padStart(2, "0")}`;
}

/** `total` rows in the BASELINE window (before 2026-09-15), `bad` of them negative. */
function baselineRows(total: number, bad: number): DecisionMemoryJoinedRow[] {
  return Array.from({ length: total }, (_, i) => row(day(1, i), i < bad ? BAD : GOOD));
}
/** `total` rows in the POST-deploy window (from 2026-09-16), `bad` of them negative. */
function postRows(total: number, bad: number, evidenceFor: (i: number) => string[] = () => []): DecisionMemoryJoinedRow[] {
  return Array.from({ length: total }, (_, i) => row(day(16, i), i < bad ? BAD : GOOD, { evidence: evidenceFor(i) }));
}
const evalOutcome = (rows: DecisionMemoryJoinedRow[], overrides: Partial<Parameters<typeof evaluateGapOutcome>[0]> = {}) =>
  evaluateGapOutcome({ source: "ELVOID_PRO_ORACLE", symbol: "SUI", gapCategory: "PATTERN_GAP", rows, deployedAtIso: DEPLOYED_AT, ...overrides });

check("O0. the outcome measurement reads its thresholds from validation's own gate constants (min eligible per window = 20)", MIN === 20, String(MIN));

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)]);
  check("O1. real drop after the verified deploy (15/30 -> 3/30) -> IMPROVED", o.status === "IMPROVED" && o.baseline.eligibleCount === 30 && o.post.eligibleCount === 30 && o.baseline.targetOccurrenceCount === 15 && o.post.targetOccurrenceCount === 3, JSON.stringify({ s: o.status, b: o.baseline, p: o.post, r: o.reasons }));
  check("O1b. every validation gate was actually evaluated and passed", o.gates.length > 0 && o.gates.every((g) => g.passed) && o.regressionCheck.evaluated && !o.regressionCheck.regressionDetected, JSON.stringify(o.gates));
  check("O1c. IMPROVED wording is observational, never causal", /does not establish that the change caused/.test(o.reasons.join(" ")), o.reasons.join(" "));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 14)]);
  check("O2. enough post-deploy decisions but the rate barely moved (15/30 -> 14/30) -> NOT_IMPROVED, never IMPROVED", o.status === "NOT_IMPROVED" && isTerminalOutcome(o.status), JSON.stringify({ s: o.status, r: o.reasons }));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 20)]);
  check("O2b. rate got WORSE after the deploy (15/30 -> 20/30) -> NOT_IMPROVED (not IMPROVED)", o.status === "NOT_IMPROVED", JSON.stringify({ s: o.status, r: o.reasons }));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3, (i) => (i < 6 ? ["CAUTIOUS_STATE_PRESENT"] : []))]);
  check("O3. target rate fell but another gap category became newly active after the deploy -> REGRESSED (regression outranks the improvement)", o.status === "REGRESSED" && o.regressionCheck.regressionDetected && o.regressionCheck.newlyActiveGapCategories.includes("EVIDENCE_GAP"), JSON.stringify({ s: o.status, rc: o.regressionCheck }));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(5, 0)]);
  check("O4. too few post-deploy decisions (5 < 20) -> INSUFFICIENT_EVIDENCE, not terminal", o.status === "INSUFFICIENT_EVIDENCE" && !isTerminalOutcome(o.status) && /Waiting for post-deploy decisions/.test(o.reasons.join(" ")), JSON.stringify(o.reasons));
}

{
  const o = evalOutcome([...baselineRows(9, 5), ...postRows(30, 0)]);
  check("O4b. too few BASELINE decisions (9 < 20) -> INSUFFICIENT_EVIDENCE even when the post window looks great (an improvement cannot be claimed against a thin baseline)", o.status === "INSUFFICIENT_EVIDENCE", JSON.stringify({ s: o.status, b: o.baseline.eligibleCount }));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)], { deployedAtIso: null });
  const bad = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)], { deployedAtIso: "not-a-date" });
  check("O5. no usable deployment timestamp -> INSUFFICIENT_EVIDENCE (nothing split, nothing claimed)", o.status === "INSUFFICIENT_EVIDENCE" && bad.status === "INSUFFICIENT_EVIDENCE" && o.gates.length === 0, JSON.stringify(o.reasons));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)], { gapCategory: "REJECT_DOMINANCE_GAP" });
  check("O6. a gap category replay cannot measure -> INSUFFICIENT_EVIDENCE with the applicability reason (never IMPROVED)", o.status === "INSUFFICIENT_EVIDENCE" && /cannot be measured/.test(o.reasons.join(" ")), JSON.stringify(o.reasons));
}

{
  const big = Array.from({ length: 1000 }, (_, i) => row(day(1, i), GOOD, { symbol: "OTHER" }));
  const o = evalOutcome([...big, ...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)]);
  check("O7. a population at the truncation guard (>=1000 rows) -> INSUFFICIENT_EVIDENCE (a truncated read would corrupt both windows)", o.status === "INSUFFICIENT_EVIDENCE" && /truncation guard/.test(o.reasons.join(" ")), JSON.stringify(o.reasons));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3), ...baselineRows(40, 40).map((r) => ({ ...r, experience: { ...r.experience, symbol: "ETH" } })), ...postRows(40, 0).map((r) => ({ ...r, experience: { ...r.experience, symbol: "BTC" } }))]);
  check("O8. other symbols' decisions never leak into this symbol's windows", o.status === "IMPROVED" && o.baseline.eligibleCount === 30 && o.post.eligibleCount === 30, JSON.stringify({ b: o.baseline.eligibleCount, p: o.post.eligibleCount }));
}

{
  const o = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)]);
  const split = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)], { deployedAtIso: "2026-09-22T00:00:00.000Z" }); // moves the 09-16..09-21 post rows into the baseline window
  check("O9. the split point is the deployment time: decisions BEFORE it are baseline, AT/AFTER it are post (moving the point moves rows between windows)", o.baseline.eligibleCount === 30 && o.post.eligibleCount === 30 && split.baseline.eligibleCount + split.post.eligibleCount === 60 && split.baseline.eligibleCount !== o.baseline.eligibleCount, JSON.stringify({ a: [o.baseline.eligibleCount, o.post.eligibleCount], b: [split.baseline.eligibleCount, split.post.eligibleCount] }));
}

{
  const rows = [...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)];
  const a = evalOutcome(rows);
  const b = evalOutcome([...rows].reverse());
  check("O10. deterministic and input-order independent", JSON.stringify(a) === JSON.stringify(b));
}

// ---------------------------------------------------------------------------
// LEARNING
// ---------------------------------------------------------------------------

function outcomeRecord(status: EvolutionOutcomeRecord["status"]): EvolutionOutcomeRecord {
  const base = evalOutcome([...baselineRows(MIN + 10, 15), ...postRows(MIN + 10, 3)]);
  return {
    ...base,
    status,
    outcomeId: outcomeIdFor(PATCH_RUN_ID, 1),
    patchRunId: PATCH_RUN_ID,
    verificationId: verificationIdFor(PATCH_RUN_ID, 1),
    recordHash: RECORD_HASH,
    artifactId: `artifact:${RECORD_HASH}`,
    proposalId: "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    candidateId: "candidate:ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    source: "ELVOID_PRO_ORACLE",
    symbol: "SUI",
    gapCategory: "PATTERN_GAP",
    commitSha: EXPECTED_SHA,
    deploymentId: DEPLOYMENT_ID,
    deployedAt: "2026-09-15T00:00:00.000Z",
    evaluationNo: 1,
    evaluatedAt: NOW,
  };
}

{
  const eff = deriveLearningFromOutcome(outcomeRecord("IMPROVED"), verificationIdFor(PATCH_RUN_ID, 1), NOW);
  const ineff = deriveLearningFromOutcome(outcomeRecord("NOT_IMPROVED"), verificationIdFor(PATCH_RUN_ID, 1), NOW);
  const harm = deriveLearningFromOutcome(outcomeRecord("REGRESSED"), verificationIdFor(PATCH_RUN_ID, 1), NOW);
  check("L1. every terminal outcome is learned — good AND bad (effective / ineffective / harmful)", eff?.learningKind === "CHANGE_EFFECTIVE" && ineff?.learningKind === "CHANGE_INEFFECTIVE" && harm?.learningKind === "CHANGE_HARMFUL", JSON.stringify([eff?.learningKind, ineff?.learningKind, harm?.learningKind]));
  check("L1b. next evolution state: addressed->monitor, ineffective->revision needed, harmful->human regression review", eff?.nextEvolutionState === "GAP_ADDRESSED_MONITOR" && ineff?.nextEvolutionState === "GAP_PERSISTS_REVISION_NEEDED" && harm?.nextEvolutionState === "REGRESSION_REVIEW_REQUIRED", JSON.stringify([eff?.nextEvolutionState, ineff?.nextEvolutionState, harm?.nextEvolutionState]));
}

check("L2. a still-pending (INSUFFICIENT_EVIDENCE) outcome yields NO learning — nothing is learned before a verdict exists", deriveLearningFromOutcome(outcomeRecord("INSUFFICIENT_EVIDENCE"), verificationIdFor(PATCH_RUN_ID, 1), NOW) === null);

{
  const l = deriveLearningFromOutcome(outcomeRecord("IMPROVED"), verificationIdFor(PATCH_RUN_ID, 1), NOW);
  const ln = l?.lineage;
  check(
    "L3. full traceability: proposal -> candidate -> recordHash -> artifact -> patch run -> commit -> deployment -> verification -> outcome, all on the learning",
    ln?.proposalId === "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP" && ln?.candidateId === "candidate:ELVOID_PRO_ORACLE:SUI:PATTERN_GAP" && ln?.recordHash === RECORD_HASH && ln?.artifactId === `artifact:${RECORD_HASH}` && ln?.patchRunId === PATCH_RUN_ID && ln?.commitSha === EXPECTED_SHA && ln?.deploymentId === DEPLOYMENT_ID && ln?.verificationId === verificationIdFor(PATCH_RUN_ID, 1) && ln?.outcomeId === outcomeIdFor(PATCH_RUN_ID, 1) && l?.learningId === learningIdFor(PATCH_RUN_ID),
    JSON.stringify(ln)
  );
}

{
  const l = deriveLearningFromFailedVerification({
    patchRunId: PATCH_RUN_ID,
    recordHash: RECORD_HASH,
    artifactId: `artifact:${RECORD_HASH}`,
    proposalId: "ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    candidateId: "candidate:ELVOID_PRO_ORACLE:SUI:PATTERN_GAP",
    source: "ELVOID_PRO_ORACLE",
    symbol: "SUI",
    gapCategory: "PATTERN_GAP",
    commitSha: EXPECTED_SHA,
    deploymentId: DEPLOYMENT_ID,
    verificationId: verificationIdFor(PATCH_RUN_ID, MAX_VERIFICATION_ATTEMPTS),
    failureReasons: ["RUNTIME_BUILD_INFO_MATCHES: no probe matched"],
    attempts: MAX_VERIFICATION_ATTEMPTS,
    nowIso: NOW,
  });
  check("L4. a deployment that never verified is ALSO learned (CHANGE_UNVERIFIED -> production review) and says its effect was NOT measured", l.learningKind === "CHANGE_UNVERIFIED" && l.nextEvolutionState === "PRODUCTION_REVIEW_REQUIRED" && l.derivedFrom === "PRODUCTION_VERIFICATION" && l.outcomeId === null && /NOT measured/.test(l.summary), JSON.stringify(l));
}

// ---------------------------------------------------------------------------
// STATIC GUARDS — the database enforces the same mapping, nothing here can approve/merge/deploy, thresholds are not redefined
// ---------------------------------------------------------------------------

{
  const sql = src("supabase/learning/migrations/2026-10a-evolution-verification-outcome-learning.sql");
  const mapped = Object.entries(OUTCOME_LEARNING_MAP).every(([status, m]) => sql.includes(`o.outcome_status = '${status}' and new.learning_kind = '${m.kind}' and new.next_evolution_state = '${m.next}'`));
  check("S1. the SQL guard trigger encodes EXACTLY the same outcome -> learning -> next-state table as learning.ts", mapped);
  check("S2. migration is additive + idempotent: every create is `if not exists`/`or replace`/`drop ... if exists`; no drop table, delete, truncate-of-data, or alter of existing columns", !/drop\s+table|delete\s+from|alter\s+table\s+\w+\s+(drop\s+column|alter\s+column|rename)/i.test(sql) && /create table if not exists evolution_production_verifications/.test(sql) && /create table if not exists evolution_outcomes/.test(sql) && /create table if not exists evolution_learnings/.test(sql));
  check("S3. all three new tables are service-role only (RLS enabled, no policy) and append-only (UPDATE/DELETE/TRUNCATE rejected)", ["evolution_production_verifications", "evolution_outcomes", "evolution_learnings"].every((t) => sql.includes(`alter table ${t} enable row level security`) && sql.includes(`${t}_no_mutation`) && sql.includes(`${t}_no_truncate`)) && !/create policy/i.test(sql));
  check("S4. the DB refuses VERIFIED unless READY + production + deployed sha = expected sha + every check passed", /new\.deployment_state is distinct from 'READY'/.test(sql) && /new\.deployment_target is distinct from 'production'/.test(sql) && /new\.deployed_commit_sha is distinct from new\.expected_commit_sha/.test(sql) && /every recorded check to have passed/.test(sql));
  check("S5. the DB refuses an outcome without a VERIFIED verification, and a learning without a terminal outcome (or a failed verification)", /an outcome requires a VERIFIED production verification/.test(sql) && /requires a terminal outcome/.test(sql) && /requires a FAILED verification/.test(sql));
}

{
  const files = ["lib/ai/evolutionVerification/sweep.ts", "lib/ai/evolutionVerification/verify.ts", "lib/ai/evolutionVerification/repository.ts", "lib/ai/evolutionOutcome/evaluate.ts", "lib/ai/evolutionOutcome/learning.ts", "lib/ai/evolutionOutcome/repository.ts", "app/api/ai-performance/evolution/verify/route.ts", "app/api/ai-performance/evolution/build-info/route.ts", "app/api/ai-performance/evolution/lifecycle/route.ts"];
  const forbiddenImports = /from "@\/lib\/ai\/(evolutionGit|evolutionApproval|evolutionCoding|evolutionPipeline\/authorization)|pushChange|mergeApprovedBranch|claimPatchAuthorization|transitionPatchRunIfStatus|upsertPatchRun|runPhase9Pipeline|sendApprovalRequest|buildChangeArtifact/;
  const offenders = files.filter((f) => forbiddenImports.test(src(f)));
  check("S6. none of the new post-deploy modules can approve, authorize, merge, push, generate code, or mutate a patch run (no such import/call exists)", offenders.length === 0, offenders.join(", "));
}

{
  const ev = src("lib/ai/evolutionOutcome/evaluate.ts");
  check("S7. outcome evaluation defines no threshold of its own — it imports validation's VALIDATION_GATE_THRESHOLDS and evaluateValidationGates", /VALIDATION_GATE_THRESHOLDS/.test(ev) && /evaluateValidationGates/.test(ev) && !/(minEligibleSamplesPerWindow|minAbsoluteReduction|minRelativeReduction)\s*[:=]\s*\d/.test(ev));
  const sweep = src("lib/ai/evolutionVerification/sweep.ts");
  check("S8. the sweep only reads DEPLOY_SUCCESS runs and never writes to evolution_patch_runs / approvals / artifacts", /getPatchRunsByStatus\("DEPLOY_SUCCESS"\)/.test(sweep) && !/evolution_patch_runs|evolution_approvals|evolution_change_artifacts/.test(sweep));
  const verifyRoute = src("app/api/ai-performance/evolution/verify/route.ts");
  check("S9. the sweep route is cron-secret gated and fails closed when CRON_SECRET is unset", /if \(!secret\) return false/.test(verifyRoute) && /Unauthorized cron trigger/.test(verifyRoute));
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
