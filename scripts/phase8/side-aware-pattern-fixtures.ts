// ---------------------------------------------------------------------------
// Side-aware failure-pattern isolation — regression fixtures (dev-only).
//
// Root cause under test (production audit, 2026-10-08): `failure_pattern_candidates`
// is keyed (source, symbol, evidenceTag) and is SIDE-BLIND. A group reached
// MIN_OCCURRENCE_COUNT purely by pooling LONG and SHORT losses, was returned in
// `matchedPatterns` regardless of the query's side, and
// `qualify.ts::computeSignals()` treats `matchedPatternPresent` alone as
// negativeMemorySignalPresent -> CONFLICTED -> pre-entry BLOCKED -> REJECT.
// 184/189 production REJECTs were pattern-only; only 8 had >= 5 same-side
// negative evaluations.
//
// Pure/offline. Exercises the real retrieveDecisionMemory() ->
// qualifyAutonomousDecision() -> decideAutonomous() chain (no DB).
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/side-aware-pattern-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { retrieveDecisionMemory } from "@/lib/ai/decisionMemory/retrieve";
import { detectFailurePatternCandidates, detectSideScopedFailurePatternCandidates } from "@/lib/ai/failurePatterns/detect";
import { qualifyAutonomousDecision } from "@/lib/ai/decisionQualification/qualify";
import { QUALIFIABLE_SOURCE } from "@/lib/ai/decisionQualification/contracts";
import type { AutonomousDecisionContext } from "@/lib/ai/decisionQualification/contracts";
import type { DecisionMemoryJoinedRow, DecisionMemoryQuery, DecisionExperienceRecord, DecisionEvaluation, FailurePatternCandidate } from "@/lib/ai/decisionMemory/contracts";
import type { FailurePatternObservationInput } from "@/lib/ai/failurePatterns/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const SRC = "ELVOID_PRO_ORACLE" as const;
const GENERATED_AT = "2026-10-08T07:00:00.000Z";

type Side = "LONG" | "SHORT" | null;
let seq = 0;

function joined(symbol: string, side: Side, kind: "neg" | "pos", day: number, opts: { source?: "AI_SIGNAL" | "ELVOID_PRO_ORACLE"; tags?: DecisionEvaluation["evidence"] } = {}): DecisionMemoryJoinedRow {
  const id = `sig-${++seq}`;
  const ts = `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`;
  const experience: DecisionExperienceRecord = {
    id: `exp-${id}`,
    source: opts.source ?? SRC,
    sourceSignalId: id,
    symbol,
    side: side as never, // `null` models an unknown-side row (defensive; the column is nullable in practice for legacy data).
    grade: "A",
    confidence: 80,
    decisionTimestamp: ts,
    learningContext: null,
    createdAt: ts,
    outcome: null,
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: id,
    decisionQuality: "GOOD",
    marketOutcome: kind === "neg" ? "NEGATIVE" : "POSITIVE",
    evaluationClass: kind === "neg" ? "GOOD_DECISION_BAD_OUTCOME" : "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: opts.tags ?? ["HIGH_GRADE"],
    evaluatedAt: ts,
  };
  return { experience, evaluation };
}

/** Distinct days (>= 2) so the temporal-spread rule is satisfied unless a test says otherwise. */
function negs(symbol: string, side: Side, count: number, opts: { startDay?: number; singleDay?: boolean; source?: "AI_SIGNAL" | "ELVOID_PRO_ORACLE" } = {}): DecisionMemoryJoinedRow[] {
  return Array.from({ length: count }, (_, i) => joined(symbol, side, "neg", opts.singleDay ? (opts.startDay ?? 1) : (opts.startDay ?? 1) + i, { source: opts.source }));
}
function poss(symbol: string, side: Side, count: number, startDay = 1): DecisionMemoryJoinedRow[] {
  return Array.from({ length: count }, (_, i) => joined(symbol, side, "pos", startDay + i));
}

