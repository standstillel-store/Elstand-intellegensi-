"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Maximize2,
  Minus,
  Plus,
  ChevronDown,
  Sparkles,
  Bitcoin,
  Coins,
  Landmark,
  BarChart3,
  Newspaper,
  Gauge,
  Gem,
  Shuffle,
  DollarSign,
  Euro,
  PoundSterling,
  JapaneseYen,
  Banknote,
  Cpu,
  Smartphone,
  Car,
  Percent,
  Receipt,
  Factory,
  Users,
  TrendingUp,
  AtSign,
  Send,
  Layers,
  Waves,
  Building2,
  Network,
  CornerDownRight,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { LiveDot } from "@/components/ui/LiveDot";
import { NodeIntelPanel, useIsDesktopPanel } from "./ui/NodeDrawer";
import { useZoomPan } from "./ui/useZoomPan";
import {
  buildMarketMapNodes,
  MARKET_MAP_EDGES,
  type MarketMapLiveInputs,
  type MarketMapNode,
  type MarketMapNodeId,
} from "@/lib/intelligence/marketMap";
import type { DisplayTone } from "@/lib/intelligence/shared";
import type { SentimentStatus } from "@/lib/intelligence/globalSentiment";
import type { FinalConclusion } from "@/lib/intelligence/finalConclusion";

// ---------------------------------------------------------------------------
// V4 — "fully interactive AI relationship graph". See CHANGES.md for the
// full writeup of what changed and why. Short version: same MarketMapNode
// data model as V2/V3 (now much bigger, built in lib/intelligence/marketMap.ts),
// rendered as a hub ("global") + 6-category spokes, each expandable to its
// real children, plus a persistent detail panel, a top status bar, and a
// bottom "Relationship Timeline" strip.
// ---------------------------------------------------------------------------

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
const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-gold",
  neutral: "text-smartmoney-glow",
};
const TONE_ICON_WRAP: Record<DisplayTone, string> = {
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
  amber: "border-gold/30 bg-gold/10 text-gold",
  neutral: "border-smartmoney/30 bg-smartmoney/10 text-smartmoney-glow",
};
const TONE_STROKE: Record<DisplayTone, string> = {
  up: "#00E676",
  down: "#FF5252",
  amber: "#D4AF37",
  neutral: "#3B82F6",
};
const TONE_DOT: Record<DisplayTone, "up" | "down" | "gold" | "smartmoney"> = {
  up: "up",
  down: "down",
  amber: "gold",
  neutral: "smartmoney",
};
const STATUS_RING: Record<SentimentStatus, string> = {
  "risk-on": "border-up/60",
  "risk-off": "border-down/60",
  neutral: "border-smartmoney/60",
  transition: "border-gold/60",
};
const TONE_DOT_BG: Record<DisplayTone, string> = {
  up: "bg-up",
  down: "bg-down",
  amber: "bg-gold",
  neutral: "bg-smartmoney",
};

const NODE_ICON: Record<MarketMapNodeId, LucideIcon> = {
  global: Sparkles,
  crypto: Bitcoin,
  forex: Landmark,
  stocks: BarChart3,
  macro: Landmark,
  news: Newspaper,
  sentiment: Gauge,
  btc: Bitcoin,
  eth: Gem,
  altcoin: Coins,
  stablecoin: DollarSign,
  dex: Shuffle,
  usd: DollarSign,
  eur: Euro,
  gbp: PoundSterling,
  jpy: JapaneseYen,
  cny: Banknote,
  gold: Gem,
  nasdaq: BarChart3,
  sp500: BarChart3,
  nvda: Cpu,
  aapl: Smartphone,
  tsla: Car,
  interestrate: Percent,
  cpi: Receipt,
  ppi: Factory,
  nfp: Users,
  gdp: TrendingUp,
  reuters: Newspaper,
  bloomberg: Newspaper,
  twitter: AtSign,
  telegram: Send,
  coindesk: Newspaper,
  feargreed: Gauge,
  funding: Percent,
  openinterest: Layers,
  whale: Waves,
  etfflow: Building2,
  sol: Coins,
  bnb: Coins,
  xrp: Coins,
  link: Coins,
  sui: Coins,
  render: Coins,
};

const MAP_FALLBACK_HEIGHT = 460;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Node card — used for every tier-1/2/3 node. Tier 0 (the hub) gets its own
// GlobalOrb component below.
// ---------------------------------------------------------------------------

