import { Bot } from "lucide-react";

/**
 * Static, intentional isolation state — ELVOID PRO / ELVOID Intelligence
 * Core is currently under active development and must never be called
 * from ELSTAND PREMIUM. This component has zero data props and zero
 * imports from lib/ai/oracle or lib/elvoid by design: it can never
 * accidentally go "live" just by someone wiring a prop in later without
 * also touching this file directly.
 */
export function AiSummaryIsolated() {
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          <Bot size={12} />
          AI Summary
        </span>
        <span className="rounded border border-line px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-faint">
          Connector Offline
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Intelligence connector unavailable — ELVOID Intelligence Core integration is currently isolated during active
        development.
      </p>
    </div>
  );
}