/** The persisted, SIDE-BLIND pattern row exactly as production holds it (pooled counts). */
function persisted(symbol: string, overrides: Partial<FailurePatternCandidate> = {}): FailurePatternCandidate {
  return {
    version: 1,
    source: SRC,
    symbol,
    evidenceTag: "HIGH_GRADE",
    dominantEvaluationClass: "GOOD_DECISION_BAD_OUTCOME",
    occurrenceCount: 5,
    dominantClassShare: 1,
    confidence: 0.1167,
    firstObservedAt: "2026-10-01T10:00:00.000Z",
    lastObservedAt: "2026-10-07T10:00:00.000Z",
    computedAt: "2026-10-08T06:58:50.278Z",
    ...overrides,
  };
}

function q(symbol: string, side?: "LONG" | "SHORT", extra: Partial<DecisionMemoryQuery> = {}): DecisionMemoryQuery {
  return { source: SRC, symbol, ...(side ? { side } : {}), ...extra };
}

function ctx(symbol: string, side: "LONG" | "SHORT", memory: ReturnType<typeof retrieveDecisionMemory> | null): AutonomousDecisionContext {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
    symbol,
    source: QUALIFIABLE_SOURCE,
    canonical: { symbol, timestamp: "2026-10-08T06:55:00.000Z", grade: "A", side, confidence: 80, riskStatus: "valid", invalidation: "n/a" },
    cognitive: null,
    memory,
    validConstraints: [],
  };
}

// ===========================================================================
// 1. The core regression: a pattern that exists ONLY because opposite-side
//    losses were pooled must not veto either direction.
// ===========================================================================

// 1a. ARB-shaped (production): 2 LONG + 3 SHORT negatives, 4 LONG positives. Pooled = 5 -> persisted pattern.
{
  const rows = [...negs("ARB", "LONG", 2, { startDay: 1 }), ...negs("ARB", "SHORT", 3, { startDay: 3 }), ...poss("ARB", "LONG", 4, 6)];
  const patterns = [persisted("ARB")];
  const pooledDetected = detectFailurePatternCandidates(rows.map((r) => ({ source: r.experience.source, symbol: r.experience.symbol, sourceSignalId: r.experience.sourceSignalId, evaluationClass: r.evaluation!.evaluationClass, evidenceTags: r.evaluation!.evidence, decisionTimestamp: r.experience.decisionTimestamp })));
  check("1a-pre. The side-blind detector DOES produce the pooled ARB HIGH_GRADE pattern (reproduces the production precondition)", pooledDetected.some((c) => c.symbol === "ARB" && c.evidenceTag === "HIGH_GRADE" && c.occurrenceCount === 5), JSON.stringify(pooledDetected));

  const long = retrieveDecisionMemory(q("ARB", "LONG"), rows, patterns);
  const short = retrieveDecisionMemory(q("ARB", "SHORT"), rows, patterns);
  check("1a. ARB LONG query: pooled pattern (2 LONG + 3 SHORT) no longer matches", long.matchedPatterns.length === 0, JSON.stringify(long.matchedPatterns));
  check("1b. ARB SHORT query: pooled pattern (3 SHORT only) no longer matches", short.matchedPatterns.length === 0, JSON.stringify(short.matchedPatterns));

  const qual = qualifyAutonomousDecision(ctx("ARB", "LONG", long));
  check("1c. Qualification for ARB LONG is no longer CONFLICTED via matchedPatternPresent", qual.status === "QUALIFIED" && qual.negativeMemory?.matchedPatternPresent === false && qual.signals.negativeMemorySignalPresent === false, JSON.stringify(qual));
}

// 1d. Opposite-only: ADA-shaped — all 6 negatives are LONG. A SHORT decision has zero same-side negatives.
{
  const rows = [...negs("ADA", "LONG", 6, { startDay: 1 }), ...poss("ADA", "LONG", 7, 1)];
  const patterns = [persisted("ADA", { occurrenceCount: 6 })];
  const short = retrieveDecisionMemory(q("ADA", "SHORT"), rows, patterns);
  check("1d. ADA SHORT (zero same-side negatives; all 6 losses were LONG) -> no pattern match", short.matchedPatterns.length === 0, JSON.stringify(short.matchedPatterns));
  check("1e. ADA SHORT qualification is QUALIFIED, not CONFLICTED", qualifyAutonomousDecision(ctx("ADA", "SHORT", short)).status === "QUALIFIED", "");
}

