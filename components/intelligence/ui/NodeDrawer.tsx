"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { X, ExternalLink } from "lucide-react";
import { LiveDot } from "@/components/ui/LiveDot";
import type { DrawerSection, MarketMapNode } from "@/lib/intelligence/marketMap";
import type { DisplayTone } from "@/lib/intelligence/shared";
import { Sparkline } from "./Sparkline";

const TONE_TEXT: Record<DisplayTone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink",
};
const TONE_DOT: Record<DisplayTone, "up" | "down" | "amber" | "signal"> = {
  up: "up",
  down: "down",
  amber: "amber",
  neutral: "signal",
};
const TONE_BG: Record<DisplayTone, string> = {
  up: "bg-up",
  down: "bg-down",
  amber: "bg-amber",
  neutral: "bg-ink-faint",
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
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
        {section.items.map((m) => (
          <div
            key={m.label}
            className={clsx("rounded-lg border px-3 py-2", m.connected ? "border-line bg-bg-surface" : "border-dashed border-line/60 bg-bg-surface/50")}
          >
            <p className="text-[10px] uppercase tracking-wide text-ink-faint">{m.label}</p>
            <p className={clsx("mono-num mt-0.5 text-sm font-medium", m.connected ? TONE_TEXT[m.tone] : "text-ink-faint")}>{m.value}</p>
          </div>
        ))}
      </div>
    );
  }

  if (section.kind === "list") {
    return (
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{section.title}</p>
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="rounded-lg border border-line bg-bg-surface px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className={clsx("min-w-0 flex-1", item.tone ? TONE_TEXT[item.tone] : "text-ink")}>{item.label}</span>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-ink-faint hover:text-signal-glow">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              {item.detail && <p className="mt-0.5 text-[11px] text-ink-faint">{item.detail}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section.kind === "chain") {
    return (
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
          Reasoning Chain <span className="normal-case text-ink-faint/70">— bukan black box, ini rule-nya</span>
        </p>
        <div>
          {section.steps.map((step) => (
            <div key={step.node} className="relative pb-3.5 pl-5 last:pb-0">
              <span
                className={clsx(
                  "absolute left-0 top-1 h-3 w-3 rounded-full border-2 border-bg-raised",
                  step.reasons.length ? TONE_BG[step.tone] : "bg-ink-faint/40"
                )}
              />
              <span className="absolute left-[5px] top-4 h-full w-px bg-line" />
              <p className="mono-num text-[10px] uppercase tracking-wide text-ink-faint">{step.nodeLabel}</p>
              {step.reasons.length ? (
                step.reasons.map((r, j) => (
                  <p key={j} className={clsx("mt-0.5 text-[12px] leading-snug", TONE_TEXT[step.tone])}>
                    {r.text}
                  </p>
                ))
              ) : (
                <p className="mt-0.5 text-[12px] text-ink-faint">Tidak ada sinyal signifikan saat ini</p>
              )}
            </div>
          ))}
          <div className="relative pl-5">
            <span className={clsx("absolute left-0 top-1 h-3 w-3 rounded-full", TONE_BG[section.verdict.tone])} />
            <p className="mono-num text-[10px] uppercase tracking-wide text-signal-glow">AI Conclusion</p>
            <p className={clsx("mt-0.5 text-[13px] font-semibold", TONE_TEXT[section.verdict.tone])}>
              {section.verdict.label} · {section.verdict.confidence}% confidence
            </p>
          </div>
        </div>
      </div>
    );
  }

  // text
  return (
    <div className="rounded-lg border border-signal/20 bg-signal/5 px-3 py-2.5">
      <p className="eyebrow mb-1 text-[10px] text-signal-glow">{section.title}</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">{section.body}</p>
    </div>
  );
}

export function NodeDrawer({ node, open, onClose }: { node: MarketMapNode | null; open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && node && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="drawer"
            initial={isMobile ? { y: "100%" } : { x: "100%" }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className={clsx(
              "fixed z-50 flex flex-col border-line bg-bg-raised shadow-2xl",
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t",
              "sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0"
            )}
            role="dialog"
            aria-modal="true"
            aria-label={node.title}
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3.5">
              <LiveDot tone={TONE_DOT[node.tone]} />
              <span className="eyebrow text-[11px] text-ink-faint">{node.code}</span>
              <h3 className="text-sm font-semibold text-ink">{node.title}</h3>
              {!node.connected && (
                <span className="rounded border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-faint">Waiting for API</span>
              )}
              <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-bg-surface hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <p className="text-[13px] leading-relaxed text-ink-muted">{node.summary}</p>

              <div className="rounded-lg border border-signal/20 bg-signal/5 px-3 py-2.5">
                <p className="eyebrow mb-1 text-[10px] text-signal-glow">AI Explanation</p>
                <p className="text-[13px] leading-relaxed text-ink-muted">{node.aiExplanation}</p>
              </div>

              {node.sections.map((section, i) => (
                <SectionView key={i} section={section} />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
