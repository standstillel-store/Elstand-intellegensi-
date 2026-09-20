// ---------------------------------------------------------------------------
// ELVOID Intelligence — Append-only validation record, pure construction and
// verification (Phase 8.6.6b)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// Date.now()/randomness. The only non-arithmetic dependency is a sha256 from
// node:crypto; nothing here is a secret or a signature — the hash is a
// CONTENT IDENTITY, not authentication.
//
// WHAT A RECORD IS: one proposal + the candidate built from it + the
// validation derived from that candidate, frozen together and named by the
// hash of their canonical serialization. See contracts.ts for the 8.6.7
// requirement (an approval must store `recordHash`).
//
// CONSISTENCY IS ENFORCED, NOT ASSUMED: `buildEvolutionValidationRecord`
// takes only the proposal and the candidate. It re-derives the candidate's
// scope check and status from (proposal, candidate.replay,
// candidate.replayLimitation) and re-derives the validation from the
// candidate; if the candidate handed in is not exactly what that derivation
// gives, no record is produced (`null`). A record therefore cannot contain a
// validation that does not follow from its candidate, or a candidate that
// does not follow from its proposal. `verifyEvolutionValidationRecord` runs
// the same checks against a record read back from storage.
//
// CANONICAL SERIALIZATION: JSON with object keys sorted (code-unit order) at
// every depth, arrays in order, no whitespace, `undefined` object properties
// omitted. `undefined` inside an array, a non-finite number, or a non-JSON
// type is an error — never silently coerced — and yields `null` from the
// builder. `recordedAt` is not part of the snapshot, so it cannot affect the
// hash.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { candidateIdFor, checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { validateEvolutionCandidate } from "./validate";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionCandidateWithoutTimestamp } from "@/lib/ai/evolutionCandidate/contracts";
import type { EvolutionValidationRecordSnapshot, EvolutionValidationRecordWithoutTimestamp } from "./contracts";

export const EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION = 1 as const;

/** Domain separator so this hash can never equal a hash of the same bytes computed for another purpose. */
const HASH_DOMAIN = "elvoid.evolution-validation-record.v1\n";

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((item) => {
            if (item === undefined) throw new Error("canonicalJson: undefined array element");
            return canonicalize(item);
          })
          .join(",")}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** Canonical JSON text of any plain JSON-shaped value. Throws on undefined array elements, non-finite numbers and non-JSON types. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

/** sha256 (lowercase hex) of the domain-separated canonical serialization of `{ recordSchemaVersion, snapshot }`. Throws exactly when `canonicalJson` would. */
export function computeRecordHash(snapshot: EvolutionValidationRecordSnapshot): string {
  return createHash("sha256")
    .update(HASH_DOMAIN + canonicalize({ recordSchemaVersion: EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION, snapshot }))
    .digest("hex");
}

/** `true` when `candidate` is exactly what the pipeline derives from `proposal` + the candidate's own replay/limitation. */
function candidateFollowsFromProposal(proposal: EvolutionProposalWithoutTimestamp, candidate: EvolutionCandidateWithoutTimestamp): boolean {
  if (candidate.candidateId !== candidateIdFor(proposal)) return false;
  const rebuilt = finalizeCandidate(proposal, checkCandidateScope(proposal.hypothesis, proposal.proposedChange), candidate.replay, candidate.replayLimitation);
  return canonicalize(rebuilt) === canonicalize(candidate);
}

/**
 * Builds the record for one proposal + candidate, deriving the validation
 * itself. Returns `null` when the candidate does not follow from the
 * proposal, or when anything in the snapshot cannot be canonically
 * serialized. Never throws.
 */
export function buildEvolutionValidationRecord(proposal: EvolutionProposalWithoutTimestamp, candidate: EvolutionCandidateWithoutTimestamp): EvolutionValidationRecordWithoutTimestamp | null {
  try {
    if (!candidateFollowsFromProposal(proposal, candidate)) return null;
    const validation = validateEvolutionCandidate(candidate);
    const snapshot: EvolutionValidationRecordSnapshot = { proposal, candidate, validation };
    return {
      recordHash: computeRecordHash(snapshot),
      recordSchemaVersion: EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION,
      proposalId: proposal.proposalId,
      candidateId: candidate.candidateId,
      source: proposal.source,
      symbol: proposal.symbol,
      gapCategory: proposal.gapCategory,
      result: validation.result,
      validationMode: validation.validationMode,
      counterfactualAvailable: validation.counterfactualAvailable,
      snapshot,
    };
  } catch {
    return null;
  }
}

export interface RecordVerification {
  readonly valid: boolean;
  /** Empty exactly when `valid`. Deterministic, ordered. */
  readonly problems: readonly string[];
}

/**
 * Independent integrity check of a record (freshly built, or read back from
 * storage): the hash matches the snapshot, the column copies agree with the
 * snapshot, and the snapshot is internally consistent (candidate follows from
 * proposal, validation follows from candidate). Never throws.
 */
export function verifyEvolutionValidationRecord(record: EvolutionValidationRecordWithoutTimestamp): RecordVerification {
  const problems: string[] = [];
  try {
    const { snapshot } = record;
    if (record.recordSchemaVersion !== EVOLUTION_VALIDATION_RECORD_SCHEMA_VERSION) problems.push("recordSchemaVersion is not the supported version.");
    if (computeRecordHash(snapshot) !== record.recordHash) problems.push("recordHash does not match the canonical serialization of the snapshot.");
    if (record.proposalId !== snapshot.proposal.proposalId) problems.push("proposalId column does not match the snapshot proposal.");
    if (record.candidateId !== snapshot.candidate.candidateId) problems.push("candidateId column does not match the snapshot candidate.");
    if (record.source !== snapshot.proposal.source) problems.push("source column does not match the snapshot proposal.");
    if (record.symbol !== snapshot.proposal.symbol) problems.push("symbol column does not match the snapshot proposal.");
    if (record.gapCategory !== snapshot.proposal.gapCategory) problems.push("gapCategory column does not match the snapshot proposal.");
    if (record.result !== snapshot.validation.result) problems.push("result column does not match the snapshot validation.");
    if (record.validationMode !== snapshot.validation.validationMode) problems.push("validationMode column does not match the snapshot validation.");
    if (record.counterfactualAvailable !== snapshot.validation.counterfactualAvailable) problems.push("counterfactualAvailable column does not match the snapshot validation.");
    if (!candidateFollowsFromProposal(snapshot.proposal, snapshot.candidate)) problems.push("snapshot candidate does not follow from the snapshot proposal.");
    if (canonicalize(validateEvolutionCandidate(snapshot.candidate)) !== canonicalize(snapshot.validation)) problems.push("snapshot validation does not follow from the snapshot candidate.");
  } catch {
    problems.push("record could not be canonically serialized.");
  }
  return { valid: problems.length === 0, problems };
}
