// ---------------------------------------------------------------------------
// Phase 8.0.2 — Cognitive Working Memory fixtures (dev-only, not part of the
// app). Pure/offline — hand-typed CognitiveObservation fixtures (reusing the
// same builder shapes as scripts/phase8/cognitive-observation-fixtures.ts).
// No network/Binance call, no LLM call, no database access.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-memory-fixtures.ts
// ---------------------------------------------------------------------------

import { createWorkingMemory, appendMemoryEntry, type CognitiveMemoryEntry } from "@/lib/ai/cognitive/memory";
import type { CognitiveObservation } from "@/lib/ai/cognitive/contracts";
import type { CognitiveEvidenceRef } from "@/lib/ai/cognitive/types";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// Fixture builders — a hand-typed CognitiveObservation, matching the exact
// shape Phase 8.0.1's buildCognitiveObservation() produces, without calling
// it (no ConfluenceResult/OracleAssessment scaffolding needed here — this
// file tests memory.ts, not observation.ts, which already has its own
// fixture suite).
// ---------------------------------------------------------------------------

function evidenceRef(overrides: Partial<CognitiveEvidenceRef> = {}): CognitiveEvidenceRef {
  return { source: "market_structure", cluster: "structure", direction: "LONG", strength: 8, quality: "real", evidence: "fixture evidence", timeframe: "15m", invalidation: undefined, timestamp: "2026-01-01T00:00:00.000Z", ...overrides };
}

function observation(overrides: Partial<CognitiveObservation> = {}): CognitiveObservation {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    symbol: "FIXTURE",
    sourceAssessment: { side: "LONG", grade: "A", confidence: 72, riskStatus: "valid", invalidation: "fixture invalidation" },
    evidence: [evidenceRef()],
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

function note(overrides: Partial<CognitiveMemoryEntry> = {}): CognitiveMemoryEntry {
  return { text: "Evidence cluster contains unresolved disagreement", ...overrides };
}

// 1. Creation preserves observation ------------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  check("1. Creation preserves observation (same reference) and notes initially empty", memory.observation === obs && memory.notes.length === 0, `got observation===obs? ${memory.observation === obs}, notes=${JSON.stringify(memory.notes)}`);
}

// 2. Evidence provenance preservation ----------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  check(
    "2. Evidence remains accessible through memory.observation.evidence — same reference, no re-normalization/duplication",
    memory.observation.evidence === obs.evidence && memory.observation.evidence.length === 1 && memory.observation.evidence[0].source === "market_structure",
    `got ${JSON.stringify(memory.observation.evidence)}`
  );
}

// 3. Append-only behavior -----------------------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  const entry = note();
  const nextMemory = appendMemoryEntry(memory, entry);
  check(
    "3. Append returns new object; original memory/notes unchanged; new memory contains appended note",
    nextMemory !== memory && memory.notes.length === 0 && nextMemory.notes.length === 1 && nextMemory.notes[0] === entry,
    `memory.notes=${JSON.stringify(memory.notes)}, nextMemory.notes=${JSON.stringify(nextMemory.notes)}`
  );
}

// 4. Notes array identity -----------------------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  const nextMemory = appendMemoryEntry(memory, note());
  check("4. memory.notes !== nextMemory.notes (new array identity)", memory.notes !== nextMemory.notes, "arrays share identity");
}

// 5. Observation identity preservation ----------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  const nextMemory = appendMemoryEntry(memory, note());
  check("5. memory.observation === nextMemory.observation (carried through unchanged)", memory.observation === nextMemory.observation, "observation reference changed across append");
}

// 6. Source observation mutation safety ---------------------------------------
{
  const obs = observation();
  const before = JSON.stringify(obs);
  const memory = createWorkingMemory(obs);
  appendMemoryEntry(memory, note());
  const after = JSON.stringify(obs);
  check("6. JSON.stringify(observation) unchanged after creation and append", before === after, `before=${before} after=${after}`);
}

