"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { X, ExternalLink, Sparkles, Clock, Share2, Layers, Gauge } from "lucide-react";
import { LiveDot } from "@/components/ui/LiveDot";
import type { DrawerSection, MarketMapEdge, MarketMapNode, MarketMapNodeId } from "@/lib/intelligence/marketMap";
import type { DisplayTone } from "@/lib/intelligence/shared";
import { Sparkline } from "./Sparkline";

/**
 * V4 — was a right-side slide-in drawer only. Now doubles as:
 *  - the Intelligence Map's persistent LEFT PANEL on desktop (mode="sidebar",
 *    always mounted, shows the selected node or the Global Hub by default)
 *  - the same bottom-sheet-on-mobile it always was (mode="sheet")
 * Same MarketMapNode data either way — this file only decides how to lay it
 * out, never what to show.
 */

const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-gold",
  neutral: "text-smartmoney-glow",
};
const TONE_DOT: Record<DisplayTone, "up" | "down" | "gold" | "smartmoney"> = {
  up: "up",
  down: "down",
  amber: "gold",
  neutral: "smartmoney",
};
const TONE_BG: Record<DisplayTone, string> = {
  up: "bg-up",
  down: "bg-down",
  amber: "bg-gold",
  neutral: "bg-smartmoney",
};
const TONE_BADGE: Record<DisplayTone, string> = {
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
  amber: "border-gold/30 bg-gold/10 text-gold",
  neutral: "border-smartmoney/30 bg-smartmoney/10 text-smartmoney-glow",
};
const TREND_LABEL: Record<DisplayTone, string> = {
  up: "Bullish",
  down: "Bearish",
  amber: "Transition",
  neutral: "Neutral",
};

export function useIsDesktopPanel() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isDesktop;
}

function getConnectedNodes(nodeId: MarketMapNodeId, edges: MarketMapEdge[], allNodes: MarketMapNode[]): MarketMapNode[] {
  const ids = new Set<MarketMapNodeId>();
  for (const e of edges) {
    if (e.from === nodeId) ids.add(e.to);
    if (e.to === nodeId) ids.add(e.from);
  }
  return allNodes.filter((n) => ids.has(n.id));
}

function getSiblings(nodeId: MarketMapNodeId, allNodes: MarketMapNode[]): MarketMapNode[] {
  const parent = allNodes.find((n) => n.childIds?.includes(nodeId));
  if (!parent?.childIds) return [];
  return allNodes.filter((n) => parent.childIds!.includes(n.id) && n.id !== nodeId);
}

function NodeChip({ node, onSelect }: { node: MarketMapNode; onSelect?: (id: MarketMapNodeId) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(node.id)}
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:-translate-y-0.5",
        node.connected ? TONE_BADGE[node.tone] : "border-line text-ink-faint"
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", node.connected ? TONE_BG[node.tone] : "bg-ink-faint")} />
      {node.title}
    </button>
  );
}

function PanelSectionLabel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-ink-faint">
      <Icon size={12} />
      <span className="eyebrow text-[10px] uppercase tracking-wide">{text}</span>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-[96px] flex-1 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-signal-dim to-signal-glow shadow-glow-signal transition-[width] duration-700 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="mono-num shrink-0 text-[11px] font-bold text-signal-glow">{Math.round(clamped)}%</span>
    </div>
  );
}

