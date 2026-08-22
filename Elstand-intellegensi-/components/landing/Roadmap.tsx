import { Container, LandingEyebrow } from "./shared";
import { Reveal } from "./Reveal";

// Phase 5 — Roadmap (brief Section 7). Status reflects the codebase as
// audited in PHASE5-PLAN.md, not aspirational copy: "Now" is what's shipped
// and reachable from the dashboard today, "Next" is code that already
// exists but touches real funds (live order execution) so it's framed as
// expanding rather than finished, "Later" is explicitly gated on something
// outside our control (no free ETF-flow data source yet) instead of a made
// -up ship date. No quarters/dates anywhere — nothing here is a date we've
// actually committed to, and a fake one would be worse than none.

type Horizon = "now" | "next" | "later";

const HORIZON_META: Record<Horizon, { label: string; sub: string; dot: string }> = {
  now: { label: "Now", sub: "Live in the terminal", dot: "bg-landing-violet" },
  next: { label: "Next", sub: "In progress", dot: "bg-landing-cyan" },
  later: { label: "Later", sub: "Exploring", dot: "bg-landing-ink-faint" },
};

interface RoadmapItem {
  title: string;
  body: string;
}

const ITEMS: Record<Horizon, RoadmapItem[]> = {
  now: [
    { title: "AI Reasoning & Chat", body: "ElVoid reads price, whales, funding, news, and macro together, not one indicator at a time." },
    { title: "AI Signals & Scanner", body: "Confidence-scored setups across hundreds of pairs, ranked instead of scattered across tabs." },
    { title: "Paper Trading", body: "Equity curve, trade journal, and an AI coach — full reps before anything touches a real account." },
    { title: "Market Intelligence", body: "Whale flow, sector rotation, sentiment, and an economic calendar in one map." },
    { title: "AI Energy", body: "No subscription — 10 free to start, +10 every day, spend only on what you use." },
  ],
  next: [
    {
      title: "Live order execution",
      body: "Auto-trading on your own Binance account — trailing stop, breakeven, and an emergency stop switch — expanding with additional guardrails.",
    },
    { title: "Referral rewards", body: "Bonus AI Energy for traders you bring to ElStand." },
    { title: "Macro ticker", body: "Indices, DXY, gold, and oil alongside crypto in the live strip." },
  ],
  later: [
    {
      title: "Institutional flow data",
      body: "ETF flow and institutional movement — waiting on a data source that doesn't require a paid vendor before we'll show it.",
    },
    { title: "Bug Hunter rewards", body: "AI Energy for traders who report real bugs. Program terms not finalized." },
  ],
};

function RoadmapColumn({ horizon }: { horizon: Horizon }) {
  const meta = HORIZON_META[horizon];
  const items = ITEMS[horizon];
  return (
    <div className="landing-glass rounded-xl p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className="eyebrow text-[11px] uppercase tracking-[0.2em] text-landing-ink-muted">{meta.label}</span>
      </div>
      <p className="mt-1 font-display text-sm text-landing-ink">{meta.sub}</p>

      <ul className="mt-5 space-y-5">
        {items.map((item) => (
          <li key={item.title}>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-landing-ink-faint" />
              <h3 className="text-sm font-semibold tracking-tight text-landing-ink">{item.title}</h3>
            </div>
            <p className="mt-1.5 pl-3 text-[13px] leading-relaxed text-landing-ink-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Roadmap() {
  return (
    <section id="roadmap" className="border-t border-landing-line bg-landing-bg py-20 sm:py-28">
      <Container>
        <Reveal className="max-w-xl">
          <LandingEyebrow>Roadmap</LandingEyebrow>
          <h2 className="mt-4 font-display text-2xl font-medium tracking-tight text-landing-ink sm:text-3xl">
            Built in the open, one working feature at a time
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-landing-ink-muted">
            No quarters, no fixed dates — just what's actually shipped, what's being hardened, and what
            we haven't solved yet.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 grid gap-4 lg:grid-cols-3">
          <RoadmapColumn horizon="now" />
          <RoadmapColumn horizon="next" />
          <RoadmapColumn horizon="later" />
        </Reveal>
      </Container>
    </section>
  );
}
