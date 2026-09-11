"use client";

import { ArrowRight, ArrowDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared diagram primitives for the ELSTAND Intelligence documentation page.
 *
 * Design constraint (per doc spec): no external image dependency — every
 * diagram here is rendered as local React/CSS or inline SVG, not an
 * <img> pointing at a generated/remote asset.
 */

function Node({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "violet";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber/40 bg-amber/[0.06] text-amber"
      : tone === "violet"
      ? "border-violet-400/40 bg-violet-400/[0.06] text-violet-300"
      : "border-line bg-bg-raised text-ink";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center text-[11px] font-medium leading-snug sm:text-xs ${toneClass}`}
    >
      {children}
    </div>
  );
}

/** Horizontal on desktop, vertical on mobile — a linear pipeline of steps. */
export function FlowDiagram({
  steps,
  direction = "horizontal",
}: {
  steps: { label: string; tone?: "neutral" | "gold" | "violet" }[];
  direction?: "horizontal" | "vertical";
}) {
  return (
    <div
      className={`panel flex gap-2 overflow-x-auto p-4 ${
        direction === "horizontal" ? "flex-col sm:flex-row sm:items-center" : "flex-col items-stretch"
      }`}
    >
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-center gap-2 ${
            direction === "horizontal" ? "sm:flex-1" : ""
          }`}
        >
          <div className={direction === "horizontal" ? "w-full sm:w-auto sm:flex-1" : "w-full"}>
            <Node tone={s.tone}>{s.label}</Node>
          </div>
          {i < steps.length - 1 &&
            (direction === "horizontal" ? (
              <>
                <ArrowDown size={14} className="mx-auto shrink-0 text-ink-faint sm:hidden" />
                <ArrowRight size={14} className="hidden shrink-0 text-ink-faint sm:block" />
              </>
            ) : (
              <ArrowDown size={14} className="mx-auto shrink-0 text-ink-faint" />
            ))}
        </div>
      ))}
    </div>
  );
}

/** ELSTAND × ELVOID comparison + relationship flow. */
export function EcosystemRelationDiagram() {
  return (
    <div className="panel space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-amber/30 bg-amber/[0.05] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber">ELSTAND Intelligence</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Ecosystem / product surface — dashboard, macro, quant, order flow, Web3, membership, wallet.
          </p>
        </div>
        <div className="rounded-lg border border-violet-400/30 bg-violet-400/[0.05] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">ELVOID</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Decision-intelligence layer di dalam ELSTAND — Oracle, Cognitive Layer, evaluasi &amp; learning.
          </p>
        </div>
      </div>
      <FlowDiagram
        steps={[
          { label: "External information" },
          { label: "ELSTAND intelligence sources", tone: "gold" },
          { label: "Evidence" },
          { label: "ELVOID", tone: "violet" },
          { label: "Decision context", tone: "violet" },
          { label: "Outcome" },
          { label: "Learning" },
        ]}
      />
    </div>
  );
}

/** System Iceberg — inline SVG. UI is the visible tip; most of the system sits below the waterline. */
export function SystemIcebergDiagram() {
  return (
    <div className="panel p-4">
      <svg
        viewBox="0 0 640 460"
        className="mx-auto w-full max-w-xl"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Diagram System Iceberg: UI di permukaan, ELVOID di tengah, infrastruktur di dasar"
      >
        {/* waterline */}
        <line x1="20" y1="150" x2="620" y2="150" stroke="rgb(245 185 66 / 0.35)" strokeDasharray="6 6" strokeWidth="1.5" />
        <text x="20" y="142" fontSize="10" fill="rgb(245 185 66)" fontFamily="monospace">
          WATERLINE — apa yang user lihat
        </text>

        {/* top group */}
        {["User Interface", "Dashboard", "Macro", "Quant", "Order Flow", "Intelligence Map", "Web3"].map((label, i) => (
          <g key={label} transform={`translate(${40 + (i % 4) * 145}, ${30 + Math.floor(i / 4) * 46})`}>
            <rect width="130" height="34" rx="7" fill="rgb(245 185 66 / 0.08)" stroke="rgb(245 185 66 / 0.4)" />
            <text x="65" y="21" fontSize="10" textAnchor="middle" fill="rgb(240 226 190)" fontFamily="monospace">
              {label}
            </text>
          </g>
        ))}

        {/* middle group (ELVOID) */}
        {["ELVOID Oracle", "Evidence", "Risk", "Conflict", "Cognitive Layer"].map((label, i) => (
          <g key={label} transform={`translate(${40 + (i % 3) * 195}, ${175 + Math.floor(i / 3) * 46})`}>
            <rect width="180" height="34" rx="7" fill="rgb(167 139 250 / 0.1)" stroke="rgb(167 139 250 / 0.45)" />
            <text x="90" y="21" fontSize="10" textAnchor="middle" fill="rgb(216 204 250)" fontFamily="monospace">
              {label}
            </text>
          </g>
        ))}

        {/* bottom group */}
        {["Autonomous Runtime", "Persistence", "Evaluation", "Learning", "Database", "Security", "Infrastructure"].map(
          (label, i) => (
            <g key={label} transform={`translate(${30 + (i % 4) * 148}, ${280 + Math.floor(i / 4) * 46})`}>
              <rect width="136" height="34" rx="7" fill="rgb(255 255 255 / 0.03)" stroke="rgb(255 255 255 / 0.12)" />
              <text x="68" y="21" fontSize="9.5" textAnchor="middle" fill="rgb(200 200 205)" fontFamily="monospace">
                {label}
              </text>
            </g>
          )
        )}

        {/* iceberg outline, very subtle */}
        <path
          d="M 320 20 L 560 150 L 610 420 L 30 420 L 80 150 Z"
          fill="none"
          stroke="rgb(255 255 255 / 0.05)"
          strokeWidth="1"
        />

        <text x="320" y="450" fontSize="10" textAnchor="middle" fill="rgb(150 150 155)" fontFamily="monospace">
          UI hanyalah permukaan — sebagian besar sistem berada di bawah garis air
        </text>
      </svg>
    </div>
  );
}
