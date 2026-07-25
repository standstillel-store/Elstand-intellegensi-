"use client";
import { useEffect, useState } from "react";
import { Zap, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SettingsCard, SettingsRow } from "../SettingsCard";
import { timeAgo, timeUntil } from "@/lib/format";

interface EnergyTransaction {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface EnergyState {
  balance: number;
  nextResetAt: string;
  transactions: EnergyTransaction[];
}

const REASON_LABEL: Record<string, string> = {
  chat: "AI Chat",
  ai_signal_generate: "AI Signal (single)",
  ai_signal_scan: "AI Signal (full scan)",
  chart_analysis: "Chart Analysis",
  token_analysis: "Token Analyzer",
  daily_reset: "Daily reset",
};

export function AiEnergySection() {
  const [state, setState] = useState<EnergyState | null | "unauth">(null);

  useEffect(() => {
    fetch("/api/account/energy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setState)
      .catch(() => setState("unauth"));
  }, []);

  return (
    <SettingsCard id="ai-energy" icon={Zap} title="AI Energy" description="10 gratis per hari, reset otomatis 24 jam setelah pemakaian pertama.">
      {state === null && <p className="text-xs text-ink-faint">Memuat…</p>}
      {state === "unauth" && <p className="text-xs text-ink-faint">Sign in untuk melihat AI Energy kamu.</p>}
      {state && state !== "unauth" && (
        <>
          <SettingsRow label="Balance" hint={`Reset otomatis ${timeUntil(state.nextResetAt)}.`}>
            <span className="flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal-glow">
              <Zap size={12} /> {state.balance} / 10
            </span>
          </SettingsRow>

          {state.transactions.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-3.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Riwayat terbaru</p>
              {state.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    {tx.delta < 0 ? (
                      <ArrowDownRight size={12} className="text-down" />
                    ) : (
                      <ArrowUpRight size={12} className="text-up" />
                    )}
                    {REASON_LABEL[tx.reason] ?? tx.reason}
                  </span>
                  <span className="mono-num text-ink-faint">
                    {tx.delta > 0 ? "+" : ""}
                    {tx.delta} · {timeAgo(tx.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SettingsCard>
  );
}
