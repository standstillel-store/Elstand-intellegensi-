"use client";
import { useEffect } from "react";
import { applyAppearance, loadPreferences } from "@/lib/preferences";

/**
 * Mounted once in the root layout. Applies the saved Appearance preference
 * (theme / accent color / compact mode / animations) to <html> as soon as
 * any page loads — not just while Settings is open. Renders nothing.
 *
 * Phase 9 — also listens for OS color-scheme changes. Without this, a user
 * on theme:"system" would only pick up a switch from light to dark (or back)
 * on their next full page load, which isn't what "System" is supposed to
 * mean. The listener re-reads preferences on each change and only re-applies
 * if the user still has "system" selected, so it never overrides an
 * explicit dark/light choice.
 */
export function ThemePreferenceProvider() {
  useEffect(() => {
    applyAppearance(loadPreferences().appearance);

    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onSchemeChange = () => {
      const current = loadPreferences().appearance;
      if (current.theme === "system") applyAppearance(current);
    };
    media.addEventListener("change", onSchemeChange);
    return () => media.removeEventListener("change", onSchemeChange);
  }, []);

  return null;
}
