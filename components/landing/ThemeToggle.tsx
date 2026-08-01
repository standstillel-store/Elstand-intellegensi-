"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Phase 5 REBOOT — landing-only light/dark toggle. Deliberately not built on
// lib/preferences.ts (that's the dashboard's Settings > Appearance system —
// different attribute, different storage key, different concern) and
// deliberately not touching <html> — it reads/writes the data-landing-theme
// attribute on the nearest .landing-root ancestor (set on <main> in
// app/page.tsx) via direct DOM access, the same pattern
// lib/preferences.ts's applyAppearance() already uses for the dashboard's
// accent-color picker, just scoped to one element instead of the document
// root so it can never survive a client-side navigation to a dashboard route.
const STORAGE_KEY = "elstand-landing-theme";

function getRoot() {
  return document.querySelector<HTMLElement>(".landing-root");
}

function applyTheme(theme: "light" | "dark") {
  const root = getRoot();
  if (!root) return;
  if (theme === "light") root.setAttribute("data-landing-theme", "light");
  else root.removeAttribute("data-landing-theme");
}

export function ThemeToggle() {
  // Starts null (unknown) rather than defaulting to "dark" so the button
  // doesn't render a confident icon for a guess — it just shows nothing
  // until the real saved/system preference is read on mount.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let initial: "light" | "dark" = "dark";
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        initial = saved;
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        initial = "light";
      }
    } catch {
      /* localStorage unavailable — fall back to dark, same as the dashboard's own preference store does */
    }
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — toggle still works for this session, just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-landing-line text-landing-ink-muted transition-colors hover:text-landing-ink"
    >
      {theme === null ? null : theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
