// ---------------------------------------------------------------------------
// ELVOID Intelligence — Community Intelligence analyzer (Phase 8.4.4)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PURE and DETERMINISTIC. No network call, no database access, no LLM
//     call, no `Math.random()`, no `Date.now()` — the only "now" this
//     module knows is the caller-supplied `asOf`. Identical
//     `(evidence, symbol, asOf)` always produces a deep-equal output.
//   - This module reads the Phase 8.4.1 registry (`getSourcesByCategory`,
//     `checkAvailability`) ONLY to answer "is any real community source
//     currently available" — an in-memory env-var check, never a fetch.
//     It reads nothing else from `registry.ts`, nothing from
//     `researchTrigger/*`, and nothing from `lib/ai/oracle/*`.
//   - Every output field traces back to a specific
//     `NormalizedExternalEvidence.id` (Phase 8.4.3) — see
//     `CommunityActivitySignal.evidenceId`,
//     `CommunityAnnouncement.evidenceId`,
//     `CommunityClaimConflict.evidenceIds`,
//     `CommunityManipulationSignal.evidenceId`. There is no field on any
//     output shape that isn't directly copied or mechanically derived
//     from an input evidence record.
//   - `COMMUNITY_CLAIM_CONFLICT` is intentionally NOT a semantic
//     contradiction detector — see `contracts.ts`'s doc comment on
//     `CommunityClaimConflict` for exactly what "conflict" means here
//     (textually distinct claims from different sources on the same
//     subject) and what it explicitly does NOT mean (verified logical
//     disagreement). No keyword list, no sentiment words, no NLP of any
//     kind is used to compare claims — only case/whitespace-normalized
//     string inequality.
//   - Nothing here merges, averages, or picks a "winning" claim across
//     sources. `groupCommunityClaims()` only groups for the purpose of
//     detecting textual distinctness; every individual evidence record
//     that made it into a `CommunityClaimConflict` is still separately
//     traceable via `evidenceIds`/`claims` (same order, same length) —
//     nothing is collapsed into one.
// ---------------------------------------------------------------------------

import { getSourcesByCategory, checkAvailability } from "../registry";
import type { NormalizedExternalEvidence } from "../evidence/contracts";
import type {
  CommunityIntelligenceContext,
  CommunityIntelligenceStatus,
  CommunityActivitySignal,
  CommunityActivityDirection,
  CommunityAnnouncement,
  CommunityClaimConflict,
  CommunityManipulationSignal,
  CommunityEvidenceCount,
} from "./contracts";

/** See this file's header: only these two capabilities ever produce an ACTIVITY_* signal — `sentiment_divergence` and `narrative_emergence` are deliberately excluded. */
const ACTIVITY_CAPABILITIES = new Set(["discussion_velocity", "ecosystem_activity"]);

function countByAvailability(evidence: readonly NormalizedExternalEvidence[]): CommunityEvidenceCount {
  return {
    total: evidence.length,
    available: evidence.filter((e) => e.availability === "AVAILABLE").length,
    unavailable: evidence.filter((e) => e.availability === "UNAVAILABLE").length,
    insufficient: evidence.filter((e) => e.availability === "INSUFFICIENT_DATA").length,
    unknown: evidence.filter((e) => e.availability === "UNKNOWN").length,
    malformed: evidence.filter((e) => e.malformed).length,
  };
}

/** Exported for direct fixture testing of the UNAVAILABLE_NOT_INTEGRATED vs INSUFFICIENT_DATA distinction without needing to fake the real Source Registry's environment state. */
export function determineStatus(evidence: readonly NormalizedExternalEvidence[], hasAvailableRegisteredSource: boolean): CommunityIntelligenceStatus {
  if (evidence.length === 0) {
    return hasAvailableRegisteredSource ? "INSUFFICIENT_DATA" : "UNAVAILABLE_NOT_INTEGRATED";
  }
  const usable = evidence.filter((e) => e.availability === "AVAILABLE" && !e.malformed);
  if (usable.length === 0) return "INSUFFICIENT_DATA";
  const impaired = evidence.some((e) => e.availability !== "AVAILABLE" || e.malformed);
  return impaired ? "DEGRADED" : "AVAILABLE";
}

function buildActivitySignals(evidence: readonly NormalizedExternalEvidence[]): CommunityActivitySignal[] {
  const signals: CommunityActivitySignal[] = [];
  for (const e of evidence) {
    if (e.availability !== "AVAILABLE" || e.malformed) continue;
    if (e.kind !== "FACTUAL_OBSERVATION") continue;
    if (!ACTIVITY_CAPABILITIES.has(e.capability)) continue;
    if (e.direction === null) continue;
    let direction: CommunityActivityDirection | null = null;
    if (e.direction === "INCREASING") direction = "ACTIVITY_INCREASING";
    else if (e.direction === "DECREASING") direction = "ACTIVITY_DECREASING";
    else if (e.direction === "FLAT") direction = "ACTIVITY_STABLE";
    // POSITIVE/NEGATIVE direction values never map to an activity signal —
    // those describe a signed metric's sign, not a volume trend, and this
    // module has no capability for which that distinction would be a
    // structural activity reading rather than a sentiment-shaped one.
    if (direction === null) continue;
    signals.push({ evidenceId: e.id, capability: e.capability, direction, symbol: e.symbol, observedAt: e.observedAt });
  }
  return signals;
}

