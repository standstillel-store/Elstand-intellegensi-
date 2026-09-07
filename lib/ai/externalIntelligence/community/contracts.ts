// ---------------------------------------------------------------------------
// ELVOID Intelligence — Community Intelligence contracts (Phase 8.4.4)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - AUDITED FIRST: as of this phase, NO Twitter/X, Reddit, Telegram,
//     Discord, or forum integration exists anywhere in this repository —
//     no client module, no env var, no fetch function. This is not new
//     information invented for this phase; the app's own
//     `lib/intelligence/marketMap.ts` already says so explicitly in its
//     own header ("A few of the new leaf nodes (dex, twitter, telegram)
//     currently have no real source at all and are ALWAYS
//     connected:false ... never pretend to have data they don't") and in
//     its News hub's own description ("Twitter/Telegram belum
//     tersambung — belum ada integrasi sosial media di app ini"). The
//     Phase 8.4.1 Source Registry encodes the same fact structurally: its
//     single `community` entry, `community_unintegrated`, always reports
//     `UNAVAILABLE_NOT_INTEGRATED` regardless of environment.
//   - THIS MODULE DOES NOT FETCH ANYTHING. It is an ANALYZER over
//     `NormalizedExternalEvidence` (Phase 8.4.3) that already exists in
//     memory — supplied by whatever produced it. If no community
//     evidence is supplied (because no real source has ever been wired),
//     this module says so honestly (`UNAVAILABLE_NOT_INTEGRATED` /
//     `INSUFFICIENT_DATA`) instead of inventing anything.
//   - THIS MODULE NEVER COMPUTES A SENTIMENT/HYPE/BULLISH SCORE. There is
//     no numeric "score" field anywhere in `CommunityIntelligenceContext`.
//     Deliberately, capability `sentiment_divergence` (Phase 8.4.1) is
//     NEVER read by this module's activity-pattern logic — folding a
//     signed "divergence" reading into an ACTIVITY_* pattern would be
//     exactly the "communitySentiment = positive" shortcut this phase is
//     forbidden from taking. Same for `narrative_emergence` — "a
//     narrative is emerging" is inherently an INTERPRETATION-shaped
//     judgment, not a structural count, so this module does not turn it
//     into a pattern either. Only `discussion_velocity` and
//     `ecosystem_activity` — both explicitly volume/frequency metrics
//     per the Phase 8.4.1 registry — ever feed `ACTIVITY_*`.
//   - THIS MODULE NEVER PERFORMS TEXT/SEMANTIC ANALYSIS. It cannot tell
//     that "listing expected" and "listing denied" are opposites — doing
//     so would require NLP this app does not have and is not allowed to
//     fabricate. `COMMUNITY_CLAIM_CONFLICT` below fires on a narrower,
//     fully mechanical signal instead — see its own doc comment for
//     exactly what is (and is not) being detected.
//   - THIS MODULE NEVER DETECTS MANIPULATION/BOTS/ASTROTURFING ITSELF.
//     `manipulationSignals` is a pure pass-through of whatever a future
//     producer already reported under capability `manipulation_risk` —
//     never independently computed. Its ABSENCE is recorded as an
//     honest `dataLimitations` entry, never silently treated as "no
//     manipulation risk".
//   - NO DECISION AUTHORITY: nothing in this module or `analyze.ts`
//     touches `lib/ai/oracle/*`, `autonomousDecision/*`,
//     `autonomousExecution/*`, or produces anything resembling
//     BUY/SELL/EXECUTE/WAIT/REJECT. This is evidence/context only.
// ---------------------------------------------------------------------------

import type { SourceCapability } from "../contracts";
import type { EvidenceKind } from "../evidence/contracts";

/**
 * Closed status for the whole analysis. `UNAVAILABLE_NOT_INTEGRATED` and
 * `INSUFFICIENT_DATA` are kept distinct on purpose: the former means "no
 * real community source is currently AVAILABLE per the Phase 8.4.1
 * registry" (a structural/configuration fact), the latter means "a
 * source may exist, but what was supplied here isn't enough to say
 * anything" (an evidence-volume fact). Neither is ever conflated with a
 * market reading.
 */
