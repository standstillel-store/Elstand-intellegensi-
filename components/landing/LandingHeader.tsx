"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthAwareCta } from "./AuthAwareCta";

// The desktop brand mark lives in SystemRail.tsx (fixed top-left, part of
// the vertical rail that's hidden under 901px) — this header only shows its
// own brand mark below that breakpoint (see .elv-header-brand in
// globals.css) so the two never render at once. The auth-aware CTA is
// always shown here, at every breakpoint, since the rail itself has no CTA.
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`elv-header ${scrolled ? "elv-header-scrolled" : ""}`}>
      <Link href="/" className="elv-header-brand mono">
        <span className="elv-header-brand-mark" />
        ELSTAND
      </Link>
      <AuthAwareCta guestLabel="Sign In" authLabel="Dashboard" variant="secondary" icon={false} className="elv-header-cta" />
    </header>
  );
}
