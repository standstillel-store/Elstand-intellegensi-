// ---------------------------------------------------------------------------
// ELVOID Intelligence — External Evidence Normalization contracts
// (Phase 8.4.3)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - AUDITED FIRST: `lib/ai/oracle/evidence.ts`'s `NormalizedEvidence` is
//     NOT reused here. That type's `source: ConfluenceSource` is a closed
//     enum of eight INTERNAL confluence factors (market_structure,
//     smc_ict, tpo, footprint, orderbook, liquidity, microstructure,
//     macro) computed from this app's own OHLCV/order-book pipeline — it
//     has no member for "an external API" and was never meant to
//     describe one. Bending it to also carry external-source evidence
//     would silently blur two different authorities. This file declares
//     a SEPARATE, non-colliding type — `NormalizedExternalEvidence` — for
//     a different semantic contract: evidence that originates OUTSIDE
//     this app, from a Phase 8.4.1-registered source. Nothing here is
//     imported by, or feeds into, `lib/ai/oracle/*` in this phase.
//   - This module NEVER decides BUY/SELL/EXECUTE/WAIT/REJECT, NEVER
//     computes a confidence/reliability SCORE, and NEVER assigns market
//     direction (bullish/bearish) to anything. See `EvidenceDirection`
//     below — its members are deliberately restricted to
//     objectively-derivable, metric-level facts (a rate's own sign, a
//     count going up or down) with NO market-sentiment member existing
//     in the type at all. A caller cannot express "bullish" through this
//     field even by mistake — the union itself has no such member.
//   - `EvidenceKind` keeps FACTUAL_OBSERVATION / INTERPRETATION /
//     EXTERNAL_CLAIM strictly separate and this module never promotes one
//     into another — see normalize.ts's header for the one-way rule
//     ("passed through, never upgraded").
//   - RAW DATA IS NEVER FABRICATED. A raw observation this module cannot
//     honestly classify (bad status, unparseable timestamp, an
//     unregistered source/capability pair) is still emitted as evidence —
//     never silently dropped — but flagged via `malformed`/
//     `malformedReasons` and downgraded to the honest state (`UNKNOWN`
//     availability/freshness, `direction: null`), never guessed at.
//   - BATCH NORMALIZATION NEVER MERGES. Two observations from different
//     sources — even directly conflicting ones — always produce two
//     separate `NormalizedExternalEvidence` entries. There is no
//     averaging, no "pick the more reliable source" logic, and no
//     consensus field anywhere in this file. Conflict resolution is
//     explicitly out of scope for this phase — see normalize.ts's header.
//   - UNWIRED: nothing in the app calls `normalizeExternalEvidence`/
//     `normalizeExternalEvidenceBatch` yet. No fetch layer exists to
//     produce `RawExternalObservation`s in this phase — that is a
//     separately-approved future phase's job. This module only defines
//     the shape a future fetch layer's output must have to be normalized
//     honestly, and the pure function that does the normalizing.
// ---------------------------------------------------------------------------

import type { SourceCapability, SourceCategory } from "../contracts";

/**
 * Strictly distinguishes what kind of statement a piece of external
 * evidence is. Never reinterpreted or promoted by normalize.ts — an
 * `EXTERNAL_CLAIM` in stays an `EXTERNAL_CLAIM` out, even if its wording
 * happens to look factual. The PRODUCER (a future fetch/provider layer)
 * is responsible for classifying honestly at the source; this module
 * only preserves that classification.
 *   - `FACTUAL_OBSERVATION` — a directly-measured data point, e.g.
 *     "Funding rate = 0.012%".
 *   - `INTERPRETATION` — a derived reading of a factual observation that
 *     is NOT itself a raw measurement, e.g. "Funding crowded long". Never
 *     computed by this module — only passed through if a producer
 *     already supplied one.
 *   - `EXTERNAL_CLAIM` — a statement whose truth this app cannot verify
 *     at all, e.g. "Community expects token rally".
 */
export type EvidenceKind = "FACTUAL_OBSERVATION" | "INTERPRETATION" | "EXTERNAL_CLAIM";

/**
 * Closed, objectively-derivable-only vocabulary for a metric's OWN
 * directionality — never a market call. `POSITIVE`/`NEGATIVE` describe a
 * signed value's sign (e.g. funding rate sign); `INCREASING`/
 * `DECREASING`/`FLAT` describe a comparison between two readings of the
 * same metric (e.g. open interest vs. its prior reading). There is no
 * `BULLISH`/`BEARISH`/`RISK_ON`/`RISK_OFF` member — by construction, this
 * type cannot carry a market-sentiment claim.
 */
export type EvidenceDirection = "POSITIVE" | "NEGATIVE" | "INCREASING" | "DECREASING" | "FLAT";

export const EVIDENCE_DIRECTIONS: readonly EvidenceDirection[] = ["POSITIVE", "NEGATIVE", "INCREASING", "DECREASING", "FLAT"];

/**
 * Closed freshness bucket. `UNKNOWN` covers every case where an honest
 * bucket cannot be computed — no usable timestamp, a timestamp after
 * `asOf` (malformed), or a source with no declared cache-TTL policy in
 * the Phase 8.4.1 registry (e.g. the community placeholder). See
 * normalize.ts's `computeFreshness()` for the exact deterministic rule
 * and the `EVIDENCE_STALE_MULTIPLIER` constant's own honesty note.
 */
export type EvidenceFreshnessBucket = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

/**
 * Closed availability/failure state for a single piece of evidence.
 * `UNAVAILABLE` (the provider had nothing) and `INSUFFICIENT_DATA` (the
 * provider returned something, but not enough to support a claim) are
 * kept distinct from each other and from `UNKNOWN` (this module could not
 * even classify the raw input) — none of the three is ever treated as a
 * market signal of any kind (see this file's header).
 */
