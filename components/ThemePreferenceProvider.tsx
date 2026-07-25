"use client";
import { useEffect } from "react";
import { applyAppearance, loadPreferences } from "@/lib/preferences";

/**
 * Mounted once in the root layout. Applies the saved Appearance preference
 * (accent color / compact mode / animations) to <html> as soon as any page
 * loads — not just while Settings is open. Renders nothing.
 */
export function ThemePreferenceProvider() {
  useEffect(() => {
    applyAppearance(loadPreferences().appearance);
  }, []);

  return null;
}
