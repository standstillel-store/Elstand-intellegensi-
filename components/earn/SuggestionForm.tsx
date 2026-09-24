"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Loader2, CheckCircle2 } from "lucide-react";
import { SUGGESTION_CATEGORIES } from "@/lib/suggestions/config";

const inputClass = "w-full rounded-md border border-line bg-bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal/40 focus:outline-none";

export function SuggestionForm() {
  const { address: connectedWallet } = useAccount();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formEl = e.currentTarget;
      const formData = new FormData(formEl);
      const payload = {
        title: String(formData.get("title") ?? ""),
        category: String(formData.get("category") ?? ""),
        description: String(formData.get("description") ?? ""),
        supportingInfo: String(formData.get("supportingInfo") ?? "") || undefined,
        walletAddress: String(formData.get("walletAddress") ?? ""),
        email: String(formData.get("email") ?? "") || undefined,
      };

      const res = await fetch("/api/suggestions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim saran.");
      setDone(json.publicId);
      formEl.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim saran.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-up/30 bg-up/10 p-6 text-center">
        <CheckCircle2 size={28} className="mx-auto mb-2 text-up" />
        <p className="text-sm font-semibold text-ink">Saran terkirim!</p>
        <p className="mt-1 text-xs text-ink-muted">
          ID saran kamu: <span className="font-mono text-ink">{done}</span>
        </p>
        <p className="mt-1 text-xs text-ink-faint">Tim kami akan meninjau saranmu. Reward ditentukan oleh admin setelah review.</p>
        <button onClick={() => setDone(null)} className="mt-4 rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted hover:bg-bg-raised/60">
          Kirim saran lain
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title">
        <input name="title" required maxLength={200} className={inputClass} placeholder="Contoh: Tambahkan dark mode toggle di Settings" />
      </Field>

      <Field label="Category">
        <select name="category" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Pilih kategori
          </option>
          {SUGGESTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description">
        <textarea name="description" required maxLength={5000} rows={5} className={inputClass} placeholder="Jelaskan idemu secara detail — masalah apa yang diselesaikan, bagaimana implementasinya." />
      </Field>

      <Field label="Optional supporting information">
        <textarea name="supportingInfo" maxLength={5000} rows={3} className={inputClass} placeholder="Link referensi, mockup, atau konteks tambahan (opsional)" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="BSC Testnet wallet address">
          <input name="walletAddress" required defaultValue={connectedWallet ?? ""} className={inputClass} placeholder="0x..." />
        </Field>
        <Field label="Email address (optional)">
          <input name="email" type="email" className={inputClass} placeholder="you@example.com" />
        </Field>
      </div>

      <p className="text-xs text-ink-faint">
        Submitting a suggestion does not automatically earn ELS. Rewards are granted only if an admin approves your suggestion.
      </p>

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
          "Submit Suggestion"
        )}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