export type EvidenceAvailability = "AVAILABLE" | "UNAVAILABLE" | "INSUFFICIENT_DATA" | "UNKNOWN";

/** = the Phase 8.4.1 registry's own `SourceCategory`, plus `UNKNOWN` for a `source` id this module could not resolve against the registry — never silently coerced into one of the four real categories. */
export type EvidenceSourceCategory = SourceCategory | "UNKNOWN";

/**
 * The input shape a future fetch/provider layer must produce for one
 * observation to be normalized. Every field is either required or
 * explicitly nullable/optional — there is no implicit "assume present"
 * field. `status` is the producer's own honest report of what happened
 * at fetch time; this module never infers it from the shape of `claim`
 * or `rawValue`.
 */
export interface RawExternalObservation {
  /** Should match a Phase 8.4.1 registry `source` id. An unmatched id is handled honestly (see `EvidenceProvenance.limitation`), never rejected outright and never silently treated as if it were registered. */
  readonly source: string;
  readonly capability: SourceCapability;
  readonly symbol: string | null;
  /** When the underlying data point was itself observed/measured at the provider (e.g. a funding-rate print's own timestamp). `null` when the producer cannot supply one. */
  readonly observedAt: string | null;
  /** When this app retrieved the observation. `null` only for malformed/incomplete raw input — a well-formed observation always knows when it was fetched. */
  readonly fetchedAt: string | null;
  readonly kind: EvidenceKind;
  /** Human-readable factual statement, e.g. "Funding rate = 0.012%". Required; empty/missing is treated as malformed (see normalize.ts). */
  readonly claim: string;
  /** The raw numeric/structured value backing `claim`, if any. Never required — some factual observations (e.g. "an economic release occurred") have no single number. */
  readonly rawValue?: unknown;
  /** Only ever set by the producer when objectively derivable from `rawValue` (e.g. a comparison against a prior reading). If set without a `rawValue` to back it, normalize.ts drops it and records why — see `EvidenceDirection`'s own header. */
  readonly direction?: EvidenceDirection | null;
  /** The producer's own honest fetch outcome. `OK` still requires a non-empty `claim` to become `AVAILABLE` evidence — see normalize.ts's `resolveAvailability()`. */
  readonly status: "OK" | "UNAVAILABLE" | "INSUFFICIENT_DATA";
  /** Optional provenance detail beyond the source id itself (e.g. a specific endpoint path or article id). Never fabricated when absent — `null`/omitted is preserved as `null` on the output, never invented. */
  readonly reference?: { readonly note?: string; readonly url?: string } | null;
}

export interface EvidenceFreshness {
  readonly bucket: EvidenceFreshnessBucket;
  /** `asOf - anchor timestamp`, in ms. `null` whenever `bucket === "UNKNOWN"` for a reason that makes an age meaningless (no timestamp, unparseable, or timestamp after `asOf`) — but note a negative-age malformed case still reports its (negative) `ageMs` for diagnosability; see normalize.ts. */
  readonly ageMs: number | null;
  /** Factual, template-built explanation of the bucket — never a narrative. */
  readonly note: string;
}

export interface EvidenceProvenance {
  readonly source: string;
  /** `true` only when `source` resolved against the Phase 8.4.1 registry via `getSourceById()`. */
  readonly sourceRegistered: boolean;
  readonly capability: SourceCapability;
  /** Verbatim copy of `RawExternalObservation.reference`, or `null` — never fabricated. */
  readonly reference: { readonly note?: string; readonly url?: string } | null;
  /** Non-null only when provenance is honestly incomplete (unregistered source, or a capability the registered source doesn't declare) — explicit, human-readable, never silently swallowed. */
  readonly limitation: string | null;
}

/**
 * The single canonical output type of this phase. One instance always
 * corresponds to exactly one `RawExternalObservation` — batch
 * normalization (see normalize.ts) never merges multiple raw
 * observations into one evidence record.
 */
export interface NormalizedExternalEvidence {
  /** Schema-evolution marker only — bump when adding fields, never to reinterpret existing ones. */
  readonly version: 1;
  /** Deterministic, derived from stable input fields via a stable hash (see normalize.ts's `buildEvidenceId()`) — never `Math.random()`, never a counter with hidden state. Identical input always yields an identical id. */
  readonly id: string;
  readonly source: string;
  readonly category: EvidenceSourceCategory;
  readonly capability: SourceCapability;
  readonly symbol: string | null;
  readonly observedAt: string | null;
  readonly fetchedAt: string | null;
  /** = the batch's `asOf` argument, copied verbatim — never a fresh `Date.now()` read inside normalize.ts. */
  readonly normalizedAt: string;
  readonly kind: EvidenceKind;
  readonly claim: string;
  /** Verbatim copy of `RawExternalObservation.rawValue`; `null` when the raw observation had none (never coerced to `0`/`""`/any other fabricated default). */
  readonly rawValue: unknown;
  /** `null` unless the raw observation supplied a `direction` AND a `rawValue` to back it — see `resolveDirection()` in normalize.ts. */
  readonly direction: EvidenceDirection | null;
  readonly freshness: EvidenceFreshness;
  readonly availability: EvidenceAvailability;
  readonly provenance: EvidenceProvenance;
  /** `true` when any structural issue was found (empty claim, unregistered source/capability, unrecognized status, unparseable timestamp, unsupported direction) — the evidence is still emitted, never dropped, but callers should treat a `malformed` record with extra caution. */
  readonly malformed: boolean;
  /** Empty when `malformed === false`. Each entry is a specific, factual reason — never a vague "data issue". */
  readonly malformedReasons: readonly string[];
}