function buildAnnouncements(evidence: readonly NormalizedExternalEvidence[]): CommunityAnnouncement[] {
  return evidence
    .filter((e) => e.availability === "AVAILABLE" && !e.malformed && e.kind === "FACTUAL_OBSERVATION" && e.capability === "catalyst_announcement")
    .map((e) => ({ evidenceId: e.id, claim: e.claim, symbol: e.symbol, observedAt: e.observedAt }));
}

function normalizeClaimText(claim: string): string {
  return claim.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildClaimConflicts(evidence: readonly NormalizedExternalEvidence[]): CommunityClaimConflict[] {
  const candidates = evidence.filter((e) => e.availability === "AVAILABLE" && !e.malformed && (e.kind === "EXTERNAL_CLAIM" || e.kind === "INTERPRETATION") && e.claim.trim().length > 0);

  // Group by (capability, symbol) — a "subject" for conflict-detection purposes.
  const groups = new Map<string, NormalizedExternalEvidence[]>();
  for (const e of candidates) {
    const key = `${e.capability}::${e.symbol ?? "null"}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const conflicts: CommunityClaimConflict[] = [];
  for (const list of groups.values()) {
    const distinctSources = new Set(list.map((e) => e.source));
    const distinctNormalizedClaims = new Set(list.map((e) => normalizeClaimText(e.claim)));
    if (distinctSources.size < 2 || distinctNormalizedClaims.size < 2) continue; // agreement, or a single source repeating itself — not a conflict signal
    conflicts.push({
      capability: list[0].capability,
      symbol: list[0].symbol,
      evidenceIds: list.map((e) => e.id),
      claims: list.map((e) => e.claim),
      note: "Textually distinct claims from different sources on the same subject — this is a mechanical string-inequality signal, NOT a verified semantic contradiction. Claims may differ in wording without actually disagreeing.",
    });
  }
  return conflicts;
}

function buildManipulationSignals(evidence: readonly NormalizedExternalEvidence[]): CommunityManipulationSignal[] {
  return evidence
    .filter((e) => e.availability === "AVAILABLE" && !e.malformed && e.capability === "manipulation_risk" && e.claim.trim().length > 0)
    .map((e) => ({ evidenceId: e.id, kind: e.kind, claim: e.claim, symbol: e.symbol }));
}

function buildDataLimitations(evidence: readonly NormalizedExternalEvidence[], hasAvailableRegisteredSource: boolean, manipulationSignals: readonly CommunityManipulationSignal[]): string[] {
  const limitations: string[] = [];
  if (!hasAvailableRegisteredSource) {
    limitations.push("No community-category source is currently AVAILABLE per the Phase 8.4.1 Source Registry — any evidence considered here, if present, did not come from a live integration.");
  }
  if (evidence.length > 0 && manipulationSignals.length === 0) {
    limitations.push("No manipulation_risk evidence was available for this evaluation — bot activity, coordinated shilling, spam, or astroturfing cannot be assessed from an absence of signal (absence is not evidence of absence).");
  }
  const malformedCount = evidence.filter((e) => e.malformed).length;
  if (malformedCount > 0) {
    limitations.push(`${malformedCount} community evidence record(s) were malformed and excluded from every pattern below — see each record's own malformedReasons for detail.`);
  }
  return limitations;
}

/**
 * The single exported entry point. Pure, synchronous. `evidence` may
 * contain non-community records — they are silently ignored (this module
 * only ever reasons about `category === "community"` entries). `symbol`,
 * when non-null, further restricts consideration to evidence for that
 * symbol; pass `null` to analyze across whatever symbols are present.
 */
export function analyzeCommunityIntelligence(evidence: readonly NormalizedExternalEvidence[], symbol: string | null, asOf: string): CommunityIntelligenceContext {
  const communityEvidence = evidence.filter((e) => e.category === "community" && (symbol === null || e.symbol === symbol));

  const hasAvailableRegisteredSource = getSourcesByCategory("community").some((s) => checkAvailability(s) === "AVAILABLE");
  const status = determineStatus(communityEvidence, hasAvailableRegisteredSource);
  const evidenceCount = countByAvailability(communityEvidence);
  const activitySignals = buildActivitySignals(communityEvidence);
  const announcements = buildAnnouncements(communityEvidence);
  const claimConflicts = buildClaimConflicts(communityEvidence);
  const manipulationSignals = buildManipulationSignals(communityEvidence);
  const dataLimitations = buildDataLimitations(communityEvidence, hasAvailableRegisteredSource, manipulationSignals);

  return {
    version: 1,
    symbol,
    generatedAt: asOf,
    status,
    evidenceCount,
    activitySignals,
    announcements,
    claimConflicts,
    manipulationSignals,
    dataLimitations,
  };
}
