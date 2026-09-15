// ---------------------------------------------------------------------------
// Phase 8.6.4 — Evolution Proposal Engine + Self-Evaluation fixtures
// (dev-only). Pure/offline — exercises propose.ts + build.ts only
// (repository.ts requires a live Learning DB and is not exercised here).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-proposal-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import { buildSelfEvaluationSummary } from "@/lib/ai/selfEvaluation/build";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { GapCategory, GapSeverity, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { EvolutionNeed, EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { EvaluationCoverageReport, SelfPerformanceAggregate } from "@/lib/ai/selfPerformance/contracts";
import type { NoveltyAssessment } from "@/lib/ai/noveltyDetection/contracts";

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

function gap(category: GapCategory, severity: GapSeverity): CognitiveGap {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    category,
    severity,
    evidence: { occurrenceCount: MIN_OCCURRENCE_COUNT, evaluatedCount: 20, triggeringTags: [] },
    reasons: [`fixture reason for ${category}`],
  };
}

function need(value: EvolutionNeed, gaps: readonly CognitiveGap[] = []): EvolutionNeedAssessment {
  return { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", need: value, consideredGaps: gaps, hasValidConstraint: false, reasons: ["fixture"] };
}

// ---------------------------------------------------------------------------
// draftEvolutionProposals
// ---------------------------------------------------------------------------

{
  const proposals = draftEvolutionProposals(need("NO_EVOLUTION_NEEDED"));
  check("1. NO_EVOLUTION_NEEDED (no gap) -> zero proposals", proposals.length === 0, JSON.stringify(proposals));
}

{
  const proposals = draftEvolutionProposals(need("MONITOR", [gap("PATTERN_GAP", "LOW")]));
  check("2. MONITOR (weak gap) -> zero proposals", proposals.length === 0, JSON.stringify(proposals));
}

{
  const proposals = draftEvolutionProposals(need("INSUFFICIENT_EVIDENCE"));
  check("2b. INSUFFICIENT_EVIDENCE -> zero proposals", proposals.length === 0, JSON.stringify(proposals));
}

{
  const proposals = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTRADICTION_GAP", "HIGH")]));
  check("3. EVOLUTION_WARRANTED -> exactly one DRAFT proposal", proposals.length === 1 && proposals[0].status === "DRAFT", JSON.stringify(proposals));
}

{
  const [proposal] = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTRADICTION_GAP", "HIGH")]));
  check("4. Proposal contains evidence (occurrenceCount/evaluatedCount carried through verbatim)", proposal.evidence.occurrenceCount === MIN_OCCURRENCE_COUNT && proposal.evidence.evaluatedCount === 20, JSON.stringify(proposal.evidence));
}

{
  const [proposal] = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("PATTERN_GAP", "HIGH")]));
  check(
    "5. proposedChange describes investigation, never a directly-executable instruction (no numeric threshold change, matches the GOOD example)",
    proposal.proposedChange.toLowerCase().startsWith("investigate") && !/\b\d+\s*(to|->)\s*\d+\b/.test(proposal.proposedChange),
    proposal.proposedChange
  );
}

{
  const a = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTRADICTION_GAP", "HIGH")]))[0];
  const b = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTRADICTION_GAP", "HIGH")]))[0];
  check("6. Deterministic identity — same source/symbol/category always produces the same proposalId", a.proposalId === b.proposalId && a.proposalId === "ELVOID_PRO_ORACLE:BTCUSDT:CONTRADICTION_GAP", `${a.proposalId} vs ${b.proposalId}`);
}

{
  const [proposal] = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTEXT_GAP", "HIGH")]));
  check("7. Proposal carries an explicit, static proposalVersion (deterministic identity requirement)", proposal.proposalVersion === 1, String(proposal.proposalVersion));
}

{
  const proposals = draftEvolutionProposals(need("EVOLUTION_WARRANTED", [gap("CONTRADICTION_GAP", "HIGH"), gap("PATTERN_GAP", "MEDIUM")]));
  check("8. One proposal drafted per considered gap category", proposals.length === 2 && new Set(proposals.map((p) => p.gapCategory)).size === 2, JSON.stringify(proposals.map((p) => p.gapCategory)));
}

// ---------------------------------------------------------------------------
// buildSelfEvaluationSummary — OBSERVED/INFERRED/UNKNOWN
// ---------------------------------------------------------------------------

