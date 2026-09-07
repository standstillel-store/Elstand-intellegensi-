// ---------------------------------------------------------------------------
// ELVOID Intelligence — External Evidence Normalization public surface
// (Phase 8.4.3)
//
// Single import point for consumers. UNWIRED as of this phase — no fetch
// layer, no orchestrator, no Community Intelligence, no Altcoin Screener
// integration calls into this module yet. Those are separately-approved
// future phases (8.4.4, 8.4.5).
// ---------------------------------------------------------------------------

export { normalizeExternalEvidence, normalizeExternalEvidenceBatch, computeFreshness, EVIDENCE_STALE_MULTIPLIER } from "./normalize";
export type {
  RawExternalObservation,
  NormalizedExternalEvidence,
  EvidenceKind,
  EvidenceDirection,
  EvidenceFreshnessBucket,
  EvidenceFreshness,
  EvidenceAvailability,
  EvidenceSourceCategory,
  EvidenceProvenance,
} from "./contracts";
export { EVIDENCE_DIRECTIONS } from "./contracts";
