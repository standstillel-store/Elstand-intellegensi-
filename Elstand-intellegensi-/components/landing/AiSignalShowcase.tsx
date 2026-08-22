import { TrendingUp } from "lucide-react";
import { Container, SectionIntro } from "./shared";

export function AiSignalShowcase() {
  return (
    <section id="ai-signal" className="border-t border-line/70 py-20 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
        <div>
          <SectionIntro
            eyebrow="AI Signal"
            title="A clear read, with its reasoning shown"
            description="AI Signals provide analytical insights based on market data. They are designed as decision-support tools, not financial advice."
          />
          <ul className="mt-6 space-y-3 text-sm text-ink-muted">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-signal-glow" />
              Every signal is built from transparent, rule-based analysis — not a black-box score.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-signal-glow" />
              Bias, trend, key levels, and risk are shown together, so you can weigh them yourself.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-signal-glow" />
              No signal predicts the future. Markets stay unpredictable — treat this as a starting point for your own research.
            </li>
          </ul>
        </div>

        <div className="glow-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-[10px] tracking-[0.15em] text-ink-faint">SAMPLE · NOT LIVE DATA</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-ink">BTC/USDT</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-up/15 px-3 py-1 text-xs font-medium text-up">
              <TrendingUp size={13} /> Bullish
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel px-3 py-2.5">
              <p className="text-[11px] text-ink-faint">Trend</p>
              <p className="mt-0.5 text-sm font-medium text-ink">Uptrend</p>
            </div>
            <div className="panel px-3 py-2.5">
              <p className="text-[11px] text-ink-faint">Support</p>
              <p className="mono-num mt-0.5 text-sm font-medium text-ink">$108,400</p>
            </div>
            <div className="panel px-3 py-2.5">
              <p className="text-[11px] text-ink-faint">Resistance</p>
              <p className="mono-num mt-0.5 text-sm font-medium text-ink">$114,200</p>
            </div>
            <div className="panel px-3 py-2.5">
              <p className="text-[11px] text-ink-faint">Risk Level</p>
              <p className="mt-0.5 text-sm font-medium text-amber">Medium</p>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
            Sample signal for illustration only — not real-time data and not financial advice.
          </p>
        </div>
      </Container>
    </section>
  );
}
