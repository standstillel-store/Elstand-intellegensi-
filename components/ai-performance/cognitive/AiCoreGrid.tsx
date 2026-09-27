"use client";

import { useEffect, useState } from "react";
import { Activity, Globe2, Waves, Radar, ShieldAlert, BookOpen, GitBranch, Zap, Brain, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import type { CognitiveMapSnapshot } from "@/lib/ai/cognitiveMap/contracts";
import { NODE_STATUS_META, CORE_STATE_META } from "./status";

// ---------------------------------------------------------------------------
// AI Core (ELVOID Cognitive Runtime Command Center redesign) — a compact,
// static grid presentation of the SAME 9 modules registered in
// lib/ai/cognitiveMap/registry.ts, which the Live Intelligence Graph next
// to this panel already renders as a ring (CognitiveGraph.tsx). Nothing
// here is a new module, capability, or computed field — it independently
// polls the SAME read-only /api/ai-performance/cognitive endpoint
// CognitiveMapSection.tsx already polls (cheap, indexed, cannot itself
// trigger a cycle — see that route's own header) and only re-lays-out the
// same snapshot as a grid instead of a circle.
//
// GRID_ORDER below is a purely visual grouping (top row: market data feeds
// risk feeds the decision layer; sides: the two REASONING-layer modules
// (memory, pattern) flanking the core; bottom row: macro context, paper
// trade execution, learning feedback) — it is NOT a claim about actual
// call order. The real, evidence-graded connections between modules are
// what the ring graph beside this panel already draws. The registry has
// 9 modules and a 3x3 grid only has 8 outer slots once the center is
// reserved for the core badge, so the 9th (oracle) renders in its own
// full-size tile in the row below the grid — see `overflow` — not a
// smaller/hidden treatment.
// ---------------------------------------------------------------------------

const POLL_MS = 20_000;

const ICONS: Record<string, LucideIcon> = {
  market: Activity,
  macro: Globe2,
  pattern: Waves,
  oracle: Radar,
  risk: ShieldAlert,
  memory: BookOpen,
  decision: GitBranch,
  execution: Zap,
  learning: Brain,
};

// Fixed 3x3 layout: 8 outer module slots + 1 center slot (null = core).
const GRID_ORDER: readonly (string | null)[] = ["market", "risk", "decision", "memory", null, "pattern", "macro", "execution", "learning"];

// Percentage-space spoke endpoints (viewBox 0-100, scale-independent) —
// one per outer GRID_ORDER slot, in the same order, radiating from the
// center (50, 50).
const SPOKES: readonly { x: number; y: number }[] = [
  { x: 16.67, y: 16.67 },
  { x: 50, y: 16.67 },
  { x: 83.33, y: 16.67 },
  { x: 16.67, y: 50 },
  { x: 83.33, y: 50 },
  { x: 16.67, y: 83.33 },
  { x: 50, y: 83.33 },
  { x: 83.33, y: 83.33 },
];

export function AiCoreGrid() {
  const [snapshot, setSnapshot] = useState<CognitiveMapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai-performance/cognitive", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CognitiveMapSnapshot;
        if (!cancelled) {
          setSnapshot(json);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach ELVOID runtime telemetry.");
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const nodes = snapshot?.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const activeCount = nodes.filter((n) => n.status === "ACTIVE" || n.status === "PROCESSING").length;
  const coreMeta = snapshot ? CORE_STATE_META[snapshot.core.state] : null;
  const openNode = openId ? byId.get(openId) ?? null : null;

  // The 3x3 grid has 8 outer slots (center reserved for the core badge),
  // but the registry has 9 modules — whichever one isn't in GRID_ORDER
  // (today: oracle) renders as a full-size tile below, not hidden or
  // shrunk. Written generically so it still degrades honestly if the
  // registry ever changes instead of silently dropping a module.
  const placedIds = new Set(GRID_ORDER.filter((id): id is string => id !== null));
  const overflow = nodes.filter((n) => !placedIds.has(n.id));

  return (
    <div className="glow-card flex flex-col p-3 sm:p-4">
      <SectionHeader code="COR" title="AI Core" hint={snapshot ? `${activeCount}/${nodes.length} Active` : undefined} />

      {!snapshot ? (
        <div className="flex flex-1 items-center justify-center py-10 text-xs text-ink-muted">Connecting to ELVOID runtime…</div>
      ) : (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[320px]">
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {SPOKES.map((p, i) => (
                <line key={i} x1={50} y1={50} x2={p.x} y2={p.y} stroke="#232a35" strokeWidth={0.6} />
              ))}
            </svg>

            <div className="relative grid h-full w-full grid-cols-3 grid-rows-3">
              {GRID_ORDER.map((id, i) => {
                if (id === null) {
                  return (
                    <div key="core" className="flex items-center justify-center">
                      <div
                        className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 text-center sm:h-16 sm:w-16"
                        style={{ borderColor: coreMeta?.color ?? "#7d8794", backgroundColor: "#0b0f16" }}
                      >
                        <span className="text-[9px] font-semibold tracking-wide text-ink">ELVOID</span>
                        <span className="text-[7px] tracking-widest text-ink-muted">CORE</span>
                      </div>
                    </div>
                  );
                }
                const node = byId.get(id);
                const Icon = ICONS[id] ?? LayoutGrid;
                const meta = node ? NODE_STATUS_META[node.status] : NODE_STATUS_META.NO_DATA;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!node}
                    onClick={() => setOpenId((cur) => (cur === id ? null : id))}
                    className="flex flex-col items-center justify-center gap-1 p-1 text-center disabled:cursor-default"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg border sm:h-10 sm:w-10"
                      style={{ borderColor: meta.color, opacity: meta.dim ? 0.55 : 1 }}
                    >
                      <Icon size={16} style={{ color: meta.color }} />
                    </span>
                    <span className="max-w-[68px] truncate text-[9px] font-medium leading-tight text-ink sm:text-[10px]">{node?.label ?? id}</span>
                    <span className="text-[8px] leading-tight" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {overflow.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2 border-t border-line/60 pt-2">
              {overflow.map((n) => {
                const Icon = ICONS[n.id] ?? LayoutGrid;
                const meta = NODE_STATUS_META[n.status];
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                    style={{ borderColor: meta.color, opacity: meta.dim ? 0.55 : 1 }}
                  >
                    <Icon size={14} style={{ color: meta.color }} />
                    <span className="text-[10px] font-medium text-ink">{n.label}</span>
                    <span className="text-[9px]" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {openNode && (
            <div className="mt-2 rounded border border-line bg-black/20 p-2 text-[10.5px]">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-ink">{openNode.label}</span>
                <button type="button" onClick={() => setOpenId(null)} className="text-ink-faint hover:text-ink" aria-label="Close">
                  ×
                </button>
              </div>
              {openNode.facts.length === 0 ? (
                <p className="text-ink-faint">No real data observed for this module yet.</p>
              ) : (
                <dl className="space-y-0.5">
                  {openNode.facts.map((f) => (
                    <div key={f.label} className="flex justify-between gap-2">
                      <dt className="text-ink-faint">{f.label}</dt>
                      <dd className="max-w-[60%] truncate text-right text-ink">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
            <LiveDot tone={activeCount > 0 ? "up" : "signal"} label={activeCount > 0 ? "AI Core Online" : "AI Core Observing"} />
            <span className="text-[10px] text-ink-faint">
              {activeCount}/{nodes.length} modules active
            </span>
          </div>
          {error && <p className="mt-1 text-[10px] text-down">{error}</p>}
        </>
      )}
    </div>
  );
}
