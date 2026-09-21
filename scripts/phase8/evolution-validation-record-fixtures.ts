// ---------------------------------------------------------------------------
// Phase 8.6.6b — Append-only validation record fixtures (dev-only).
// Pure/offline — exercises record.ts (canonical JSON, hashing, construction,
// verification) plus static inspection of recordRepository.ts and the
// schema.sql migration. recordRepository.ts itself needs a live Learning DB
// (and @supabase/supabase-js) and is inspected statically only; the trigger
// SQL cannot be executed here and is inspected statically only.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-validation-record-fixtures.ts
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison } from "@/lib/ai/evolutionCandidate/replay";
import { EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION, buildEvolutionValidationRecord, canonicalJson, computeRecordHash, verifyEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import type { GapCategory, EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
}
function strip(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// ---------------------------------------------------------------------------
// Builders
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
    proposedChange: "Investigate whether the current contradiction-resolution logic under-resolves disagreement for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol"],
    status: "DRAFT",
  };
}

function realRejectDominanceProposal(): EvolutionProposalWithoutTimestamp {
  const gap: CognitiveGap = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", category: "REJECT_DOMINANCE_GAP", severity: "HIGH", evidence: { occurrenceCount: 40, evaluatedCount: 45, triggeringTags: [] }, reasons: ["fixture"] };
  const need: EvolutionNeedAssessment = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", need: "EVOLUTION_WARRANTED", consideredGaps: [gap], hasValidConstraint: false, reasons: ["fixture"] };
  return draftEvolutionProposals(need)[0];
}

function candidateFor(p: EvolutionProposalWithoutTimestamp, rows: readonly DecisionMemoryJoinedRow[] | null, limitation: "POPULATION_POSSIBLY_TRUNCATED" | null = null): EvolutionCandidateWithoutTimestamp {
  const replay = rows === null ? null : buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  return finalizeCandidate(p, checkCandidateScope(p.hypothesis, p.proposedChange), replay, limitation);
}

