"use client";
import { useState } from "react";
import { Wrench, Download, RotateCcw, Check } from "lucide-react";
import type { PaperWallet } from "@/lib/elvoid/types";
import { DEFAULT_PREFERENCES, savePreferences, applyAppearance } from "@/lib/preferences";
import { SettingsCard, SettingsRow } from "../SettingsCard";

export function AdvancedSection({ wallet }: { wallet: PaperWallet }) {
  const [resetDone, setResetDone] = useState(false);

  function handleResetPreferences() {
    savePreferences(DEFAULT_PREFERENCES);
    applyAppearance(DEFAULT_PREFERENCES.appearance);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2000);
  }

  function handleExportSnapshot() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), wallet }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elstand-wallet-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SettingsCard id="advanced" icon={Wrench} title="Advanced" description="Interval refresh dan kontrol tingkat lanjut.">
      <SettingsRow label="Data Refresh Intervals" hint="Ticker header setiap 30 detik · Alerts setiap 60 detik · Dashboard snapshot setiap 30 detik.">
        <span className="mono-num text-xs text-ink-faint">30s / 60s / 30s</span>
      </SettingsRow>

      <SettingsRow label="Export Wallet Snapshot" hint="Unduh state Paper Trader saat ini sebagai file JSON.">
        <button
          onClick={handleExportSnapshot}
          className="flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink"
        >
          <Download size={13} /> Export
        </button>
      </SettingsRow>

      <SettingsRow label="Reset Local Preferences" hint="Mengembalikan Appearance, General, dan AI Engine preview ke default — tidak menyentuh wallet.">
        <button
          onClick={handleResetPreferences}
          className="flex items-center gap-1.5 rounded-md border border-line px-3.5 py-2 text-xs text-ink-muted hover:border-signal/40 hover:text-ink"
        >
          {resetDone ? <Check size={13} /> : <RotateCcw size={13} />}
          {resetDone ? "Direset" : "Reset ke Default"}
        </button>
      </SettingsRow>
    </SettingsCard>
  );
}
