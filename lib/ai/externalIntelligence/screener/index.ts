// ---------------------------------------------------------------------------
// ELVOID Intelligence — Altcoin Screener Integration public surface
// (Phase 8.4.5)
//
// Single import point for consumers. UNWIRED as of this phase — nothing
// in the app calls `analyzeAltcoinScreener` yet. A future caller would
// pass in whatever `lib/intelligence/premium.ts::getPremiumIntelligenceSnapshot()`
// or `lib/snapshot.ts::getSnapshot()` already computed
// (`pumpCandidates`/`rugpullRisks`, optionally `markets`) — this module
// never fetches that data itself.
// ---------------------------------------------------------------------------

export { analyzeAltcoinScreener } from "./analyze";
export type {
  AltcoinScreenerIntelligence,
  AltcoinScreenerStatus,
  AltcoinScreenerAsset,
  AltcoinScreenerAssetType,
  AltcoinScreenerPattern,
  AltcoinScreenerPatternType,
  AltcoinScreenerRawInput,
  AltcoinScreenerEvidenceCount,
  ScreenerResearchTriggerHint,
} from "./contracts";