// ===========================================================================
// 2. Negative memory is NOT bypassed: a genuine same-side recurring failure
//    still matches and still produces CONFLICTED.
// ===========================================================================
{
  const rows = [...negs("DOGE", "LONG", 5, { startDay: 1 })];
  const patterns = [persisted("DOGE")];
  const long = retrieveDecisionMemory(q("DOGE", "LONG"), rows, patterns);
  check("2a. DOGE LONG: 5 same-side negatives across 5 days -> pattern still matches", long.matchedPatterns.length === 1 && long.matchedPatterns[0].occurrenceCount === 5, JSON.stringify(long.matchedPatterns));
  const qual = qualifyAutonomousDecision(ctx("DOGE", "LONG", long));
  check("2b. ...and qualification is still CONFLICTED (negative memory not bypassed)", qual.status === "CONFLICTED" && qual.negativeMemory?.matchedPatternPresent === true, JSON.stringify(qual));
  const short = retrieveDecisionMemory(q("DOGE", "SHORT"), rows, patterns);
  check("2c. ...but the opposite direction (DOGE SHORT) is not vetoed by LONG's failures", short.matchedPatterns.length === 0, JSON.stringify(short.matchedPatterns));
}

// ===========================================================================
// 3. Same detector, same thresholds — nothing loosened.
// ===========================================================================
{
  const four = [...negs("SOL", "LONG", 4, { startDay: 1 })];
  check("3a. 4 same-side negatives (< MIN_OCCURRENCE_COUNT=5) -> no match even though a persisted pooled row exists", retrieveDecisionMemory(q("SOL", "LONG"), four, [persisted("SOL")]).matchedPatterns.length === 0, "");
  const oneDay = [...negs("SOL", "LONG", 6, { startDay: 3, singleDay: true })];
  check("3b. 6 same-side negatives all on ONE calendar day -> temporal-spread rule still rejects", retrieveDecisionMemory(q("SOL", "LONG"), oneDay, [persisted("SOL")]).matchedPatterns.length === 0, "");
}

// ===========================================================================
// 4. Unknown-side, symbol and source isolation.
// ===========================================================================
{
  const rows = [...negs("XRP", "LONG", 3, { startDay: 1 }), ...negs("XRP", null, 4, { startDay: 4 })];
  check("4a. Unknown-side (null) negatives are never attributed to LONG (3 LONG + 4 unknown -> no LONG match)", retrieveDecisionMemory(q("XRP", "LONG"), rows, [persisted("XRP", { occurrenceCount: 7 })]).matchedPatterns.length === 0, "");
  check("4a'. ...nor to SHORT", retrieveDecisionMemory(q("XRP", "SHORT"), rows, [persisted("XRP", { occurrenceCount: 7 })]).matchedPatterns.length === 0, "");

  const mixedSymbols = [...negs("LINK", "LONG", 3, { startDay: 1 }), ...negs("OP", "LONG", 5, { startDay: 1 })];
  check("4b. Same-side negatives of ANOTHER symbol never count (LINK LONG: 3 own + 5 OP)", retrieveDecisionMemory(q("LINK", "LONG"), mixedSymbols, [persisted("LINK", { occurrenceCount: 3 })]).matchedPatterns.length === 0, "");

  const mixedSources = [...negs("BNB", "LONG", 3, { startDay: 1 }), ...negs("BNB", "LONG", 5, { startDay: 1, source: "AI_SIGNAL" })];
  check("4c. Same-side negatives of the OTHER source never count", retrieveDecisionMemory(q("BNB", "LONG"), mixedSources, [persisted("BNB", { occurrenceCount: 3 })]).matchedPatterns.length === 0, "");
}

