// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Map (Phase 8.3.1)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - This module computes NOTHING new about the market or the AI's
//     decisions. It is a presentation-shaping layer only, exactly like
//     `lib/ai/autonomousSnapshot` is for its own table: every field on
//     every type below is either (a) copied verbatim from an
//     already-computed Phase 7/8.x record (autonomous_intelligence_snapshot,
//     constraint_validations, ai_statistics), or (b) a deterministic,
//     pure function of those verbatim fields (e.g. "is this node's data
//     older than STALE_AFTER_MS" or "how many symbols are VALID").
//   - No field here is ever produced by `Math.random()` or any other
//     non-deterministic source. Given the same input snapshots, `build.ts`
//     always returns the same output. This is a hard invariant — see
//     build.ts's own header.
//   - `status` on `IntelligenceNode` is a CLOSED enum. A module with no
//     real data behind it MUST report `"NO_DATA"` — never a fabricated
//     `"ACTIVE"`. There is no "looks-active" placeholder state.
// ---------------------------------------------------------------------------

/** Which stage of the DATA → INTERPRETATION → REASONING → DECISION →
 * LEARNING pipeline a node belongs to. Purely a layout/grouping hint. */
export type CognitiveLayer = "DATA" | "MACRO" | "REASONING" | "DECISION" | "EXECUTION" | "LEARNING" | "CORE";

/**
 * Closed set of honest node states. Every one of these must be reachable
 * from real data alone — there is deliberately no "fake activity" state.
 */
export type NodeStatus =
  | "NO_DATA" // module registered, but nothing has been observed yet
  | "IDLE" // module has data, but nothing recent
  | "ACTIVE" // module has recent, healthy real activity
  | "PROCESSING" // a real cycle is currently mid-flight for this module
  | "DEGRADED" // real data exists but signals a provider/consistency problem
  | "GATED"; // module exists, but this viewer lacks the membership to see it

export type CoreState = "IDLE" | "OBSERVING" | "ANALYZING" | "DECIDING" | "LEARNING" | "DEGRADED";

export interface IntelligenceNode {
  readonly id: string;
  readonly label: string;
  readonly layer: CognitiveLayer;
  /** Real filesystem module path this node represents — for the inspector. */
  readonly modulePath: string;
  readonly status: NodeStatus;
  /** ISO timestamp of the real record this node's status was derived from. Null when NO_DATA/GATED. */
  readonly lastUpdated: string | null;
  /** Short, human-readable facts pulled verbatim from real fields — never invented copy. */
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  /** Recent real events tied to this node, newest first (subset of the terminal log). */
  readonly recentEventIds: readonly string[];
}

export interface IntelligenceConnection {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** True only when a real event timestamped within the last poll window traversed this edge. */
  readonly active: boolean;
  /** ISO timestamp of the real event that last activated this edge, if any. */
  readonly lastActivatedAt: string | null;
}

export type EventSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR";
export type EventSource = "MARKET" | "MACRO" | "PATTERN" | "ORACLE" | "RISK" | "EXECUTION" | "LEARNING" | "SYSTEM";

/** One real runtime event, derived verbatim from a persisted record. */
export interface CognitiveEvent {
  readonly id: string;
  readonly timestamp: string; // ISO, copied from the source record
  readonly source: EventSource;
  readonly severity: EventSeverity;
  readonly message: string;
  readonly nodeId: string | null;
  readonly relatedNodeIds: readonly string[];
}

export interface CognitiveCore {
  readonly state: CoreState;
  readonly reason: string;
  readonly symbolsTracked: number;
  readonly lastCycleAt: string | null;
}

export interface CognitiveMapSnapshot {
  readonly generatedAt: string;
  readonly core: CognitiveCore;
  readonly nodes: readonly IntelligenceNode[];
  readonly connections: readonly IntelligenceConnection[];
  readonly events: readonly CognitiveEvent[];
  /** Honest reporting of what this view could and couldn't see this cycle — never silently dropped. */
  readonly limitations: readonly string[];
}
