import type { LucideIcon } from "lucide-react";
import { BrainCircuit, LineChart, ScanSearch, Newspaper, ShieldCheck, Wallet } from "lucide-react";
import { Container, SectionIntro } from "./shared";

const INDICATORS = ["RSI", "Moving Average", "Market Structure", "Support/Resistance", "Liquidity", "Order Flow"];

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  tags?: string[];
}

const FEATURES: Feature[] = [
  {
    icon: BrainCircuit,
    title: "AI Market Analysis",
    body: "Analyze market conditions using AI — trend, momentum, and structure read together instead of one indicator at a time.",
  },
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
    <section id="features" className="border-t border-line/70 py-20 sm:py-24">
      <Container>
        <SectionIntro
          eyebrow="Features"
          title="Everything you need to read the market, in one terminal"
          description="Six tools, one workflow — from first scan to a documented trading plan."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glow-card flex flex-col p-5">
              <f.icon size={20} className="text-signal-glow" />
              <h3 className="mt-3 text-sm font-semibold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
              {f.tags && (
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {f.tags.map((tag) => (
                    <span
                      key={tag}
                      className="mono-num rounded border border-line bg-bg-raised px-1.5 py-0.5 text-[10px] text-ink-faint"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
