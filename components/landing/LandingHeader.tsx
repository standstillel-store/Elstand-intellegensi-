"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "./shared";

// Phase 5 REBOOT — same structure as the previous reskin (scroll-aware
// blur, fixed nav links), only the accent swapped from violet to gold to
// match the new primary direction (see VoidCore.tsx / Hero.tsx comments).
// "Start Free" now sits on a gold button, so its label needs a dark text
// color for contrast — reuses the landing-bg token rather than a new
// one-off hex value.
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
          <span className="font-display text-[15px] font-medium tracking-tight text-ink">ElStand AI</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-ink-muted transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:block"
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
