// ---------------------------------------------------------------------------
// ELVOID Intelligence — External Evidence Normalization (Phase 8.4.3)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PURE and DETERMINISTIC. No network call, no database access, no LLM
//     call, no `Math.random()`. The only "current time" this module ever
//     uses is the caller-supplied `asOf` — there is no `Date.now()`
//     anywhere in this file. Identical `(raw, asOf)` input always
//     produces a deep-equal output (see fixtures E and J).
//   - This module reads the Phase 8.4.1 registry (`getSourceById`) ONLY
//     to resolve `category`, a source's declared `capability` list (for
//     the capability-registered check), and its `freshness.cacheTtlMs`
//     (to bucket evidence age) — that lookup is in-memory, not a fetch.
//     It never calls anything from `researchTrigger/*` and never writes
//     back into the registry.
//   - EvidenceKind is never promoted. `raw.kind` is copied straight to
//     `NormalizedExternalEvidence.kind` — this module has no logic path
//     that turns an `EXTERNAL_CLAIM` or `INTERPRETATION` into a
//     `FACTUAL_OBSERVATION`, regardless of how confident-sounding `claim`
//     is.
//   - Direction is dropped, never invented, when unsupported — see
//     `resolveDirection()`. There is no code path in this file that
//     derives a direction from `claim`'s text or from `capability`
//     alone.
//   - Malformed raw input is never thrown away. Every `RawExternalObservation`
//     passed in produces exactly one `NormalizedExternalEvidence` out —
//     even a completely empty/garbled one — with the problem recorded in
//     `malformed`/`malformedReasons` rather than an exception or a
//     silently-dropped record. A caller processing a batch never loses
//     count between input and output length (see fixture K).
//   - Batch normalization NEVER merges. `normalizeExternalEvidenceBatch`
//     is a plain `map`, nothing more — two observations disagreeing with
//     each other simply become two separate, individually-provenanced
//     evidence records. There is no averaging, no "pick the higher
//     ReliabilityTier" logic, and no consensus field anywhere in this
//     file. `ReliabilityTier` (Phase 8.4.1) is provenance metadata about
//     WHERE a number came from, never evidence that the number is
//     correct — this module never reads it to score or filter evidence.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { getSourceById } from "../registry";
import type {
  RawExternalObservation,
  NormalizedExternalEvidence,
  EvidenceDirection,
  EvidenceFreshness,
  EvidenceAvailability,
  EvidenceProvenance,
  EvidenceSourceCategory,
} from "./contracts";
import { EVIDENCE_DIRECTIONS } from "./contracts";

/**
 * New, explicitly-introduced convention for THIS phase — there is no
 * existing "how many TTLs old counts as stale" precedent anywhere else in
 * this repository to reuse (the closest analog, `FRESHNESS_WINDOW_DAYS`
 * in lib/ai/learningValidation/validate.ts, is a 30-day learning-data
 * window operating on an entirely different timescale and is not
 * meaningfully transferable to a seconds/minutes-scale API cache TTL).
 * A conservative, round, first-cut multiple — matching
 * `lib/ai/macroIntelligence/contracts.ts`'s own documented precedent for
 * introducing a genuinely new bucket boundary honestly rather than
 * silently inventing one.
 */
export const EVIDENCE_STALE_MULTIPLIER = 3;

