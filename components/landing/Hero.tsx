import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "./shared";
import { HeroMockup } from "./HeroMockup";
import { TickerStrip } from "./TickerStrip";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-14 sm:pt-20">
      <Container className="grid items-center gap-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div>
          <Eyebrow>AI-Powered Crypto Intelligence</Eyebrow>
          <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            AI-Powered Crypto <span className="text-gradient-signal">Market Intelligence</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-muted sm:text-base">
            Analyze crypto markets smarter with AI-driven insights, technical analysis, and market monitoring tools.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-signal px-6 py-3 text-sm font-semibold text-white shadow-glow-signal transition-colors hover:bg-signal-glow"
            >
              Start Free <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-signal/40 hover:text-ink"
            >
              Explore Features
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-faint">Free plan available · No credit card required</p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroMockup />
        </div>
      </Container>

      <TickerStrip />
    </section>
  );
}
