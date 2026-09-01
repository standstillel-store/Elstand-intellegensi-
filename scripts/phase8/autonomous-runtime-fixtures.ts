// ---------------------------------------------------------------------------
// Phase 8.2.9 — Autonomous Runtime fixtures (dev-only, not part of the app).
//
// Pure/offline, same convention as every prior 8.x fixture script — no
// live Supabase/Learning DB connection, no network call. Covers the two
// genuinely NEW pure-logic surfaces this phase introduces:
//
//   1. lib/ai/autonomousRuntime/dedup.ts — buildAutonomousSetupIdentity()
//      + isDuplicateSetup() (§6's "what exactly counts as a duplicate
//      decision").
//   2. The orchestrator's dedup-gate DECISION (EXECUTE + duplicate setup
//      -> effective WAIT; EXECUTE + new setup -> unchanged EXECUTE;
//      WAIT/REJECT never consult dedup at all) — exercised here as a
//      standalone pure function mirroring orchestrator.ts's own gate
//      logic exactly, since runAutonomousCycle() itself calls Binance/
//      the Oracle pipeline directly and has no dependency-injection seam
//      (unlike executeAutonomousPaperTrade — see
//      autonomousExecution/contracts.ts's own `AutonomousExecutionDeps`).
//      This is a KNOWN, DOCUMENTED LIMITATION — see CHANGES.md's
//      "Known limitations" for this phase: true end-to-end orchestrator
//      testing needs either a live Learning DB / Binance test harness or
//      a follow-up refactor that gives runAutonomousCycle() the same
//      injectable-deps seam execute.ts already has.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-runtime-fixtures.ts
// ---------------------------------------------------------------------------

