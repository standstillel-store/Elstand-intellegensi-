"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Maximize2, Minus, Plus, Network } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { NodeDrawer } from "./ui/NodeDrawer";
import { useZoomPan } from "./ui/useZoomPan";
import { buildMarketMapNodes, MARKET_MAP_EDGES, type MarketMapLiveInputs, type MarketMapNodeId } from "@/lib/intelligence/marketMap";
import type { DisplayTone } from "@/lib/intelligence/shared";
import type { SentimentStatus } from "@/lib/intelligence/globalSentiment";

// Neutral now reads as the dashboard's "Neutral = Blue" accent instead of
// purple — purple is reserved for the AI Core orb below, so it always
// means "this is the AI speaking" and nothing else. Transition (amber
// data, gold display) follows "Transition = Gold". up/down are re-pinned
// to the exact brand hex instead of a slightly-off placeholder.
const TONE_BORDER: Record<DisplayTone, string> = {
  up: "border-up/30",
  down: "border-down/30",
  amber: "border-gold/30",
  neutral: "border-line",
};
const TONE_BORDER_ACTIVE: Record<DisplayTone, string> = {
  up: "border-up shadow-glow-up",
  down: "border-down shadow-glow-down",
  amber: "border-gold shadow-glow-gold",
  neutral: "border-smartmoney shadow-glow-smartmoney",
};
const TONE_DOT: Record<DisplayTone, "up" | "down" | "gold" | "smartmoney"> = {
  up: "up",
  down: "down",
  amber: "gold",
  neutral: "smartmoney",
};
const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-gold",
  neutral: "text-smartmoney-glow",
};
const TONE_STROKE: Record<DisplayTone, string> = {
  up: "#00E676",
  down: "#FF5252",
  amber: "#D4AF37",
  neutral: "#3B82F6",
};
const STATUS_RING: Record<SentimentStatus, string> = {
  "risk-on": "border-up/60",
  "risk-off": "border-down/60",
  neutral: "border-smartmoney/60",
  transition: "border-gold/60",
};

const MAP_FALLBACK_HEIGHT = 420;

