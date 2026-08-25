"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

interface ReportSummary {
  id: string;
  publicId: string;
  title: string;
  category: string;
  severity: string;
  walletAddress: string;
  email: string;
  status: string;
  rewardAmount: string | null;
  createdAt: string;
}

interface ReportDetail extends ReportSummary {
  description: string;
  reproduction_steps: string;
  expected_behavior: string;
  actual_behavior: string;
  impact: string;
  rejected_reason: string | null;
  tx_hash: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-yellow-400",
  APPROVED: "text-up",
  REJECTED: "text-down",
  CLAIMING: "text-signal-glow",
  REWARDED: "text-up",
};

export function BugHunterPanel({ adminEntry }: { adminEntry: string }) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/${adminEntry}/api/bug-hunter`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReports(json.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat laporan.");
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
      const res = await fetch(`/${adminEntry}/api/bug-hunter/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const r = json.report;
      setSelected({
        id: r.id,
        publicId: r.public_id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        walletAddress: r.wallet_address,
        email: r.email,
        status: r.status,
        rewardAmount: r.reward_amount,
        createdAt: r.created_at,
        description: r.description,
        reproduction_steps: r.reproduction_steps,
        expected_behavior: r.expected_behavior,
        actual_behavior: r.actual_behavior,
        impact: r.impact,
        rejected_reason: r.rejected_reason,
        tx_hash: r.tx_hash,
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
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer border-t border-line hover:bg-white/5">
                <td className="px-3 py-2 font-mono">{r.publicId}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2 capitalize">{r.severity}</td>
                <td className={`px-3 py-2 font-medium ${STATUS_COLOR[r.status] ?? "text-white/60"}`}>{r.status}</td>
                <td className="px-3 py-2 text-white/40">{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-white/30">
                  Belum ada laporan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        {error && <p className="mb-2 text-xs text-down">{error}</p>}
        {selected ? (
          <ReportDetailCard
            adminEntry={adminEntry}
            report={selected}
            onChanged={() => {
              setSelected(null);
              load();
            }}
          />
        ) : (
          <p className="rounded-lg border border-line p-4 text-xs text-white/30">Pilih laporan untuk melihat detail.</p>
        )}
      </div>
    </div>
  );
}

function ReportDetailCard({ adminEntry, report, onChanged }: { adminEntry: string; report: ReportDetail; onChanged: () => void }) {
  const [rewardAmount, setRewardAmount] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);

  useEffect(() => {
    setEvidenceUrl(null);
    fetch(`/${adminEntry}/api/bug-hunter/${report.id}/evidence-url`)
      .then((r) => r.json())
      .then((j) => setEvidenceUrl(j.url ?? null))
      .catch(() => {});
  }, [adminEntry, report.id]);

  async function approve() {
    setActionError(null);
    const amount = Number(rewardAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Masukkan reward amount yang valid.");
      return;
    }
    setBusy("approve");
    try {
      const res = await fetch(`/${adminEntry}/api/bug-hunter/${report.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardAmount: amount }),
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
      const res = await fetch(`/${adminEntry}/api/bug-hunter/${report.id}/reject`, {
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
      <p className="font-mono text-white/40">{report.publicId}</p>
      <p className="text-sm font-semibold text-white">{report.title}</p>
      <p className={`font-medium ${STATUS_COLOR[report.status] ?? "text-white/60"}`}>{report.status}</p>

      <DetailRow label="Category" value={report.category} />
      <DetailRow label="Severity" value={report.severity} />
      <DetailRow label="Wallet" value={report.walletAddress} mono />
      <DetailRow label="Email" value={report.email} />
      <DetailRow label="Description" value={report.description} block />
      <DetailRow label="Steps to reproduce" value={report.reproduction_steps} block />
      <DetailRow label="Expected" value={report.expected_behavior} block />
      <DetailRow label="Actual" value={report.actual_behavior} block />
      <DetailRow label="Impact" value={report.impact} block />

      {evidenceUrl && (
        <a href={evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-signal-glow hover:underline">
          View evidence <ExternalLink size={11} />
        </a>
      )}

      {report.tx_hash && <DetailRow label="Tx Hash" value={report.tx_hash} mono />}
      {report.rejected_reason && <DetailRow label="Rejected reason" value={report.rejected_reason} block />}

      {report.status === "PENDING" && (
        <div className="space-y-3 border-t border-line pt-3">
          <div>
            <label className="mb-1 block text-white/40">Reward amount (ELS)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
              className="w-full rounded-md border border-line bg-black/20 px-2 py-1.5 text-white"
            />
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

function DetailRow({ label, value, mono, block }: { label: string; value: string; mono?: boolean; block?: boolean }) {
  return (
    <div>
      <p className="text-white/40">{label}</p>
      <p className={`${mono ? "break-all font-mono" : ""} ${block ? "whitespace-pre-wrap" : ""} text-white/80`}>{value}</p>
    </div>
  );
}
