import { UserPlus, Coins, ScanLine, Sparkles } from "lucide-react";
import { Container, SectionIntro } from "./shared";

const STEPS = [
  { icon: UserPlus, title: "Connect your account", body: "Sign in with Google and your terminal is ready — no setup required." },
  { icon: Coins, title: "Choose a crypto asset", body: "Search any pair you're watching, from majors to long-tail altcoins." },
  { icon: ScanLine, title: "AI analyzes market data", body: "Price, structure, liquidity, and sentiment are read together in seconds." },
  { icon: Sparkles, title: "Receive insights and analysis", body: "A clear read on bias, key levels, and risk — ready for your own review." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line/70 py-20 sm:py-24">
      <Container>
        <SectionIntro eyebrow="How it Works" title="From sign-in to insight, in four steps" align="center" />

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="relative">
              {i < STEPS.length - 1 && (
                <div className="absolute right-0 top-6 hidden h-px w-full -translate-y-1/2 translate-x-1/2 bg-line lg:block" />
              )}
              <div className="relative flex flex-col items-start gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="mono-num flex h-8 w-8 items-center justify-center rounded-full border border-signal/30 bg-bg-surface text-xs font-semibold text-signal-glow">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <step.icon size={18} className="text-ink-faint" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight text-ink">{step.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
