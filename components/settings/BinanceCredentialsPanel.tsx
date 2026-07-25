"use client";
import { useEffect, useState } from "react";
import { Check, X, KeyRound, Trash2 } from "lucide-react";

interface CredentialsStatus {
  source: "database" | "env" | "none";
  configured: boolean;
  maskedApiKey: string | null;
  mode: "testnet" | "live";
  market: "spot" | "futures";
  encryptionAvailable: boolean;
}

/**
 * Optional, additional way to configure Binance API keys beyond
 * BINANCE_API_KEY / BINANCE_SECRET_KEY in .env.local — useful for rotating
 * keys without a redeploy. Requires ENCRYPTION_KEY to be set (AES-256-GCM);
 * without it, this panel stays read-only and points back to env vars. See
 * lib/binance/credentials.ts.
 */
export function BinanceCredentialsPanel() {
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/binance/credentials");
    const body = await res.json().catch(() => null);
    if (res.ok && body) setStatus(body);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/binance/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secretKey }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Gagal menyimpan API key.");
        return;
      }
      setStatus(body);
      setApiKey("");
      setSecretKey("");
      setMessage("API key tersimpan terenkripsi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/binance/credentials", { method: "DELETE" });
      const body = await res.json();
      if (res.ok) {
        setStatus(body);
        setMessage("API key tersimpan dihapus — fallback ke environment variable.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glow-card p-4">
      <h2 className="text-sm font-semibold">Binance Trading API</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Cara direkomendasikan: set <code className="rounded bg-bg-raised px-1 py-0.5">BINANCE_API_KEY</code> /{" "}
        <code className="rounded bg-bg-raised px-1 py-0.5">BINANCE_SECRET_KEY</code> di .env.local. Form di bawah ini opsional — untuk mengganti key tanpa
        redeploy, tersimpan terenkripsi (AES-256-GCM) di database.
      </p>

      {status && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-xs">
          <span className="text-ink-muted">Sumber aktif:</span>
          <span className="font-medium text-ink">{status.source === "database" ? "Database (terenkripsi)" : status.source === "env" ? "Environment Variable" : "Belum dikonfigurasi"}</span>
          {status.maskedApiKey && <span className="mono-num text-ink-faint">({status.maskedApiKey})</span>}
          <span className={`ml-auto rounded px-1.5 py-0.5 ${status.mode === "live" ? "bg-down/15 text-down" : "bg-signal/15 text-signal-glow"}`}>
            {status.mode === "live" ? "LIVE" : "TESTNET"}
          </span>
        </div>
      )}

      {status && !status.encryptionAvailable && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber">
          <X size={12} /> <code className="rounded bg-bg-raised px-1 py-0.5">ENCRYPTION_KEY</code> belum diset — penyimpanan key via form ini nonaktif.
          Gunakan .env.local untuk sekarang.
        </p>
      )}

      {status?.encryptionAvailable && (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            placeholder="Binance API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-signal/50"
            autoComplete="off"
          />
          <input
            type="password"
            placeholder="Binance Secret Key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-signal/50"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !apiKey || !secretKey}
              className="flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-xs font-medium text-white hover:bg-signal-glow disabled:opacity-50"
            >
              <KeyRound size={13} /> {saving ? "Menyimpan…" : "Simpan Terenkripsi"}
            </button>
            {status.source === "database" && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-xs text-ink-muted hover:border-down/40 hover:text-down disabled:opacity-50"
              >
                <Trash2 size={13} /> Hapus
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-down">
          <X size={12} /> {error}
        </p>
      )}
      {message && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-up">
          <Check size={12} /> {message}
        </p>
      )}
    </div>
  );
}
