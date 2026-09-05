// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Map Builder (Phase 8.3.1-C)
//
// PURE FUNCTION. Given already-fetched real records, deterministically
// derives node/connection/core/event state. This file performs NO I/O —
// the route (`app/api/ai-performance/cognitive/route.ts`) does all
// fetching and passes plain data in. That keeps this file trivially
// testable and keeps the "no fabricated intelligence" invariant
// mechanically checkable: nothing in here can reach for `Math.random()`,
// a clock other than the `now` argument, or a network/database call.
//
// Every `IntelligenceNode.status` and every `CognitiveEvent` traces back
// to a field on `snapshots`, `validations`, or `stats` — see the inline
// comments at each derivation site.
// ---------------------------------------------------------------------------

import type { AutonomousIntelligenceSnapshotRecord } from "@/lib/ai/autonomousSnapshot/contracts";
import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { AiStatistics } from "@/lib/elvoid/types";
import { COGNITIVE_MODULE_REGISTRY } from "./registry";
import type { CognitiveEvent, CognitiveMapSnapshot, CoreState, IntelligenceConnection, IntelligenceNode, NodeStatus } from "./contracts";

/** A snapshot's real telemetry is only considered "fresh" within this window. Beyond it, the module still HAS data (IDLE), it just isn't recent. */
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const MAX_EVENTS = 80;

export interface CognitiveMapInputs {
  readonly now: string; // ISO — the only clock this module is allowed to use
  readonly hasOracleMembership: boolean; // gates the ELVOID PRO Oracle snapshot table
  readonly snapshots: readonly AutonomousIntelligenceSnapshotRecord[]; // ELVOID_PRO_ORACLE, one row per symbol
  readonly validations: readonly ConstraintValidation[]; // ELVOID_PRO_ORACLE, across the symbols in `snapshots`
  readonly stats: AiStatistics | null; // paper trader account statistics (ungated)
}

function isFresh(iso: string | null, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t <= ACTIVE_WINDOW_MS;
}

