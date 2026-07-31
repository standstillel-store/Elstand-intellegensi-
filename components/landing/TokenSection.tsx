import Link from "next/link";
import { Container, LandingEyebrow } from "./shared";

// Replaces the old Pricing.tsx entirely — that component described a $0/$29
// subscription model that was never actually built (see PHASE5-PLAN.md audit).
// Every number below is pulled straight from lib/energy.ts (FEATURE_COSTS,
// NEW_USER_ENERGY, DAILY_CLAIM_AMOUNT) rather than written from scratch, so
// this section describes the real mechanic instead of inventing a nicer one.
// Referral and Bug Hunter are confirmed "Coming Soon" — neither exists in the
// codebase yet (checked: no referral/bounty code anywhere).

const SAMPLE_COSTS: Array<{ label: string; cost: number }> = [
  { label: "AI Signal", cost: 4 },
  { label: "Market Scanner", cost: 4 },
  { label: "AI Reasoning", cost: 3 },
  { label: "Coin Analysis", cost: 2 },
  { label: "AI Chat", cost: 2 },
];

function UtilityCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status?: "live" | "soon";
}) {
  return (
    <div className="landing-glass relative rounded-xl p-5">
      {status === "soon" && (
        <span className="eyebrow absolute right-4 top-4 text-[8px] tracking-[0.15em] text-ink-faint">COMING SOON</span>
      )}
      {status === "live" && <span className="live-dot absolute right-4 top-4" aria-hidden="true" />}
      <h3 className="font-display text-base text-ink">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

export function TokenSection() {
  return (
    <section className="bg-landing-bg py-20 sm:py-28">
      <Container>
        <div className="max-w-xl">
          <LandingEyebrow>AI Energy</LandingEyebrow>
          <h2 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            No subscriptions. Just energy.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            Every account starts with <span className="text-landing-gold">10 AI Energy</span>, free — and claims{" "}
            <span className="text-landing-gold">+10 more every day</span>. Spend it only on the AI features you
            actually use. No tiers, no card required to start.
          </p>
        </div>

        {/* Cost strip — real numbers from lib/energy.ts, not illustrative. */}
        <div className="mt-10 flex flex-wrap gap-3">
          {SAMPLE_COSTS.map((c) => (
            <div key={c.label} className="landing-glass flex items-center gap-2 rounded-full px-4 py-2 text-[12px]">
              <span className="text-ink-muted">{c.label}</span>
              <span className="mono-num text-landing-cyan-glow">{c.cost} ⚡</span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UtilityCard
            status="live"
            title="AI Energy"
            description="The balance that powers every AI-driven feature in the terminal — signals, scans, reasoning, chat."
          />
          <UtilityCard
            status="live"
            title="Daily Reward"
            description="Claim +10 Energy every 24 hours. It adds to whatever you already have — no reset, no expiry."
          />
          <UtilityCard
            status="soon"
            title="Referral"
            description="Earn bonus Energy for every trader you bring to ElStand. In active development."
          />
          <UtilityCard
            status="soon"
            title="Bug Hunter"
            description="Report a real bug, get rewarded in Energy. Program details coming soon."
          />
        </div>

        <div className="mt-10">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-landing-violet px-6 py-3 text-sm font-semibold text-white shadow-glow-landing-violet transition-colors hover:bg-landing-violet-glow"
          >
            Launch Terminal
          </Link>
        </div>
      </Container>
    </section>
  );
}
