// ---------------------------------------------------------------------------
// Phase 8.6.5 — Evolution Candidate + Replay Engine fixtures (dev-only).
// Pure/offline — exercises create.ts + replay.ts only (repository.ts
// requires a live Learning DB and is not exercised here).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-candidate-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { checkCandidateScope, candidateIdFor, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison } from "@/lib/ai/evolutionCandidate/replay";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, GapCategory, GapSeverity } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation, EvaluationClass } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function proposal(overrides: { hypothesis?: string; proposedChange?: string; gapCategory?: GapCategory } = {}): EvolutionProposalWithoutTimestamp {
  return {
    proposalId: "ELVOID_PRO_ORACLE:BTCUSDT:CONTRADICTION_GAP",
    proposalVersion: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    currentSystemVersion: "phase-8.6.4",
    gapCategory: overrides.gapCategory ?? "CONTRADICTION_GAP",
    gapSeverity: "HIGH",
    evidence: { occurrenceCount: MIN_OCCURRENCE_COUNT, evaluatedCount: 20, triggeringTags: [] },
    hypothesis: overrides.hypothesis ?? "Repeated unresolved contradiction observed for this source/symbol.",
    proposedChange: overrides.proposedChange ?? "Investigate whether the current contradiction-resolution logic systematically under-resolves disagreement for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "If confirmed, a future revision could reduce the rate of CONFLICTED-state decisions. Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol", "Human review before any qualification/arbitration change"],
    status: "DRAFT",
  };
}

let idCounter = 0;
function row(overrides: { source?: DecisionSource; symbol?: string; decisionTimestamp?: string; evaluationClass?: EvaluationClass } = {}): DecisionMemoryJoinedRow {
  idCounter++;
  const source = overrides.source ?? "ELVOID_PRO_ORACLE";
  const symbol = overrides.symbol ?? "BTCUSDT";
  const experience: DecisionExperienceRecord = {
    id: `exp-${idCounter}`,
    source,
    sourceSignalId: `sig-${idCounter}`,
    symbol,
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp: overrides.decisionTimestamp ?? "2026-09-01T00:00:00.000Z",
    learningContext: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: "2026-09-01T01:00:00.000Z" },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: `sig-${idCounter}`,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: overrides.evaluationClass ?? "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: [],
    evaluatedAt: "2026-09-01T01:05:00.000Z",
  };
  return { experience, evaluation };
}

function repeat<T>(count: number, build: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => build(i));
}

// ---------------------------------------------------------------------------
// checkCandidateScope
// ---------------------------------------------------------------------------

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  check("1. A real 8.6.4-style proposal is always within scope (no forbidden keyword)", scope.withinScope === true && scope.violatingKeywords.length === 0, JSON.stringify(scope));
}

{
  const scope = checkCandidateScope("hypothesis mentions risk sizing", "Modify the risk engine directly.");
  check("2. Invalid/out-of-scope proposal (mentions risk) -> withinScope false, violatingKeywords non-empty", scope.withinScope === false && scope.violatingKeywords.includes("risk"), JSON.stringify(scope));
}

{
  const p = proposal({ validationRequirements: undefined } as never);
  const scope = checkCandidateScope("Repeated inconsistency observed.", "Investigate the contradiction-resolution logic; validate through historical replay.");
  check("3. validationRequirements text (mentioning qualification/arbitration) is never scanned — only hypothesis/proposedChange", scope.withinScope === true, JSON.stringify(scope));
}

// ---------------------------------------------------------------------------
// finalizeCandidate — status assignment
// ---------------------------------------------------------------------------

{
  const p = proposal({ hypothesis: "mentions wallet access directly" });
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const candidate = finalizeCandidate(p, scope, null);
  check("4. Out-of-scope proposal -> candidate blocked (VALIDATION_BLOCKED), replay forced null", candidate.status === "VALIDATION_BLOCKED" && candidate.replay === null, JSON.stringify(candidate.status));
}

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const rows = [...repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }))];
  const replay = buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, scope, replay);
  check("5. DRAFT proposal, in scope, sufficient data both windows -> candidate created with REPLAY_PASSED", candidate.status === "REPLAY_PASSED" && candidate.replay !== null, JSON.stringify(candidate.status));
}

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const rows = repeat(2, () => row()); // far below MIN_OCCURRENCE_COUNT once split in half
  const replay = buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, scope, replay);
  check("6. Insufficient historical data in the split windows -> REPLAY_FAILED, not REPLAY_PASSED", candidate.status === "REPLAY_FAILED", JSON.stringify(candidate.status));
}

{
  const a = candidateIdFor(proposal());
  const b = candidateIdFor(proposal());
  check("7. Deterministic candidate identity — same proposal always produces the same candidateId", a === b && a === "candidate:ELVOID_PRO_ORACLE:BTCUSDT:CONTRADICTION_GAP", `${a} vs ${b}`);
}