interface PathModel {
  key: string;
  d: string;
  tone: DisplayTone;
  touchesActive: boolean;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function GlobalIntelligenceMap({ live }: { live: MarketMapLiveInputs }) {
  const nodes = buildMarketMapNodes(live);
  const [activeId, setActiveId] = useState<MarketMapNodeId | null>(null);
  const [selectedId, setSelectedId] = useState<MarketMapNodeId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Partial<Record<MarketMapNodeId, HTMLButtonElement | null>>>({});
  const [paths, setPaths] = useState<PathModel[]>([]);
  const [mapHeight, setMapHeight] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const zoomPan = useZoomPan(viewportRef, containerRef, { reducedMotion });

  const stateRef = useRef({ nodes, activeId });
  stateRef.current = { nodes, activeId };

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { nodes: currentNodes, activeId: currentActive } = stateRef.current;
    const anchors: Partial<Record<MarketMapNodeId, { x: number; top: number; bottom: number }>> = {};

    (Object.keys(nodeRefs.current) as MarketMapNodeId[]).forEach((id) => {
      const el = nodeRefs.current[id];
      if (!el) return;
      // offsetLeft/offsetTop (not getBoundingClientRect) — these are
      // unaffected by the pan/zoom CSS transform applied to `container`,
      // so edges stay in the same local coordinate space as the nodes and
      // the whole assembly scales/pans together as one unit instead of
      // needing to be recalculated on every frame of a drag or pinch.
      anchors[id] = {
        x: el.offsetLeft + el.offsetWidth / 2,
        top: el.offsetTop,
        bottom: el.offsetTop + el.offsetHeight,
      };
    });

    const nextPaths = MARKET_MAP_EDGES.map((edge) => {
      const a = anchors[edge.from];
      const b = anchors[edge.to];
      if (!a || !b) return null;
      const midY = a.bottom + (b.top - a.bottom) / 2;
      const d = `M ${a.x} ${a.bottom} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.top}`;
      const toneSource = currentNodes.find((n) => n.id === edge.to);
      const touchesActive = currentActive !== null && (edge.from === currentActive || edge.to === currentActive);
      return { key: `${edge.from}-${edge.to}`, d, tone: toneSource?.tone ?? "neutral", touchesActive };
    }).filter((p): p is PathModel => Boolean(p));

    setPaths(nextPaths);
    setMapHeight(container.offsetHeight);
  }, []);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    const t1 = setTimeout(recompute, 120);
    const t2 = setTimeout(recompute, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [recompute]);

  useLayoutEffect(() => {
    recompute();
  }, [activeId, nodes.length, recompute]);

  function setNodeRef(id: MarketMapNodeId) {
    return (el: HTMLButtonElement | null) => {
      nodeRefs.current[id] = el;
    };
  }

  function openNode(id: MarketMapNodeId) {
    if (zoomPan.shouldSuppressClick()) return; // a real drag/pinch just ended — don't also open the drawer
    setSelectedId(id);
    setDrawerOpen(true);
    // Pin the connected-path highlight on click too, not just hover — the
    // only way touch devices (no real :hover) ever see it.
    setActiveId(id);
  }

  function renderNode(id: MarketMapNodeId, opts?: { wide?: boolean }) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    const isActive = activeId === id;
    return (
      <button
        key={node.id}
        ref={setNodeRef(node.id)}
        type="button"
        onClick={() => openNode(node.id)}
        onMouseEnter={() => setActiveId(node.id)}
        onMouseLeave={() =>
          setActiveId((cur) => (cur === node.id && !(drawerOpen && selectedId === node.id) ? null : cur))
        }
        onFocus={() => setActiveId(node.id)}
        className={clsx(
          "group relative z-10 rounded-xl border bg-bg-surface p-3 text-left shadow-card transition-all duration-200",
          "hover:-translate-y-0.5 hover:scale-[1.03] hover:border-gold/40",
          isActive ? TONE_BORDER_ACTIVE[node.tone] : TONE_BORDER[node.tone],
          !node.connected && "border-dashed",
          opts?.wide ? "w-full sm:mx-auto sm:max-w-xs" : "w-full"
        )}
      >
        <div className="flex items-center gap-1.5">
          <LiveDot tone={TONE_DOT[node.tone]} />
          <span className="eyebrow text-[10px] tracking-wide text-ink-faint">{node.code}</span>
          {!node.connected && (
            <span className="ml-auto shrink-0 rounded border border-line px-1 text-[8px] uppercase tracking-wide text-ink-faint">
              waiting
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{node.title}</p>
        <p className={clsx("mt-0.5 truncate text-[11px]", node.cardMetric.connected ? TONE_TEXT[node.cardMetric.tone] : "text-ink-faint")}>
          {node.cardMetric.label}: {node.cardMetric.value}
        </p>
      </button>
    );
  }

  const topReasons = live.sentiment.reasons.slice(0, 3);

  return (
    <div className="glow-card ambient-glow ambient-glow-gold p-4">
      <SectionHeader
        code="MAP"
        title="Global Market Intelligence Map"
        hint="Klik node · geser/cubit = zoom"
        icon={<Network size={13} />}
        accent="gold"
      />

      {/* Global Sentiment summary — reads every node, always visible without a click.
         Same data as before (status/confidence/signal count/reasons), now led by a
         bigger "AI Core" orb instead of a plain bar — the map's previous biggest
         complaint was feeling empty, and this is its visual center of gravity. */}
      <div className="ambient-glow ambient-glow-ai relative mb-4 overflow-hidden rounded-xl border border-line bg-bg-raised p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="relative flex h-[150px] w-[150px] shrink-0 items-center justify-center">
            <span
              className="absolute h-[92px] w-[92px] animate-ping rounded-full border border-signal/50"
              style={{ animationDuration: "3.2s" }}
            />
            <span className="absolute h-[142px] w-[142px] animate-orbitSlow rounded-full border border-dashed border-signal/20" />
            <span className="absolute h-[118px] w-[118px] animate-orbitSlowReverse rounded-full border border-signal/25" />
            <span className={clsx("absolute h-[104px] w-[104px] rounded-full border-2 transition-colors duration-500", STATUS_RING[live.sentiment.status])} />
            <div className="ai-orb-core relative flex h-[92px] w-[92px] animate-coreBreathe items-center justify-center rounded-full shadow-glow-signal">
              <div className="text-center leading-none">
                <p className="mono-num text-2xl font-bold text-ink">{live.sentiment.confidence}%</p>
                <p className="mt-1 text-[8px] uppercase tracking-wider text-ink/70">AI Read</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
              <MarketStatusBadge status={live.sentiment.status} />
              <span className="text-xs text-ink-faint">Confidence</span>
              <span className="mono-num text-sm font-semibold text-ink">{live.sentiment.confidence}%</span>
              <span className="text-xs text-ink-faint">· {live.sentiment.signalsAvailable} sinyal terbaca</span>
            </div>
            {topReasons.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5 text-left">
                {topReasons.map((r) => (
                  <li key={r.text} className={clsx("flex items-start gap-1.5 text-[12px]", r.direction === 1 ? "text-up" : "text-down")}>
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current" />
                    {r.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-[12px] text-ink-faint">{live.sentiment.note ?? "Belum ada sinyal terbaca."}</p>
            )}
          </div>
        </div>
      </div>

      {/* Zoomable / pannable canvas — Ctrl/Cmd+scroll or pinch to zoom, drag to pan,
         like an Arkham-style graph explorer. See useZoomPan for the interaction model. */}
      <div
        ref={viewportRef}
        {...zoomPan.viewportHandlers}
        style={{ height: mapHeight ?? MAP_FALLBACK_HEIGHT, ...zoomPan.viewportStyle }}
        className="map-canvas-grid relative overflow-hidden rounded-xl border border-line"
      >
        <div ref={containerRef} style={zoomPan.contentStyle} className="relative space-y-2.5 px-2.5 py-3.5">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {paths.map((p) => {
              const pathId = `edge-${p.key}`;
              const lineColor = p.touchesActive ? TONE_STROKE[p.tone] : "#3A3F4B";
              const particleColor = TONE_STROKE[p.tone];
              const duration = p.touchesActive ? 1.6 : 3.4;
              return (
                <g key={p.key}>
                  {/* soft glow underlay */}
                  <path
                    d={p.d}
                    id={pathId}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={p.touchesActive ? 6 : 3.5}
                    strokeOpacity={p.touchesActive ? 0.16 : 0.07}
                    strokeLinecap="round"
                  />
                  {/* core line */}
                  <path d={p.d} fill="none" stroke={lineColor} strokeWidth={p.touchesActive ? 1.75 : 1.25} strokeOpacity={p.touchesActive ? 0.9 : 0.45} strokeLinecap="round" />

                  {/* flowing particles — a small stream of dots travels the path on a loop, like liquidity moving downstream */}
                  {!reducedMotion &&
                    [0, 1, 2].map((i) => (
                      <g key={i}>
                        <circle r={p.touchesActive ? 4.5 : 3} fill={particleColor} opacity={p.touchesActive ? 0.25 : 0.14} />
                        <circle r={p.touchesActive ? 2.2 : 1.5} fill={particleColor} opacity={p.touchesActive ? 1 : 0.65} />
                        <animateMotion dur={`${duration}s`} repeatCount="indefinite" begin={`${(i * duration) / 3}s`}>
                          <mpath href={`#${pathId}`} />
                        </animateMotion>
                      </g>
                    ))}
                </g>
              );
            })}
          </svg>

          <div className="flex justify-center">{renderNode("macro", { wide: true })}</div>
          <div className="flex justify-center">{renderNode("sentiment", { wide: true })}</div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {renderNode("usd")}
            {renderNode("gold")}
            {renderNode("stocks")}
          </div>
          <div className="flex justify-center">{renderNode("crypto", { wide: true })}</div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {renderNode("btc")}
            {renderNode("eth")}
            {renderNode("altcoin")}
          </div>
        </div>

        {/* Floating zoom controls — always visible so touch users who miss the pinch
           gesture and desktop users who miss Ctrl+scroll still have an obvious way in. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute bottom-2.5 right-2.5 flex items-center gap-0.5 rounded-lg border border-line bg-bg-raised/90 p-1 shadow-card backdrop-blur-sm">
            <button
              type="button"
              onClick={zoomPan.zoomOut}
              disabled={!zoomPan.canZoomOut}
              aria-label="Perkecil peta"
              className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
            <span className="mono-num w-9 select-none text-center text-[10px] text-ink-faint">{Math.round(zoomPan.scale * 100)}%</span>
            <button
              type="button"
              onClick={zoomPan.zoomIn}
              disabled={!zoomPan.canZoomIn}
              aria-label="Perbesar peta"
              className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <button
              type="button"
              onClick={zoomPan.reset}
              disabled={zoomPan.isAtDefault}
              aria-label="Atur ulang zoom peta"
              className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Peta ini menjelaskan hubungan antar market, bukan sinyal beli/jual. Node bertanda &quot;waiting&quot; menunggu API
        terhubung — lihat CHANGES.md untuk daftar key yang dibutuhkan.
      </p>

      <NodeDrawer node={selectedNode} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