// 7. Canonical authority safety ------------------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  const nextMemory = appendMemoryEntry(memory, note());
  const snap = nextMemory.observation.sourceAssessment;
  const valuesUnchanged = snap.side === obs.sourceAssessment.side && snap.grade === obs.sourceAssessment.grade && snap.confidence === obs.sourceAssessment.confidence && snap.riskStatus === obs.sourceAssessment.riskStatus && snap.invalidation === obs.sourceAssessment.invalidation;
  const memoryAny = nextMemory as unknown as Record<string, unknown>;
  const snapAny = snap as unknown as Record<string, unknown>;
  const noForbiddenKeys =
    !("cognitiveSide" in memoryAny) &&
    !("cognitiveGrade" in memoryAny) &&
    !("cognitiveConfidence" in memoryAny) &&
    !("cognitiveRiskStatus" in memoryAny) &&
    !("cognitiveSide" in snapAny) &&
    !("cognitiveGrade" in snapAny) &&
    !("cognitiveConfidence" in snapAny) &&
    !("cognitiveRiskStatus" in snapAny);
  check("7. side/grade/confidence/riskStatus/invalidation unchanged; no cognitiveSide/cognitiveGrade/alternative decision fields anywhere", valuesUnchanged && noForbiddenKeys, `got ${JSON.stringify(nextMemory)}`);
}

// 8. Quality inheritance --------------------------------------------------------
{
  const obs = observation({ quality: "mixed" });
  const memory = createWorkingMemory(obs);
  const nextMemory = appendMemoryEntry(memory, note());
  const memoryAny = nextMemory as unknown as Record<string, unknown>;
  check(
    "8. Working Memory introduces no second quality calculation — quality reachable only through observation.quality/evidence quality",
    nextMemory.observation.quality === "mixed" && !("quality" in memoryAny),
    `got observation.quality=${nextMemory.observation.quality}, top-level keys=${Object.keys(memoryAny).join(",")}`
  );
}

// 9. Independent memory instances ------------------------------------------------
{
  const obsA = observation({ symbol: "AAA" });
  const obsB = observation({ symbol: "BBB" });
  const memoryA = createWorkingMemory(obsA);
  const memoryB = createWorkingMemory(obsB);
  const nextMemoryA = appendMemoryEntry(memoryA, note({ text: "note for A" }));
  check(
    "9. Memory A and B do not share notes; appending to A does not affect B",
    nextMemoryA.notes.length === 1 && memoryB.notes.length === 0 && nextMemoryA.notes !== memoryB.notes,
    `A.notes=${JSON.stringify(nextMemoryA.notes)}, B.notes=${JSON.stringify(memoryB.notes)}`
  );
}

// 10. Deterministic output ---------------------------------------------------------
{
  const obs = observation();
  const runOnce = () => {
    const memory = createWorkingMemory(obs);
    const m1 = appendMemoryEntry(memory, note({ text: "first note" }));
    const m2 = appendMemoryEntry(m1, note({ text: "second note" }));
    return m2;
  };
  const resultA = runOnce();
  const resultB = runOnce();
  check("10. Same observation + same append sequence -> byte-identical JSON output", JSON.stringify(resultA) === JSON.stringify(resultB), `A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`);
}

// 11. Structural safety ------------------------------------------------------------
{
  // Static/structural check, same style as reasoning-fixtures.ts documents
  // its own network limitation — memory.ts (see its source) contains no
  // Map/Set, no module-level mutable store, no Supabase import, no fetch,
  // no LLM call. Verified here by re-reading the module's own exported
  // surface: only createWorkingMemory/appendMemoryEntry are exported, both
  // synchronous, both taking/returning plain data with no I/O.
  const memoryModule = await import("@/lib/ai/cognitive/memory");
  const exportedKeys = Object.keys(memoryModule).sort();
  const onlyExpectedExports = exportedKeys.every((k) => k === "createWorkingMemory" || k === "appendMemoryEntry");
  const bothSynchronous = memoryModule.createWorkingMemory.constructor.name === "Function" && memoryModule.appendMemoryEntry.constructor.name === "Function";
  check("11. memory.ts exposes only createWorkingMemory/appendMemoryEntry, both synchronous plain functions — no Map/Set/Supabase/fetch/LLM surface", onlyExpectedExports && bothSynchronous, `exports=${exportedKeys.join(",")}`);
}

// 12. Input immutability -----------------------------------------------------------
{
  const obs = observation();
  const memory = createWorkingMemory(obs);
  const before = JSON.stringify(memory);
  appendMemoryEntry(memory, note());
  const after = JSON.stringify(memory);
  check("12. Original memory JSON remains byte-identical after append", before === after, `before=${before} after=${after}`);
}

console.log(failures === 0 ? "\nAll Phase 8.0.2 cognitive working memory fixtures passed." : `\n${failures} Phase 8.0.2 fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
