"use client";
import { useEffect, useState } from "react";
import { Zap, ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { SettingsCard, SettingsRow } from "../SettingsCard";
import { timeAgo, timeUntil } from "@/lib/format";
import { notifyAiEnergyChanged, useAiEnergyRefresh } from "@/lib/energyBus";

interface EnergyTransaction {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface EnergyData {
  balance: number;
  nextClaimAt: string;
  canClaim: boolean;
  transactions: EnergyTransaction[];
}

// Phase 3.2 feature keys (see FEATURE_COSTS in lib/energy.ts) plus the daily
// grant and each feature's refund reason. Kept the old Phase 3.1 stub's
// placeholder keys too (harmless if unused) in case anything under those
// names is already sitting in someone's history.
const REASON_LABEL: Record<string, string> = {
  analyze_coin: "Analyze Coin",
  generate_signal: "Generate AI Signal",
  ai_chat: "AI Agent Chat",
  daily_claim: "Daily Reward",
  analyze_coin_refund: "Refund — Analyze Coin gagal",
  generate_signal_refund: "Refund — Signal gagal",
  ai_chat_refund: "Refund — AI Chat gagal",
  chat: "AI Chat",
  ai_signal_generate: "AI Signal (single)",
  ai_signal_scan: "AI Signal (full scan)",
  chart_analysis: "Chart Analysis",
  token_analysis: "Token Analyzer",
  daily_reset: "Daily reset",
};

export function AiEnergySection() {
  const [data, setData] = useState<EnergyData | null | "unauth">(null);
  const [claiming, setClaiming] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);

  function load() {
    return fetch("/api/ai-energy")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData("unauth"));
  }

  useEffect(() => {
    load();
  }, []);

  // AI Energy purchase bug fix: also refetch when a purchase happens
  // elsewhere (e.g. the /wallet page) while this Settings tab is open.
  useAiEnergyRefresh(load);

  async function handleClaim() {
    setClaiming(true);
    setClaimNotice(null);
    try {
      await fetch("/api/ai-energy/claim", { method: "POST" });
      // Reload regardless of the response body: a 200 means the claim
      // landed, a 429 ("too_soon" — e.g. a double-click, or another tab
      // claimed first) just means it didn't, and either way the freshly
      // reloaded balance/nextClaimAt/canClaim already tell the accurate
      // story without needing a separate notice.
      await load();
      // Tell every other mounted balance display (dashboard widget, profile
      // dropdown, sidebar) to refresh too — same fix as the purchase flow.
      notifyAiEnergyChanged();
    } catch {
      setClaimNotice("Gagal klaim — coba lagi sebentar.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <SettingsCard
      id="ai-energy"
      icon={Zap}
      title="AI Energy"
      description="Dipakai untuk Analyze Coin, Generate AI Signal, dan AI Agent Chat. +10 gratis tiap 24 jam lewat Daily Reward — diklaim manual, bukan reset otomatis."
    >
      {data === null && <p className="text-xs text-ink-faint">Memuat…</p>}
      {data === "unauth" && <p className="text-xs text-ink-faint">Sign in untuk melihat AI Energy kamu.</p>}
      {data && data !== "unauth" && (
        <>
          <SettingsRow label="Current Balance">
            <span className="flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-signal-glow">
              <Zap size={12} /> {data.balance}
            </span>
          </SettingsRow>

          <SettingsRow
            label="Next Daily Reward"
            hint={
              claimNotice ??
              (data.canClaim ? "+10 AI Energy siap diklaim sekarang." : `Tersedia lagi ${timeUntil(data.nextClaimAt)}.`)
            }
          >
            <button
              onClick={handleClaim}
              disabled={!data.canClaim || claiming}
              className={clsx(
                "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                data.canClaim && !claiming
                  ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20"
                  : "cursor-not-allowed border-line text-ink-faint"
              )}
            >
              {claiming ? "Mengklaim…" : "Klaim +10"}
            </button>
          </SettingsRow>

          {data.transactions.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-3.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Riwayat terbaru</p>
              {data.transactions.map((tx) => (
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
