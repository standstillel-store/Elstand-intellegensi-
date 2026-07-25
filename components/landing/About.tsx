import { Target, Eye, Cpu } from "lucide-react";
import { Container, SectionIntro } from "./shared";

const PILLARS = [
  {
    icon: Target,
    label: "Mission",
    body: "Give crypto traders and investors clear, data-driven market intelligence instead of hype — so decisions are backed by evidence, not emotion.",
  },
  {
    icon: Eye,
    label: "Vision",
    body: "A world where every trader, from first-timers to full-time desks, has access to institutional-grade market analysis tools.",
  },
  {
    icon: Cpu,
    label: "Technology",
    body: "Real-time market data pipelines and rule-based technical analysis, with AI reasoning that shows its logic — not a black-box score.",
  },
];

export function About() {
  return (
    <section id="about" className="border-t border-line/70 py-20 sm:py-24">
      <Container>
        <SectionIntro
          eyebrow="About ElStand AI"
          title="A crypto intelligence platform built for clarity, not noise"
          description="ElStand AI is a crypto intelligence platform designed to help users analyze market trends, understand price movements, and make more informed decisions using artificial intelligence."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.label} className="glow-card p-5">
              <p.icon size={20} className="text-signal-glow" />
              <h3 className="mt-3 text-sm font-semibold tracking-tight text-ink">{p.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
