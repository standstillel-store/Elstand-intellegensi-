import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { Container, LandingEyebrow } from "./shared";
import { HeroSignature } from "./HeroSignature";
import { TickerStrip, TickerStripFallback } from "./TickerStrip";

// Phase 5.2 rewrite. HeroMockup is intentionally no longer imported here —
// its heatmap/sparkline/signal-card content is being repurposed into the
// "ELVOID AI Terminal Preview" section (Phase 5.3), not deleted. The file
// still exists at ./HeroMockup.tsx, just unused until then.

export function Hero() {
  return (
    <section className="landing-aurora relative overflow-hidden bg-landing-bg pt-16 sm:pt-24">
      <Container className="flex flex-col items-center pb-10 text-center">
        <LandingEyebrow>AI-Powered Crypto Intelligence</LandingEyebrow>

        <h1 className="mt-5 max-w-3xl font-display text-4xl font-medium leading-[1.08] tracking-tight text-ink sm:text-6xl">
          The Bloomberg Terminal for{" "}
          <span className="bg-gradient-to-r from-landing-violet via-landing-blue to-landing-cyan bg-clip-text text-transparent">
            Crypto Intelligence
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
          One AI terminal that reads price action, whales, funding, news, and macro together —
          then shows you exactly why, not just a BUY/SELL badge.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-landing-violet px-6 py-3 text-sm font-semibold text-white shadow-glow-landing-violet transition-colors hover:bg-landing-violet-glow"
          >
            Launch Terminal <ArrowRight size={16} />
          </Link>
          {/* Live Market Preview (Section 2) now exists at #intelligence. */}
          <a
            href="#intelligence"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-landing-line px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-landing-violet/40"
          >
            View Intelligence
          </a>
        </div>

        <p className="mt-4 text-xs text-ink-faint">Free to start · No credit card required</p>

        <div className="mt-14 w-full sm:mt-20">
          <HeroSignature />
        </div>
      </Container>

      <Suspense fallback={<TickerStripFallback />}>
        <TickerStrip />
      </Suspense>
    </section>
  );
}
