// ---------------------------------------------------------------------------
// Phase 8.6.3 — Evolution Need Evaluator + Reasoning Gap fixtures
// (dev-only). Pure/offline — exercises evaluate.ts + derive.ts only.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-need-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { evaluateEvolutionNeed } from "@/lib/ai/evolutionNeed/evaluate";
import { deriveReasoningGapObservations } from "@/lib/ai/reasoningGap/derive";
import { MIN_OCCURRENCE_COUNT } from "@/lib/ai/failurePatterns/detect";
import type { DecisionSource, GapCategory, GapSeverity, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { EvaluationCoverageReport, EvaluationCoverageStatus } from "@/lib/ai/selfPerformance/contracts";

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

function coverage(status: EvaluationCoverageStatus, closedExperienceCount = 20): EvaluationCoverageReport {
  return {
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    closedExperienceCount,
    evaluatedExperienceCount: status === "COMPLETE" ? closedExperienceCount : Math.max(0, closedExperienceCount - 2),
    unevaluatedExperienceCount: status === "COMPLETE" ? 0 : 2,
    coverageRatio: status === "COMPLETE" ? 1 : 0.8,
    status,
  };
}

function gap(category: GapCategory, severity: GapSeverity, overrides: { source?: DecisionSource; symbol?: string; occurrenceCount?: number } = {}): CognitiveGap {
  return {
    source: overrides.source ?? "ELVOID_PRO_ORACLE",
    symbol: overrides.symbol ?? "BTCUSDT",
    category,
    severity,
    evidence: { occurrenceCount: overrides.occurrenceCount ?? MIN_OCCURRENCE_COUNT, evaluatedCount: 20, triggeringTags: [] },
    reasons: [`fixture reason for ${category}`],
  };
}

// ---------------------------------------------------------------------------
// evaluateEvolutionNeed
// ---------------------------------------------------------------------------

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("INSUFFICIENT_DATA", 3), [gap("PATTERN_GAP", "HIGH")], false);
  check("1. Insufficient evaluation coverage -> INSUFFICIENT_EVIDENCE (conservative), gaps not considered even if present", result.need === "INSUFFICIENT_EVIDENCE" && result.consideredGaps.length === 0, JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [], false);
  check("2. Sufficient coverage, zero gaps -> NO_EVOLUTION_NEEDED", result.need === "NO_EVOLUTION_NEEDED", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "LOW")], false);
  check("3. Single failure/single low-severity gap -> MONITOR, never EVOLUTION_WARRANTED (a single bad outcome must never trigger evolution)", result.need === "MONITOR", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH")], false);
  check("4. Repeated failure reaching HIGH severity, no addressing constraint -> EVOLUTION_WARRANTED", result.need === "EVOLUTION_WARRANTED", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "MEDIUM"), gap("CONTRADICTION_GAP", "MEDIUM")], false);
  check("4b. Two independently active categories (neither HIGH alone) -> EVOLUTION_WARRANTED", result.need === "EVOLUTION_WARRANTED", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "LOW")], true);
  check("5. Existing VALID constraint already addresses the (only, non-HIGH) gap -> MONITOR, not EVOLUTION_WARRANTED", result.need === "MONITOR", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH")], true);
  check("5b. Existing VALID constraint does NOT hold back a HIGH-severity gap -> still EVOLUTION_WARRANTED", result.need === "EVOLUTION_WARRANTED", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("CONTRADICTION_GAP", "HIGH")], false);
  check("6. Repeated contradiction reaching HIGH -> EVOLUTION_WARRANTED", result.need === "EVOLUTION_WARRANTED" && result.consideredGaps[0].category === "CONTRADICTION_GAP", JSON.stringify(result));
}

{
  const result = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("CONFIDENCE_ALIGNMENT_GAP", "HIGH")], false);
  check("7. Confidence alignment mismatch reaching HIGH -> EVOLUTION_WARRANTED", result.need === "EVOLUTION_WARRANTED" && result.consideredGaps[0].category === "CONFIDENCE_ALIGNMENT_GAP", JSON.stringify(result));
}

{
  const a = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH", { source: "ELVOID_PRO_ORACLE" })], false);
  const b = evaluateEvolutionNeed("AI_SIGNAL", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH", { source: "AI_SIGNAL" })], false);
  check("8. Source isolation — source is carried through verbatim, never inferred/pooled", a.source === "ELVOID_PRO_ORACLE" && b.source === "AI_SIGNAL", `${a.source} / ${b.source}`);
}

{
  const a = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "BTCUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH", { symbol: "BTCUSDT" })], false);
  const b = evaluateEvolutionNeed("ELVOID_PRO_ORACLE", "ETHUSDT", coverage("COMPLETE"), [gap("PATTERN_GAP", "HIGH", { symbol: "ETHUSDT" })], false);
  check("9. Symbol isolation — symbol is carried through verbatim, never inferred/pooled", a.symbol === "BTCUSDT" && b.symbol === "ETHUSDT", `${a.symbol} / ${b.symbol}`);
}

// ---------------------------------------------------------------------------
// deriveReasoningGapObservations
// ---------------------------------------------------------------------------

{
  const gaps = [gap("CONTRADICTION_GAP", "HIGH"), gap("PATTERN_GAP", "HIGH"), gap("CONFIDENCE_ALIGNMENT_GAP", "MEDIUM")];
  const observations = deriveReasoningGapObservations(gaps);
  check(
    "10. Only the 4 reasoning-related categories are included — PATTERN_GAP and CONFIDENCE_ALIGNMENT_GAP are excluded",
    observations.length === 1 && observations[0].category === "CONTRADICTION_GAP",
    JSON.stringify(observations.map((o) => o.category))
  );
}

{
  const observations = deriveReasoningGapObservations([gap("CONTEXT_GAP", "HIGH")]);
  check(
    "11. Statement uses the required vocabulary (\"Observed reasoning gap\", \"Candidate reasoning weakness\") and never a causal claim",
    observations[0].statement.startsWith("Observed reasoning gap:") && observations[0].statement.includes("Candidate reasoning weakness") && !observations[0].statement.toLowerCase().includes("caused"),
    observations[0].statement
  );
}

{
  const g = gap("REASONING_CONSISTENCY_GAP", "MEDIUM");
  const observations = deriveReasoningGapObservations([g]);
  check("12. sourceGap is carried through verbatim (same evidence, not re-derived)", observations[0].sourceGap === g, JSON.stringify(observations[0].sourceGap));
}

{
  const observations = deriveReasoningGapObservations([]);
  check("13. Empty gap list -> empty observation list", observations.length === 0, JSON.stringify(observations));
}

// ---------------------------------------------------------------------------
// Static scope audit
// ---------------------------------------------------------------------------

{
  const source = readFileSync(new URL("../../lib/ai/evolutionNeed/evaluate.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["fetch(", "Date.now(", "Math.random(", "Supabase", "supabase", "openai", "anthropic"];
  const found = forbidden.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check("14. evaluate.ts contains none of: fetch/Date.now/Math.random/Supabase/LLM-call (comments excluded)", found.length === 0, `found: ${found.join(", ")}`);
}

{
  const source = readFileSync(new URL("../../lib/ai/reasoningGap/derive.ts", import.meta.url), "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = ["caused", "causes", "because it", "therefore it"];
  const found = forbidden.filter((token) => withoutComments.toLowerCase().includes(token.toLowerCase()));
  check("15. derive.ts source contains no causal-claim language in its templates", found.length === 0, `found: ${found.join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Evolution Need Evaluator + Reasoning Gap fixtures passed.`);
if (failures > 0) process.exit(1);