function NodeCard({
  node,
  isActive,
  isExpanded,
  onSelect,
  onToggleExpand,
  registerRef,
}: {
  node: MarketMapNode;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand?: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const Icon = NODE_ICON[node.id] ?? Sparkles;
  const hasChildren = Boolean(node.childIds?.length);

  return (
    <div
      ref={registerRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={clsx(
        "group relative flex w-full cursor-pointer flex-col rounded-xl border bg-bg-surface p-2.5 text-left shadow-card outline-none transition-all duration-200",
        "hover:-translate-y-0.5 hover:scale-[1.03] hover:border-gold/40 focus-visible:border-gold/50",
        isActive ? TONE_BORDER_ACTIVE[node.tone] : TONE_BORDER[node.tone],
        !node.connected && "border-dashed"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
            node.connected ? TONE_ICON_WRAP[node.tone] : "border-line bg-ink-faint/10 text-ink-faint"
          )}
        >
          <Icon size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-wide text-ink">{node.title}</span>
        {node.connected && <span className={clsx("h-1.5 w-1.5 shrink-0 animate-pulseGlow rounded-full", TONE_DOT_BG[node.tone])} />}
        {hasChildren && (
          <button
            type="button"
            aria-label={isExpanded ? "Ciutkan" : "Perluas"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-gold"
          >
            <ChevronDown size={12} className={clsx("transition-transform duration-200", isExpanded && "rotate-180")} />
          </button>
        )}
      </div>
      <p className={clsx("mono-num mt-1.5 truncate text-[13px] font-bold", node.connected ? TONE_TEXT[node.tone] : "text-ink-faint")}>
        {node.connected ? node.cardMetric.value : "Waiting"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The center node — bigger, breathing, tone-reactive ring, sonar ping.
// ---------------------------------------------------------------------------

function GlobalOrb({
  node,
  sentimentStatus,
  isActive,
  onSelect,
  registerRef,
}: {
  node: MarketMapNode;
  sentimentStatus: SentimentStatus;
  isActive: boolean;
  onSelect: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={clsx(
        "mx-auto flex w-fit cursor-pointer flex-col items-center gap-2 rounded-2xl p-2 outline-none transition-transform duration-200 hover:scale-[1.02]",
        isActive && "scale-[1.02]"
      )}
    >
      <div className="relative flex h-[168px] w-[168px] items-center justify-center sm:h-[188px] sm:w-[188px]">
        <span
          className="absolute h-[104px] w-[104px] animate-ping rounded-full border border-signal/50 sm:h-[116px] sm:w-[116px]"
          style={{ animationDuration: "3.2s" }}
        />
        <span className="absolute h-[156px] w-[156px] animate-orbitSlow rounded-full border border-dashed border-signal/20 sm:h-[176px] sm:w-[176px]" />
        <span className="absolute h-[132px] w-[132px] animate-orbitSlowReverse rounded-full border border-signal/25 sm:h-[150px] sm:w-[150px]" />
        <span
          className={clsx(
            "absolute h-[116px] w-[116px] rounded-full border-2 transition-colors duration-500 sm:h-[130px] sm:w-[130px]",
            STATUS_RING[sentimentStatus]
          )}
        />
        <div className="ai-orb-core relative flex h-[100px] w-[100px] animate-coreBreathe items-center justify-center rounded-full shadow-glow-signal sm:h-[112px] sm:w-[112px]">
          <div className="text-center leading-none">
            <p className="mono-num text-2xl font-bold text-ink sm:text-3xl">{node.confidence !== undefined ? `${node.confidence}%` : "—"}</p>
            <p className="mt-1 text-[8px] uppercase tracking-wider text-ink/70">AI Hub</p>
          </div>
        </div>
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink">Global Market</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar — AI Verdict / Risk Mode / Confidence / Market Phase.
// ---------------------------------------------------------------------------

function TopBarStat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: DisplayTone }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-surface p-3">
      <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", TONE_ICON_WRAP[tone])}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="eyebrow truncate text-[9px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p className={clsx("mono-num truncate text-[14px] font-bold", TONE_TEXT[tone])}>{value}</p>
      </div>
    </div>
  );
}

function TopBar({ global, finalConclusion }: { global: MarketMapNode; finalConclusion?: FinalConclusion }) {
  return (
    <div className="ambient-glow ambient-glow-ai glow-card relative mb-4 grid grid-cols-2 gap-2.5 overflow-hidden p-4 sm:grid-cols-4">
      <TopBarStat icon={Sparkles} label="AI Verdict" value={global.cardMetric.value} tone={global.tone} />
      <TopBarStat
        icon={Gauge}
        label="Risk Mode"
        value={finalConclusion?.actionLabel ?? "—"}
        tone={finalConclusion?.actionTone ?? "neutral"}
      />
      <TopBarStat icon={Percent} label="Confidence" value={global.confidence !== undefined ? `${global.confidence}%` : "—"} tone={global.tone} />
      <TopBarStat icon={TrendingUp} label="Market Phase" value={finalConclusion?.modeLabel ?? global.cardMetric.value} tone={finalConclusion?.modeTone ?? global.tone} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom — Relationship Timeline.
// ---------------------------------------------------------------------------

function RelationshipTimeline({ nodes }: { nodes: MarketMapNode[] }) {
  const byId = (id: MarketMapNodeId) => nodes.find((n) => n.id === id);
  const global = byId("global");
  const macro = byId("macro");
  const whale = byId("whale");
  const etf = byId("etfflow");

  const items: { icon: LucideIcon; label: string; value?: string; tone: DisplayTone; connected: boolean }[] = [
    { icon: Sparkles, label: "AI Reasoning", value: global?.latestEvent ?? global?.summary, tone: global?.tone ?? "neutral", connected: Boolean(global?.connected) },
    { icon: Landmark, label: "Macro Event", value: macro?.latestEvent, tone: macro?.tone ?? "neutral", connected: Boolean(macro?.connected) && Boolean(macro?.latestEvent) },
    { icon: Waves, label: "Whale Movement", value: whale?.latestEvent, tone: whale?.tone ?? "neutral", connected: Boolean(whale?.connected) },
    { icon: Building2, label: "ETF Flow", value: etf?.latestEvent, tone: etf?.tone ?? "neutral", connected: Boolean(etf?.connected) && Boolean(etf?.latestEvent) },
  ];

  return (
    <div className="glow-card ambient-glow ambient-glow-gold relative mt-4 overflow-hidden p-4">
      <SectionHeader code="TML" title="Relationship Timeline" hint="Bacaan terbaru per cabang" icon={<Landmark size={13} />} accent="gold" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className={clsx(
              "rounded-lg border p-3 transition-colors hover:border-gold/30",
              item.connected ? TONE_BORDER[item.tone] : "border-dashed border-line"
            )}
          >
            <div className="flex items-center gap-1.5 text-ink-faint">
              <item.icon size={12} />
              <span className="eyebrow text-[9px] uppercase tracking-wide">{item.label}</span>
            </div>
            <p className={clsx("mt-1.5 text-[12px] leading-snug", item.connected && item.value ? "text-ink" : "text-ink-faint")}>
              {item.connected && item.value ? item.value : "Menunggu data"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Measurement helper — walks the offsetParent chain from a node up to the
// (untransformed) content container, so line coordinates stay correct
// regardless of how many wrapper divs sit in between (the hub grid, an
// expanded-branch box, etc). Deliberately NOT getBoundingClientRect(): that
// returns post-zoom/pan screen coordinates, which would need dividing by
// `scale` on every frame. offset* is already in the content's own
// untransformed space (see useZoomPan.ts's own note on this).
function offsetRelativeTo(el: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = el;
  let guard = 0;
  while (current && current !== ancestor && guard < 50) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
    guard += 1;
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

function findAncestorChain(id: MarketMapNodeId, allNodes: MarketMapNode[]): MarketMapNodeId[] {
  const chain: MarketMapNodeId[] = [];
  let current = id;
  for (let i = 0; i < 5; i++) {
    const parent = allNodes.find((n) => n.childIds?.includes(current));
    if (!parent) break;
    chain.push(parent.id);
    current = parent.id;
  }
  return chain;
}

interface EdgeLine {
  key: string;
  d: string;
  midX: number;
  midY: number;
  tone: DisplayTone;
  opacity: number;
  live: boolean;
}

// ---------------------------------------------------------------------------
// Recursive expanded-children row — Level 2 under a category, and (for
// Altcoin specifically) Level 3 under that if it's expanded too. Generic
// over any node with childIds, not hardcoded to "altcoin".
// ---------------------------------------------------------------------------

function ExpandedBranch({
  nodeId,
  allNodes,
  expandedIds,
  activeId,
  selectedId,
  depth,
  onSelect,
  onToggleExpand,
  registerRef,
}: {
  nodeId: MarketMapNodeId;
  allNodes: MarketMapNode[];
  expandedIds: Set<MarketMapNodeId>;
  activeId: MarketMapNodeId | null;
  selectedId: MarketMapNodeId;
  depth: number;
  onSelect: (id: MarketMapNodeId) => void;
  onToggleExpand: (id: MarketMapNodeId) => void;
  registerRef: (id: MarketMapNodeId) => (el: HTMLDivElement | null) => void;
}) {
  const node = allNodes.find((n) => n.id === nodeId);
  if (!node?.childIds?.length || !expandedIds.has(nodeId)) return null;
  const allChildren = node.childIds.map((id) => allNodes.find((n) => n.id === id)).filter((n): n is MarketMapNode => Boolean(n));
  // jpy/gold/btc/eth/altcoin live permanently in the AI Core spine, so
  // re-rendering their card here would just repeat what's already on
  // screen above. This only hides the card — it must NOT also skip
  // recursing into a spine node's own children (see the second .map
  // below): altcoin isn't in CATEGORY_IDS, so this is the only place
  // its sol/bnb/xrp/link/sui/render sub-branch ever gets rendered.
  const visibleChildren = allChildren.filter((n) => !SPINE_NODE_IDS.has(n.id));

  return (
    <div className={clsx("mt-3 rounded-xl border border-dashed p-3", TONE_BORDER[node.tone])} style={{ marginLeft: depth * 16 }}>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
        <CornerDownRight size={11} /> Dari {node.title}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {visibleChildren.map((child) => (
          <NodeCard
            key={child.id}
            node={child}
            isActive={activeId === child.id || selectedId === child.id}
            isExpanded={expandedIds.has(child.id)}
            onSelect={() => onSelect(child.id)}
            onToggleExpand={child.childIds?.length ? () => onToggleExpand(child.id) : undefined}
            registerRef={registerRef(child.id)}
          />
        ))}
      </div>
      {allChildren.map((child) =>
        child.childIds?.length ? (
          <ExpandedBranch
            key={child.id}
            nodeId={child.id}
            allNodes={allNodes}
            expandedIds={expandedIds}
            activeId={activeId}
            selectedId={selectedId}
            depth={depth + 1}
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
            registerRef={registerRef}
          />
        ) : null
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------------

const CATEGORY_IDS: MarketMapNodeId[] = ["crypto", "forex", "stocks", "macro", "news", "sentiment"];

// Nodes rendered permanently in the AI Core spine (see the grid below) —
// excluded from ExpandedBranch's own children list so expanding Forex or
// Crypto doesn't re-render a card that's already visible above.
const SPINE_NODE_IDS = new Set<MarketMapNodeId>(["jpy", "gold", "btc", "eth", "altcoin"]);

export function GlobalIntelligenceMap({ live, finalConclusion }: { live: MarketMapLiveInputs; finalConclusion?: FinalConclusion }) {
  const nodes = useMemo(() => buildMarketMapNodes(live), [live]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const globalNode = nodeById.get("global")!;

  const [selectedId, setSelectedId] = useState<MarketMapNodeId>("global");
  const [expandedIds, setExpandedIds] = useState<Set<MarketMapNodeId>>(new Set());
  const [activeId, setActiveId] = useState<MarketMapNodeId | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const isDesktop = useIsDesktopPanel();
  const reducedMotion = useReducedMotion();

  const selectedNode = nodeById.get(selectedId) ?? globalNode;

  const handleSelect = useCallback(
    (id: MarketMapNodeId) => {
      setSelectedId(id);
      setActiveId(id);
      if (!isDesktop) setMobileSheetOpen(true);
      const ancestors = findAncestorChain(id, nodes);
      if (ancestors.length) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          ancestors.forEach((a) => next.add(a));
          return next;
        });
      }
    },
    [isDesktop, nodes]
  );

  const handleToggleExpand = useCallback((id: MarketMapNodeId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // --- Measurement / line drawing ---------------------------------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<MarketMapNodeId, HTMLDivElement>());
  const [lines, setLines] = useState<EdgeLine[]>([]);
  const [canvasHeight, setCanvasHeight] = useState(MAP_FALLBACK_HEIGHT);

  const zoomPan = useZoomPan(viewportRef, containerRef, { reducedMotion, minScale: 0.5, maxScale: 1.6 });

  const setNodeRef = useCallback(
    (id: MarketMapNodeId) => (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(id, el);
      else nodeRefs.current.delete(id);
    },
    []
  );

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setCanvasHeight(Math.max(MAP_FALLBACK_HEIGHT, container.offsetHeight));

    const rects = new Map<MarketMapNodeId, { left: number; top: number; width: number; height: number }>();
    nodeRefs.current.forEach((el, id) => rects.set(id, offsetRelativeTo(el, container)));

    const nextLines: EdgeLine[] = [];
    for (const edge of MARKET_MAP_EDGES) {
      const from = rects.get(edge.from);
      const to = rects.get(edge.to);
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      if (!from || !to || !fromNode || !toNode) continue;

      const x1 = from.left + from.width / 2;
      const y1 = from.top + from.height / 2;
      const x2 = to.left + to.width / 2;
      const y2 = to.top + to.height / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      // gentle perpendicular bow so the graph reads as organic rather than a rigid wireframe
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy) || 1;
      const bow = Math.min(28, dist * 0.12);
      const ctrlX = midX + (-dy / dist) * bow;
      const ctrlY = midY + (dx / dist) * bow;

      const bothConnected = fromNode.connected && toNode.connected;
      const agree = bothConnected && fromNode.tone === toNode.tone && fromNode.tone !== "neutral";
      const tone: DisplayTone = agree ? fromNode.tone : "neutral";
      const opacity = !bothConnected ? 0.14 : agree ? 0.85 : 0.32;

      nextLines.push({
        key: `${edge.from}-${edge.to}`,
        d: `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`,
        midX: ctrlX,
        midY: ctrlY,
        tone,
        opacity,
        live: bothConnected,
      });
    }
    setLines(nextLines);
  }, [nodeById]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, expandedIds, nodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recompute]);

  function renderNodeCard(id: MarketMapNodeId, className?: string) {
    const node = nodeById.get(id);
    if (!node) return null;
    return (
      <div className={className}>
        <NodeCard
          node={node}
          isActive={activeId === node.id || selectedId === node.id}
          isExpanded={expandedIds.has(node.id)}
          onSelect={() => handleSelect(node.id)}
          onToggleExpand={node.childIds?.length ? () => handleToggleExpand(node.id) : undefined}
          registerRef={setNodeRef(node.id)}
        />
      </div>
    );
  }

  return (
    <section className="relative">
      <TopBar global={globalNode} finalConclusion={finalConclusion} />

      <div className="glow-card ambient-glow ambient-glow-gold relative overflow-hidden p-0">
        <div className="border-b border-line p-4">
          <SectionHeader
            code="MAP"
            title="Global Market Intelligence Map"
            hint="Klik node = detail · panah = perluas · geser/cubit = zoom"
            icon={<Network size={13} />}
            accent="gold"
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <NodeIntelPanel node={selectedNode} allNodes={nodes} edges={MARKET_MAP_EDGES} mode="sidebar" onSelectNode={handleSelect} />

          <div className="relative min-w-0 flex-1">
            <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-bg-surface/90 p-1 backdrop-blur">
              <button
                type="button"
                onClick={zoomPan.zoomOut}
                disabled={!zoomPan.canZoomOut}
                aria-label="Perkecil peta"
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-gold disabled:pointer-events-none disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={zoomPan.reset}
                disabled={zoomPan.isAtDefault}
                aria-label="Reset tampilan peta"
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-gold disabled:pointer-events-none disabled:opacity-30"
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                onClick={zoomPan.zoomIn}
                disabled={!zoomPan.canZoomIn}
                aria-label="Perbesar peta"
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-bg-raised hover:text-gold disabled:pointer-events-none disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>

            <div
              ref={viewportRef}
              {...zoomPan.viewportHandlers}
              style={{ ...zoomPan.viewportStyle, height: Math.min(canvasHeight, 640) }}
              className="bg-grid-animated relative overflow-hidden bg-bg"
              onDoubleClick={zoomPan.reset}
            >
              <div ref={containerRef} style={zoomPan.contentStyle} className="relative px-3 py-4">
                <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                  <defs>
                    {(["up", "down", "amber", "neutral"] as DisplayTone[]).map((tone) => (
                      <radialGradient key={tone} id={`map-glow-${tone}`}>
                        <stop offset="0%" stopColor={TONE_STROKE[tone]} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={TONE_STROKE[tone]} stopOpacity="0" />
                      </radialGradient>
                    ))}
                  </defs>
                  {lines.map((line) => (
                    <g key={line.key}>
                      <path d={line.d} fill="none" stroke={TONE_STROKE[line.tone]} strokeWidth={line.live ? 1.6 : 1} opacity={line.opacity} />
                      {line.live && !reducedMotion && (
                        <circle r={2.2} fill={TONE_STROKE[line.tone]} opacity={0.9}>
                          <animateMotion dur="3.2s" repeatCount="indefinite" path={line.d} />
                        </circle>
                      )}
                    </g>
                  ))}
                </svg>

                <div className="relative z-10 mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl">
                  {/* Support row — News / Stocks / Macro / Sentiment. Kept as a
                      compact strip above the spine rather than boxed into the
                      old 3-col grid, so the wide "AI Core" layout below reads
                      as the hero without these four competing for the same
                      row heights. */}
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {renderNodeCard("news")}
                    {renderNodeCard("stocks")}
                    {renderNodeCard("macro")}
                    {renderNodeCard("sentiment")}
                  </div>

                  {/* AI Core spine — single grid, single render per node
                      (no filler divs, no order-* tricks, no double-mount).
                      DOM order is identical at both breakpoints: jpy, btc,
                      forex, crypto, orb, gold, eth.

                      Mobile/tablet (<1024px, grid-cols-2): pure natural
                      auto-flow —
                        JPY   | BTC
                        Forex | Crypto
                        [ Orb — col-span-2, auto-starts its own row ]
                        Gold  | ETH

                      Desktop/laptop (lg: 1024px+ — matching what "PC" means
                      on real hardware, not the 640px sm: breakpoint that
                      fired far too early before) — every element gets an
                      explicit lg:col-start + lg:row-start, independent of
                      DOM order:
                        JPY  ·        ·  BTC
                        Forex → Orb ← Crypto
                        XAU  ·        ·  ETH

                      jpy/gold/btc/eth/altcoin are real existing node ids
                      from lib/intelligence/marketMap.ts — same NodeCard,
                      same click/expand/drawer behavior as every other
                      node, just arranged to match the sketch. Rendering
                      any of these — especially the Orb — twice would be a
                      real bug: registerRef writes into a single shared Map
                      keyed by node id (see setNodeRef above), so two
                      mounted instances of the same id race to own that
                      ref, and whichever mounts last wins even if it's the
                      hidden one — which would silently break the edge
                      lines drawn to that node. Each node here mounts
                      exactly once. */}
                  <div className="grid grid-cols-2 items-center gap-2 lg:grid-cols-5 lg:gap-3">
                    {renderNodeCard("jpy", "lg:col-start-1 lg:row-start-1")}
                    {renderNodeCard("btc", "lg:col-start-5 lg:row-start-1")}

                    {renderNodeCard("forex", "lg:col-start-1 lg:row-start-2")}
                    {renderNodeCard("crypto", "lg:col-start-5 lg:row-start-2")}

                    <div className="col-span-2 flex items-center justify-center lg:col-start-2 lg:col-span-3 lg:row-start-2">
                      <GlobalOrb
                        node={globalNode}
                        sentimentStatus={live.sentiment.status}
                        isActive={activeId === "global" || selectedId === "global"}
                        onSelect={() => handleSelect("global")}
                        registerRef={setNodeRef("global")}
                      />
                    </div>

                    {renderNodeCard("gold", "lg:col-start-1 lg:row-start-3")}
                    {renderNodeCard("eth", "lg:col-start-5 lg:row-start-3")}
                  </div>

                  <div className="mx-auto mt-2.5 max-w-xs lg:max-w-sm">{renderNodeCard("altcoin")}</div>
                </div>

                {expandedIds.size > 0 && (
                  <div className="relative z-10 mx-auto max-w-3xl">
                    {CATEGORY_IDS.map((id) => (
                      <ExpandedBranch
                        key={id}
                        nodeId={id}
                        allNodes={nodes}
                        expandedIds={expandedIds}
                        activeId={activeId}
                        selectedId={selectedId}
                        depth={0}
                        onSelect={handleSelect}
                        onToggleExpand={handleToggleExpand}
                        registerRef={setNodeRef}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <NodeIntelPanel
        node={selectedNode}
        allNodes={nodes}
        edges={MARKET_MAP_EDGES}
        mode="sheet"
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        onSelectNode={handleSelect}
      />

      <RelationshipTimeline nodes={nodes} />
    </section>
  );
}
