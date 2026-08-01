"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "./shared";
import { ThemeToggle } from "./ThemeToggle";

// Phase 5 REBOOT — accent is gold (see VoidCore.tsx/Hero.tsx comments).
// Now also uses landing-ink instead of the shared dashboard `ink` token,
// so header text responds to the new light/dark toggle correctly — ink
// itself never changed, this file just points at the new landing-only
// copy of it instead.
const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "#ai-signal", label: "AI Signal" },
  { href: "#ai-energy", label: "AI Energy" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled
          ? "border-b border-landing-line bg-landing-bg/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-landing-gold animate-pulseGlow" />
          <span className="font-display text-[15px] font-medium tracking-tight text-landing-ink">ElStand AI</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-landing-ink-muted transition-colors hover:text-landing-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden text-sm font-medium text-landing-ink-muted transition-colors hover:text-landing-ink sm:block"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-landing-gold px-4 py-2 text-sm font-medium text-landing-bg shadow-glow-landing-gold transition-colors hover:bg-landing-gold-glow"
          >
            Start Free
          </Link>
        </div>
      </Container>
    </header>
  );
}