function SectionView({ section }: { section: DrawerSection }) {
  if (section.kind === "chart") {
    return (
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{section.label}</p>
        <Sparkline series={section.series} connected={section.connected} />
      </div>
    );
  }
  if (section.kind === "stats") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {section.items.map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-bg-surface px-2.5 py-2">
            <p className="truncate text-[9px] uppercase tracking-wide text-ink-faint">{item.label}</p>
            <p className={clsx("mono-num mt-0.5 truncate text-[13px] font-bold", item.connected ? TONE_TEXT[item.tone] : "text-ink-faint")}>{item.value}</p>
          </div>
        ))}
      </div>
    );
  }
  if (section.kind === "list") {
    return (
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{section.title}</p>
        <div className="space-y-1.5">
          {section.items.map((item, i) => (
            <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-bg-surface px-2.5 py-2 text-[12px]">
              <div className="min-w-0">
                <p className="truncate text-ink">{item.label}</p>
                {item.detail && <p className="mt-0.5 truncate text-[11px] text-ink-faint">{item.detail}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.tone && <span className={clsx("h-1.5 w-1.5 rounded-full", TONE_BG[item.tone])} />}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-ink-faint hover:text-gold">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (section.kind === "text") {
    return (
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">{section.title}</p>
        <p className="text-[12px] leading-relaxed text-ink-muted">{section.body}</p>
      </div>
    );
  }
  // chain
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Reasoning Chain</p>
      <div className="space-y-1.5">
        {section.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-line bg-bg-surface px-2.5 py-2 text-[12px]">
            <span className={clsx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", TONE_BG[step.tone])} />
            <div className="min-w-0">
              <span className="text-ink-faint">{step.nodeLabel}</span>
              {step.reasons.map((reason, j) => (
                <p key={j} className="text-ink">
                  {reason.text}
                </p>
              ))}
            </div>
          </div>
        ))}
        <div className={clsx("mt-2 rounded-lg border px-2.5 py-2 text-[12px] font-semibold", TONE_BADGE[section.verdict.tone])}>
          Verdict: {section.verdict.label} · {section.verdict.confidence}% confidence
        </div>
      </div>
    </div>
  );
}

function PanelBody({
  node,
  allNodes,
  edges,
  onSelectNode,
}: {
  node: MarketMapNode;
  allNodes: MarketMapNode[];
  edges: MarketMapEdge[];
  onSelectNode?: (id: MarketMapNodeId) => void;
}) {
  const connectedMarkets = getConnectedNodes(node.id, edges, allNodes);
  const siblings = getSiblings(node.id, allNodes);
  const narrativeText = node.tone === "up" ? node.narrative.up : node.tone === "down" ? node.narrative.down : node.narrative.neutral;

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Current Trend + Confidence */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={clsx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", TONE_BADGE[node.tone])}>{TREND_LABEL[node.tone]}</span>
        {node.confidence !== undefined && <ConfidenceBar value={node.confidence} />}
        {!node.connected && <span className="text-[11px] text-ink-faint">Menunggu API</span>}
      </div>

      <p className="text-[13px] leading-relaxed text-ink">{node.summary}</p>

      {/* AI Reasoning */}
      <div>
        <PanelSectionLabel icon={Sparkles} text="AI Reasoning" />
        <p className="text-[12px] leading-relaxed text-ink-muted">{node.aiExplanation}</p>
        <p className="mt-1.5 text-[11px] italic leading-relaxed text-ink-faint">{narrativeText}</p>
      </div>

      {/* Latest Event */}
      {node.latestEvent && (
        <div>
          <PanelSectionLabel icon={Clock} text="Latest Event" />
          <p className="text-[12px] leading-relaxed text-ink-muted">{node.latestEvent}</p>
        </div>
      )}

      {/* Connected Markets */}
      {connectedMarkets.length > 0 && (
        <div>
          <PanelSectionLabel icon={Share2} text="Connected Markets" />
          <div className="flex flex-wrap gap-1.5">
            {connectedMarkets.map((n) => (
              <NodeChip key={n.id} node={n} onSelect={onSelectNode} />
            ))}
          </div>
        </div>
      )}

      {/* Related Assets (siblings under the same parent) */}
      {siblings.length > 0 && (
        <div>
          <PanelSectionLabel icon={Layers} text="Related Assets" />
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((n) => (
              <NodeChip key={n.id} node={n} onSelect={onSelectNode} />
            ))}
          </div>
        </div>
      )}

      {/* Full detail sections */}
      {node.sections.length > 0 && (
        <div className="space-y-4 border-t border-line pt-4">
          {node.sections.map((section, i) => (
            <SectionView key={i} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeIntelPanel({
  node,
  allNodes,
  edges,
  mode,
  open = true,
  onClose,
  onSelectNode,
}: {
  node: MarketMapNode | undefined;
  allNodes: MarketMapNode[];
  edges: MarketMapEdge[];
  mode: "sidebar" | "sheet";
  /** Only meaningful for mode="sheet" — sidebar is always considered open. */
  open?: boolean;
  onClose?: () => void;
  onSelectNode?: (id: MarketMapNodeId) => void;
}) {
  if (mode === "sidebar") {
    return (
      <aside className="hidden h-full w-[320px] shrink-0 flex-col border-r border-line bg-bg-raised/60 lg:flex xl:w-[360px]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {node ? (
            <>
              <LiveDot tone={node.connected ? TONE_DOT[node.tone] : "signal"} />
              <div className="min-w-0">
                <p className="eyebrow truncate text-[9px] text-ink-faint">{node.code}</p>
                <h3 className="truncate text-sm font-bold text-ink">{node.title}</h3>
              </div>
            </>
          ) : (
            <span className="text-xs text-ink-faint">Pilih node untuk melihat detail</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {node && (
              <motion.div key={node.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <PanelBody node={node} allNodes={allNodes} edges={edges} onSelectNode={onSelectNode} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    );
  }

  // mode === "sheet" (mobile) — slide up from bottom, dismissable, unmounted when closed.
  return (
    <AnimatePresence>
      {open && node && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-hidden rounded-t-2xl border-t border-line bg-bg-surface shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <LiveDot tone={node.connected ? TONE_DOT[node.tone] : "signal"} />
                <div className="min-w-0">
                  <p className="eyebrow truncate text-[9px] text-ink-faint">{node.code}</p>
                  <h3 className="truncate text-sm font-bold text-ink">{node.title}</h3>
                </div>
              </div>
              <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-bg-raised hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[calc(82vh-52px)] overflow-y-auto">
              <PanelBody node={node} allNodes={allNodes} edges={edges} onSelectNode={onSelectNode} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
