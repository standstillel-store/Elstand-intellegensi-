"use client";
import { useEffect, useState } from "react";

/**
 * Tracks the OS-level `prefers-reduced-motion` media query reactively (not
 * just read once on mount) — matches the Settings > Appearance > Animations
 * toggle's own [data-motion="reduced"] handling in globals.css, which is a
 * stronger explicit opt-out layered on top of this OS-level one.
 *
 * Previously reimplemented ad hoc in app/auth/success/page.tsx (read-once,
 * no change listener) and components/intelligence/GlobalIntelligenceMap.tsx
 * (this same reactive version, but module-local). This is the one shared
 * copy going forward.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
