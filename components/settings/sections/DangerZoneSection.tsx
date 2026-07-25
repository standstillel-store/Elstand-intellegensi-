"use client";
import { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { SettingsCard, SettingsRow } from "../SettingsCard";

export function DangerZoneSection({
  onReset,
  resetting,
  confirmReset,
}: {
  onReset: () => void;
  resetting: boolean;
  confirmReset: boolean;
}) {
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function handleClearCache() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  }

  return (
    <SettingsCard id="danger-zone" icon={AlertTriangle} title="Danger Zone" tone="down" description="Tindakan ini tidak bisa dibatalkan.">
      <SettingsRow label="Reset Paper Trading" hint="Menghapus seluruh sinyal, journal, dan statistik, lalu mengembalikan wallet ke $10,000.">
        <button
          onClick={onReset}
          disabled={resetting}
          className={`flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium disabled:opacity-50 ${
            confirmReset ? "border-down bg-down/15 text-down" : "border-line text-ink-muted hover:border-down/40 hover:text-down"
          }`}
        >
          {resetting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {resetting ? "Mereset…" : confirmReset ? "Klik lagi untuk konfirmasi" : "Reset Paper Trading"}
        </button>
      </SettingsRow>

      <SettingsRow label="Clear Cache" hint="Menghapus cache browser lokal untuk dashboard ini lalu memuat ulang halaman.">
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className={`flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium disabled:opacity-50 ${
            confirmClear ? "border-down bg-down/15 text-down" : "border-line text-ink-muted hover:border-down/40 hover:text-down"
          }`}
        >
          {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {clearing ? "Membersihkan…" : confirmClear ? "Klik lagi untuk konfirmasi" : "Clear Cache"}
        </button>
      </SettingsRow>
    </SettingsCard>
  );
}
