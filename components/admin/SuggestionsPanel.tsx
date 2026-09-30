"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { SUGGESTION_BASE_ELS_REWARD, SUGGESTION_AI_ENERGY_REWARD } from "@/lib/suggestions/config";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

interface SuggestionSummary {
  id: string;
  publicId: string;
  title: string;
  category: string;
  walletAddress: string;
  email: string | null;
  status: string;
  rewardAmount: string | null;
  createdAt: string;
}

interface SuggestionDetail extends SuggestionSummary {
  description: string;
  supporting_info: string | null;
  rejected_reason: string | null;
  tx_hash: string | null;
  base_reward_els: string;
  admin_bonus_els: string;
  ai_energy_amount: number;
  last_error_message: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-yellow-400",
  APPROVED: "text-signal-glow",
  REJECTED: "text-down",
  CLAIMING: "text-signal-glow",
  CLAIMED: "text-up",
  REWARDED: "text-up",
};

export function SuggestionsPanel({ adminEntry }: { adminEntry: string }) {
  const [items, setItems] = useState<SuggestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SuggestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/${adminEntry}/api/suggestions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(json.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat saran.");
    } finally {
      setLoading(false);
    }
  }, [adminEntry]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const res = await fetch(`/${adminEntry}/api/suggestions/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const s = json.suggestion;
      setSelected({
        id: s.id,
        publicId: s.public_id,
        title: s.title,
        category: s.category,
        walletAddress: s.wallet_address,
        email: s.email,
        status: s.status,
        rewardAmount: s.reward_amount,
        createdAt: s.created_at,
        description: s.description,
        supporting_info: s.supporting_info,
        rejected_reason: s.rejected_reason,
        tx_hash: s.tx_hash,
        base_reward_els: s.base_reward_els,
        admin_bonus_els: s.admin_bonus_els,
        ai_energy_amount: s.ai_energy_amount,
        last_error_message: s.last_error_message ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-white/40">
        <Loader2 size={16} className="animate-spin" /> Memuat...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-white/40">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reward</th>
              <th className="px-3 py-2">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} onClick={() => openDetail(s.id)} className="cursor-pointer border-t border-line hover:bg-white/5">
                <td className="px-3 py-2 font-mono">{s.publicId}</td>
                <td className="px-3 py-2">{s.title}</td>
                <td className="px-3 py-2">{s.category}</td>
                <td className={`px-3 py-2 font-medium ${STATUS_COLOR[s.status] ?? "text-white/60"}`}>{s.status}</td>
                <td className="px-3 py-2">{s.rewardAmount ? `${s.rewardAmount} ELS` : "—"}</td>
                <td className="px-3 py-2 text-white/40">{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/30">
                  Belum ada saran.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        {error && <p className="mb-2 text-xs text-down">{error}</p>}
        {selected ? (
          <SuggestionDetailCard
            adminEntry={adminEntry}
            suggestion={selected}
            onChanged={() => {
              setSelected(null);
              load();
            }}
          />
        ) : (
          <p className="rounded-lg border border-line p-4 text-xs text-white/30">Pilih saran untuk melihat detail.</p>
        )}
      </div>
    </div>
  );
}

function SuggestionDetailCard({ adminEntry, suggestion, onChanged }: { adminEntry: string; suggestion: SuggestionDetail; onChanged: () => void }) {
  const [adminBonusEls, setAdminBonusEls] = useState("0");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const bonusPreview = Number(adminBonusEls);
  const totalPreview = Number.isFinite(bonusPreview) && bonusPreview >= 0 ? SUGGESTION_BASE_ELS_REWARD + bonusPreview : null;

  async function approve() {
    setActionError(null);
    const bonus = Number(adminBonusEls);
    if (!Number.isFinite(bonus) || bonus < 0) {
      setActionError("Admin bonus (ELS) harus angka >= 0.");
      return;
    }
    setBusy("approve");
    try {
      const res = await fetch(`/${adminEntry}/api/suggestions/${suggestion.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminBonusEls: bonus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal approve.");
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setActionError(null);
    if (!rejectReason.trim()) {
      setActionError("Isi alasan penolakan.");
      return;
    }
    setBusy("reject");
    try {
      const res = await fetch(`/${adminEntry}/api/suggestions/${suggestion.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal reject.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-4 text-xs">
      <p className="font-mono text-white/40">{suggestion.publicId}</p>
      <p className="text-sm font-semibold text-white">{suggestion.title}</p>
      <p className={`font-medium ${STATUS_COLOR[suggestion.status] ?? "text-white/60"}`}>{suggestion.status}</p>

      <DetailRow label="Category" value={suggestion.category} />
      <DetailRow label="Wallet" value={suggestion.walletAddress} mono />
      {suggestion.email && <DetailRow label="Email" value={suggestion.email} />}
      <DetailRow label="Description" value={suggestion.description} block />
      {suggestion.supporting_info && <DetailRow label="Supporting info" value={suggestion.supporting_info} block />}

      {(suggestion.status === "APPROVED" || suggestion.status === "CLAIMING" || suggestion.status === "CLAIMED" || suggestion.status === "REWARDED") && (
        <>
          <DetailRow label="Base reward" value={`${suggestion.base_reward_els} ELS`} />
          <DetailRow label="Admin bonus" value={`${suggestion.admin_bonus_els} ELS`} />
          <DetailRow label="Total ELS reward" value={`${suggestion.rewardAmount} ELS`} />
          <DetailRow label="AI Energy" value={`${suggestion.ai_energy_amount} (granted on approval)`} />
        </>
      )}
      {suggestion.tx_hash && (
        <div>
          <p className="text-white/40">Tx Hash</p>
          <a
            href={`${WALLET_NETWORK_CONFIG.explorerUrl}/tx/${suggestion.tx_hash}`}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-signal-glow hover:underline"
          >
            {suggestion.tx_hash}
          </a>
        </div>
      )}
      {suggestion.rejected_reason && <DetailRow label="Rejected reason" value={suggestion.rejected_reason} block />}

      {suggestion.status === "APPROVED" && !suggestion.tx_hash && (
        <RetryDistributionBlock adminEntry={adminEntry} suggestionId={suggestion.id} lastError={suggestion.last_error_message} onChanged={onChanged} />
      )}

      {suggestion.status === "PENDING" && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-white/40">
            Base reward: <span className="text-white/80">{SUGGESTION_BASE_ELS_REWARD} ELS</span> (fixed) + AI Energy:{" "}
            <span className="text-white/80">{SUGGESTION_AI_ENERGY_REWARD}</span> (fixed, granted immediately on approval)
          </p>
          <div>
            <label className="mb-1 block text-white/40">Admin bonus (ELS, optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={adminBonusEls}
              onChange={(e) => setAdminBonusEls(e.target.value)}
              className="w-full rounded-md border border-line bg-black/20 px-2 py-1.5 text-white"
            />
            {totalPreview !== null && <p className="mt-1 text-white/40">Total ELS reward: {totalPreview} ELS</p>}
          </div>
          <button
            onClick={approve}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 font-semibold text-up hover:bg-up/20 disabled:opacity-50"
          >
            {busy === "approve" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve
          </button>

          <div>
            <label className="mb-1 block text-white/40">Reject reason</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} className="w-full rounded-md border border-line bg-black/20 px-2 py-1.5 text-white" />
          </div>
          <button
            onClick={reject}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-down/40 bg-down/10 px-3 py-1.5 font-semibold text-down hover:bg-down/20 disabled:opacity-50"
          >
            {busy === "reject" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Reject
          </button>

          {actionError && <p className="text-down">{actionError}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Shown only when a Suggestion is APPROVED but has no tx_hash yet — meaning
 * the automatic distribution attempt (triggered by the approve route
 * itself) either failed or hasn't completed. Calls the idempotent
 * retry-distribution route; safe to click repeatedly / from multiple admin
 * tabs, since distributeSuggestionRewardServerSide never double-pays.
 */
function RetryDistributionBlock({
  adminEntry,
  suggestionId,
  lastError,
  onChanged,
}: {
  adminEntry: string;
  suggestionId: string;
  lastError: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/${adminEntry}/api/suggestions/${suggestionId}/retry-distribution`, { method: "POST" });
      const json = await res.json();
      if (!res.ok && json.status !== "IN_PROGRESS") throw new Error(json.detail ?? json.reason ?? json.status ?? "Gagal distribusi.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal distribusi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-down">Distribusi on-chain belum selesai{lastError ? `: ${lastError}` : "."}</p>
      <button
        onClick={retry}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-signal-glow/40 bg-signal-glow/10 px-3 py-1.5 font-semibold text-signal-glow hover:bg-signal-glow/20 disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : null} Retry Distribution
      </button>
      {error && <p className="text-down">{error}</p>}
    </div>
  );
}

function DetailRow({ label, value, mono, block }: { label: string; value: string; mono?: boolean; block?: boolean }) {
  return (
    <div>
      <p className="text-white/40">{label}</p>
      <p className={`${mono ? "break-all font-mono" : ""} ${block ? "whitespace-pre-wrap" : ""} text-white/80`}>{value}</p>
    </div>
  );
}
