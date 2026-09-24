"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";

interface MySuggestion {
  id: string;
  publicId: string;
  title: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CLAIMING" | "CLAIMED";
  rewardAmount: string | null;
  aiEnergyAmount: number;
  aiEnergyGranted: boolean;
  rejectedReason: string | null;
  txHash: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Under review",
  APPROVED: "Reward available",
  REJECTED: "Rejected",
  CLAIMING: "Claiming...",
  CLAIMED: "Claimed",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-yellow-400",
  APPROVED: "text-up",
  REJECTED: "text-down",
  CLAIMING: "text-signal-glow",
  CLAIMED: "text-up",
};

/**
 * Signed-in users only (mirrors EligibleRewardCard — claiming requires a
 * verified wallet on the account, so an anonymous submitter can't reach
 * this view; they were told their public ID at submission time instead).
 */
export function MySuggestionsList() {
  const [items, setItems] = useState<MySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
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

  async function claim(id: string) {
    setError(null);
    setClaimingId(id);
    try {
      const res = await fetch("/api/suggestions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.reason ?? "Gagal claim reward.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal claim reward.");
    } finally {
      setClaimingId(null);
    }
  }

  if (!signedIn) {
    return <p className="text-xs text-ink-faint">Sign in and link a verified wallet to track and claim your suggestion rewards.</p>;
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

          {s.status === "CLAIMED" && s.txHash && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-up">
              <CheckCircle2 size={11} /> Claimed <span className="font-mono">{s.txHash.slice(0, 10)}...</span>
              <ExternalLink size={10} />
            </p>
          )}

          {s.status === "APPROVED" && (
            <button
              onClick={() => claim(s.id)}
              disabled={claimingId === s.id}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-[11px] font-semibold text-up hover:bg-up/20 disabled:opacity-50"
            >
              {claimingId === s.id ? <Loader2 size={11} className="animate-spin" /> : null}
              Claim Reward
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
