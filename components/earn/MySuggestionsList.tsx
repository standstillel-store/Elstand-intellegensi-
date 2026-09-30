"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";

interface MySuggestion {
  id: string;
  publicId: string;
  title: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CLAIMING" | "CLAIMED" | "REWARDED";
  rewardAmount: string | null;
  aiEnergyAmount: number;
  aiEnergyGranted: boolean;
  rejectedReason: string | null;
  txHash: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Under review",
  APPROVED: "Distributing reward...",
  REJECTED: "Rejected",
  CLAIMING: "Distributing reward...",
  CLAIMED: "Rewarded",
  REWARDED: "Rewarded",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-yellow-400",
  APPROVED: "text-signal-glow",
  REJECTED: "text-down",
  CLAIMING: "text-signal-glow",
  CLAIMED: "text-up",
  REWARDED: "text-up",
};

/**
 * Signed-in users only (mirrors EligibleRewardCard). Model B: ELS is
 * distributed automatically the moment an admin approves — there is no
 * user-facing claim action anymore. APPROVED here just means "reward
 * approved, on-chain distribution in progress" (it resolves to REWARDED
 * within the same admin approve request in the normal case).
 */
export function MySuggestionsList() {
  const [items, setItems] = useState<MySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suggestions/my-submissions");
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(json.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat saran.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!signedIn) {
    return <p className="text-xs text-ink-faint">Sign in and link a verified wallet to track your suggestion rewards.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-ink-faint">
        <Loader2 size={14} className="animate-spin" /> Memuat...
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-xs text-ink-faint">Belum ada saran yang kamu kirim.</p>;
  }

  return (
    <div className="space-y-2.5">
      {error && <p className="text-xs text-down">{error}</p>}
      {items.map((s) => (
        <div key={s.id} className="rounded-md border border-line bg-bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{s.title}</p>
              <p className="mono-num text-[11px] text-ink-faint">
                {s.publicId} · {s.category}
              </p>
            </div>
            <span className={`shrink-0 text-[11px] font-medium ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
          </div>

          {s.rewardAmount && (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Reward: <span className="text-ink">{s.rewardAmount} ELS</span>
              {s.aiEnergyAmount > 0 && (
                <>
                  {" "}
                  + <span className="text-ink">{s.aiEnergyAmount} AI Energy</span>
                  {s.aiEnergyGranted && <span className="text-up"> (granted)</span>}
                </>
              )}
            </p>
          )}

          {s.status === "REJECTED" && s.rejectedReason && <p className="mt-1.5 text-[11px] text-down">{s.rejectedReason}</p>}

          {(s.status === "CLAIMED" || s.status === "REWARDED") && s.txHash && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-up">
              <CheckCircle2 size={11} /> Rewarded <span className="font-mono">{s.txHash.slice(0, 10)}...</span>
              <ExternalLink size={10} />
            </p>
          )}

          {(s.status === "APPROVED" || s.status === "CLAIMING") && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <Loader2 size={11} className="animate-spin" /> Reward distribution in progress...
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
