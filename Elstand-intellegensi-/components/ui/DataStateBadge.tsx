import { AlertTriangle } from "lucide-react";
import type { DataState } from "@/lib/intelligence/premium";

const CONFIG: Record<DataState, { label: string; classes: string; dot: string }> = {
  real: { label: "REAL", classes: "border-up/30 bg-up/10 text-up", dot: "bg-up" },
  proxy: { label: "PROXY", classes: "border-amber/30 bg-amber/10 text-amber", dot: "bg-amber" },
  unavailable: { label: "N/A", classes: "border-line bg-ink-faint/10 text-ink-faint", dot: "bg-ink-faint" },
};

/**
 * Explicit REAL / PROXY / UNAVAILABLE indicator (ELSTAND PREMIUM data-integrity
 * rule: every module must say what kind of data it's showing). `compact` renders
 * just a colored dot for dense table headers; the full badge is for card corners.
 */
export function DataStateBadge({ state, compact = false, title }: { state: DataState; compact?: boolean; title?: string }) {
  const cfg = CONFIG[state];
  if (compact) {
    return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} title={title ?? cfg.label} />;
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cfg.classes}`}
    >
      {state === "unavailable" && <AlertTriangle size={9} />}
      {cfg.label}
    </span>
  );
}

/** Literal "DATA UNAVAILABLE" placeholder text — used in place of a value, never an invented number. */
export function DataUnavailable({ label = "DATA UNAVAILABLE" }: { label?: string }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>;
}
