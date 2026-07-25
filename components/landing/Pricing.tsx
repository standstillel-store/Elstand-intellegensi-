import Link from "next/link";
import { Check } from "lucide-react";
import { Container, SectionIntro } from "./shared";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    features: ["Basic AI Analysis", "Limited daily requests", "Market overview"],
    cta: "Start Free",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    highlight: true,
    features: ["Advanced AI Analysis", "More requests", "Advanced tools", "Priority access"],
    cta: "Upgrade to Pro",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-line/70 py-20 sm:py-24">
      <Container>
        <SectionIntro
          eyebrow="Pricing"
          title="Start free. Upgrade when you need more depth."
          align="center"
        />

        <div className="mx-auto mt-10 grid max-w-2xl gap-5 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.highlight ? "border-signal/50 bg-signal/[0.04] shadow-glow-signal" : "border-line bg-bg-surface"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-signal px-3 py-0.5 text-[11px] font-medium text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-sm font-semibold tracking-tight text-ink">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="mono-num text-3xl font-bold text-ink">{plan.price}</span>
                <span className="text-sm text-ink-faint">{plan.period}</span>
              </div>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-ink-muted">
                    <Check size={16} className="mt-0.5 shrink-0 text-signal-glow" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className={`mt-7 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-signal text-white hover:bg-signal-glow"
                    : "border border-line text-ink hover:border-signal/40"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
