// ---------------------------------------------------------------------------
// Phase 8.2.1 — Autonomous Decision Traceability fixtures (dev-only, not
// part of the app). Pure/offline — exercises contracts.ts's
// `validateDecisionTraceInput()` only (repository.ts requires a live
// Learning DB and is intentionally not exercised here beyond static
// source-scan checks, same convention as every prior 8.1.x fixture script).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-trace-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { validateDecisionTraceInput } from "@/lib/ai/decisionTrace/contracts";
import type { DecisionTraceInput, TraceOutcome } from "@/lib/ai/decisionTrace/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function trace(overrides: Partial<DecisionTraceInput> = {}): DecisionTraceInput {
  return {
    source: "ELVOID_PRO_ORACLE",
    outcome: "WAIT",
    symbol: "BTCUSDT",
    side: null,
    decisionTimestamp: "2026-02-01T00:00:00.000Z",
    snapshot: null,
    sourceSignalId: null,
    ...overrides,
  };
}

// ===========================================================================
// 1. EXECUTE with a sourceSignalId -> valid
// ===========================================================================
{
  const r = validateDecisionTraceInput(trace({ outcome: "EXECUTE", sourceSignalId: "sig-1", side: "LONG" }));
  check("1. EXECUTE with sourceSignalId -> valid", r.valid === true, JSON.stringify(r));
}

// ===========================================================================
// 2. EXECUTE with sourceSignalId null -> still valid (reference is optional)
// ===========================================================================
{
  const r = validateDecisionTraceInput(trace({ outcome: "EXECUTE", sourceSignalId: null }));
  check("2. EXECUTE with sourceSignalId null -> valid (optional reference)", r.valid === true, JSON.stringify(r));
}

// ===========================================================================
// 3a-3c. WAIT/REJECT/EXPIRE with sourceSignalId null -> valid
// ===========================================================================
{
  const outcomes: TraceOutcome[] = ["WAIT", "REJECT", "EXPIRE"];
  for (const [i, outcome] of outcomes.entries()) {
    const r = validateDecisionTraceInput(trace({ outcome, sourceSignalId: null }));
    check(`3${String.fromCharCode(97 + i)}. ${outcome} with sourceSignalId null -> valid`, r.valid === true, JSON.stringify(r));
  }
}

// ===========================================================================
// 4a-4c. WAIT/REJECT/EXPIRE with sourceSignalId set -> invalid
// ===========================================================================
{
  const outcomes: TraceOutcome[] = ["WAIT", "REJECT", "EXPIRE"];
  for (const [i, outcome] of outcomes.entries()) {
    const r = validateDecisionTraceInput(trace({ outcome, sourceSignalId: "sig-2" }));
    check(`4${String.fromCharCode(97 + i)}. ${outcome} with sourceSignalId set -> invalid (NON_EXECUTE_MUST_NOT_REFERENCE_SIGNAL)`, r.valid === false && r.reason === "NON_EXECUTE_MUST_NOT_REFERENCE_SIGNAL", JSON.stringify(r));
  }
}

// ===========================================================================
// 5. WAIT/REJECT/EXPIRE work with symbol/side only, no signal, no snapshot
// ===========================================================================
{
  const r = validateDecisionTraceInput(trace({ outcome: "REJECT", side: null, snapshot: null, sourceSignalId: null }));
  check("5. REJECT with no side/snapshot/signal -> still valid (fully self-contained)", r.valid === true, JSON.stringify(r));
}

// ===========================================================================
// 6. Input immutability — validate does not mutate its argument
// ===========================================================================
{
  const input = trace({ outcome: "WAIT", sourceSignalId: null });
  const before = JSON.stringify(input);
  validateDecisionTraceInput(input);
  const after = JSON.stringify(input);
  check("6. input immutability — validate does not mutate its argument", before === after, `${before} vs ${after}`);
}

// ===========================================================================
// 7. Determinism — identical input -> identical result
// ===========================================================================
{
  const input = trace({ outcome: "EXPIRE", sourceSignalId: "sig-3" });
  const r1 = JSON.stringify(validateDecisionTraceInput(input));
  const r2 = JSON.stringify(validateDecisionTraceInput(input));
  check("7. determinism — identical input -> identical result", r1 === r2, `${r1} vs ${r2}`);
}

