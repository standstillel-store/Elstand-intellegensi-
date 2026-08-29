// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Layer primitive types (Phase 8.0.1)
//
// Minimal, additive. Only what Phase 8.0.1 (Cognitive Observation) actually
// needs — no CognitivePlan/CognitiveAction/CognitiveCycle/Hypothesis Engine
// types here (those belong to later, not-yet-implemented sub-phases).
// ---------------------------------------------------------------------------

import type { NormalizedEvidence } from "@/lib/ai/oracle/evidence";

/**
 * Cognitive-layer-facing alias for the existing NormalizedEvidence type
 * (lib/ai/oracle/evidence.ts). Deliberately NOT a new/duplicate schema —
 * the Cognitive Layer consumes the same normalized evidence shape the
 * Oracle pipeline already produces, it does not define its own.
 */
export type CognitiveEvidenceRef = NormalizedEvidence;
