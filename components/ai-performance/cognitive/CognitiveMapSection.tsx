"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { useZoomPan } from "@/components/intelligence/ui/useZoomPan";
import type { CognitiveMapSnapshot } from "@/lib/ai/cognitiveMap/contracts";
import { CognitiveGraph, COGNITIVE_GRAPH_SIZE } from "./CognitiveGraph";
import { RuntimeTerminal } from "./RuntimeTerminal";
import { NODE_STATUS_META } from "./status";

// ---------------------------------------------------------------------------
// ELVOID Live Intelligence Graph (Phase 8.3.1) — additive section on the AI
// PERFORMANCE page (per spec, never its own route/page). Client-side
// polling only (Vercel Hobby plan has no per-minute cron — see
// /areas/elstand-platform.md), matching every other "live" panel in this
// repo. A poll is a plain GET against an already-computed, read-only
// endpoint — it can never itself trigger a new Oracle cycle or trade.
// ---------------------------------------------------------------------------

const POLL_MS = 20_000;

export function CognitiveMapSection() {
  const [snapshot, setSnapshot] = useState<CognitiveMapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomPan = useZoomPan(viewportRef, containerRef, { reducedMotion, minScale: 0.5, maxScale: 1.8 });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai-performance/cognitive", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CognitiveMapSnapshot;
        if (!cancelled) {
          setSnapshot(data);
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

  const handleSelectNode = useCallback((id: string) => setSelectedNodeId((cur) => (cur === id ? null : id)), []);

  const selectedNode = snapshot?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const anyActive = snapshot?.nodes.some((n) => n.status === "ACTIVE" || n.status === "PROCESSING") ?? false;

  return (
    <div id="cognitive-graph" className="glow-card ambient-glow ambient-glow-ai scroll-mt-20 overflow-hidden p-0">
      <div className="border-b border-line p-4">
        <SectionHeader
          code="ENS"
          title="Live Intelligence Graph"
          hint={snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString(undefined, { hour12: false }) : undefined}
        />
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xl text-xs text-ink-muted">Observe how ELVOID connects market data, decisions, outcomes, errors, and learned patterns.</p>
          <LiveDot tone={anyActive ? "up" : "signal"} label={anyActive ? "LIVE" : "IDLE"} />
        </div>
        {snapshot && snapshot.limitations.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[10.5px] text-amber">
            {snapshot.limitations.map((l) => (
              <li key={l}>· {l}</li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-[10.5px] text-down">{error}</p>}
      </div>

      <div className="flex min-h-[520px] flex-col lg:h-[680px] lg:min-h-0 lg:flex-row">
        <div className="relative min-h-[360px] flex-1 lg:min-w-0">
          {!snapshot ? (
            <div className="flex h-full items-center justify-center text-xs text-ink-muted">Connecting to ELVOID runtime…</div>
          ) : (
            <>
              <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-bg-surface/90 p-1 backdrop-blur">
                <button type="button" onClick={zoomPan.zoomOut} disabled={!zoomPan.canZoomOut} aria-label="Zoom out" className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-cyan disabled:pointer-events-none disabled:opacity-30">
                  <Minus size={14} />
                </button>
                <button type="button" onClick={zoomPan.reset} disabled={zoomPan.isAtDefault} aria-label="Reset view" className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-cyan disabled:pointer-events-none disabled:opacity-30">
                  <Maximize2 size={14} />
                </button>
                <button type="button" onClick={zoomPan.zoomIn} disabled={!zoomPan.canZoomIn} aria-label="Zoom in" className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-cyan disabled:pointer-events-none disabled:opacity-30">
                  <Plus size={14} />
                </button>
              </div>

              <div
                ref={viewportRef}
                {...zoomPan.viewportHandlers}
                style={{ ...zoomPan.viewportStyle, minHeight: 360 }}
                className="bg-grid-animated relative flex h-full w-full items-center justify-center overflow-hidden bg-bg"
                onDoubleClick={zoomPan.reset}
              >
                <div ref={containerRef} style={{ ...zoomPan.contentStyle, width: COGNITIVE_GRAPH_SIZE, height: COGNITIVE_GRAPH_SIZE, flexShrink: 0 }}>
                  <CognitiveGraph snapshot={snapshot} selectedNodeId={selectedNodeId} onSelectNode={handleSelectNode} reducedMotion={reducedMotion} />
                </div>
              </div>

              {selectedNode && (
                <div className="absolute bottom-3 left-3 right-3 z-20 max-h-[45%] overflow-y-auto rounded-lg border border-line bg-bg-surface/95 p-3 text-xs backdrop-blur sm:right-auto sm:w-72">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1.5">
                    <span className="font-semibold text-ink">{selectedNode.label}</span>
                    <button type="button" onClick={() => setSelectedNodeId(null)} className="text-ink-faint hover:text-ink" aria-label="Close">
                      ×
                    </button>
                  </div>
                  <dl className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-muted">Status</dt>
                      <dd style={{ color: NODE_STATUS_META[selectedNode.status].color }}>{NODE_STATUS_META[selectedNode.status].label}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-muted">Module</dt>
                      <dd className="text-right text-ink-faint">{selectedNode.modulePath}</dd>
                    </div>
                    {selectedNode.lastUpdated && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Last updated</dt>
                        <dd className="text-ink">{new Date(selectedNode.lastUpdated).toLocaleTimeString(undefined, { hour12: false })}</dd>
                      </div>
                    )}
                    {selectedNode.facts.map((f) => (
                      <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-ink-muted">{f.label}</dt>
                        <dd className="max-w-[60%] truncate text-right text-ink" title={f.value}>
                          {f.value}
                        </dd>
                      </div>
                    ))}
                    {selectedNode.facts.length === 0 && selectedNode.status === "NO_DATA" && <p className="pt-1 text-ink-faint">No real data observed for this module yet.</p>}
                    {selectedNode.status === "GATED" && <p className="pt-1 text-ink-faint">Requires an active ELVOID PRO membership to view live telemetry.</p>}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-h-[260px] border-t border-line lg:h-full lg:w-80 lg:min-h-0 lg:border-l lg:border-t-0">
          <RuntimeTerminal events={snapshot?.events ?? []} onSelectNode={handleSelectNode} />
        </div>
      </div>
    </div>
  );
}