function isParsableIso(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Deterministic id from stable input fields — never random, never a
 * hidden counter. Same (source, capability, symbol, observedAt,
 * fetchedAt, claim, rawValue) always yields the same id.
 */
function buildEvidenceId(parts: { source: string; capability: string; symbol: string | null; observedAt: string | null; fetchedAt: string | null; claim: string; rawValue: unknown }): string {
  let rawValueKey: string;
  try {
    rawValueKey = JSON.stringify(parts.rawValue) ?? "undefined";
  } catch {
    rawValueKey = "unserializable";
  }
  const stable = [parts.source, parts.capability, parts.symbol ?? "null", parts.observedAt ?? "null", parts.fetchedAt ?? "null", parts.claim, rawValueKey].join("|");
  return createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

/**
 * Deterministic freshness bucket from real timestamps + the registry's
 * own declared cache TTL for this source — never a hidden `Date.now()`.
 * See `EVIDENCE_STALE_MULTIPLIER`'s own header for why the AGING/STALE
 * boundary is a new, explicitly-labeled convention.
 */
export function computeFreshness(observedAt: string | null, fetchedAt: string | null, asOf: string, cacheTtlMs: number | null): EvidenceFreshness {
  const anchor = observedAt ?? fetchedAt;
  if (!anchor) return { bucket: "UNKNOWN", ageMs: null, note: "no observedAt/fetchedAt timestamp supplied" };
  if (!isParsableIso(anchor)) return { bucket: "UNKNOWN", ageMs: null, note: "timestamp failed to parse" };
  if (!isParsableIso(asOf)) return { bucket: "UNKNOWN", ageMs: null, note: "asOf failed to parse" };

  const ageMs = Date.parse(asOf) - Date.parse(anchor);
  if (ageMs < 0) return { bucket: "UNKNOWN", ageMs, note: "timestamp is after asOf — cannot compute a valid age" };
  if (cacheTtlMs === null) return { bucket: "UNKNOWN", ageMs, note: "source has no declared cache TTL policy in the Phase 8.4.1 registry" };

  if (ageMs <= cacheTtlMs) return { bucket: "FRESH", ageMs, note: `within source's own ${cacheTtlMs}ms cache TTL` };
  if (ageMs <= cacheTtlMs * EVIDENCE_STALE_MULTIPLIER) return { bucket: "AGING", ageMs, note: `beyond ${cacheTtlMs}ms TTL but within ${EVIDENCE_STALE_MULTIPLIER}x (${cacheTtlMs * EVIDENCE_STALE_MULTIPLIER}ms)` };
  return { bucket: "STALE", ageMs, note: `beyond ${EVIDENCE_STALE_MULTIPLIER}x source's cache TTL (${cacheTtlMs * EVIDENCE_STALE_MULTIPLIER}ms)` };
}

/**
 * Only ever returns a non-null direction when the raw observation both
 * (a) supplied one from the closed `EvidenceDirection` vocabulary, and
 * (b) supplied a `rawValue` to objectively back it. Anything else is
 * dropped with a recorded reason — never guessed, never left silently
 * unexplained.
 */
function resolveDirection(raw: RawExternalObservation, malformedReasons: string[]): EvidenceDirection | null {
  if (raw.direction === undefined || raw.direction === null) return null;
  if (!EVIDENCE_DIRECTIONS.includes(raw.direction)) {
    malformedReasons.push(`unrecognized direction value "${String(raw.direction)}" dropped`);
    return null;
  }
  const hasBacking = raw.rawValue !== undefined && raw.rawValue !== null;
  if (!hasBacking) {
    malformedReasons.push(`direction "${raw.direction}" omitted — no rawValue supplied to objectively derive it from`);
    return null;
  }
  return raw.direction;
}

function resolveProvenance(raw: RawExternalObservation, malformedReasons: string[]): { category: EvidenceSourceCategory; provenance: EvidenceProvenance } {
  const reference = raw.reference ?? null;
  const def = getSourceById(raw.source);

  if (!def) {
    malformedReasons.push(`source "${raw.source}" not found in the Phase 8.4.1 registry`);
    return {
      category: "UNKNOWN",
      provenance: {
        source: raw.source,
        sourceRegistered: false,
        capability: raw.capability,
        reference,
        limitation: `source "${raw.source}" is not a registered External Source — provenance cannot be verified against the registry`,
      },
    };
  }

  const capabilityRegistered = def.capability.includes(raw.capability);
  if (!capabilityRegistered) {
    malformedReasons.push(`capability "${raw.capability}" is not registered for source "${raw.source}"`);
  }

  return {
    category: def.category,
    provenance: {
      source: raw.source,
      sourceRegistered: true,
      capability: raw.capability,
      reference,
      limitation: capabilityRegistered ? null : `source "${raw.source}" does not declare capability "${raw.capability}" in the registry`,
    },
  };
}

/**
 * `status === "OK"` still requires a non-empty `claim` to become
 * `AVAILABLE` — a producer that reports success but supplies nothing to
 * say is treated as honestly unclassifiable (`UNKNOWN`), never silently
 * upgraded to a real observation.
 */
function resolveAvailability(status: unknown, claim: string, malformedReasons: string[]): EvidenceAvailability {
  if (status === "OK") {
    if (claim.trim().length === 0) {
      malformedReasons.push("status=OK but claim is empty/missing");
      return "UNKNOWN";
    }
    return "AVAILABLE";
  }
  if (status === "UNAVAILABLE") return "UNAVAILABLE";
  if (status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  malformedReasons.push(`unrecognized status "${String(status)}"`);
  return "UNKNOWN";
}

/**
 * The single-observation entry point. Pure, synchronous. Always returns
 * exactly one evidence record — never throws on malformed input, never
 * drops it.
 */
export function normalizeExternalEvidence(raw: RawExternalObservation, asOf: string): NormalizedExternalEvidence {
  const malformedReasons: string[] = [];

  const claim = typeof raw.claim === "string" ? raw.claim : "";
  if (claim.trim().length === 0) malformedReasons.push("claim missing or empty");

  const symbol = typeof raw.symbol === "string" && raw.symbol.trim().length > 0 ? raw.symbol : null;

  let observedAt: string | null = null;
  if (raw.observedAt != null) {
    if (isParsableIso(raw.observedAt)) observedAt = raw.observedAt;
    else malformedReasons.push("observedAt present but unparseable — treated as null");
  }

  let fetchedAt: string | null = null;
  if (raw.fetchedAt != null) {
    if (isParsableIso(raw.fetchedAt)) fetchedAt = raw.fetchedAt;
    else malformedReasons.push("fetchedAt present but unparseable — treated as null");
  }

  const { category, provenance } = resolveProvenance(raw, malformedReasons);
  const availability = resolveAvailability(raw.status, claim, malformedReasons);
  const direction = resolveDirection(raw, malformedReasons);
  const cacheTtlMs = getSourceById(raw.source)?.freshness.cacheTtlMs ?? null;
  const freshness = computeFreshness(observedAt, fetchedAt, asOf, cacheTtlMs);

  const rawValue = raw.rawValue ?? null;
  const id = buildEvidenceId({ source: raw.source, capability: raw.capability, symbol, observedAt, fetchedAt, claim, rawValue });

  return {
    version: 1,
    id,
    source: raw.source,
    category,
    capability: raw.capability,
    symbol,
    observedAt,
    fetchedAt,
    normalizedAt: asOf,
    kind: raw.kind,
    claim,
    rawValue,
    direction,
    freshness,
    availability,
    provenance,
    malformed: malformedReasons.length > 0,
    malformedReasons,
  };
}

/**
 * Batch entry point — a plain, order-preserving map over
 * `normalizeExternalEvidence`. Never merges, never drops, never
 * reconciles conflicting entries. Input length always equals output
 * length.
 */
export function normalizeExternalEvidenceBatch(raws: readonly RawExternalObservation[], asOf: string): readonly NormalizedExternalEvidence[] {
  return raws.map((raw) => normalizeExternalEvidence(raw, asOf));
}