{
  const p = proposal();
  const scope = checkCandidateScope(p.hypothesis, p.proposedChange);
  const candidate = finalizeCandidate(p, scope, null);
  check("8. baselineVersion / candidateVersion present and distinct (version traceability)", candidate.baselineVersion === "phase-8.6.4" && candidate.candidateVersion.startsWith("phase-8.6.5:") && candidate.baselineVersion !== candidate.candidateVersion, `${candidate.baselineVersion} / ${candidate.candidateVersion}`);
}

// ---------------------------------------------------------------------------
// buildReplayComparison — baseline vs candidate windows, isolation, determinism
// ---------------------------------------------------------------------------

{
  const rows = repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }));
  const comparison = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("9. Baseline vs candidate slices both populated from the same rows array", comparison.baseline.windowLabel === "BASELINE" && comparison.candidate.windowLabel === "CANDIDATE" && comparison.baseline.performance.totalEvaluated + comparison.candidate.performance.totalEvaluated === rows.length, JSON.stringify({ b: comparison.baseline.performance.totalEvaluated, c: comparison.candidate.performance.totalEvaluated }));
}

{
  const rows = [...repeat(MIN_OCCURRENCE_COUNT, () => row({ source: "AI_SIGNAL" })), ...repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }))];
  const comparison = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("10. Source isolation — AI_SIGNAL rows never counted in either slice", comparison.baseline.performance.totalEvaluated + comparison.candidate.performance.totalEvaluated === MIN_OCCURRENCE_COUNT * 2, JSON.stringify(comparison));
}

{
  const rows = [...repeat(MIN_OCCURRENCE_COUNT, () => row({ symbol: "ETHUSDT" })), ...repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }))];
  const comparison = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("11. Symbol isolation — ETHUSDT rows never counted in either slice", comparison.baseline.performance.totalEvaluated + comparison.candidate.performance.totalEvaluated === MIN_OCCURRENCE_COUNT * 2, JSON.stringify(comparison));
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }));
  const a = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  const b = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("12. Replay determinism — same rows always produce byte-identical comparison JSON", JSON.stringify(a) === JSON.stringify(b), "two calls with identical input produced different output");
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }));
  const snapshot = JSON.stringify(rows);
  buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("13. buildReplayComparison does not mutate its input rows", JSON.stringify(rows) === snapshot, "input rows array was mutated");
}

{
  const rows = repeat(MIN_OCCURRENCE_COUNT * 2, (i) => row({ decisionTimestamp: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z`, evaluationClass: "GOOD_DECISION_GOOD_OUTCOME" }));
  const comparison = buildReplayComparison("ELVOID_PRO_ORACLE", "BTCUSDT", "CONTRADICTION_GAP", rows);
  check("14. Evidence preserved — coverage/performance are real, non-fabricated EvaluationCoverageReport/SelfPerformanceAggregate shapes on both slices", comparison.baseline.coverage.source === "ELVOID_PRO_ORACLE" && comparison.candidate.performance.symbol === "BTCUSDT", JSON.stringify({ baselineSource: comparison.baseline.coverage.source, candidateSymbol: comparison.candidate.performance.symbol }));
}

// ---------------------------------------------------------------------------
// Static scope audit
// ---------------------------------------------------------------------------

{
  const files = ["../../lib/ai/evolutionCandidate/contracts.ts", "../../lib/ai/evolutionCandidate/create.ts", "../../lib/ai/evolutionCandidate/replay.ts", "../../lib/ai/evolutionCandidate/repository.ts"];
  const forbiddenStatuses = ["APPROVED", "ACTIVE", "DEPLOYED", "PRODUCTION_MUTATED"];
  let found: string[] = [];
  for (const f of files) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const status of forbiddenStatuses) if (source.includes(`"${status}"`)) found.push(`${f}:${status}`);
  }
  check("15. No file in lib/ai/evolutionCandidate contains APPROVED/ACTIVE/DEPLOYED/PRODUCTION_MUTATED as a literal", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const files = ["../../lib/ai/evolutionCandidate/create.ts", "../../lib/ai/evolutionCandidate/replay.ts", "../../lib/ai/evolutionCandidate/repository.ts"];
  const forbiddenImports = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', 'from "@/lib/ai/oracle/risk', "fetch(", "Date.now(", "Math.random(", "openai", "anthropic", "execSync", "child_process", "octokit", "github", "vercel", "telegram"];
  let found: string[] = [];
  for (const f of files) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const token of forbiddenImports) if (source.toLowerCase().includes(token.toLowerCase())) found.push(`${f}:${token}`);
  }
  check("16. No candidate/replay file imports qualification/arbitration/execution/risk, calls an LLM, shells out, or touches GitHub/Vercel/Telegram", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const qualifySource = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");
  const executeSource = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  check(
    "17. qualify.ts and execute.ts import neither evolutionCandidate nor evolutionValidation — candidates never touch the live decision path",
    !qualifySource.includes("evolutionCandidate") && !qualifySource.includes("evolutionValidation") && !executeSource.includes("evolutionCandidate") && !executeSource.includes("evolutionValidation"),
    "one of qualify.ts/execute.ts references the new 8.6.5-8.6.6 modules"
  );
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Evolution Candidate + Replay Engine fixtures passed.`);
if (failures > 0) process.exit(1);