// ===========================================================================
// Static-scan checks (source text, not execution) — mirrors every prior
// 8.1.x fixture script's convention for repository.ts, which requires a
// live Learning DB unavailable in this sandbox.
// ===========================================================================
const contractsSrc = readFileSync(new URL("../../lib/ai/decisionTrace/contracts.ts", import.meta.url), "utf8");
const repoSrc = readFileSync(new URL("../../lib/ai/decisionTrace/repository.ts", import.meta.url), "utf8");
const schemaSrc = readFileSync(new URL("../../supabase/learning/schema.sql", import.meta.url), "utf8");

// 8. No autonomous-decision imports anywhere in this phase's two files.
{
  const forbidden = ["lib/ai/oracle/", "lib/ai/cognitive/", "lib/elvoid/execute", "lib/elvoid/paperTrader"];
  const hit = forbidden.find((f) => contractsSrc.includes(f) || repoSrc.includes(f));
  check("8. no oracle/cognitive/execute/paperTrader import anywhere in this phase", !hit, `hit: ${hit}`);
}

// 9. No Main Supabase client import — Learning DB only.
{
  const hit = repoSrc.includes('from "@/lib/supabase"') || repoSrc.includes("from '@/lib/supabase'");
  check("9. repository.ts never imports the Main Supabase client (Learning DB only)", !hit, "found Main DB import");
}

// 10. repository.ts writes only to decision_traces (no other table name appears in a write call).
{
  const writesToOtherTable = /\.from\(["'](?!decision_traces)[a-z_]+["']\)\s*\.\s*(insert|update|upsert|delete)/.test(repoSrc);
  check("10. repository.ts writes only to decision_traces (static scan)", !writesToOtherTable, "found a write to a different table");
}

// 11. No UPDATE/UPSERT call anywhere in repository.ts — insert-only, immutable.
{
  const hasMutatingUpdate = /\.(update|upsert)\(/.test(repoSrc);
  check("11. repository.ts has no update()/upsert() call — insert-only (immutable rows)", !hasMutatingUpdate, "found update()/upsert()");
}

// 12. No causal-language / free-text explanation field in DecisionTraceInput.
{
  const forbiddenFields = ["reason:", "explanation", "narrative", "cause:"];
  const hit = forbiddenFields.find((f) => contractsSrc.includes(f) && !contractsSrc.includes("reason:  "));
  // "reason" appears only inside DecisionTraceValidationResult's closed literal — not a free-text field.
  const hasFreeTextReasonField = /reason:\s*string/.test(contractsSrc);
  check("12. no free-text causal/explanation field in DecisionTraceInput", !hasFreeTextReasonField, "found reason: string");
}

// 13. schema.sql: decision_traces CHECK constraint mirrors the app-level invariant.
{
  const hasCheck = schemaSrc.includes("decision_traces_signal_ref_only_on_execute");
  check("13. schema.sql has the EXECUTE-only signal-reference CHECK constraint", hasCheck, "constraint not found");
}

// 14. schema.sql: source is single-value CHECK ('ELVOID_PRO_ORACLE') only, on decision_traces.
{
  const traceTableChunk = schemaSrc.slice(schemaSrc.indexOf("create table if not exists decision_traces"));
  const singleValueSource = /source text not null check \(source in \('ELVOID_PRO_ORACLE'\)\)/.test(traceTableChunk);
  check("14. decision_traces.source is a single-value CHECK ('ELVOID_PRO_ORACLE' only)", singleValueSource, "source CHECK not single-valued");
}

// 15. schema.sql: decision_traces table is additive (append-only file edit) — table name did not previously exist elsewhere.
{
  const occurrences = (schemaSrc.match(/create table if not exists decision_traces/g) ?? []).length;
  check("15. decision_traces table defined exactly once in schema.sql", occurrences === 1, `found ${occurrences} definitions`);
}

// 16. contracts.ts exports the closed 4-member TraceOutcome union exactly.
{
  const hasAllFour = ["EXECUTE", "WAIT", "REJECT", "EXPIRE"].every((v) => contractsSrc.includes(`"${v}"`));
  check("16. TraceOutcome includes all four closed members", hasAllFour, "missing a member");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