// ===========================================================================
// 5. Safety properties.
// ===========================================================================
{
  // 5a. A side-scoped qualification can never create a match without a persisted row.
  const rows = [...negs("SUI", "LONG", 6, { startDay: 1 })];
  check("5a. Same-side history qualifies but NO persisted pattern row exists -> still no match (read path never invents a pattern)", retrieveDecisionMemory(q("SUI", "LONG"), rows, []).matchedPatterns.length === 0, "");

  // 5b. Unscoped query (no side) is byte-identical to before: returns the persisted pooled row untouched.
  const pooled = persisted("SUI");
  const unscoped = retrieveDecisionMemory(q("SUI"), rows, [pooled]);
  check("5b. Query without `side` returns the persisted row unchanged (explicit unscoped read)", unscoped.matchedPatterns.length === 1 && JSON.stringify(unscoped.matchedPatterns[0]) === JSON.stringify(pooled), JSON.stringify(unscoped.matchedPatterns));

  // 5c. Returned counts are the SIDE-scoped ones; identity/computedAt come from the persisted row.
  const rows6 = [...negs("PEPE", "SHORT", 6, { startDay: 1 }), ...negs("PEPE", "LONG", 2, { startDay: 8 })];
  const res = retrieveDecisionMemory(q("PEPE", "SHORT"), rows6, [persisted("PEPE", { occurrenceCount: 8, computedAt: "2026-10-08T06:58:50.278Z" })]);
  check("5c. Returned pattern carries SIDE-scoped occurrenceCount (6, not pooled 8) and the persisted computedAt", res.matchedPatterns.length === 1 && res.matchedPatterns[0].occurrenceCount === 6 && res.matchedPatterns[0].computedAt === "2026-10-08T06:58:50.278Z", JSON.stringify(res.matchedPatterns));

  // 5d. Subset property: side-scoped keys ⊆ side-blind keys for a mixed population, both sides.
  const pop = [...negs("WIF", "LONG", 6, { startDay: 1 }), ...negs("WIF", "SHORT", 2, { startDay: 7 }), ...negs("ETH", "LONG", 2, { startDay: 1 }), ...negs("ETH", "SHORT", 3, { startDay: 3 })];
  const pats = [persisted("WIF", { occurrenceCount: 8 }), persisted("ETH")];
  const keyOf = (p: FailurePatternCandidate) => `${p.symbol}::${p.evidenceTag}`;
  let subsetOk = true;
  for (const sym of ["WIF", "ETH"]) {
    const blind = new Set(retrieveDecisionMemory(q(sym), pop, pats).matchedPatterns.map(keyOf));
    for (const side of ["LONG", "SHORT"] as const) {
      for (const m of retrieveDecisionMemory(q(sym, side), pop, pats).matchedPatterns) if (!blind.has(keyOf(m))) subsetOk = false;
    }
  }
  check("5d. Side-scoped matches are always a subset of the side-blind matches (can only remove, never add)", subsetOk, "");
  check("5e. WIF LONG (6 same-side) still matches while WIF SHORT (2) does not", retrieveDecisionMemory(q("WIF", "LONG"), pop, pats).matchedPatterns.length === 1 && retrieveDecisionMemory(q("WIF", "SHORT"), pop, pats).matchedPatterns.length === 0, "");

  // 5f. Determinism + no input mutation.
  const snapshot = JSON.stringify({ pop, pats });
  const a = JSON.stringify(retrieveDecisionMemory(q("WIF", "LONG"), pop, pats));
  const b = JSON.stringify(retrieveDecisionMemory(q("WIF", "LONG"), [...pop].reverse(), pats));
  check("5f. Deterministic regardless of input row order, and inputs are never mutated", a === b && JSON.stringify({ pop, pats }) === snapshot, "");
}