function freshest<T extends { readonly updatedAt: string }>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a));
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function buildCognitiveMap(input: CognitiveMapInputs): CognitiveMapSnapshot {
  const now = Date.parse(input.now);
  const limitations: string[] = [];
  if (!input.hasOracleMembership) {
    limitations.push("ELVOID PRO Oracle telemetry (market/macro/pattern/oracle/risk/decision nodes) requires an active membership — shown as GATED for this viewer.");
  }

  const snapshots = input.snapshots;
  const latest = freshest(snapshots);
  const symbols = Array.from(new Set(snapshots.map((s) => s.symbol)));

  const events: CognitiveEvent[] = [];
  let eventSeq = 0;
  const nextId = () => `evt_${eventSeq++}`;

  // --- Real events, one small factual batch per persisted snapshot row ---
  for (const s of snapshots) {
    events.push({ id: nextId(), timestamp: s.updatedAt, source: "MARKET", severity: "INFO", message: `${s.symbol} intelligence snapshot updated (H1 cycle)`, nodeId: "market", relatedNodeIds: ["market"] });
    if (s.macroState) {
      events.push({ id: nextId(), timestamp: s.updatedAt, source: "MACRO", severity: "INFO", message: `${s.symbol} macro state: ${s.macroState}`, nodeId: "macro", relatedNodeIds: ["macro", "oracle"] });
    }
    if (s.structureEvidence || s.liquidityEvidence || s.volumeEvidence) {
      const parts = [s.structureEvidence, s.liquidityEvidence, s.volumeEvidence].filter(Boolean).join(" · ");
      events.push({ id: nextId(), timestamp: s.updatedAt, source: "PATTERN", severity: "INFO", message: `${s.symbol} evidence: ${parts}`, nodeId: "pattern", relatedNodeIds: ["pattern", "oracle"] });
    }
    events.push({
      id: nextId(),
      timestamp: s.updatedAt,
      source: "ORACLE",
      severity: s.grade === "NO_TRADE" ? "WARNING" : "SUCCESS",
      message: `${s.symbol} grade=${s.grade} confidence=${pct(s.confidence)} risk=${s.riskStatus}`,
      nodeId: "oracle",
      relatedNodeIds: ["oracle", "risk"],
    });
    events.push({
      id: nextId(),
      timestamp: s.updatedAt,
      source: s.decision === "EXECUTE" ? "EXECUTION" : "ORACLE",
      severity: s.decision === "EXECUTE" ? "SUCCESS" : s.decision === "REJECT" ? "WARNING" : "INFO",
      message: `${s.symbol} decision=${s.decision}${s.side ? ` side=${s.side}` : ""}`,
      nodeId: "decision",
      relatedNodeIds: ["decision", "risk"],
    });
    if (s.executionOutcome) {
      events.push({ id: nextId(), timestamp: s.updatedAt, source: "EXECUTION", severity: "INFO", message: `${s.symbol} execution outcome: ${s.executionOutcome}`, nodeId: "execution", relatedNodeIds: ["execution", "decision"] });
    }
    if (s.learningInfluence) {
      events.push({ id: nextId(), timestamp: s.updatedAt, source: "LEARNING", severity: "INFO", message: `${s.symbol} learning influence: ${s.learningInfluence}`, nodeId: "learning", relatedNodeIds: ["learning", "oracle"] });
    }
  }

  // --- Real events from constraint validations (the honest "learning" record) ---
  for (const v of input.validations) {
    events.push({
      id: nextId(),
      timestamp: v.validatedAt,
      source: "LEARNING",
      severity: v.status === "VALID" ? "SUCCESS" : v.status === "INCONSISTENT" || v.status === "OVERFIT_RISK" ? "WARNING" : "INFO",
      message: `${v.symbol} constraint (${v.evidenceTag}) validation: ${v.status}`,
      nodeId: "learning",
      relatedNodeIds: ["learning"],
    });
  }

  // --- Real event from paper trader statistics (execution + learning summary) ---
  if (input.stats && input.stats.total_trade > 0) {
    events.push({
      id: nextId(),
      timestamp: input.stats.updated_at,
      source: "EXECUTION",
      severity: "INFO",
      message: `Paper trader statistics recomputed: ${input.stats.total_trade} trades, win rate ${input.stats.win_rate.toFixed(1)}%`,
      nodeId: "execution",
      relatedNodeIds: ["execution", "learning"],
    });
  }

  events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const boundedEvents = events.slice(0, MAX_EVENTS);

  const eventIdsByNode = new Map<string, string[]>();
  for (const e of boundedEvents) {
    if (!e.nodeId) continue;
    const list = eventIdsByNode.get(e.nodeId) ?? [];
    list.push(e.id);
    eventIdsByNode.set(e.nodeId, list);
  }

  // --- Nodes ---
  const gated = !input.hasOracleMembership;
  const validCount = input.validations.filter((v) => v.status === "VALID").length;

  // `nodeGated` is per-node, not global — `execution` and the paper-trade
  // half of `learning` read from `ai_statistics`, which is NEVER gated by
  // ELVOID PRO membership, so they must never be forced to "GATED" just
  // because the Oracle snapshot table was skipped for this viewer.
  function statusFor(nodeGated: boolean, hasAnyData: boolean, freshRecent: boolean): NodeStatus {
    if (nodeGated) return "GATED";
    if (!hasAnyData) return "NO_DATA";
    return freshRecent ? "ACTIVE" : "IDLE";
  }

  const nodes: IntelligenceNode[] = COGNITIVE_MODULE_REGISTRY.map((mod) => {
    const base = { id: mod.id, label: mod.label, layer: mod.layer, modulePath: mod.modulePath, recentEventIds: eventIdsByNode.get(mod.id) ?? [] };

    switch (mod.id) {
      case "market": {
        const withData = snapshots.filter((s) => s.sparkline && s.sparkline.length > 0);
        const f = freshest(withData);
        return {
          ...base,
          status: statusFor(gated, withData.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated ? [] : [{ label: "Symbols with real candle data", value: String(withData.length) }, ...(f ? [{ label: "Freshest symbol", value: f.symbol }] : [])],
        };
      }
      case "macro": {
        const withData = snapshots.filter((s) => s.macroState || s.eventState);
        const f = freshest(withData);
        return {
          ...base,
          status: statusFor(gated, withData.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated ? [] : f ? [{ label: "Macro state", value: f.macroState ?? "N/A" }, { label: "Event state", value: f.eventState ?? "N/A" }] : [],
        };
      }
      case "pattern": {
        const withData = snapshots.filter((s) => s.structureEvidence || s.liquidityEvidence || s.volumeEvidence);
        const f = freshest(withData);
        return {
          ...base,
          status: statusFor(gated, withData.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated
            ? []
            : f
              ? [
                  { label: "Structure", value: f.structureEvidence ?? "N/A" },
                  { label: "Liquidity", value: f.liquidityEvidence ?? "N/A" },
                  { label: "Volume", value: f.volumeEvidence ?? "N/A" },
                ]
              : [],
        };
      }
      case "oracle": {
        const f = latest;
        return {
          ...base,
          status: statusFor(gated, snapshots.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated ? [] : f ? [{ label: "Grade", value: f.grade }, { label: "Confidence", value: pct(f.confidence) }, { label: "Risk status", value: f.riskStatus }] : [],
        };
      }
      case "risk": {
        const withData = snapshots.filter((s) => s.entry !== null || s.stopLoss !== null || s.takeProfit !== null);
        const f = freshest(withData);
        return {
          ...base,
          status: statusFor(gated, withData.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated
            ? []
            : f
              ? [
                  { label: "Entry", value: f.entry !== null ? String(f.entry) : "N/A" },
                  { label: "Stop loss", value: f.stopLoss !== null ? String(f.stopLoss) : "N/A" },
                  { label: "Take profit", value: f.takeProfit !== null ? String(f.takeProfit) : "N/A" },
                  { label: "Risk/reward", value: f.riskReward !== null ? f.riskReward.toFixed(2) : "N/A" },
                ]
              : [],
        };
      }
      case "decision": {
        const f = latest;
        const counts = snapshots.reduce(
          (acc, s) => {
            acc[s.decision] = (acc[s.decision] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        return {
          ...base,
          status: statusFor(gated, snapshots.length > 0, isFresh(f?.updatedAt ?? null, now)),
          lastUpdated: gated ? null : f?.updatedAt ?? null,
          facts: gated
            ? []
            : [
                ...(f ? [{ label: "Latest decision", value: `${f.symbol} → ${f.decision}` }] : []),
                ...Object.entries(counts).map(([k, v]) => ({ label: k, value: String(v) })),
              ],
        };
      }
      case "execution": {
        const s = input.stats;
        const hasData = !!s && s.total_trade > 0;
        return {
          ...base,
          status: statusFor(false, hasData, isFresh(s?.updated_at ?? null, now)),
          lastUpdated: s?.updated_at ?? null,
          facts: s
            ? [
                { label: "Total trades", value: String(s.total_trade) },
                { label: "Win rate", value: `${s.win_rate.toFixed(1)}%` },
                { label: "Profit factor", value: s.profit_factor.toFixed(2) },
              ]
            : [{ label: "Total trades", value: "0" }],
        };
      }
      case "learning": {
        // Learning has two independent, never-mutually-gated real sources:
        // constraint validations (ELVOID PRO Oracle, gated) and paper
        // trader statistics (ungated). The node is only NO_DATA/GATED when
        // BOTH are unavailable — it must never hide real, ungated trade
        // history just because the Oracle half is gated for this viewer.
        const lastValidated = freshest(input.validations.map((v) => ({ ...v, updatedAt: v.validatedAt })));
        const validationsUsable = !gated && input.validations.length > 0;
        const statsUsable = !!input.stats && input.stats.total_trade > 0;
        const mostRecentIso = [lastValidated?.updatedAt, input.stats?.updated_at].filter((x): x is string => !!x).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
        const nodeGated = gated && !statsUsable; // fully gated only if the ungated fallback is also empty
        return {
          ...base,
          status: statusFor(nodeGated, validationsUsable || statsUsable, isFresh(mostRecentIso, now)),
          lastUpdated: mostRecentIso,
          facts: [
            { label: "Validated constraints", value: String(validCount) },
            { label: "Total constraint snapshots", value: String(input.validations.length) },
            ...(input.stats ? [{ label: "Closed trades observed", value: String(input.stats.total_trade) }] : []),
          ],
        };
      }
      default:
        return { ...base, status: "NO_DATA" as NodeStatus, lastUpdated: null, facts: [] };
    }
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeDefs: readonly [string, string][] = [
    ["market", "macro"],
    ["market", "pattern"],
    ["macro", "oracle"],
    ["pattern", "oracle"],
    ["oracle", "risk"],
    ["risk", "decision"],
    ["decision", "execution"],
    ["execution", "learning"],
    ["learning", "oracle"],
  ];
  const connections: IntelligenceConnection[] = edgeDefs.map(([from, to]) => {
    const a = nodeById.get(from);
    const b = nodeById.get(to);
    const aFresh = !!a && isFresh(a.lastUpdated, now);
    const bFresh = !!b && isFresh(b.lastUpdated, now);
    const active = aFresh && bFresh;
    const lastActivatedAt =
      a?.lastUpdated && b?.lastUpdated ? (Date.parse(a.lastUpdated) > Date.parse(b.lastUpdated) ? a.lastUpdated : b.lastUpdated) : a?.lastUpdated ?? b?.lastUpdated ?? null;
    return { id: `${from}->${to}`, from, to, active, lastActivatedAt };
  });

  // --- Core state ---
  let coreState: CoreState = "IDLE";
  let coreReason = "Waiting for the first observed cycle.";
  if (!gated && latest && isFresh(latest.updatedAt, now)) {
    if (latest.decision === "EXECUTE") {
      coreState = "DECIDING";
      coreReason = `${latest.symbol}: EXECUTE ${latest.side ?? ""} at grade ${latest.grade}, confidence ${pct(latest.confidence)}.`;
    } else {
      coreState = "ANALYZING";
      coreReason = `${latest.symbol}: ${latest.decision} — ${latest.reasoningSummary ?? `risk status ${latest.riskStatus}`}.`;
    }
  } else if (!gated && latest) {
    coreState = "OBSERVING";
    coreReason = `Latest cycle for ${latest.symbol} was at ${latest.updatedAt} — no fresher cycle observed yet.`;
  } else if (input.stats && input.stats.total_trade > 0) {
    coreState = "LEARNING";
    coreReason = `No live Oracle telemetry visible; reviewing ${input.stats.total_trade} historical paper trades (win rate ${input.stats.win_rate.toFixed(1)}%).`;
  } else if (gated) {
    coreReason = "ELVOID PRO Oracle telemetry requires an active membership.";
  }

  return {
    generatedAt: input.now,
    core: { state: coreState, reason: coreReason, symbolsTracked: symbols.length, lastCycleAt: latest?.updatedAt ?? null },
    nodes,
    connections,
    events: boundedEvents,
    limitations,
  };
}
