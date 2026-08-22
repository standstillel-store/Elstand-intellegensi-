"use client";
import { Palette, Check } from "lucide-react";
import clsx from "clsx";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { ACCENT_PRESETS, type AccentPreset, type ThemeMode } from "@/lib/preferences";
import { SettingsCard, SettingsRow, ToggleSwitch, SegmentedControl } from "../SettingsCard";

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "terminal", label: "Terminal", hint: "Default — gelap pekat, mono-first" },
  { value: "bloomberg", label: "Bloomberg", hint: "Grid lebih rapat, warna lebih tegas" },
  { value: "minimal", label: "Minimal", hint: "Lebih lega, dekorasi diminimalkan" },
  { value: "light", label: "Light", hint: "Preview — belum dioptimalkan penuh" },
];

export function AppearanceSection() {
  const { prefs, update } = usePreferences();
  const { appearance } = prefs;

  return (
    <SettingsCard
      id="appearance"
      icon={Palette}
      title="Appearance"
      description="Tema, warna aksen, kepadatan layout, dan animasi — berlaku langsung ke seluruh dashboard."
    >
      <SettingsRow label="Theme">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update((p) => ({ ...p, appearance: { ...p.appearance, theme: opt.value } }))}
              title={opt.hint}
              className={clsx(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                appearance.theme === opt.value
                  ? "border-signal/50 bg-signal/15 text-signal-glow"
                  : "border-line text-ink-muted hover:text-ink"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Accent Color" hint="Mengubah warna highlight, glow, dan progress bar di seluruh dashboard.">
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
