"use client";
import { useEffect, useState } from "react";
import { Gift, Zap, ArrowUpRight, Loader2 } from "lucide-react";
import clsx from "clsx";
import { timeAgo, timeUntil } from "@/lib/format";

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

// Same reason labels as the old Settings > AI Energy section — moved here
// verbatim, not reinvented.
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

export function EarnView() {
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

  async function handleClaim() {
    setClaiming(true);
    setClaimNotice(null);
    try {
      await fetch("/api/ai-energy/claim", { method: "POST" });
      await load();
    } catch {
      setClaimNotice("Gagal klaim — coba lagi sebentar.");
    } finally {
      setClaiming(false);
    }
  }

  const rewardHistory = data && data !== "unauth" ? data.transactions.filter((tx) => tx.delta > 0) : [];

  return (
    <div className="space-y-6">
      {data === null && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-bg-surface p-4 text-xs text-ink-faint">
          <Loader2 size={14} className="animate-spin" /> Memuat…
        </div>
      )}

      {data === "unauth" && (
        <div className="rounded-md border border-line bg-bg-surface p-4 text-xs text-ink-faint">
          Sign in untuk melihat Earn kamu.
        </div>
      )}

      {data && data !== "unauth" && (
        <>
          {/* Quest / Available Tasks — the only real earn mechanic that exists today is the Daily Reward claim. */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Available Tasks</p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-raised/60 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal-glow">
                  <Gift size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Daily Reward</p>
                  <p className="text-xs text-ink-faint">
                    {claimNotice ??
                      (data.canClaim ? "+10 AI Energy siap diklaim sekarang." : `Tersedia lagi ${timeUntil(data.nextClaimAt)}.`)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClaim}
                disabled={!data.canClaim || claiming}
                className={clsx(
                  "shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                  data.canClaim && !claiming
                    ? "border-signal/40 bg-signal/10 text-signal-glow hover:bg-signal/20"
                    : "cursor-not-allowed border-line text-ink-faint"
                )}
              >
                {claiming ? "Mengklaim…" : "Klaim +10"}
              </button>
            </div>
          </section>

          {/* Rewards — current balance, same source as sidebar/profile. */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Rewards</p>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <Zap size={14} className="text-signal-glow" /> AI Energy Balance
              </span>
              <span className="mono-num text-base font-semibold text-ink">{data.balance}</span>
            </div>
          </section>

          {/* Completed — reward transactions only (positive deltas), same feed as Settings used to show. */}
          <section className="rounded-md border border-line bg-bg-surface p-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-faint">Completed</p>
            {rewardHistory.length === 0 && <p className="text-xs text-ink-faint">Belum ada reward yang diklaim.</p>}
            {rewardHistory.length > 0 && (
              <div className="space-y-1.5">
                {rewardHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <ArrowUpRight size={12} className="text-up" />
                      {REASON_LABEL[tx.reason] ?? tx.reason}
                    </span>
                    <span className="mono-num text-ink-faint">
                      +{tx.delta} · {timeAgo(tx.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
