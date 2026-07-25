"use client";
import { useEffect, useState } from "react";
import type { PaperWallet } from "@/lib/elvoid/types";
import { GeneralSection } from "./sections/GeneralSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AiEngineSection } from "./sections/AiEngineSection";
import { PaperTradingSection } from "./sections/PaperTradingSection";
import { ApiIntegrationSection } from "./sections/ApiIntegrationSection";
import { SecuritySection } from "./sections/SecuritySection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { DangerZoneSection } from "./sections/DangerZoneSection";

interface Status {
  supabase: boolean;
  alchemy: boolean;
  newsapi: boolean;
  fred: boolean;
}

export function SettingsView({ initialWallet }: { initialWallet: PaperWallet }) {
  const [wallet, setWallet] = useState(initialWallet);
  const [riskInput, setRiskInput] = useState(String(initialWallet.risk_per_trade));
  const [autoExecute, setAutoExecute] = useState(initialWallet.auto_execute);
  const [autoExecuteMinGrade, setAutoExecuteMinGrade] = useState<PaperWallet["auto_execute_min_grade"]>(
    initialWallet.auto_execute_min_grade
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function handleSaveRisk() {
    const value = parseFloat(riskInput);
    if (Number.isNaN(value)) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/paper-trader/wallet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskPercent: value, autoExecute, autoExecuteMinGrade }),
      }).then((r) => r.json());
      if (res.wallet) {
        setWallet(res.wallet);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAiEngine() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/paper-trader/wallet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskPercent: wallet.risk_per_trade, autoExecute, autoExecuteMinGrade }),
      }).then((r) => r.json());
      if (res.wallet) {
        setWallet(res.wallet);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    try {
      await fetch("/api/paper-trader/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingBalance: 10000 }),
      });
      setWallet({
        balance: 10000,
        equity: 10000,
        total_profit: 0,
        risk_per_trade: wallet.risk_per_trade,
        auto_execute: wallet.auto_execute,
        auto_execute_min_grade: wallet.auto_execute_min_grade,
        updated_at: new Date().toISOString(),
      });
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow text-[10px] uppercase tracking-[0.18em] text-signal-glow">Control Center</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Semua konfigurasi ElStand AI dalam satu tempat.</p>
      </div>

      <GeneralSection />
      <AppearanceSection />
      <AiEngineSection
        autoExecute={autoExecute}
        autoExecuteMinGrade={autoExecuteMinGrade}
        onToggleAutoExecute={() => {
          setAutoExecute((v) => !v);
          setSaved(false);
        }}
        onChangeGrade={(g) => {
          setAutoExecuteMinGrade(g);
          setSaved(false);
        }}
        onSave={handleSaveAiEngine}
        saving={saving}
        saved={saved}
      />
      <PaperTradingSection
        wallet={wallet}
        riskInput={riskInput}
        onRiskInputChange={(v) => {
          setRiskInput(v);
          setSaved(false);
        }}
        onSave={handleSaveRisk}
        saving={saving}
        saved={saved}
      />
      <ApiIntegrationSection status={status} />
      <SecuritySection />
      <AdvancedSection wallet={wallet} />
      <DangerZoneSection onReset={handleReset} resetting={resetting} confirmReset={confirmReset} />
    </div>
  );
}
