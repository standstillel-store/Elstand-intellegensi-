// ---------------------------------------------------------------------------
// ELVOID Intelligence — Community Intelligence public surface (Phase 8.4.4)
//
// Single import point for consumers. UNWIRED as of this phase — nothing
// in the app calls `analyzeCommunityIntelligence` yet, and no real
// community source exists to feed it (see contracts.ts's header for the
// audit). Wiring a future Altcoin Screener consumer (Phase 8.4.5) is a
// separately-approved future step, out of scope here.
// ---------------------------------------------------------------------------

export { analyzeCommunityIntelligence, determineStatus } from "./analyze";
export type {
  CommunityIntelligenceContext,
  CommunityIntelligenceStatus,
  CommunityActivityDirection,
  CommunityActivitySignal,
  CommunityAnnouncement,
  CommunityClaimConflict,
  CommunityManipulationSignal,
  CommunityEvidenceCount,
} from "./contracts";
