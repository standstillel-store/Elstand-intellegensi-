"use client";
import { Zap, Lock } from "lucide-react";

const USES = ["AI Signal Analysis", "Deep Scan", "AI Performance", "Premium Features"];

export function WalletAiEnergy() {
  return (
    <div className="rounded-lg border border-dashed border-signal/30 bg-bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <Zap size={15} className="text-signal-glow" />
        <p className="text-sm font-semibold text-ink">Buy AI Energy</p>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 rounded-md border border-line bg-bg-raised px-4 py-4">
        <div className="text-center">
          <p className="text-xl font-bold text-signal-glow">10</p>
          <p className="text-[11px] text-ink-faint">AI Energy</p>
        </div>
        <span className="text-ink-faint">=</span>
        <div className="text-center">
          <p className="text-xl font-bold text-ink">15</p>
          <p className="text-[11px] text-ink-faint">ELS</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">AI Energy digunakan untuk:</p>
      <ul className="mt-1.5 space-y-1">
        {USES.map((u) => (
          <li key={u} className="text-xs text-ink-muted">
            &#10003; {u}
          </li>
        ))}
      </ul>

      <button
        disabled
        className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-line bg-bg-raised py-2.5 text-xs font-medium text-ink-faint"
      >
        <Lock size={12} />
        Coming Soon
      </button>
    </div>
  );
}
