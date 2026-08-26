"use client";
import { useEffect, useState } from "react";
import { Trophy, Loader2, AlertTriangle, Zap, Flame } from "lucide-react";
import clsx from "clsx";
import { shortAddr } from "@/lib/format";

interface Contributor {
  wallet: string;
  els: number;
  aiEnergy: number;
}

type LoadState = "loading" | "ready" | "error";

const MEDAL = ["🥇", "🥈", "🥉"];

// Top Contributors leaderboard — pure presentation over
// GET /api/leaderboard, which itself only reuses existing tables
// (ai_token, wallets, ai_energy_ledger). See that route for the full
// data-source documentation. This component owns no data of its own:
// no mock rows, no hardcoded balances, nothing rendered here that didn't
// come back from the API.
export function LeaderboardView() {
  const [state, setState] = useState<LoadState>("loading");
  const [contributors, setContributors] = useState<Contributor[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setContributors(Array.isArray(json.contributors) ? json.contributors : []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-md border border-line bg-bg-surface p-4 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber/30 bg-amber/10 text-amber shadow-glow-amber">
          <Trophy size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Top Contributors</p>
          <p className="text-[11px] text-ink-faint">Ranked by ELS Testnet earned, current AI Energy balance shown alongside.</p>
        </div>
      </div>

      {state === "loading" && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-bg-raised/40 p-4 text-xs text-ink-faint">
          <Loader2 size={14} className="animate-spin" /> Loading leaderboard...
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center gap-2 rounded-md border border-down/30 bg-down/5 p-4 text-xs text-down">
          <AlertTriangle size={14} /> Unable to load leaderboard
        </div>
      )}

      {state === "ready" && contributors.length === 0 && (
        <div className="rounded-md border border-dashed border-line p-6 text-center text-xs text-ink-faint">
          No contributors yet.
        </div>
      )}

      {state === "ready" && contributors.length > 0 && (
        <>
          {/* Desktop / wide: table */}
          <div className="hidden overflow-hidden rounded-md border border-line sm:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-bg-raised/40 text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 text-left font-semibold">Rank</th>
                  <th className="px-3 py-2 text-left font-semibold">Wallet</th>
                  <th className="px-3 py-2 text-right font-semibold">ELS</th>
                  <th className="px-3 py-2 text-right font-semibold">AI Energy</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((c, i) => (
                  <tr key={c.wallet} className={clsx("border-b border-line/60 last:border-b-0", i < 3 && "bg-amber/5")}>
                    <td className="px-3 py-2.5 font-semibold text-ink">
                      {MEDAL[i] ? <span className="mr-1">{MEDAL[i]}</span> : null}
                      {i + 1}
                    </td>
                    <td className="mono-num px-3 py-2.5 text-ink-muted">{shortAddr(c.wallet)}</td>
                    <td className="mono-num px-3 py-2.5 text-right font-semibold text-amber">{c.els.toLocaleString("en-US")}</td>
                    <td className="mono-num px-3 py-2.5 text-right font-semibold text-signal-glow">{c.aiEnergy.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="space-y-2 sm:hidden">
            {contributors.map((c, i) => (
              <div
                key={c.wallet}
                className={clsx(
                  "flex items-center gap-3 rounded-md border border-line bg-bg-raised/40 p-3",
                  i < 3 && "border-amber/30 bg-amber/5"
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold text-ink">
                  {MEDAL[i] ?? i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mono-num truncate text-xs text-ink-muted">{shortAddr(c.wallet)}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold">
                    <span className="flex items-center gap-1 text-amber">
                      <Flame size={11} /> {c.els.toLocaleString("en-US")}
                    </span>
                    <span className="flex items-center gap-1 text-signal-glow">
                      <Zap size={11} /> {c.aiEnergy.toLocaleString("en-US")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