// ===========================================================================
// 6. Freshness interplay: `since` is applied to the SIDE-SCOPED lastObservedAt.
// ===========================================================================
{
  // Pooled row looks fresh (a recent SHORT loss), but LONG's own newest loss is old.
  const rows = [...negs("AVAX", "LONG", 5, { startDay: 1 }), ...negs("AVAX", "SHORT", 1, { startDay: 7 })];
  const pats = [persisted("AVAX", { occurrenceCount: 6, lastObservedAt: "2026-10-07T10:00:00.000Z" })];
  const since = "2026-10-06T00:00:00.000Z";
  check("6a. LONG's own newest loss (Oct 5) predates `since`, so a stale LONG pattern is not kept alive by a fresh SHORT loss", retrieveDecisionMemory(q("AVAX", "LONG", { since }), rows, pats).matchedPatterns.length === 0, "");
  check("6b. Without `since`, the same LONG pattern matches (it genuinely qualifies on its own side)", retrieveDecisionMemory(q("AVAX", "LONG"), rows, pats).matchedPatterns.length === 1, "");
}

// ===========================================================================
// 7. Pure detector: side-scoped is the same algorithm over a filtered subset;
//    the persisted side-blind detector is unchanged by the new optional field.
// ===========================================================================
{
  const obs = (side: Side, day: number, i: number): FailurePatternObservationInput => ({ source: SRC, symbol: "BTC", side, sourceSignalId: `o-${side}-${i}`, evaluationClass: "GOOD_DECISION_BAD_OUTCOME", evidenceTags: ["HIGH_GRADE"], decisionTimestamp: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z` });
  const population = [1, 2, 3].map((d, i) => obs("LONG", d, i)).concat([4, 5].map((d, i) => obs("SHORT", d, i + 10)));
  const blind = detectFailurePatternCandidates(population);
  const blindStripped = detectFailurePatternCandidates(population.map(({ side: _side, ...rest }) => rest));
  check("7a. The side-blind detector ignores the new `side` field (output identical with/without it) — persisted aggregates, constraints and causal graph are unaffected", JSON.stringify(blind) === JSON.stringify(blindStripped) && blind.length === 1 && blind[0].occurrenceCount === 5, JSON.stringify(blind));
  check("7b. detectSideScoped(LONG) on 3 LONG + 2 SHORT -> []", detectSideScopedFailurePatternCandidates(population, "LONG").length === 0, "");
  const fiveLong = [1, 2, 3, 4, 5].map((d, i) => obs("LONG", d, i));
  check("7c. detectSideScoped(LONG) on 5 LONG -> exactly one candidate with occurrenceCount 5", detectSideScopedFailurePatternCandidates(fiveLong, "LONG").length === 1 && detectSideScopedFailurePatternCandidates(fiveLong, "SHORT").length === 0, "");
}

// ===========================================================================
// 8. Static guards.
// ===========================================================================
{
  const retrieveSrc = readFileSync("lib/ai/decisionMemory/retrieve.ts", "utf8");
  const detectSrc = readFileSync("lib/ai/failurePatterns/detect.ts", "utf8");
  const qualifySrc = readFileSync("lib/ai/decisionQualification/qualify.ts", "utf8");
  check("8a. retrieve.ts reuses the pure detector (no second, divergent threshold constant)", retrieveSrc.includes("detectSideScopedFailurePatternCandidates") && !/MIN_OCCURRENCE_COUNT\s*=/.test(retrieveSrc), "");
  check("8b. detect.ts keeps MIN_OCCURRENCE_COUNT = 5 (threshold not lowered)", /export const MIN_OCCURRENCE_COUNT = 5;/.test(detectSrc), "");
  check("8c. qualify.ts still treats matchedPatternPresent as a CONFLICTED signal (veto logic untouched)", qualifySrc.includes("negativeMemory.matchedPatternPresent || negativeMemory.state === \"CURRENT_NEGATIVE_EVIDENCE\""), "");
  check("8d. detect.ts keeps zero imports from lib/elvoid (module boundary preserved)", !/from\s+["']@\/lib\/elvoid/.test(detectSrc) && !/from\s+["']@\/lib\/elvoid/.test(readFileSync("lib/ai/failurePatterns/contracts.ts", "utf8")), "");
}

console.log(failures === 0 ? `\n✓ ${passed}/${passed} Side-aware pattern isolation fixtures passed.` : `\n${failures} fixture(s) FAILED (${passed} passed).`);
if (failures > 0) process.exitCode = 1;
