"use client";
import { Cpu, Gauge, Save, Check } from "lucide-react";
import { usePreferences } from "@/lib/hooks/usePreferences";
import type { AiSpeed, AiPersonality } from "@/lib/preferences";
import type { TradeGrade } from "@/lib/elvoid/types";
import { SettingsCard, SettingsRow, ToggleSwitch, SegmentedControl } from "../SettingsCard";

export function AiEngineSection({
  autoExecute,
  autoExecuteMinGrade,
  onToggleAutoExecute,
  onChangeGrade,
  onSave,
  saving,
  saved,
}: {
  autoExecute: boolean;
  autoExecuteMinGrade: TradeGrade;
  onToggleAutoExecute: () => void;
  onChangeGrade: (g: TradeGrade) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const { prefs, update } = usePreferences();
  const { aiEngine } = prefs;

  return (
    <SettingsCard
      id="ai-engine"
      icon={Cpu}
      title="AI Engine"
      description="Perilaku ElVoid AI saat scan & auto-execute sinyal."
    >
      <SettingsRow
        label="Auto-Execute"
        hint="Otomatis buka Market Order untuk sinyal baru dari Scan Market yang memenuhi Trade Grade minimum."
      >
        <ToggleSwitch checked={autoExecute} onChange={onToggleAutoExecute} />
      </SettingsRow>

      {autoExecute && (
        <SettingsRow label="Minimum Trade Grade">
          <SegmentedControl
            value={autoExecuteMinGrade}
            options={(["A++", "A+", "A", "B+", "B", "C+", "C"] as TradeGrade[]).map((g) => ({ value: g, label: g }))}
            onChange={onChangeGrade}
          />
        </SettingsRow>
      )}

      <SettingsRow label="Save Auto-Execute settings">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-xs font-medium text-white hover:bg-signal-glow disabled:opacity-50"
        >
          {saved ? <Check size={13} /> : <Save size={13} />}
          {saving ? "Menyimpan…" : saved ? "Tersimpan" : "Simpan"}
        </button>
      </SettingsRow>

      <div className="terminal-divider py-1 text-[10px] uppercase tracking-wider">Signal Tuning Preview</div>

      <SettingsRow
        label="AI Confidence"
        hint={`Preview filter — sembunyikan sinyal di bawah ${aiEngine.confidenceThreshold}% confidence dari tampilan Watchlist.`}
      >
        <div className="flex w-full items-center gap-3 sm:w-56">
          <Gauge size={13} className="shrink-0 text-ink-faint" />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={aiEngine.confidenceThreshold}
            onChange={(e) => update((p) => ({ ...p, aiEngine: { ...p.aiEngine, confidenceThreshold: Number(e.target.value) } }))}
            className="h-1.5 w-full accent-signal"
          />
          <span className="mono-num w-10 shrink-0 text-right text-xs text-signal-glow">{aiEngine.confidenceThreshold}%</span>
        </div>
      </SettingsRow>

      <SettingsRow label="AI Speed" hint="Seberapa sering ElVoid AI menyisir ulang watchlist.">
        <SegmentedControl
          value={aiEngine.speed}
          options={[
            { value: "eco", label: "Eco" },
            { value: "balanced", label: "Balanced" },
            { value: "turbo", label: "Turbo" },
          ]}
          onChange={(speed: AiSpeed) => update((p) => ({ ...p, aiEngine: { ...p.aiEngine, speed } }))}
        />
      </SettingsRow>

      <SettingsRow label="AI Personality" hint="Menyesuaikan nada narasi 'Alasan Analisa' di setiap signal card.">
        <SegmentedControl
          value={aiEngine.personality}
          options={[
            { value: "conservative", label: "Conservative" },
            { value: "balanced", label: "Balanced" },
            { value: "aggressive", label: "Aggressive" },
          ]}
          onChange={(personality: AiPersonality) => update((p) => ({ ...p, aiEngine: { ...p.aiEngine, personality } }))}
        />
      </SettingsRow>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Signal Tuning Preview tersimpan di browser ini untuk sekarang — belum menyaring hasil scan yang sebenarnya.
      </p>
    </SettingsCard>
  );
}
