"use client";
// ---------------------------------------------------------------------------
// Local, browser-only preference store for the Phase 2 Settings redesign.
//
// Scope on purpose: everything here is a *visual/local* preference, not a
// server-backed setting. Paper Trader risk %, auto-execute, and the wallet
// itself stay exactly where they were (Supabase-backed, via
// /api/paper-trader/wallet) — this file never touches that.
//
// Nothing here calls an API. It's read/written to localStorage only, so it's
// per-browser, not per-account — flagged in the Settings copy so it never
// reads as more persistent than it is.
// ---------------------------------------------------------------------------

export type AccentPreset = "violet" | "blue" | "green" | "amber" | "rose";
export type ThemeMode = "terminal" | "bloomberg" | "minimal" | "light";
export type AiSpeed = "eco" | "balanced" | "turbo";
export type AiPersonality = "conservative" | "balanced" | "aggressive";

export interface AppPreferences {
  general: {
    language: "id" | "en";
    timezone: string;
    currency: "USD" | "IDR" | "EUR";
  };
  appearance: {
    theme: ThemeMode;
    accent: AccentPreset;
    compactMode: boolean;
    animations: boolean;
  };
  aiEngine: {
    confidenceThreshold: number; // 0-100, preview-only filter for this phase
    speed: AiSpeed;
    personality: AiPersonality;
  };
}

export const ACCENT_PRESETS: Record<AccentPreset, { label: string; rgb: string; glowRgb: string; dimRgb: string; swatch: string }> = {
  violet: { label: "Violet", rgb: "109 93 246", glowRgb: "167 139 250", dimRgb: "68 58 153", swatch: "#6D5DF6" },
  blue: { label: "Cobalt", rgb: "59 130 246", glowRgb: "96 165 250", dimRgb: "30 74 138", swatch: "#3B82F6" },
  green: { label: "Emerald", rgb: "0 230 118", glowRgb: "52 211 153", dimRgb: "6 95 70", swatch: "#00E676" },
  amber: { label: "Amber", rgb: "245 185 66", glowRgb: "252 211 77", dimRgb: "138 97 24", swatch: "#F5B942" },
  rose: { label: "Rose", rgb: "255 82 82", glowRgb: "252 130 130", dimRgb: "127 29 29", swatch: "#FF5252" },
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  general: {
    language: "id",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Jakarta",
    currency: "USD",
  },
  appearance: {
    theme: "terminal",
    accent: "violet",
    compactMode: false,
    animations: true,
  },
  aiEngine: {
    confidenceThreshold: 60,
    speed: "balanced",
    personality: "balanced",
  },
};

const STORAGE_KEY = "elstand:preferences:v1";

function isBrowser() {
  return typeof window !== "undefined";
}

/** Shallow-merges saved JSON over defaults so adding a new field later never breaks old localStorage payloads. */
export function loadPreferences(): AppPreferences {
  if (!isBrowser()) return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      general: { ...DEFAULT_PREFERENCES.general, ...parsed.general },
      appearance: { ...DEFAULT_PREFERENCES.appearance, ...parsed.appearance },
      aiEngine: { ...DEFAULT_PREFERENCES.aiEngine, ...parsed.aiEngine },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: AppPreferences) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("elstand:preferences-changed", { detail: prefs }));
  } catch {
    /* localStorage unavailable (private mode / quota) — preference just won't persist */
  }
}

/** Applies the appearance slice to <html> as CSS variables + data-attributes. Called by ThemePreferenceProvider on mount and on every change. */
export function applyAppearance(appearance: AppPreferences["appearance"]) {
  if (!isBrowser()) return;
  const root = document.documentElement;
  const preset = ACCENT_PRESETS[appearance.accent];
  root.style.setProperty("--signal-rgb", preset.rgb);
  root.style.setProperty("--signal-glow-rgb", preset.glowRgb);
  root.style.setProperty("--signal-dim-rgb", preset.dimRgb);
  root.setAttribute("data-density", appearance.compactMode ? "compact" : "comfortable");
  root.setAttribute("data-motion", appearance.animations ? "full" : "reduced");
  root.setAttribute("data-theme-mode", appearance.theme);
}
