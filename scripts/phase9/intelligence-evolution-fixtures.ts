// ---------------------------------------------------------------------------
// Phase 9 FINAL — intelligence rewire + evolution monitoring fixtures.
// Dev-only, offline, no network/DB. Exercises the REAL exported functions plus
// the actual source text of the wiring. Cannot exercise: live Supabase rows,
// live provider APIs, live GitHub Actions / Telegram / Vercel.
//
// Usage:
//   node --experimental-strip-types --no-warnings --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/intelligence-evolution-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { assembleWithCompose, buildUnavailableMacroContext, mapCompletenessToAvailability, mapRiskEnvironmentToEventRisk, toOracleMacroContext } from "@/lib/ai/economicIntelligence/oracleMacroPure";
import { buildUnavailableEventImpact, safeAnalyzeEventImpact } from "@/lib/ai/economicIntelligence/failClosed";
import { validatePreEntry } from "@/lib/ai/preEntryValidation/validate";
import { buildCandidateMonitoring, deriveNextGate } from "@/lib/ai/evolutionCandidate/monitoring";
import { mergeApprovedBranch } from "@/lib/ai/evolutionGit/pushChange";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail = "") {
  if (pass) passed += 1; else failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const src = (p: string) => readFileSync(p, "utf8");
const ASOF = "2026-09-29T00:00:00.000Z";

async function main() {
  // --- 1. normalization / mapping ---
  check("1a. HIGH completeness -> AVAILABLE", mapCompletenessToAvailability("HIGH") === "AVAILABLE");
  check("1b. MEDIUM/LIMITED -> PARTIAL (never looser)", mapCompletenessToAvailability("MEDIUM") === "PARTIAL" && mapCompletenessToAvailability("LIMITED") === "PARTIAL");
  check("1c. UNAVAILABLE/undefined -> UNAVAILABLE", mapCompletenessToAvailability("UNAVAILABLE") === "UNAVAILABLE" && mapCompletenessToAvailability(undefined) === "UNAVAILABLE");
  const risks = ["RISK_ON_SUPPORTIVE", "RISK_OFF_PRESSURE", "CAUTIOUS", "MIXED", "TRANSITIONING", "INSUFFICIENT_DATA", undefined] as const;
  check("1d. riskEnvironment never maps to ELEVATED (no invented global event risk / no new BLOCK)", risks.every((r) => mapRiskEnvironmentToEventRisk(r as never) !== "ELEVATED"));
  check("1e. INSUFFICIENT_DATA -> UNKNOWN risk", mapRiskEnvironmentToEventRisk("INSUFFICIENT_DATA") === "UNKNOWN");

  // --- 2. provider unavailable / failure ---
  const thrown = await assembleWithCompose(ASOF, async () => { throw new Error("FRED down"); });
  check("2a. compose throw -> explicit UNAVAILABLE macro (not null)", thrown.dataAvailability === "UNAVAILABLE" && !!thrown.failureReason && thrown.eventRisk === "UNKNOWN");
  const emptyCal = await assembleWithCompose(ASOF, async (i) => ({ version: 1, generatedAt: i.asOf, dataAvailability: "AVAILABLE", usableEventCount: 5, totalEventCount: 5, macroRegime: "EVENT_HEAVY", eventRisk: "ELEVATED", eventProximity: "IMMINENT", upcomingHighImpactEvent: { title: "FOMC", date: ASOF, impact: "high", hoursAway: 1, proximity: "IMMINENT" }, directionalBias: null, dataCompleteness: "LIMITED", riskEnvironment: "CAUTIOUS" }));
  check("2b. every calendar-derived field is overwritten (no FF leakage)", emptyCal.upcomingHighImpactEvent === null && emptyCal.eventRisk === "LOW" && emptyCal.macroRegime === "UNKNOWN" && emptyCal.totalEventCount === 0 && emptyCal.dataAvailability === "PARTIAL");
  const passedInput: { calendar?: readonly unknown[] } = {};
  await assembleWithCompose(ASOF, async (i) => { passedInput.calendar = i.calendar; return buildUnavailableMacroContext(i.asOf, "x"); });
  check("2c. compose is always called with an EMPTY calendar", Array.isArray(passedInput.calendar) && passedInput.calendar.length === 0);
  check("2d. toOracleMacroContext tags source", toOracleMacroContext(buildUnavailableMacroContext(ASOF, "r")).oracleSource === "ECONOMIC_INTELLIGENCE");

  // --- 3. event impact fail-closed ---
  const ei = safeAnalyzeEventImpact({ asOf: ASOF, macro: null as never, news: [] });
  check("3a. analyzeEventImpact throw -> explicit UNAVAILABLE (not silent)", ei.macroAvailability === "UNAVAILABLE" && ei.newsAvailability === "UNAVAILABLE" && ei.eventState === "UNKNOWN" && !!(ei as { failureReason?: string }).failureReason);

  // --- 4. Oracle pre-entry never VALID on unavailable intelligence ---
  const qual = { status: "QUALIFIED", signals: {} } as never;
  const ctx = { assessment: { riskValid: true } } as never;
  const macroU = buildUnavailableMacroContext(ASOF, "r");
  const eiU = buildUnavailableEventImpact(ASOF, "r");
  let statusU: string | null = null;
  try { statusU = validatePreEntry({ decisionContext: ctx, qualification: qual, macro: macroU, eventImpact: eiU, externalIntelligence: null } as never).status; } catch (e) { statusU = "THREW:" + (e as Error).message; }
  check("4a. UNAVAILABLE macro+eventImpact => pre-entry is not VALID (so cannot EXECUTE)", statusU !== "VALID" && !String(statusU).startsWith("THREW"), String(statusU));

  // --- 5. no ForexFactory dependency in Oracle decision path ---
  const orch = src("lib/ai/autonomousRuntime/orchestrator.ts").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
  const batch = src("lib/ai/autonomousRuntime/batch.ts");
  check("5a. orchestrator no longer imports/calls analyzeMacroIntelligence or the calendar", !/analyzeMacroIntelligence\s*\(/.test(orch) && !/from "@\/lib\/ai\/macroIntelligence\/analyze"/.test(orch) && !/economiccalendar/.test(orch));
  check("5b. batch no longer fetches the ForexFactory calendar", !/economiccalendar|getEconomicCalendar/.test(batch.replace(/\/\/.*$/gm, "")));
  check("5c. orchestrator uses safeAnalyzeEventImpact + assembleOracleMacroContext", /safeAnalyzeEventImpact\(/.test(orch) && /assembleOracleMacroContext/.test(orch));
  for (const f of ["lib/ai/economicIntelligence/oracleMacro.ts", "lib/ai/economicIntelligence/oracleMacroPure.ts", "lib/ai/economicIntelligence/failClosed.ts"]) {
    check(`5d. ${f} has no calendar/ForexFactory import`, !/^import .*(economiccalendar|forexFactory|macroEvents)/m.test(src(f)));
  }

  // --- 6. candidate monitoring (real-data-only, no fabrication) ---
  check("6a. no Learning DB -> MONITORING_UNAVAILABLE", buildCandidateMonitoring([], false).status === "MONITORING_UNAVAILABLE");
  check("6b. DB configured, no candidates -> NO_ACTIVE_CANDIDATE (never a fake PASS)", buildCandidateMonitoring([{ symbol: "BTCUSDT", candidates: [] }], true).status === "NO_ACTIVE_CANDIDATE");
  const entry = { symbol: "BTCUSDT", proposals: [{ proposalId: "P1", evidence: { occurrenceCount: 7, evaluatedCount: 20 } }], candidates: [{ candidate: { candidateId: "C1", proposalId: "P1", gapCategory: "OVERCONFIDENCE", status: "REPLAY_PASSED", createdAt: "2026-09-29T00:00:00Z" }, validation: { result: "VALID", gates: [{ passed: true }, { passed: true }, { passed: false }] }, approval: { status: "AWAITING_HUMAN_APPROVAL" } }] };
  const view = buildCandidateMonitoring([entry], true);
  const row = view.candidates[0];
  check("6c. proposal -> candidate -> validation lineage preserved on the row", view.status === "ACTIVE_CANDIDATES" && row.candidateId === "C1" && row.proposalId === "P1" && row.occurrenceCount === 7 && row.gatesPassed === 2 && row.gatesEvaluated === 3 && row.validationState === "VALID");
  check("6d. confidence is null when the source has none (not invented)", row.confidence === null);
  check("6e. VALID + awaiting => next gate is HUMAN_APPROVAL_1", row.nextGate === "HUMAN_APPROVAL_1");
  check("6f. rejected => stop; INVALID => blocked; approved => artifact stage", deriveNextGate("VALID", "HUMAN_REJECTED") === "HUMAN_REJECTED_STOP" && deriveNextGate("INVALID", null) === "BLOCKED_VALIDATION_FAILED" && deriveNextGate("VALID", "HUMAN_APPROVED") === "CHANGE_ARTIFACT_AND_PATCH");
  const dedup = buildCandidateMonitoring([entry, entry], true);
  check("6g. (documented) monitoring view does NOT dedupe — dedup is the candidate_id upsert key in persistence", dedup.candidates.length === 2 && /onConflict: "candidate_id"/.test(src("lib/ai/evolutionCandidate/repository.ts")));

  // --- 7. Phase 9 gaps ---
  const noSha = await mergeApprovedBranch({ owner: "o", repo: "r", token: "t", baseBranch: "main" } as never, "h".repeat(64), "P1", "elvoid/phase9/x", "not-a-sha");
  check("7a. merge refuses a missing/malformed pinned SHA (no network call made)", noSha.outcome === "MERGE_FAILED");
  const push = src("lib/ai/evolutionGit/pushChange.ts");
  check("7b. merge head is the pinned commit SHA, not the branch name", /mergeBranch\(config, config\.baseBranch, pinnedCommitSha,/.test(push));
  check("7c. authorization passes run.commitSha to the merge", /mergeApprovedBranch\(gitConfig, run\.recordHash, run\.proposalId, run\.branch, run\.commitSha\)/.test(src("lib/ai/evolutionPipeline/authorization.ts")));
  check("7d. Telegram approval route declares maxDuration", /export const maxDuration = \d+/.test(src("app/api/ai-performance/approvals/telegram/route.ts")));
  const auth = src("lib/ai/evolutionPipeline/authorization.ts");
  check("7e. authorization still requires CI SUCCESS + unchanged head before merge (fail closed)", /ci\.state !== "SUCCESS" \|\| headSha !== run\.commitSha/.test(auth));

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
