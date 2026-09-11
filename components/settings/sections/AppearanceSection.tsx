"use client";
import { Moon, Sun, Laptop, Palette, Check } from "lucide-react";
import clsx from "clsx";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { ACCENT_PRESETS, type AccentPreset, type ThemeMode } from "@/lib/preferences";
import { SettingsCard, SettingsRow, ToggleSwitch } from "../SettingsCard";

// Phase 9 — Settings/Appearance-only polish. This is now the ONLY section
// rendered by SettingsView: General, AI Engine, Paper Trading, API
// Integration, Security, Advanced, Account, Wallet, and Danger Zone were
// all removed per the brief ("Settings is ONLY for controlling the visual
// appearance/design of the ELSTAND dashboard"). See the Phase 9 Settings
// implementation report for the full before/after.
const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Laptop },
];

export function AppearanceSection() {
  const { prefs, update } = usePreferences();
  const { appearance } = prefs;

  return (
    <SettingsCard
      id="appearance"
      icon={Palette}
      title="Appearance"
      description="Tema dan warna aksen untuk dashboard ELSTAND — berlaku langsung, tersimpan di browser ini."
    >
      <SettingsRow label="Theme" hint="Dark adalah tampilan utama dashboard. System mengikuti pengaturan OS perangkat kamu.">
        <div className="grid grid-cols-3 gap-2 sm:flex">
          {THEME_OPTIONS.map((opt) => {
            const isActive = appearance.theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => update((p) => ({ ...p, appearance: { ...p.appearance, theme: opt.value } }))}
                aria-pressed={isActive}
                className={clsx(
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-signal/50 bg-signal/15 text-signal-glow"
                    : "border-line text-ink-muted hover:text-ink"
                )}
              >
                <opt.icon size={13} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow label="Accent Color" hint="Mengubah warna highlight, glow, dan progress bar terkait AI/intelligence di seluruh dashboard. Brand gold dan warna status (hijau/merah/amber) tidak ikut berubah.">
        <div className="flex items-center gap-2">
          {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => {
            const preset = ACCENT_PRESETS[key];
            const isActive = appearance.accent === key;
            return (
              <button
                key={key}
                onClick={() => update((p) => ({ ...p, appearance: { ...p.appearance, accent: key } }))}
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={isActive}
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform",
                  isActive ? "scale-110 border-ink" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: preset.swatch }}
              >
                {isActive && <Check size={13} className="text-black/70" />}
              </button>
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow label="Compact Mode" hint="Padding & jarak antar card lebih rapat — lebih banyak data per layar.">
        <ToggleSwitch
          checked={appearance.compactMode}
          onChange={() => update((p) => ({ ...p, appearance: { ...p.appearance, compactMode: !p.appearance.compactMode } }))}
        />
      </SettingsRow>

      <SettingsRow label="Animation" hint="Matikan micro-animation (glow, float, pulse) jika device terasa berat.">
        <ToggleSwitch
          checked={appearance.animations}
          onChange={() => update((p) => ({ ...p, appearance: { ...p.appearance, animations: !p.appearance.animations } }))}
        />
      </SettingsRow>
    </SettingsCard>
  );
}
