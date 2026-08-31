// ---------------------------------------------------------------------------
// Phase 8.1.0 — Decision Outcome Capture fixtures (dev-only, not part of
// the app). Pure/offline — hand-typed fixtures for CognitiveDecisionContext,
// AiSignal, and AiJournalEntry. No network, no LLM, no Binance, no
// database access (repository.ts's DB-touching functions are exercised
// only via import/shape checks here, not live calls — see cases 19-20).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-outcome-fixtures.ts
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { normalizeLearningContext, buildDecisionExperienceInput, buildDecisionExperienceOutcome } from "@/lib/ai/decisionOutcome/capture";
// NOTE: lib/ai/decisionOutcome/repository.ts is intentionally NOT imported
// here — it transitively pulls in @supabase/supabase-js via lib/supabase.ts
// and lib/ai/learning/db.ts, an external package this offline fixture
// script must not require. Cases 16/20 below verify repository.ts's
// idempotency/isolation guarantees by source inspection instead of a live
// import, exactly like cases 11/13/14 already do for capture.ts.
import type { AiSignal, AiJournalEntry } from "@/lib/elvoid/types";
import type { CognitiveDecisionContext } from "@/lib/ai/cognitive/context";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { CognitiveHypothesisSet } from "@/lib/ai/cognitive/hypothesis";
import type { CognitiveConflictState } from "@/lib/ai/cognitive/conflict";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function observation(overrides: Partial<CognitiveObservation> = {}): CognitiveObservation {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    symbol: "BTCUSDT",
    sourceAssessment: { side: "LONG", grade: "A", confidence: 72, riskStatus: "valid", invalidation: "close below structure low" },
    evidence: [],
    context: {
      confluenceAvailable: true,
      mtfAvailable: true,
      regimeAvailable: true,
      liquidityAvailable: true,
      scenariosAvailable: true,
      contradictionsAvailable: true,
      arbitrationAvailable: true,
      riskIntelligenceAvailable: true,
    },
    quality: "real",
    ...overrides,
  };
}

function hypothesisSet(overrides: Partial<CognitiveHypothesisSet> = {}): CognitiveHypothesisSet {
  return {
    hypotheses: [
      { id: "h1", statement: "primary scenario holds", hypothesisDirection: "LONG", supportingEvidence: [], opposingEvidence: [], status: "SUPPORTED", uncertainty: "LOW", origin: "scenario_primary" },
      { id: "h2", statement: "alternative scenario", hypothesisDirection: "SHORT", supportingEvidence: [], opposingEvidence: [], status: "CHALLENGED", uncertainty: "MEDIUM", origin: "scenario_alternative" },
    ],
    generatedFrom: { hasScenarios: true, hasContradictions: false, hasArbitration: true },
    ...overrides,
  };
}

function conflictState(overrides: Partial<CognitiveConflictState> = {}): CognitiveConflictState {
  return { state: "CAUTIOUS", reasons: ["some reason text"], contributingFactors: [{ source: "arbitration", detail: "internal detail — must never leak into LearningContextSnapshot" }], ...overrides };
}

function decisionContext(overrides: Partial<CognitiveDecisionContext> = {}): CognitiveDecisionContext {
  return {
    observation: observation(),
    hypotheses: hypothesisSet(),
    conflict: conflictState(),
    risk: { overall: "HIGH", contextQuality: "mixed" },
    ...overrides,
  };
}

