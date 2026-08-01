import type { LucideIcon } from "lucide-react";
import { BrainCircuit, LineChart, ScanSearch, Newspaper, ShieldCheck, Wallet } from "lucide-react";
import { Container, LandingEyebrow } from "./shared";
import { Reveal } from "./Reveal";

// Phase 5 REBOOT — reskin, not a rewrite. The six features here were
// already accurate (matches lib/ai, lib/scanner, lib/binance/riskManager,
// the paper-trader dashboard route) — what was stale was the visual system:
// this file was still on 100% dashboard tokens (border-line, glow-card,
// text-signal-glow, bg-bg-raised) while Hero/TerminalPreview had already
// moved to landing.gold.
//
// One structural change: "AI Market Analysis" is pulled out as a featured
// banner above the grid instead of sitting as a 7th equal tile. This does
// double duty as the brief's separate "AI Core" section (Section 3) —
// building a second, different "look, AI!" moment right under Hero's Void
// Core and Terminal Preview's AI callout would be repetition dressed up as
// three sections, not three sections. The copy calls back to Void Core by
// name so it reads as one throughline instead of a coincidence.

const INDICATORS = ["RSI", "Moving Average", "Market Structure", "Support/Resistance", "Liquidity", "Order Flow"];

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  tags?: string[];
}

const FEATURED: Feature = {
  icon: BrainCircuit,
  title: "AI Market Analysis",
  body: "Trend, momentum, and structure — read together by ElVoid, not one indicator at a time. This is the same reasoning that powers the Void Core on the terminal.",
};

const SUPPORTING: Feature[] = [
  {
    icon: LineChart,
    title: "Technical Analysis",
    body: "A full indicator toolkit for reading price action, built on the terminology traders already use.",
    tags: INDICATORS,
  },
  {
    icon: ScanSearch,
    title: "Crypto Scanner",
    body: "Discover market opportunities across hundreds of pairs, ranked instead of scattered across dozens of open tabs.",
  },
  {
    icon: Newspaper,
    title: "News & Sentiment Analysis",
    body: "Monitor market-moving events and sentiment shifts as they happen, correlated against the assets you actually hold.",
  },
  {
    icon: ShieldCheck,
    title: "Risk Management Tools",
    body: "Calculate position size, risk/reward ratio, and a full trading plan before you enter — not after.",
  },
  {
    icon: Wallet,
    title: "Paper Trading",
    body: "Practice strategies with a virtual wallet — no real funds, no real exchange connection, just the reps.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-landing-line bg-landing-bg py-20 sm:py-28">
      <Container>
        <Reveal className="max-w-xl">
          <LandingEyebrow>Features</LandingEyebrow>
          <h2 className="mt-4 font-display text-2xl font-medium tracking-tight text-landing-ink sm:text-3xl">
            Everything you need to read the market, in one terminal
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-landing-ink-muted">
            Six tools, one workflow — from first scan to a documented trading plan.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 grid gap-4">
          <div className="landing-glass grid gap-5 rounded-2xl p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-landing-gold/30 bg-landing-gold/10">
              <FEATURED.icon size={22} className="text-landing-gold-glow" />
            </div>
            <div>
              <h3 className="font-display text-lg text-landing-ink sm:text-xl">{FEATURED.title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-landing-ink-muted">{FEATURED.body}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORTING.map((f) => (
              <div key={f.title} className="landing-glass flex flex-col rounded-xl p-5">
                <f.icon size={20} className="text-landing-gold" />
                <h3 className="mt-3 text-sm font-semibold tracking-tight text-landing-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-landing-ink-muted">{f.body}</p>
                {f.tags && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {f.tags.map((tag) => (
                      <span
                        key={tag}
                        className="mono-num rounded-full border border-landing-line px-2 py-0.5 text-[10px] text-landing-ink-faint"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
