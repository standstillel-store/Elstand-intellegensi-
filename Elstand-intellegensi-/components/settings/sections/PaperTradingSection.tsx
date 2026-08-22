"use client";
import { Wallet, Save, Check } from "lucide-react";
import type { PaperWallet } from "@/lib/elvoid/types";
import { SettingsCard, SettingsRow } from "../SettingsCard";

export function PaperTradingSection({
  wallet,
  riskInput,
  onRiskInputChange,
  onSave,
  saving,
  saved,
}: {
  wallet: PaperWallet;
  riskInput: string;
  onRiskInputChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <SettingsCard
      id="paper-trading"
      icon={Wallet}
      title="Paper Trading"
      description="Status wallet simulasi ElVoid AI Paper Trader — bukan dana sungguhan."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-line p-3">
          <p className="text-[10px] uppercase text-ink-faint">Balance</p>
          <p className="mono-num text-sm">${wallet.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-[10px] uppercase text-ink-faint">Equity</p>
          <p className="mono-num text-sm">${wallet.equity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-[10px] uppercase text-ink-faint">Total Profit</p>
          <p className={`mono-num text-sm ${wallet.total_profit >= 0 ? "text-up" : "text-down"}`}>
            {wallet.total_profit >= 0 ? "+" : ""}
            {wallet.total_profit.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-[10px] uppercase text-ink-faint">Risk / Trade</p>
          <p className="mono-num text-sm">{wallet.risk_per_trade}%</p>
        </div>
      </div>

      <SettingsRow label="Risk per Trade (%)" hint="Menentukan besar posisi setiap sinyal yang dieksekusi.">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={riskInput}
            onChange={(e) => onRiskInputChange(e.target.value)}
            className="w-24 rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-signal/50"
          />
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-xs font-medium text-white hover:bg-signal-glow disabled:opacity-50"
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saving ? "Menyimpan…" : saved ? "Tersimpan" : "Simpan"}
          </button>
        </div>
      </SettingsRow>
    </SettingsCard>
  );
}
