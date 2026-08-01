import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { Container, LandingEyebrow } from "./shared";
import { VoidCore } from "./VoidCore";
import { TickerStrip, TickerStripFallback } from "./TickerStrip";

// Phase 5 REBOOT — full rewrite, not a reskin. Previous version (center-
// stack: eyebrow, h1, subhead, CTAs, then the signature element in its own
// row below) is gone — see VoidCore.tsx for why the signature element
// itself changed. Layout change here: the void now sits large and
// overlaps the bottom of the text block instead of politely stacking
// below it in its own clean row — more depth, less "generic SaaS hero."
//
// Copy leads with the one true mechanic (many signals in, one verdict
// out) instead of a generic "AI-powered" opener. "The Bloomberg Terminal
// for crypto intelligence" — the positioning line from the original
// brief — still appears, just demoted from H1 to subhead so the H1 can be
// shorter and bigger.

export function Hero() {
  return (
    <section className="landing-aurora theme-invariant relative overflow-hidden bg-landing-bg pt-16 sm:pt-24">
      {/* Corner registration marks — small, quiet, "instrument panel" detail. */}
      <div className="pointer-events-none absolute inset-6 hidden sm:block" aria-hidden="true">
        <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-landing-line" />
        <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-landing-line" />
        <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-landing-line" />
        <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-landing-line" />
      </div>

      <Container className="relative flex flex-col items-center pb-10 text-center">
        <LandingEyebrow>ElVoid Core — Online</LandingEyebrow>

        <h1 className="mt-6 max-w-3xl font-display text-5xl font-light leading-[1.05] tracking-tight text-ink sm:text-7xl">
          Every signal.
          <br />
          <span className="font-medium bg-gradient-to-r from-landing-gold via-landing-gold-glow to-landing-gold bg-clip-text text-transparent">
            One verdict.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
          ElVoid reads price, whales, funding, news, and macro together — then shows you exactly why.
          This is the Bloomberg Terminal for crypto intelligence.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-landing-gold px-6 py-3 text-sm font-semibold text-landing-bg shadow-glow-landing-gold transition-colors hover:bg-landing-gold-glow"
          >
            Launch Terminal <ArrowRight size={16} />
          </Link>
          {/* Live Market Preview (Section 2) lives at #intelligence. */}
          <a
            href="#intelligence"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-landing-line px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-landing-gold/40"
          >
            See It Think
          </a>
        </div>

        <p className="mt-4 text-xs text-ink-faint">Free to start · No credit card required</p>

        <div className="relative mt-8 w-full sm:mt-4 sm:-mb-8 lg:-mb-16">
          <VoidCore />
        </div>
      </Container>

      <Suspense fallback={<TickerStripFallback />}>
        <TickerStrip />
      </Suspense>
    </section>
  );
}