export type CommunityIntelligenceStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE_NOT_INTEGRATED" | "DEGRADED";

/** Purely a description of MEASURED VOLUME/FREQUENCY changing — never a market call. See this file's header for why only two capabilities ever produce this. */
export type CommunityActivityDirection = "ACTIVITY_INCREASING" | "ACTIVITY_DECREASING" | "ACTIVITY_STABLE";

/** One structural activity reading, traced to exactly one evidence record. */
export interface CommunityActivitySignal {
  readonly evidenceId: string;
  readonly capability: SourceCapability; // always "discussion_velocity" | "ecosystem_activity" — see header
  readonly direction: CommunityActivityDirection;
  readonly symbol: string | null;
  readonly observedAt: string | null;
}

/** One factual "an announcement/catalyst event occurred" observation, traced to its evidence. Never interpreted for market impact — see Phase 8.2.4's `eventImpact` module for anything resembling that, which this module does not touch. */
export interface CommunityAnnouncement {
  readonly evidenceId: string;
  readonly claim: string;
  readonly symbol: string | null;
  readonly observedAt: string | null;
}

/**
 * A MECHANICAL, non-semantic signal: two or more `EXTERNAL_CLAIM`/
 * `INTERPRETATION` evidence records share the same `capability` (and
 * `symbol`, when one was specified) but have textually DISTINCT `claim`
 * strings from DIFFERENT sources. This is NOT verified logical
 * contradiction — "developers are shipping fast" and "developers missed
 * a deadline" would both trigger this the same as genuine opposites
 * would, because this module does not read the words, only compares
 * them for inequality. The `note` field says this explicitly every time
 * so no consumer mistakes textual distinctness for confirmed
 * disagreement.
 */
export interface CommunityClaimConflict {
  readonly capability: SourceCapability;
  readonly symbol: string | null;
  readonly evidenceIds: readonly string[];
  readonly claims: readonly string[]; // verbatim, same order/length as evidenceIds
  readonly note: string;
}

/** Pure pass-through of a `manipulation_risk`-capability evidence record. `kind` is preserved so a consumer can see this was only ever a claim/observation from elsewhere, never a verdict this app reached. */
export interface CommunityManipulationSignal {
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly claim: string;
  readonly symbol: string | null;
}

/** Per-availability tally of the community-category evidence actually considered — the raw basis for `status`, kept visible rather than collapsed away. */
export interface CommunityEvidenceCount {
  readonly total: number;
  readonly available: number;
  readonly unavailable: number;
  readonly insufficient: number;
  readonly unknown: number;
  readonly malformed: number;
}

/**
 * The single output type. Deterministic given identical
 * `(evidence, symbol, asOf)` — see analyze.ts's header.
 */
export interface CommunityIntelligenceContext {
  /** Schema-evolution marker only. */
  readonly version: 1;
  /** = the `symbol` argument passed to `analyzeCommunityIntelligence`, verbatim. `null` means "analysis spans whatever symbols were in the supplied evidence", not "no symbol exists". */
  readonly symbol: string | null;
  /** = `asOf`, copied verbatim — never a fresh `Date.now()` read. */
  readonly generatedAt: string;
  readonly status: CommunityIntelligenceStatus;
  readonly evidenceCount: CommunityEvidenceCount;
  readonly activitySignals: readonly CommunityActivitySignal[];
  readonly announcements: readonly CommunityAnnouncement[];
  readonly claimConflicts: readonly CommunityClaimConflict[];
  readonly manipulationSignals: readonly CommunityManipulationSignal[];
  /** Explicit, factual caveats about what this analysis could NOT determine — e.g. no registered community source is available, or no manipulation-risk evidence exists to say anything about bot/spam activity. Never omitted in favor of silence. */
  readonly dataLimitations: readonly string[];
}
