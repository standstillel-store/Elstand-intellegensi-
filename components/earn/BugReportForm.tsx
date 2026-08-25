"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Loader2, CheckCircle2, Upload } from "lucide-react";
import { BUG_SEVERITIES, BUG_CATEGORIES } from "@/lib/bugHunter/config";

const SEVERITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export function BugReportForm() {
  const { address: connectedWallet } = useAccount();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidenceName, setEvidenceName] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formEl = e.currentTarget;
      const formData = new FormData(formEl);
      const confirmed = formData.get("confirmed") === "on";
      formData.set("confirmed", confirmed ? "true" : "false");

      const res = await fetch("/api/bug-hunter/report", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim laporan.");
      setDone(json.publicId);
      formEl.reset();
      setEvidenceName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim laporan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-up/30 bg-up/10 p-6 text-center">
        <CheckCircle2 size={28} className="mx-auto mb-2 text-up" />
        <p className="text-sm font-semibold text-ink">Laporan terkirim!</p>
        <p className="mt-1 text-xs text-ink-muted">
          ID laporan kamu: <span className="font-mono text-ink">{done}</span>
        </p>
        <p className="mt-1 text-xs text-ink-faint">Tim kami akan meninjau laporanmu. Kamu akan menerima email jika disetujui.</p>
        <button onClick={() => setDone(null)} className="mt-4 rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted hover:bg-bg-raised/60">
          Lapor bug lain
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Bug title">
        <input name="title" required maxLength={200} className={inputClass} placeholder="Contoh: Login gagal setelah refresh halaman" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select name="category" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pilih kategori
            </option>
            {BUG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select name="severity" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pilih severity
            </option>
            {BUG_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea name="description" required maxLength={5000} rows={4} className={inputClass} placeholder="Jelaskan bug secara detail" />
      </Field>
      <Field label="Steps to reproduce">
        <textarea name="reproductionSteps" required maxLength={5000} rows={4} className={inputClass} placeholder="1. Buka halaman X&#10;2. Klik Y&#10;3. ..." />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Expected behavior">
          <textarea name="expectedBehavior" required maxLength={5000} rows={3} className={inputClass} />
        </Field>
        <Field label="Actual behavior">
          <textarea name="actualBehavior" required maxLength={5000} rows={3} className={inputClass} />
        </Field>
      </div>
      <Field label="Impact">
        <textarea name="impact" required maxLength={5000} rows={3} className={inputClass} placeholder="Seberapa berdampak bug ini terhadap user/sistem?" />
      </Field>

      <Field label="Screenshot / evidence (JPEG/PNG, wajib)">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line bg-bg-surface px-3 py-3 text-xs text-ink-muted hover:border-signal/40">
          <Upload size={14} />
          {evidenceName ?? "Pilih file..."}
          <input
            type="file"
            name="evidence"
            required
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => setEvidenceName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="BSC Testnet wallet address">
          <input name="walletAddress" required defaultValue={connectedWallet ?? ""} className={inputClass} placeholder="0x..." />
        </Field>
        <Field label="Email address">
          <input name="email" type="email" required className={inputClass} placeholder="you@example.com" />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-xs text-ink-muted">
        <input type="checkbox" name="confirmed" required className="mt-0.5" />
        <span>I confirm that this report is accurate and I understand that reward eligibility is determined by the administrator.</span>
      </label>

      {error && <p className="text-xs text-down">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm font-semibold text-signal-glow hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Mengirim...
          </span>
        ) : (
          "Submit Bug Report"
        )}
      </button>
    </form>
  );
}

const inputClass = "w-full rounded-md border border-line bg-bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal/40 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
