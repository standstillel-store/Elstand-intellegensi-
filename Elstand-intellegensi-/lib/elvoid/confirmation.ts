import type { ScanResult, SignalSide } from "./types";

export type ConfirmationStatus = "confirmed" | "waiting" | "invalid";

export interface ConfirmationGate {
  key: string;
  label: string;
  passed: boolean;
}

export interface ConfirmationResult {
  status: ConfirmationStatus;
  statusLabel: string;
  gates: ConfirmationGate[];
  passedCount: number;
  totalGates: number;
}

/**
 * Entry System (Phase 2.8): re-evaluates 5 confirmation gates every time
 * it's called — at generation time in engine.ts, or again in the UI for an
 * already-persisted signal — rather than ticking a stored state machine
 * forward step by step. In practice this gives the same "waits for
 * confirmation" feel the brief describes: a signal genuinely can read
 * Waiting Confirmation on one scan and Entry Confirmed on the next one
 * once price/structure actually catches up, because it's a fresh read of
 * live conditions each time, not a cached verdict.
 *
 * `zoneOk` (discount/premium zone) is the one gate that needs the recent
 * swing range to compute, so it's passed in already-resolved rather than
 * recomputed here — see engine.ts for the swing-based calculation, and
 * ai_signals.confirmation_zone_ok for how it's persisted for old signals.
 * The other 4 gates are derived straight from scans/extraReasoning, which
 * are already stored in full, so they never need their own columns.
 */
export function evaluateEntryConfirmation(args: {
  side: SignalSide;
  scans: ScanResult[];
  extraReasoning: ScanResult[];
  zoneOk: boolean;
}): ConfirmationResult {
  const { side, scans, extraReasoning, zoneOk } = args;
  const wanted = side === "LONG" ? "bullish" : "bearish";
  const all = [...scans, ...extraReasoning];
  const has = (key: string) => all.some((s) => s.key === key && s.bias === wanted && s.weight > 0);

  const gates: ConfirmationGate[] = [
    { key: "zone", label: side === "LONG" ? "Discount Zone" : "Premium Zone", passed: zoneOk },
    { key: "structure", label: "CHoCH / Market Structure", passed: has("market_structure") },
    { key: "order_block", label: "Order Block Tervalidasi", passed: has("order_block") },
    { key: "retest", label: "Retest Likuiditas", passed: has("liquidity_sweep") || has("order_block") },
    { key: "volume", label: "Volume Confirmation", passed: has("volume") },
  ];

  const passedCount = gates.filter((g) => g.passed).length;
  const totalGates = gates.length;

  let status: ConfirmationStatus;
  let statusLabel: string;
  if (passedCount === totalGates) {
    status = "confirmed";
    statusLabel = "Entry Confirmed";
  } else if (passedCount === 0) {
    status = "invalid";
    statusLabel = "Invalid Setup";
  } else {
    status = "waiting";
    statusLabel = "Waiting Confirmation";
  }

  return { status, statusLabel, gates, passedCount, totalGates };
}