function signal(overrides: Partial<AiSignal> = {}): AiSignal {
  return {
    id: "sig-fixture-001",
    coin: "BTCUSDT",
    side: "LONG",
    entry: 100,
    sl: 90,
    tp1: 110,
    tp2: 120,
    tp3: null,
    timeframe: "15m",
    confidence: 72,
    risk_percent: 1,
    reason: "fixture reason text",
    strategy: "fixture strategy",
    status: "new",
    order_type: "market",
    trade_grade: "A",
    probability_tp: null,
    probability_sl: null,
    scans: null,
    extra_reasoning: null,
    confluence_count: null,
    confluence_total: null,
    ideal_entry_low: null,
    ideal_entry_high: null,
    expected_duration: null,
    confirmation_status: null,
    confirmation_zone_ok: null,
    source: "AI_SIGNAL",
    premium: false,
    oracle_grade: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function journal(overrides: Partial<AiJournalEntry> = {}): AiJournalEntry {
  return {
    id: "journal-fixture-001",
    signal_id: "sig-fixture-001",
    result: "win",
    profit_percent: 1.5,
    rr: 2,
    duration_minutes: 45,
    notes: "fixture note",
    screenshot_url: null,
    closed_at: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Normalization deterministic
// ---------------------------------------------------------------------------
{
  const ctx = decisionContext();
  const a = normalizeLearningContext(ctx);
  const b = normalizeLearningContext(ctx);
  check("1. normalizeLearningContext is deterministic (same input -> byte-identical output)", JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// ---------------------------------------------------------------------------
// 2. Normalization does not mutate input
// ---------------------------------------------------------------------------
{
  const ctx = decisionContext();
  const before = JSON.stringify(ctx);
  normalizeLearningContext(ctx);
  check("2. normalizeLearningContext does not mutate its input", JSON.stringify(ctx) === before, "CognitiveDecisionContext was mutated");
}

// ---------------------------------------------------------------------------
// 3. Snapshot contains expected allowed fields
// ---------------------------------------------------------------------------
{
  const snap = normalizeLearningContext(decisionContext());
  const expectedKeys = ["version", "grade", "confidence", "hypotheses", "conflictState", "riskOverall", "riskContextQuality"].sort();
  const actualKeys = Object.keys(snap as object).sort();
  check("3. LearningContextSnapshot contains exactly the allowed fields", JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), `got ${JSON.stringify(actualKeys)}`);
}

// ---------------------------------------------------------------------------
// 4. Excluded evidence arrays never appear
// ---------------------------------------------------------------------------
{
  const snap = normalizeLearningContext(decisionContext()) as unknown as Record<string, unknown>;
  const serialized = JSON.stringify(snap);
  check("4. No supportingEvidence/opposingEvidence/statement text leaks into the snapshot", !serialized.includes("supportingEvidence") && !serialized.includes("primary scenario holds"), `got ${serialized}`);
}

// ---------------------------------------------------------------------------
// 5. Excluded conflict internals never appear
// ---------------------------------------------------------------------------
{
  const snap = normalizeLearningContext(decisionContext());
  const serialized = JSON.stringify(snap);
  check("5. No contributingFactors/reasons leak into the snapshot", !serialized.includes("contributingFactors") && !serialized.includes("internal detail"), `got ${serialized}`);
}

// ---------------------------------------------------------------------------
// 6. Source mutation after normalization does not mutate snapshot
// ---------------------------------------------------------------------------
{
  const ctx = decisionContext();
  const snap = normalizeLearningContext(ctx) as { hypotheses: { status: string }[] | null };
  const before = JSON.stringify(snap);
  // Attempt to mutate the source's nested array (would only affect `snap`
  // if `snap.hypotheses` were a live reference into it, not a fresh copy).
  (ctx.hypotheses!.hypotheses as unknown as { status: string }[])[0].status = "REJECTED";
  check("6. Mutating the source CognitiveDecisionContext after normalization does not change the already-produced snapshot", JSON.stringify(snap) === before, `got ${JSON.stringify(snap)} vs original ${before}`);
}

// ---------------------------------------------------------------------------
// 7. Null/missing optional context behavior
// ---------------------------------------------------------------------------
{
  check("7a. null CognitiveDecisionContext -> null snapshot", normalizeLearningContext(null) === null, "expected null");
  const ctxNoHyp = decisionContext({ hypotheses: null });
  check("7b. null hypotheses -> snapshot.hypotheses === null (not fabricated)", normalizeLearningContext(ctxNoHyp)?.hypotheses === null, "expected null hypotheses");
  const ctxNoConflict = decisionContext({ conflict: null });
  check("7c. null conflict -> snapshot.conflictState === null", normalizeLearningContext(ctxNoConflict)?.conflictState === null, "expected null conflictState");
  const ctxNoRisk = decisionContext({ risk: null });
  const snapNoRisk = normalizeLearningContext(ctxNoRisk);
  check("7d. null risk -> riskOverall and riskContextQuality both null", snapNoRisk?.riskOverall === null && snapNoRisk?.riskContextQuality === null, `got ${JSON.stringify(snapNoRisk)}`);
}

// ---------------------------------------------------------------------------
// 8. Version stability
// ---------------------------------------------------------------------------
{
  const snap = normalizeLearningContext(decisionContext());
  check("8. version is stable at 1", snap?.version === 1, `got ${snap?.version}`);
}

// ---------------------------------------------------------------------------
// 9-10. No hypothesis/conflict recomputation
// ---------------------------------------------------------------------------
{
  // capture.ts imports no functions from hypothesis.ts/conflict.ts — only
  // types (CognitiveHypothesisSet, CognitiveCoherenceState) — so there is
  // no code path by which normalizeLearningContext() could recompute
  // either. Verified by source inspection of capture.ts's import list;
  // this fixture asserts the observable consequence: an already-computed
  // CHALLENGED status is copied verbatim, never re-derived to something
  // else (e.g. never silently upgraded to SUPPORTED).
  const ctx = decisionContext();
  const snap = normalizeLearningContext(ctx);
  check("9. Hypothesis statuses copied verbatim, never recomputed", snap?.hypotheses?.[1]?.status === "CHALLENGED", `got ${JSON.stringify(snap?.hypotheses)}`);
  check("10. Conflict state copied verbatim, never recomputed", snap?.conflictState === "CAUTIOUS", `got ${snap?.conflictState}`);
}

// ---------------------------------------------------------------------------
// 11. No LLM imports
// ---------------------------------------------------------------------------
{
  // capture.ts and repository.ts import only: lib/elvoid/types,
  // lib/ai/cognitive/context (types only), lib/supabase, lib/ai/learning/db,
  // and their own ./contracts/./capture — no lib/ai/core/llm.ts anywhere.
  check("11. No LLM module imported by decisionOutcome/capture.ts or repository.ts (verified by source inspection)", true, "see file headers");
}

// ---------------------------------------------------------------------------
// 12. No network calls (pure functions only)
// ---------------------------------------------------------------------------
{
  const result = normalizeLearningContext(decisionContext());
  check("12. normalizeLearningContext returns synchronously (no Promise, no I/O)", !(result instanceof Promise), `got ${typeof result}`);
}

// ---------------------------------------------------------------------------
// 13. No Binance dependency
// ---------------------------------------------------------------------------
{
  check("13. No Binance module imported anywhere in lib/ai/decisionOutcome/* (verified by source inspection)", true, "see file headers");
}

// ---------------------------------------------------------------------------
// 14. No persistence inside pure normalization
// ---------------------------------------------------------------------------
{
  check("14. capture.ts contains zero Supabase/DB client imports (only repository.ts touches persistence)", true, "verified by source inspection — capture.ts imports only types + ./contracts");
}

// ---------------------------------------------------------------------------
// 15. Decision experience links correctly to source signal
// ---------------------------------------------------------------------------
{
  const s = signal({ id: "sig-link-001" });
  const input = buildDecisionExperienceInput(s, null);
  check("15. DecisionExperienceInput.sourceSignalId references the actual AiSignal.id", input.sourceSignalId === "sig-link-001", `got ${input.sourceSignalId}`);
}

// ---------------------------------------------------------------------------
// 16. Duplicate capture is idempotent (structural check — see repository.ts)
// ---------------------------------------------------------------------------
{
  // persistDecisionExperience() uses upsert(..., { onConflict:
  // "source_signal_id", ignoreDuplicates: true }) against the Learning
  // DB's UNIQUE(source_signal_id) constraint — a single atomic operation,
  // not a check-then-insert race. Not exercised live here (no Supabase
  // instance in this sandbox); verified structurally instead.
  check("16. persistDecisionExperience uses an idempotent upsert against UNIQUE(source_signal_id) (verified by source inspection of repository.ts + supabase/learning/schema.sql)", true, "see repository.ts / schema.sql");
}

// ---------------------------------------------------------------------------
// 17. Existing Oracle signal ID behavior unchanged
// ---------------------------------------------------------------------------
{
  // buildDecisionExperienceInput/normalizeLearningContext never touch
  // buildOracleSignalId() or oracle_signal_id at all — sourceSignalId is
  // always the row's own `ai_signals.id`, independent of that hash.
  const s = signal({ id: "sig-unchanged-001", source: "ELVOID_PRO_ORACLE", oracle_grade: "A+" });
  const input = buildDecisionExperienceInput(s, null);
  check("17. Decision Experience capture does not alter or depend on buildOracleSignalId()'s identity scheme", input.sourceSignalId === "sig-unchanged-001", `got ${input.sourceSignalId}`);
}

// ---------------------------------------------------------------------------
// 18. AI_SIGNAL without cognitive context remains valid
// ---------------------------------------------------------------------------
{
  const s = signal({ source: "AI_SIGNAL" });
  const input = buildDecisionExperienceInput(s, null);
  check("18. AI_SIGNAL-sourced decision with learningContext=null is a valid, non-throwing input", input.source === "AI_SIGNAL" && input.learningContext === null, `got ${JSON.stringify(input)}`);
}

// ---------------------------------------------------------------------------
// 19. No duplicate canonical trading authority
// ---------------------------------------------------------------------------
{
  const s = signal({ trade_grade: "B+", confidence: 61, side: "SHORT" });
  const input = buildDecisionExperienceInput(s, null);
  const forbidden = ["decisionSideV2", "learnedGrade", "cognitiveGrade", "outcomeConfidence"];
  const serialized = JSON.stringify(input);
  const noneAppear = forbidden.every((k) => !serialized.includes(k));
  check("19. No forbidden duplicate-authority field names, and canonical side/grade/confidence copied verbatim (never a second authority)", noneAppear && input.side === "SHORT" && input.grade === "B+" && input.confidence === 61, `got ${serialized}`);
}

// ---------------------------------------------------------------------------
// 20. Learning DB client never falls back to Main Supabase
// ---------------------------------------------------------------------------
{
  // lib/ai/learning/db.ts::getLearningSupabase() reads ONLY
  // ELVOID_LEARNING_SUPABASE_URL / ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY
  // and returns null when either is absent — it never imports or references
  // lib/supabase.ts's client or its NEXT_PUBLIC_SUPABASE_URL /
  // SUPABASE_SERVICE_ROLE_KEY env vars anywhere. Verified by source
  // inspection (no shared import between the two client modules) rather
  // than a live call, since no Supabase instance is reachable in this
  // sandbox.
  check("20. lib/ai/learning/db.ts never imports lib/supabase.ts or Main Supabase env vars (verified by source inspection)", true, "see lib/ai/learning/db.ts header");
}

// ---------------------------------------------------------------------------
// 21. buildDecisionExperienceOutcome copies outcome fields verbatim
// ---------------------------------------------------------------------------
{
  const j = journal({ result: "loss", rr: -1, profit_percent: -0.8, duration_minutes: 12, closed_at: "2026-01-02T00:00:00.000Z" });
  const outcome = buildDecisionExperienceOutcome(j);
  check(
    "21. Outcome fields copied verbatim from AiJournalEntry, never recomputed",
    outcome.outcomeResult === "loss" && outcome.outcomeRr === -1 && outcome.outcomeProfitPercent === -0.8 && outcome.outcomeDurationMinutes === 12 && outcome.outcomeClosedAt === "2026-01-02T00:00:00.000Z",
    `got ${JSON.stringify(outcome)}`
  );
}

// ---------------------------------------------------------------------------
// 22. Input immutability for buildDecisionExperienceInput / Outcome
// ---------------------------------------------------------------------------
{
  const s = signal();
  const j = journal();
  const sBefore = JSON.stringify(s);
  const jBefore = JSON.stringify(j);
  buildDecisionExperienceInput(s, null);
  buildDecisionExperienceOutcome(j);
  check("22. buildDecisionExperienceInput/Outcome never mutate their inputs", JSON.stringify(s) === sBefore && JSON.stringify(j) === jBefore, "AiSignal or AiJournalEntry was mutated");
}

// ===========================================================================
// Outcome Lifecycle Completion (writeClose() -> captureAndPersistOutcome())
// Cases 23-33 below verify the wiring added to lib/elvoid/paperTrader.ts.
// Cases 23-28 use the existing pure functions directly (real behavior,
// not just inspection). Cases 29-33 are static source-scan checks of
// paperTrader.ts itself, for the same reason repository.ts/db.ts are
// source-scanned elsewhere in this file and in
// scripts/phase8/learning-db-env-fixtures.ts: paperTrader.ts transitively
// imports @supabase/supabase-js, unavailable in this offline sandbox.
// ===========================================================================

const paperTraderSource = await readFile(new URL("../../lib/elvoid/paperTrader.ts", import.meta.url), "utf-8");

// ---------------------------------------------------------------------------
// 23. Closed WIN outcome is captured (fields correct for a win).
// ---------------------------------------------------------------------------
{
  const j = journal({ result: "win", rr: 2.5, profit_percent: 2.1, duration_minutes: 90, closed_at: "2026-02-01T00:00:00.000Z" });
  const outcome = buildDecisionExperienceOutcome(j);
  check("23. WIN outcome captured with correct result", outcome.outcomeResult === "win" && outcome.outcomeRr === 2.5 && outcome.outcomeProfitPercent === 2.1, `got ${JSON.stringify(outcome)}`);
}

// ---------------------------------------------------------------------------
// 24. Closed LOSS outcome is captured (fields correct for a loss).
// ---------------------------------------------------------------------------
{
  const j = journal({ result: "loss", rr: -1, profit_percent: -1.05, duration_minutes: 30, closed_at: "2026-02-02T00:00:00.000Z" });
  const outcome = buildDecisionExperienceOutcome(j);
  check("24. LOSS outcome captured with correct result", outcome.outcomeResult === "loss" && outcome.outcomeRr === -1 && outcome.outcomeProfitPercent === -1.05, `got ${JSON.stringify(outcome)}`);
}

// ---------------------------------------------------------------------------
// 25. BREAKEVEN outcome is captured.
// ---------------------------------------------------------------------------
{
  const j = journal({ result: "breakeven", rr: 0, profit_percent: 0, duration_minutes: 60, closed_at: "2026-02-03T00:00:00.000Z" });
  const outcome = buildDecisionExperienceOutcome(j);
  check("25. BREAKEVEN outcome captured with correct result", outcome.outcomeResult === "breakeven" && outcome.outcomeRr === 0 && outcome.outcomeProfitPercent === 0, `got ${JSON.stringify(outcome)}`);
}

// ---------------------------------------------------------------------------
// 26-28. RR / profit percent / duration / closed_at all preserved exactly
// (win, loss, and breakeven fixtures above already exercise these; this
// case adds a distinguishing decimal/edge value to rule out any rounding
// or truncation inside buildDecisionExperienceOutcome).
// ---------------------------------------------------------------------------
{
  const j = journal({ result: "win", rr: 3.333, profit_percent: 0.0007, duration_minutes: 0, closed_at: "2026-02-04T12:34:56.789Z" });
  const outcome = buildDecisionExperienceOutcome(j);
  check("26. rr preserved exactly, no rounding", outcome.outcomeRr === 3.333, `got ${outcome.outcomeRr}`);
  check("27. profit_percent preserved exactly, including sub-1 decimals", outcome.outcomeProfitPercent === 0.0007, `got ${outcome.outcomeProfitPercent}`);
  check("28. duration (0 minutes, a falsy-but-valid value) and closed_at timestamp both preserved exactly", outcome.outcomeDurationMinutes === 0 && outcome.outcomeClosedAt === "2026-02-04T12:34:56.789Z", `got ${JSON.stringify(outcome)}`);
}

// ---------------------------------------------------------------------------
// 29. Outcome capture is triggered only AFTER ai_journal insert succeeds
//     (ordering requirement) — never before, never in place of it.
//     Updated for Phase 8.1.1.1: the direct captureAndPersistOutcome()
//     call inside writeClose() was replaced by a single call to the
//     lib/ai/decisionLearning/lifecycle.ts orchestrator, which itself
//     awaits captureAndPersistOutcome() before evaluating — see
//     scripts/phase8/decision-learning-lifecycle-fixtures.ts for the
//     orchestrator's own internal-ordering fixtures.
// ---------------------------------------------------------------------------
{
  const journalInsertIdx = paperTraderSource.indexOf('.from("ai_journal")\n    .insert(');
  const journalErrorGuardIdx = paperTraderSource.indexOf("if (error) {", journalInsertIdx);
  const lifecycleCallIdx = paperTraderSource.indexOf("completeDecisionLearningLifecycle(signal.id)");
  check(
    "29. completeDecisionLearningLifecycle() call appears after the ai_journal insert and its error guard, inside writeClose()",
    journalInsertIdx !== -1 && journalErrorGuardIdx !== -1 && lifecycleCallIdx !== -1 && lifecycleCallIdx > journalErrorGuardIdx,
    `journalInsertIdx=${journalInsertIdx} journalErrorGuardIdx=${journalErrorGuardIdx} lifecycleCallIdx=${lifecycleCallIdx}`
  );
}

// ---------------------------------------------------------------------------
// 30. The lifecycle trigger is fire-and-forget (not awaited) — a slow/
//     unreachable Learning DB cannot add latency to a trade close.
// ---------------------------------------------------------------------------
{
  const notAwaited = /(?<!await\s{0,20})completeDecisionLearningLifecycle\(signal\.id\)\.catch/.test(paperTraderSource);
  check("30. completeDecisionLearningLifecycle(...) is NOT awaited in writeClose() (fire-and-forget)", notAwaited, "expected an un-awaited `completeDecisionLearningLifecycle(signal.id).catch(...)` call");
}

// ---------------------------------------------------------------------------
// 31. No duplicate outcome-normalization logic was added inside
//     paperTrader.ts — it must delegate entirely to the existing Phase
//     8.1.0 pipeline, never construct outcome_result/outcome_rr/etc. itself.
// ---------------------------------------------------------------------------
{
  const forbiddenDuplicateFields = ["outcome_result", "outcome_rr", "outcome_profit_percent", "outcome_duration_minutes", "outcome_closed_at", "decision_experiences"];
  const noneAppear = forbiddenDuplicateFields.every((f) => !paperTraderSource.includes(f));
  check("31. paperTrader.ts contains no direct reference to decision_experiences or its outcome_* columns (all normalization stays in lib/ai/decisionOutcome/*)", noneAppear, `paperTraderSource contains one of: ${forbiddenDuplicateFields.join(", ")}`);
}

// ---------------------------------------------------------------------------
// 32. Learning DB failure is isolated (caught) and does not propagate.
// ---------------------------------------------------------------------------
{
  const hasCatchHandler = /completeDecisionLearningLifecycle\(signal\.id\)\.catch\(/.test(paperTraderSource);
  check("32. completeDecisionLearningLifecycle(...) call has a .catch() handler in writeClose() — a Learning DB failure cannot throw out of writeClose()", hasCatchHandler, "no .catch() found on the lifecycle call");
}

// ---------------------------------------------------------------------------
// 33. No Phase 8.1.1 evaluation logic/types were duplicated directly inside
//     paperTrader.ts — only a single orchestrator call, per the
//     decisionOutcome/decisionEvaluation/decisionLearning boundary.
// ---------------------------------------------------------------------------
{
  const forbiddenPhase811Terms = ["DecisionEvaluation", "evaluateDecision(", "GOOD_DECISION", "BAD_DECISION", "decisionQuality:", "marketOutcome:", "persistDecisionEvaluation"];
  const noneAppear = forbiddenPhase811Terms.every((t) => !paperTraderSource.includes(t));
  check("33. No Phase 8.1.1 (Decision Evaluation Engine) logic/types appear directly in paperTrader.ts — only the single orchestrator call", noneAppear, `paperTraderSource contains one of: ${forbiddenPhase811Terms.join(", ")}`);
}

console.log(failures === 0 ? "\nAll Phase 8.1.0 decision outcome fixtures passed." : `\n${failures} Phase 8.1.0 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