const validRows = [...window(1, 20, 8), ...window(21, 20, 3)];
const baseProposal = proposal();
const baseCandidate = candidateFor(baseProposal, validRows);
const baseRecord = buildEvolutionValidationRecord(baseProposal, baseCandidate);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
/** Same value with every object's keys in REVERSE order — the shape a jsonb round trip may produce. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  return value;
}

// ---------------------------------------------------------------------------
// canonicalJson
// ---------------------------------------------------------------------------

{
  check("R1a. canonicalJson is independent of object key order at every depth", canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }) === canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }), "key order changed the output");
  check("R1b. array order IS significant, and the output is compact JSON", canonicalJson([1, 2]) !== canonicalJson([2, 1]) && canonicalJson({ a: [1, "x", true, null] }) === '{"a":[1,"x",true,null]}', canonicalJson({ a: [1, "x", true, null] }));
  check("R1c. undefined object properties are omitted (like JSON); undefined array elements are an error", canonicalJson({ a: 1, b: undefined }) === '{"a":1}' && (() => { try { canonicalJson([1, undefined]); return false; } catch { return true; } })(), "undefined handling wrong");
  const throwsFor = (v: unknown) => { try { canonicalJson(v); return false; } catch { return true; } };
  check("R1d. non-finite numbers and non-JSON types are errors, never silently coerced", throwsFor(NaN) && throwsFor(Infinity) && throwsFor({ a: () => 1 }) && throwsFor(BigInt(1)) && throwsFor(Symbol("x")), "a non-JSON value was accepted");
}

// ---------------------------------------------------------------------------
// Hash properties
// ---------------------------------------------------------------------------

check("R2a. record built from a real proposal + candidate; hash is 64 lowercase hex", baseRecord !== null && /^[0-9a-f]{64}$/.test(baseRecord.recordHash) && baseRecord.recordSchemaVersion === EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION, JSON.stringify(baseRecord?.recordHash));

if (baseRecord === null) {
  console.log("FAIL — base record could not be built; remaining checks skipped");
  throw new Error("base record could not be built");
}
const record: EvolutionValidationRecordWithoutTimestamp = baseRecord;

{
  const again = buildEvolutionValidationRecord(baseProposal, candidateFor(baseProposal, validRows));
  check("R2b. deterministic: the same proposal + evidence always produces the same hash", again !== null && again.recordHash === record.recordHash, `${again?.recordHash} vs ${record.recordHash}`);
  const reordered = computeRecordHash(reverseKeys(clone(record.snapshot)) as typeof record.snapshot);
  check("R2c. hash is independent of object key order (a jsonb round trip does not change it)", reordered === record.recordHash, `${reordered} vs ${record.recordHash}`);
  const plain = createHash("sha256").update(canonicalJson({ recordSchemaVersion: 1, snapshot: record.snapshot })).digest("hex");
  check("R2d. the hash is domain-separated — it is NOT the bare sha256 of the canonical JSON", plain !== record.recordHash, "no domain separation");
}

{
  const mutations: [string, (s: typeof record.snapshot) => void][] = [
    ["proposal hypothesis", (s) => { (s.proposal as { hypothesis: string }).hypothesis += " "; }],
    ["proposal proposedChange", (s) => { (s.proposal as { proposedChange: string }).proposedChange += "."; }],
    ["proposal evidence count", (s) => { (s.proposal.evidence as { occurrenceCount: number }).occurrenceCount += 1; }],
    ["candidate replay raw occurrence count", (s) => { (s.candidate.replay!.baseline as { targetRawOccurrenceCount: number | null }).targetRawOccurrenceCount = 9; }],
    ["candidate sample accounting", (s) => { (s.candidate.replay!.candidate.sampleAccounting as { excluded: number }).excluded += 1; }],
    ["candidate status", (s) => { (s.candidate as { status: string }).status = "REPLAY_FAILED"; }],
    ["validation result", (s) => { (s.validation as { result: string }).result = "INCONCLUSIVE"; }],
    ["validation gate threshold", (s) => { (s.validation.gateThresholds as { minEligibleSamplesPerWindow: number }).minEligibleSamplesPerWindow = 19; }],
    ["validation gate outcome", (s) => { (s.validation.gates[0] as { passed: boolean }).passed = false; }],
    ["validation limitation text", (s) => { (s.validation as unknown as { limitations: string[] }).limitations = [...s.validation.limitations, "x"]; }],
  ];
  const unchanged = mutations.filter(([, mutate]) => {
    const snapshot = clone(record.snapshot);
    mutate(snapshot);
    return computeRecordHash(snapshot) === record.recordHash;
  }).map(([name]) => name);
  check("R3. the hash changes when ANY part of the frozen content changes (proposal text, evidence, replay counts, accounting, status, result, thresholds, gates, limitations)", unchanged.length === 0, `hash unchanged for: ${unchanged.join(", ")}`);
}

{
  const withTimestamp = { ...record, recordedAt: "2026-09-20T00:00:00.000Z" } as EvolutionValidationRecordWithoutTimestamp;
  check("R4. recordedAt (database time) is not part of the hash — a record carrying it still verifies against the same hash", verifyEvolutionValidationRecord(withTimestamp).valid && computeRecordHash(record.snapshot) === record.recordHash && !("recordedAt" in record) && !JSON.stringify(record.snapshot).includes("recordedAt"), "recordedAt leaked into the hashed content");
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

{
  const v = record.snapshot.validation;
  check(
    "R5. VALID record: columns agree with the snapshot; mode observational; counterfactual false; verification passes",
    record.result === "VALID" && record.result === v.result && record.proposalId === baseProposal.proposalId && record.candidateId === baseCandidate.candidateId && record.gapCategory === "CONTRADICTION_GAP" && record.validationMode === "OBSERVATIONAL_SPLIT_HISTORY" && record.counterfactualAvailable === false && verifyEvolutionValidationRecord(record).valid,
    JSON.stringify(verifyEvolutionValidationRecord(record))
  );
}

{
  const p = realRejectDominanceProposal();
  const c = candidateFor(p, validRows);
  const r = buildEvolutionValidationRecord(p, c);
  check(
    "R6. NOT_APPLICABLE + REJECT_DOMINANCE_GAP produce a valid, verifiable record with no database — the pair the legacy tables cannot hold",
    r !== null && r.result === "NOT_APPLICABLE" && r.gapCategory === "REJECT_DOMINANCE_GAP" && r.snapshot.candidate.status === "CANDIDATE_CREATED" && r.snapshot.candidate.replay === null && verifyEvolutionValidationRecord(r).valid && /^[0-9a-f]{64}$/.test(r.recordHash),
    JSON.stringify({ result: r?.result, cat: r?.gapCategory })
  );
}

{
  const truncated = buildEvolutionValidationRecord(baseProposal, candidateFor(baseProposal, validRows, "POPULATION_POSSIBLY_TRUNCATED"));
  check("R7. a truncation-limited candidate records its limitation inside the snapshot and hashes differently from the unlimited one", truncated !== null && truncated.snapshot.candidate.replayLimitation === "POPULATION_POSSIBLY_TRUNCATED" && truncated.result === "INSUFFICIENT_EVIDENCE" && truncated.recordHash !== record.recordHash && verifyEvolutionValidationRecord(truncated).valid, JSON.stringify(truncated?.result));
}

{
  const other = proposal("EVIDENCE_GAP");
  const foreign = buildEvolutionValidationRecord(baseProposal, candidateFor(other, validRows));
  const tamperedStatus = buildEvolutionValidationRecord(baseProposal, { ...baseCandidate, status: "REPLAY_FAILED" });
  const tamperedText = buildEvolutionValidationRecord(baseProposal, { ...baseCandidate, hypothesis: "a different hypothesis" });
  const tamperedReplay = buildEvolutionValidationRecord(baseProposal, { ...baseCandidate, replayLimitation: "POPULATION_POSSIBLY_TRUNCATED" });
  const nonFinite = clone(baseCandidate);
  (nonFinite.replay!.baseline as { targetRawGapRate: number | null }).targetRawGapRate = NaN;
  check("R8. no record is produced (null) for a candidate that does not follow from its proposal, or whose content cannot be canonically serialized", foreign === null && tamperedStatus === null && tamperedText === null && tamperedReplay === null && buildEvolutionValidationRecord(baseProposal, nonFinite) === null, JSON.stringify([foreign === null, tamperedStatus === null, tamperedText === null, tamperedReplay === null]));
}

{
  const a = buildEvolutionValidationRecord(baseProposal, candidateFor(baseProposal, [...window(1, 20, 8), ...window(21, 20, 3)]));
  const b = buildEvolutionValidationRecord(baseProposal, candidateFor(baseProposal, [...window(1, 20, 8), ...window(21, 20, 4)]));
  check("R9. history accumulates: identical content -> one hash; different evidence for the same proposal -> a different hash (a new row, never an overwrite)", a !== null && b !== null && a.recordHash === record.recordHash && b.recordHash !== a.recordHash && a.candidateId === b.candidateId && a.proposalId === b.proposalId, `${a?.recordHash} ${b?.recordHash}`);
}

// ---------------------------------------------------------------------------
// Verification (integrity of a record read back from storage)
// ---------------------------------------------------------------------------

{
  const roundTrip = reverseKeys(clone(record)) as EvolutionValidationRecordWithoutTimestamp;
  check("V1. a record that went through JSON serialization with reordered keys (the jsonb round trip) still verifies", verifyEvolutionValidationRecord(roundTrip).valid, JSON.stringify(verifyEvolutionValidationRecord(roundTrip)));
}

{
  const cases: [string, (r: EvolutionValidationRecordWithoutTimestamp) => EvolutionValidationRecordWithoutTimestamp][] = [
    ["snapshot validation result rewritten", (r) => { const c = clone(r); (c.snapshot.validation as { result: string }).result = "INVALID"; return c; }],
    ["result column rewritten", (r) => ({ ...clone(r), result: "INVALID" })],
    ["hash altered", (r) => ({ ...clone(r), recordHash: r.recordHash.replace(/^./, r.recordHash[0] === "a" ? "b" : "a") })],
    ["proposal text rewritten", (r) => { const c = clone(r); (c.snapshot.proposal as { hypothesis: string }).hypothesis = "rewritten"; return c; }],
    ["gap category column rewritten", (r) => ({ ...clone(r), gapCategory: "PATTERN_GAP" })],
    ["candidate replay count rewritten", (r) => { const c = clone(r); (c.snapshot.candidate.replay!.candidate as { targetRawOccurrenceCount: number | null }).targetRawOccurrenceCount = 0; return c; }],
  ];
  const accepted = cases.filter(([, mutate]) => verifyEvolutionValidationRecord(mutate(record)).valid).map(([name]) => name);
  check("V2. every tampering case is rejected by verification (hash, column copies, candidate-from-proposal, validation-from-candidate)", accepted.length === 0, `accepted: ${accepted.join(", ")}`);
  const problems = verifyEvolutionValidationRecord(cases[0][1](record)).problems;
  check("V3. verification names the problem (deterministic, non-empty, ordered) rather than returning a bare false", problems.length >= 2 && problems.some((p) => p.includes("recordHash")) && problems.some((p) => p.includes("validation does not follow")), JSON.stringify(problems));
}

// ---------------------------------------------------------------------------
// recordRepository.ts — insert-only, uncalled
// ---------------------------------------------------------------------------

{
  const source = strip(read("lib/ai/evolutionValidation/recordRepository.ts"));
  const writeCalls = [...source.matchAll(/\.(insert|update|upsert|delete|rpc|truncate)\s*\(/g)].map((m) => m[1]);
  check("P1. recordRepository.ts contains exactly ONE write — a plain insert — and no update, upsert, delete, rpc or truncate anywhere", writeCalls.length === 1 && writeCalls[0] === "insert", JSON.stringify(writeCalls));
  const insertAt = source.indexOf(".insert(");
  const verifyAt = source.indexOf("verifyEvolutionValidationRecord(record)");
  check("P2. the record is verified BEFORE it is inserted; a duplicate hash (unique violation 23505) is reported as already_recorded, not overwritten", verifyAt !== -1 && verifyAt < insertAt && source.includes('"23505"') && source.includes("already_recorded"), JSON.stringify({ verifyAt, insertAt }));
  check("P3. recordRepository.ts touches only evolution_validation_records", [...source.matchAll(/\.from\(\s*"([^"]+)"\s*\)/g)].every((m) => m[1] === "evolution_validation_records") && source.includes('.from("evolution_validation_records")'), "another table is referenced");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

{
  const root = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
  const callers: string[] = [];
  for (const dir of ["app", "lib", "components", "scripts"]) {
    for (const file of walk(`${root}/${dir}`)) {
      if (file.endsWith("lib/ai/evolutionValidation/recordRepository.ts") || file.includes("scripts/phase8/")) continue;
      const source = strip(readFileSync(file, "utf8"));
      if (source.includes("appendEvolutionValidationRecord")) callers.push(file.slice(root.length + 1));
    }
  }
  // Phase 8.6.7: the ONE legitimate reference is the approval adapter's createRequestDeps(), which only the admin-authenticated POST request route uses (asserted by the 8.6.7 fixtures). No route, tick, cron or GET reaches it.
  check("P4. only lib/ai/evolutionApproval/repository.ts references appendEvolutionValidationRecord — no route, tick, cron or other module calls it directly", JSON.stringify(callers) === JSON.stringify(["lib/ai/evolutionApproval/repository.ts"]), `referenced by: ${callers.join(", ")}`);
}

{
  // Code only — the route's own header comments legitimately NAME the persist functions to say it never calls them.
  const route = strip(read("app/api/ai-performance/cognitive/route.ts"));
  // Phase 8.6.7: the route imports the PURE record builder (to compute a recordHash) and the read-only approval view; it must import no record REPOSITORY and no write path.
  const found = ["recordRepository", "appendEvolutionValidationRecord", "appendApproval", "createApprovalStore", "createRequestDeps", "persistEvolutionCandidate", "persistEvolutionValidation", "persistEvolutionProposals"].filter((t) => route.includes(t));
  check("P5. the AI Performance GET route imports no record repository and no persistence/append function — it stays compute-only", found.length === 0, `route references: ${found.join(", ")}`);
}

// ---------------------------------------------------------------------------
// The migration (schema.sql) — static inspection only; NOT executed here
// ---------------------------------------------------------------------------

const schema = read("supabase/learning/schema.sql");
const recordsStart = schema.indexOf("create table if not exists evolution_validation_records");
// Phase 8.6.7 appended its own table AFTER this one; this block is the record table's definition only.
const approvalsStart = schema.indexOf("create table if not exists evolution_approvals");
const recordsSql = recordsStart === -1 ? "" : schema.slice(recordsStart, approvalsStart === -1 ? undefined : approvalsStart);

function unionValues(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName} =([^;]+);`));
  return match ? [...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort() : [];
}
function sqlInList(sql: string, column: string): string[] {
  const match = sql.match(new RegExp(`${column} text not null check \\(${column} in \\(([^)]+)\\)\\)`));
  return match ? [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort() : [];
}

{
  check("M1. a NEW table is created (create table if not exists) with record_hash UNIQUE and a 64-hex CHECK", recordsStart !== -1 && /record_hash text not null unique check \(record_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(recordsSql), "record table or hash constraint missing");
  const resultsInSql = sqlInList(recordsSql, "result");
  const resultsInCode = unionValues(read("lib/ai/evolutionValidation/contracts.ts"), "ValidationResult");
  check("M2. the result CHECK lists exactly the 5 ValidationResult values, including NOT_APPLICABLE (compared against the TypeScript union, not a copy)", resultsInSql.length === 5 && JSON.stringify(resultsInSql) === JSON.stringify(resultsInCode) && resultsInSql.includes("NOT_APPLICABLE"), JSON.stringify({ resultsInSql, resultsInCode }));
  const gapsInSql = sqlInList(recordsSql, "gap_category");
  const gapsInCode = unionValues(read("lib/ai/cognitiveGap/contracts.ts"), "GapCategory");
  check("M3. the gap_category CHECK lists exactly the 7 GapCategory values, including REJECT_DOMINANCE_GAP (compared against the TypeScript union)", gapsInSql.length === 7 && JSON.stringify(gapsInSql) === JSON.stringify(gapsInCode) && gapsInSql.includes("REJECT_DOMINANCE_GAP"), JSON.stringify({ gapsInSql, gapsInCode }));
  check("M4. validation_mode is pinned to OBSERVATIONAL_SPLIT_HISTORY and counterfactual_available is pinned to false", /validation_mode text not null check \(validation_mode = 'OBSERVATIONAL_SPLIT_HISTORY'\)/.test(recordsSql) && /counterfactual_available boolean not null check \(counterfactual_available = false\)/.test(recordsSql), "mode/counterfactual constraint missing");
  check("M5. UPDATE and DELETE are rejected per row and TRUNCATE per statement by triggers on the new table, through a function that raises", /create or replace function evolution_validation_records_reject_mutation\(\)/.test(recordsSql) && /raise exception/.test(recordsSql) && /before update or delete on evolution_validation_records\s+for each row/.test(recordsSql) && /before truncate on evolution_validation_records\s+for each statement/.test(recordsSql), "append-only trigger definition incomplete");
  check("M6. the migration is idempotent (create table/index if not exists, drop trigger if exists, create or replace function) and enables row level security with no policy", /create index if not exists evolution_validation_records_candidate_idx/.test(recordsSql) && (recordsSql.match(/drop trigger if exists/g) ?? []).length === 2 && /alter table evolution_validation_records enable row level security/.test(recordsSql) && !/create policy/.test(recordsSql), "idempotency or RLS missing");
}

{
  const legacy = recordsStart === -1 ? schema : schema.slice(0, recordsStart);
  const statements = [...schema.matchAll(/^\s*(alter table|drop table|drop constraint|delete from|update|truncate)\b[^;]*;/gim)].map((m) => m[0].trim().replace(/\s+/g, " "));
  const touchingLegacy = statements.filter((s) => /evolution_(proposals|candidates|validations)\b/.test(s) && !/enable row level security/.test(s));
  check("M7. no existing evolution_* table is altered, dropped, truncated or rewritten — the only statements naming them are the original enable-row-level-security ones", touchingLegacy.length === 0, JSON.stringify(touchingLegacy));
  const candidatesSql = legacy.slice(legacy.indexOf("create table if not exists evolution_candidates"), legacy.indexOf("create table if not exists evolution_validations "));
  const validationsSql = legacy.slice(legacy.indexOf("create table if not exists evolution_validations "), legacy.indexOf("create index if not exists evolution_validations_source_symbol_idx"));
  check("M8. the legacy CHECK constraints are exactly as before (result has the original 4 values; candidates.gap_category has the original 6)", validationsSql.includes("result in ('VALID', 'INVALID', 'INSUFFICIENT_EVIDENCE', 'INCONCLUSIVE')") && !validationsSql.includes("NOT_APPLICABLE") && !candidatesSql.includes("REJECT_DOMINANCE_GAP") && sqlInList(candidatesSql, "gap_category").length === 6, "a legacy constraint changed");
  check("M9. the record table is appended AFTER the legacy tables (the migration is additive at the end of the file)", schema.indexOf("create table if not exists evolution_validations ") < recordsStart && recordsStart > 0, "ordering unexpected");
}

// ---------------------------------------------------------------------------
// 8.6.7 boundary — documented, not implemented
// ---------------------------------------------------------------------------

{
  const contracts = strip(read("lib/ai/evolutionValidation/contracts.ts") + "");
  // Comment lines wrap mid-sentence; join them before matching phrases.
  const contractsRaw = read("lib/ai/evolutionValidation/contracts.ts").replace(/\n\s*\/\/\s?/g, " ");
  check("B1. the contract states that an 8.6.7 approval MUST store recordHash and must not reference ids alone", /MUST store the `recordHash`/.test(contractsRaw) && /ids are stable while the content behind them is not/.test(contractsRaw) && contracts.length > 0, "requirement not documented in contracts.ts");
  const root = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
  const offenders: string[] = [];
  for (const file of walk(`${root}/lib`).concat(walk(`${root}/app`))) {
    const source = strip(readFileSync(file, "utf8"));
    if (/\b(promoteEvolution\w*|applyEvolution\w*|deployEvolution\w*|activateEvolution\w*)\b/.test(source)) offenders.push(file.slice(root.length + 1));
  }
  // Phase 8.6.7 implemented the human approval gate (a RECORDED DECISION only); the boundary that remains is that nothing promotes, applies, deploys or activates.
  check("B2. no promotion, apply, deploy or activate function exists anywhere in lib/ or app/", offenders.length === 0, `found in: ${offenders.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Scope — the record layer does not reach the decision path
// ---------------------------------------------------------------------------

{
  const files = ["lib/ai/evolutionValidation/record.ts", "lib/ai/evolutionValidation/recordRepository.ts", "lib/ai/evolutionValidation/gates.ts"];
  const forbidden = ['from "@/lib/ai/oracle/arbitration', 'from "@/lib/ai/autonomousExecution', 'from "@/lib/ai/decisionQualification', 'from "@/lib/ai/preEntryValidation', 'from "@/lib/ai/autonomousDecision', "fetch(", "Date.now(", "new Date(", "Math.random(", "openai", "anthropic", "execSync", "child_process", "octokit", "github", "vercel", "telegram"];
  const found: string[] = [];
  for (const f of files) {
    const source = strip(read(f)).toLowerCase();
    for (const token of forbidden) if (source.includes(token.toLowerCase())) found.push(`${f}:${token}`);
  }
  check("S1. record.ts / recordRepository.ts / gates.ts import no decision-path module, call no LLM/network, use no clock or randomness, touch no GitHub/Vercel/Telegram", found.length === 0, `found: ${found.join(", ")}`);
  const imports = [...strip(read("lib/ai/evolutionValidation/record.ts")).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  check("S2. record.ts imports only node:crypto and evolution modules", imports.every((i) => i === "node:crypto" || /^@\/lib\/ai\/evolution(Candidate|Proposal)\//.test(i) || i === "./validate" || i === "./contracts"), JSON.stringify(imports));
  const validateSource = strip(read("lib/ai/evolutionValidation/validate.ts"));
  check("S3. validate.ts does not import record.ts — the pure verdict never depends on the record layer", !validateSource.includes('"./record') && !validateSource.includes("recordRepository"), "validate.ts imports the record layer");
  const live = ["decisionQualification/qualify.ts", "autonomousExecution/execute.ts", "autonomousDecision/decide.ts", "preEntryValidation/validate.ts", "autonomousRuntime/orchestrator.ts"];
  const leaks = live.filter((f) => /evolutionValidation|evolutionCandidate|evolutionProposal|evolutionNeed/.test(read(`lib/ai/${f}`)));
  check("S4. no live decision-path file references any evolution module", leaks.length === 0, `leaks: ${leaks.join(", ")}`);
}

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Phase 8.6.6b append-only validation record fixtures passed.`);
if (failures > 0) process.exit(1);
