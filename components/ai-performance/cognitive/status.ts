import type { NodeStatus, CoreState } from "@/lib/ai/cognitiveMap/contracts";

// Single source of truth for status → color/label so the graph, the
// inspector, and the terminal never disagree on what a state means.
export const NODE_STATUS_META: Record<NodeStatus, { label: string; color: string; dim: boolean }> = {
  NO_DATA: { label: "NO DATA", color: "#5b6472", dim: true },
  IDLE: { label: "IDLE", color: "#7d8794", dim: true },
  ACTIVE: { label: "ACTIVE", color: "#22d3ee", dim: false },
  PROCESSING: { label: "PROCESSING", color: "#a78bfa", dim: false },
  DEGRADED: { label: "DEGRADED", color: "#f87171", dim: false },
  GATED: { label: "MEMBERSHIP REQUIRED", color: "#f59e0b", dim: true },
};

export const CORE_STATE_META: Record<CoreState, { label: string; color: string }> = {
  IDLE: { label: "IDLE", color: "#7d8794" },
  OBSERVING: { label: "OBSERVING", color: "#38bdf8" },
  ANALYZING: { label: "ANALYZING", color: "#a78bfa" },
  DECIDING: { label: "DECIDING", color: "#22d3ee" },
  LEARNING: { label: "LEARNING", color: "#c084fc" },
  DEGRADED: { label: "DEGRADED", color: "#f87171" },
};

export const EVENT_SEVERITY_COLOR: Record<string, string> = {
  INFO: "#8b95a3",
  SUCCESS: "#34d399",
  WARNING: "#fbbf24",
  ERROR: "#f87171",
};
