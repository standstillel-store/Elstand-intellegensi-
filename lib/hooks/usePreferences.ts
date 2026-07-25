"use client";
import { useCallback, useEffect, useState } from "react";
import {
  type AppPreferences,
  DEFAULT_PREFERENCES,
  applyAppearance,
  loadPreferences,
  savePreferences,
} from "@/lib/preferences";

/** Reactive read/write access to the local preference store. Multiple components calling this in the same tab stay in sync via a custom event (no context needed). */
export function usePreferences() {
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onExternalChange(e: Event) {
      const detail = (e as CustomEvent<AppPreferences>).detail;
      if (detail) setPrefs(detail);
    }
    window.addEventListener("elstand:preferences-changed", onExternalChange);
    return () => window.removeEventListener("elstand:preferences-changed", onExternalChange);
  }, []);

  const update = useCallback((patch: Partial<AppPreferences> | ((prev: AppPreferences) => AppPreferences)) => {
    setPrefs((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      savePreferences(next);
      if (patch && (typeof patch !== "function" ? "appearance" in patch : true)) {
        applyAppearance(next.appearance);
      }
      return next;
    });
  }, []);

  return { prefs, update, hydrated };
}
