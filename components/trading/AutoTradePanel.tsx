"use client";
import { useState } from "react";
import { Bot, Play } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { timeAgo } from "@/lib/format";
import { MAX_RISK_PERCENT_CLIENT, MIN_RISK_REWARD_CLIENT } from "@/lib/binance/constantsClient";
import type { AutoTraderSettingsState, DecisionLogRow } from "@/lib/hooks/useBinanceTrading";

const ACTION_TONE: Record<string, string> = {
  entry_opened: "text-up",
  entry_rejected: "text-down",
  exit_auto: "text-amber",
  exit_failed: "text-down",
  breakeven_set: "text-signal-glow",
  skip_no_trade: "text-ink-faint",
  skip_news: "text-ink-faint",
  emergency_close_all: "text-down",
  emergency_stop_engaged: "text-down",
  emergency_stop_cleared: "text-up",
};

export function AutoTradePanel({
  settings,
  decisionLog,
  onUpdateSettings,
  onRunNow,
}: {
  settings: AutoTraderSettingsState | null;
  decisionLog: DecisionLogRow[];
  onUpdateSettings: (patch: Partial<AutoTraderSettingsState>) => Promise<boolean>;
  onRunNow: () => Promise<boolean>;
}) {
  const [symbolsInput, setSymbolsInput] = useState(settings?.symbols.join(", ") ?? "");
  const [running, setRunning] = useState(false);

  if (!settings) {
    return (
      <div className="glow-card p-4">
        <SectionHeader code="AUT" title="AI Auto Trading" />
        <p className="py-4 text-center text-sm text-ink-muted">
          Supabase belum dikonfigurasi — AI Auto Trading butuh tabel <code className="mono-num">bn_auto_trader_settings</code> untuk menyimpan konfigurasi dan
          jurnal keputusan. Trading manual tetap berjalan normal tanpa ini.
        </p>
      </div>
    );
  }

  async function toggle() {
    await onUpdateSettings({ enabled: !settings!.enabled });
  }

  async function saveSymbols() {
    const symbols = symbolsInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length) await onUpdateSettings({ symbols });
  }

  async function runNow() {
    setRunning(true);
    await onRunNow();
    setRunning(false);
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="AUT" title="AI Auto Trading" hint={settings.enabled ? "Aktif — analisa tiap 1 menit" : "Nonaktif"} />

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={toggle}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
            settings.enabled ? "border-up/40 bg-up/10 text-up" : "border-line text-ink-muted"
          }`}
        >
          <Bot size={15} />
          {settings.enabled ? "Auto Trading ON" : "Auto Trading OFF"}
        </button>
        <button onClick={runNow} disabled={running} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs text-ink-muted hover:text-ink disabled:opacity-50">
          <Play size={12} /> {running ? "Menjalankan…" : "Run Now"}
        </button>
        {settings.last_run_at && <span className="text-[11px] text-ink-faint">Tick terakhir: {timeAgo(settings.last_run_at)}</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Timeframe</span>
          <select
            value={settings.timeframe}
            onChange={(e) => onUpdateSettings({ timeframe: e.target.value })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          >
            {["5m", "15m", "1h", "4h"].map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Risk % (max {MAX_RISK_PERCENT_CLIENT}%)</span>
          <input
            type="number"
            step="0.05"
            max={MAX_RISK_PERCENT_CLIENT}
            defaultValue={settings.risk_percent}
            onBlur={(e) => onUpdateSettings({ risk_percent: Number(e.target.value) })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Leverage</span>
          <input
            type="number"
            min={1}
            max={125}
            defaultValue={settings.leverage}
            onBlur={(e) => onUpdateSettings({ leverage: Number(e.target.value) })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Min Confluence</span>
          <input
            type="number"
            min={1}
            defaultValue={settings.min_confluences}
            onBlur={(e) => onUpdateSettings({ min_confluences: Number(e.target.value) })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Min RR (≥{MIN_RISK_REWARD_CLIENT})</span>
          <input
            type="number"
            min={MIN_RISK_REWARD_CLIENT}
            defaultValue={settings.min_risk_reward}
            onBlur={(e) => onUpdateSettings({ min_risk_reward: Number(e.target.value) })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-ink-faint">Max Concurrent Positions</span>
          <input
            type="number"
            min={1}
            defaultValue={settings.max_concurrent_positions}
            onBlur={(e) => onUpdateSettings({ max_concurrent_positions: Number(e.target.value) })}
            className="w-full rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink"
          />
        </label>
      </div>

      <label className="mb-4 block text-xs">
        <span className="mb-1 block text-[10px] uppercase text-ink-faint">Watchlist Symbols (pisahkan koma)</span>
        <div className="flex gap-2">
          <input value={symbolsInput} onChange={(e) => setSymbolsInput(e.target.value)} className="flex-1 rounded-md border border-line bg-bg-raised px-2 py-1.5 text-ink" />
          <button onClick={saveSymbols} className="rounded-md border border-line px-3 py-1.5 text-ink-muted hover:text-ink">
            Save
          </button>
        </div>
      </label>

      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Decision Journal</p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {!decisionLog.length && <p className="py-3 text-center text-xs text-ink-muted">Belum ada keputusan tercatat.</p>}
          {decisionLog.map((d) => (
            <div key={d.id} className="rounded-md border border-line px-2.5 py-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-medium ${ACTION_TONE[d.action] ?? "text-ink"}`}>
                  {d.symbol ? `${d.symbol} — ` : ""}
                  {d.action.replace(/_/g, " ")}
                </span>
                <span className="text-ink-faint">{timeAgo(d.ran_at)}</span>
              </div>
              <p className="mt-0.5 text-ink-muted">{d.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