{
  const performance: SelfPerformanceAggregate = {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    totalEvaluated: 20,
    evaluationClassCounts: { GOOD_DECISION_GOOD_OUTCOME: 20, GOOD_DECISION_BAD_OUTCOME: 0, BAD_DECISION_GOOD_OUTCOME: 0, BAD_DECISION_BAD_OUTCOME: 0, NEUTRAL_OUTCOME: 0, INSUFFICIENT_EVIDENCE: 0 },
    decisionQualityCounts: { GOOD: 20, BAD: 0, UNKNOWN: 0 },
    marketOutcomeCounts: { POSITIVE: 20, NEGATIVE: 0, NEUTRAL: 0, UNKNOWN: 0 },
    confidenceAlignmentCounts: { ALIGNED: 20, MISALIGNED: 0, UNKNOWN: 0 },
  };
  const coverage: EvaluationCoverageReport = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", closedExperienceCount: 20, evaluatedExperienceCount: 20, unevaluatedExperienceCount: 0, coverageRatio: 1, status: "COMPLETE" };
  const familiarity: NoveltyAssessment = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", classification: "FAMILIAR", matchedExperienceCount: MIN_OCCURRENCE_COUNT, matchedPatternCount: 0, retrievalAvailable: true, reasons: ["fixture"] };
  const summary = buildSelfEvaluationSummary("ELVOID_PRO_ORACLE", "BTCUSDT", performance, coverage, { familiarity, relevantEvidenceTags: [] }, [], [], need("NO_EVOLUTION_NEEDED"));

  check("9. performance/coverage/familiarity/cognitiveGaps/reasoningGaps are tagged OBSERVED", summary.performance.certainty === "OBSERVED" && summary.coverage.certainty === "OBSERVED" && summary.familiarity.certainty === "OBSERVED" && summary.cognitiveGaps.certainty === "OBSERVED" && summary.reasoningGaps.certainty === "OBSERVED", JSON.stringify(summary));
  check("10. evolutionNeed is tagged INFERRED (a derived conclusion, not a raw fact)", summary.evolutionNeed.certainty === "INFERRED", summary.evolutionNeed.certainty);
  check("11. historicalNovelty remains UNKNOWN with null data — never converted into a conclusion", summary.historicalNovelty.certainty === "UNKNOWN" && summary.historicalNovelty.data === null, JSON.stringify(summary.historicalNovelty));
}

// ---------------------------------------------------------------------------
// Static scope audit
// ---------------------------------------------------------------------------

{
  const source = readFileSync(new URL("../../lib/ai/evolutionProposal/propose.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbiddenImports = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', "fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", "openai", "anthropic"];
  const found = forbiddenImports.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check(
    "12. propose.ts imports none of: oracle/arbitration, autonomousExecution, decisionQualification, and contains no fetch/Date.now/Math.random/Supabase/LLM-call (comments excluded) — a proposal never executes anything. The word \"arbitration\" DOES appear in this file, inside validationRequirements prose (\"Human review before any qualification/arbitration change\") — that is a safety reminder in generated text, not a code dependency, so this check looks for an actual import, not the bare word.",
    found.length === 0,
    `found: ${found.join(", ")}`
  );
}

{
  const qualifySource = readFileSync(new URL("../../lib/ai/decisionQualification/qualify.ts", import.meta.url), "utf8");
  const executeSource = readFileSync(new URL("../../lib/ai/autonomousExecution/execute.ts", import.meta.url), "utf8");
  check(
    "13. qualify.ts and execute.ts import neither evolutionProposal nor evolutionNeed nor cognitiveGap — proposals never modify qualification/risk/execution",
    !qualifySource.includes("evolutionProposal") && !qualifySource.includes("evolutionNeed") && !qualifySource.includes("cognitiveGap") && !executeSource.includes("evolutionProposal") && !executeSource.includes("evolutionNeed") && !executeSource.includes("cognitiveGap"),
    "one of qualify.ts/execute.ts references the new 8.6.2-8.6.4 modules"
  );
}

{
  const proposalSource = readFileSync(new URL("../../lib/ai/evolutionProposal/contracts.ts", import.meta.url), "utf8");
  const forbiddenStatuses = ["APPROVED", "ACTIVE", "DEPLOYED"];
  const found = forbiddenStatuses.filter((status) => proposalSource.includes(`"${status}"`));
  check("14. ProposalStatus never includes APPROVED/ACTIVE/DEPLOYED — those belong to a later, separately-approved phase", found.length === 0, `found: ${found.join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Evolution Proposal Engine + Self-Evaluation fixtures passed.`);
if (failures > 0) process.exit(1);