import { buildAutonomousSetupIdentity, isDuplicateSetup, type LastExecutedSetup } from "@/lib/ai/autonomousRuntime/dedup";
import type { AutonomousCanonicalSnapshot } from "@/lib/ai/autonomous/contracts";
import type { AutonomousDecisionEngineResult } from "@/lib/ai/autonomousDecision/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function canonical(overrides: Partial<AutonomousCanonicalSnapshot> = {}): AutonomousCanonicalSnapshot {
  return {
    symbol: "BTCUSDT",
    timestamp: "2026-02-01T00:00:00.000Z",
    grade: "A",
    side: "LONG",
    confidence: 78,
    riskStatus: "valid",
    invalidation: "close below 41,200",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mirrors orchestrator.ts's own §6 gate exactly (see file header above) —
// kept as a tiny standalone pure function purely for fixture coverage.
// ---------------------------------------------------------------------------
function applyDedupGate(decision: AutonomousDecisionEngineResult, candidate: AutonomousCanonicalSnapshot | null, lastExecuted: LastExecutedSetup | null): { effective: AutonomousDecisionEngineResult["decision"]; dedupApplied: boolean } {
  if (decision.decision !== "EXECUTE" || !candidate) return { effective: decision.decision, dedupApplied: false };
  const identity = buildAutonomousSetupIdentity(candidate);
  if (isDuplicateSetup(identity, lastExecuted)) return { effective: "WAIT", dedupApplied: true };
  return { effective: "EXECUTE", dedupApplied: false };
}

function decision(overrides: Partial<AutonomousDecisionEngineResult> = {}): AutonomousDecisionEngineResult {
  return {
    version: 1,
    symbol: "BTCUSDT",
    source: "ELVOID_PRO_ORACLE",
    generatedAt: "2026-02-01T00:00:00.000Z",
    decision: "EXECUTE",
    signals: {
      qualificationPresent: true,
      macroPresent: true,
      eventImpactPresent: true,
      preEntryPresent: true,
      requiredContextMissing: false,
      qualificationInsufficient: false,
      preEntryInsufficient: false,
      preEntryBlocked: false,
      qualificationConflicted: false,
      preEntryCaution: false,
      preEntryValid: true,
      qualificationQualified: true,
    },
    ...overrides,
  };
}

// ===========================================================================
// buildAutonomousSetupIdentity — determinism
// ===========================================================================
{
  const a = buildAutonomousSetupIdentity(canonical());
  const b = buildAutonomousSetupIdentity(canonical());
  check("1. identical canonical snapshots -> identical identity", a === b, `${a} vs ${b}`);
}

// ===========================================================================
// buildAutonomousSetupIdentity — stable across timestamp advancing (the whole point of §6)
// ===========================================================================
{
  const cycle1 = buildAutonomousSetupIdentity(canonical({ timestamp: "2026-02-01T00:00:00.000Z" }));
  const cycle2 = buildAutonomousSetupIdentity(canonical({ timestamp: "2026-02-01T00:15:00.000Z" }));
  check("2. identity unchanged when only timestamp advances between cycles", cycle1 === cycle2, `${cycle1} vs ${cycle2}`);
}

// ===========================================================================
// buildAutonomousSetupIdentity — stable across small confidence drift
// ===========================================================================
{
  const cycle1 = buildAutonomousSetupIdentity(canonical({ confidence: 78 }));
  const cycle2 = buildAutonomousSetupIdentity(canonical({ confidence: 80 }));
  check("3. identity unchanged when only confidence drifts", cycle1 === cycle2, `${cycle1} vs ${cycle2}`);
}

// ===========================================================================
// buildAutonomousSetupIdentity — changes when side changes
// ===========================================================================
{
  const long = buildAutonomousSetupIdentity(canonical({ side: "LONG" }));
  const short = buildAutonomousSetupIdentity(canonical({ side: "SHORT" }));
  check("4. identity changes when side changes", long !== short, `${long} vs ${short}`);
}

// ===========================================================================
// buildAutonomousSetupIdentity — changes when grade changes
// ===========================================================================
{
  const a = buildAutonomousSetupIdentity(canonical({ grade: "A" }));
  const bplus = buildAutonomousSetupIdentity(canonical({ grade: "B+" }));
  check("5. identity changes when grade changes", a !== bplus, `${a} vs ${bplus}`);
}

// ===========================================================================
// buildAutonomousSetupIdentity — changes when invalidation text changes (a genuinely new setup read)
// ===========================================================================
{
  const a = buildAutonomousSetupIdentity(canonical({ invalidation: "close below 41,200" }));
  const b = buildAutonomousSetupIdentity(canonical({ invalidation: "close below 40,800" }));
  check("6. identity changes when invalidation changes", a !== b, `${a} vs ${b}`);
}

// ===========================================================================
// isDuplicateSetup — null lastExecuted (first-ever cycle for this symbol) is never a duplicate
// ===========================================================================
{
  const id = buildAutonomousSetupIdentity(canonical());
  check("7. null lastExecuted -> never a duplicate", isDuplicateSetup(id, null) === false, "expected false");
}

// ===========================================================================
// isDuplicateSetup — matching identity -> duplicate
// ===========================================================================
{
  const id = buildAutonomousSetupIdentity(canonical());
  const last: LastExecutedSetup = { setupIdentity: id, paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  check("8. matching setup identity -> duplicate", isDuplicateSetup(id, last) === true, "expected true");
}

// ===========================================================================
// isDuplicateSetup — different identity (genuinely new setup) -> not a duplicate
// ===========================================================================
{
  const oldId = buildAutonomousSetupIdentity(canonical({ side: "LONG" }));
  const newId = buildAutonomousSetupIdentity(canonical({ side: "SHORT" }));
  const last: LastExecutedSetup = { setupIdentity: oldId, paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  check("9. changed setup identity -> not a duplicate, may be reconsidered", isDuplicateSetup(newId, last) === false, "expected false");
}

// ===========================================================================
// Dedup gate — Cycle 1: EXECUTE, nothing recorded yet -> EXECUTE goes through unchanged
// ===========================================================================
{
  const d = decision({ decision: "EXECUTE" });
  const gate = applyDedupGate(d, canonical(), null);
  check("10. cycle 1 EXECUTE with no prior record -> EXECUTE, dedupApplied=false", gate.effective === "EXECUTE" && gate.dedupApplied === false, JSON.stringify(gate));
}

// ===========================================================================
// Dedup gate — Cycle 2: EXECUTE on the SAME unchanged setup -> downgraded to WAIT
// ===========================================================================
{
  const setup = canonical();
  const id = buildAutonomousSetupIdentity(setup);
  const last: LastExecutedSetup = { setupIdentity: id, paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  const d = decision({ decision: "EXECUTE" });
  const gate = applyDedupGate(d, setup, last);
  check("11. cycle 2 EXECUTE on unchanged setup -> WAIT, dedupApplied=true (this IS §6's core requirement)", gate.effective === "WAIT" && gate.dedupApplied === true, JSON.stringify(gate));
}

// ===========================================================================
// Dedup gate — Cycle 2: EXECUTE on a CHANGED setup (side flipped) -> EXECUTE goes through, may be reconsidered
// ===========================================================================
{
  const last: LastExecutedSetup = { setupIdentity: buildAutonomousSetupIdentity(canonical({ side: "LONG" })), paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  const d = decision({ decision: "EXECUTE" });
  const gate = applyDedupGate(d, canonical({ side: "SHORT" }), last);
  check("12. cycle 2 EXECUTE on changed setup -> EXECUTE, dedupApplied=false", gate.effective === "EXECUTE" && gate.dedupApplied === false, JSON.stringify(gate));
}

// ===========================================================================
// Dedup gate — WAIT decision never consults dedup at all (only EXECUTE candidates are gated)
// ===========================================================================
{
  const setup = canonical();
  const id = buildAutonomousSetupIdentity(setup);
  const last: LastExecutedSetup = { setupIdentity: id, paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  const d = decision({ decision: "WAIT" });
  const gate = applyDedupGate(d, setup, last);
  check("13. WAIT decision passes through untouched regardless of dedup state", gate.effective === "WAIT" && gate.dedupApplied === false, JSON.stringify(gate));
}

// ===========================================================================
// Dedup gate — REJECT decision never consults dedup at all
// ===========================================================================
{
  const setup = canonical();
  const id = buildAutonomousSetupIdentity(setup);
  const last: LastExecutedSetup = { setupIdentity: id, paperTradeId: "trade-1", executedAt: "2026-02-01T00:00:00.000Z" };
  const d = decision({ decision: "REJECT" });
  const gate = applyDedupGate(d, setup, last);
  check("14. REJECT decision passes through untouched regardless of dedup state", gate.effective === "REJECT" && gate.dedupApplied === false, JSON.stringify(gate));
}

// ===========================================================================
// Dedup gate — EXECUTE with no canonical snapshot available (defensive — should not happen in practice) -> passes through, never crashes
// ===========================================================================
{
  const d = decision({ decision: "EXECUTE" });
  const gate = applyDedupGate(d, null, null);
  check("15. EXECUTE with null canonical snapshot -> passes through unchanged, never throws", gate.effective === "EXECUTE" && gate.dedupApplied === false, JSON.stringify(gate));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
