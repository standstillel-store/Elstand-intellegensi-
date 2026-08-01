import { KeyRound, Lock, Fingerprint, Siren, FileText } from "lucide-react";
import { Container, LandingEyebrow } from "./shared";

// Phase 5 — Security (brief Section 8). Every point below maps to a real
// file in this codebase (lib/binance/crypto.ts + credentials.ts,
// lib/wallet/verify.ts + message.ts, lib/binance/riskManager.ts +
// orderGuard.ts, app/api/binance/emergency-stop) rather than generic
// "institutional grade" audit-badge language — there's no named
// third-party audit in this repo to point to yet, so this section earns
// trust from what the architecture actually does instead of borrowing it
// from a badge we can't back up.

const POINTS = [
  {
    icon: KeyRound,
    title: "Encrypted at rest",
    body: "Exchange API keys are encrypted before they're ever stored — never held or transmitted in plain text.",
  },
  {
    icon: Lock,
    title: "Your keys, your exchange",
    body: "Live trades execute on your own Binance account through your own API connection. ElStand never takes custody of your funds.",
  },
  {
    icon: Fingerprint,
    title: "Sign-in, not custody",
    body: "Wallet connections use signature verification. Your private key never leaves your device, and never touches our servers.",
  },
  {
    icon: Siren,
    title: "Built-in circuit breakers",
    body: "A risk guard and a one-tap emergency stop sit between every AI signal and a live order.",
  },
];

export function Security() {
  return (
    <section id="security" className="border-t border-landing-line bg-landing-surface py-20 sm:py-28">
      <Container>
        <div className="max-w-xl">
          <LandingEyebrow>Security</LandingEyebrow>
          <h2 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            How your keys and funds are protected
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            No paid audit to point to yet — so here's exactly how your API keys, your wallet, and your
            funds are handled, in plain terms.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {POINTS.map((p) => (
            <div key={p.title} className="landing-glass flex gap-4 rounded-xl p-5">
              <p.icon size={18} className="mt-0.5 shrink-0 text-landing-cyan-glow" />
              <div>
                <h3 className="font-display text-sm text-ink">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-landing-line pt-6 text-[13px] text-ink-muted">
          <p className="max-w-md">
            When you connect an exchange, create an API key with trading permissions only — disable
            withdrawals. ElStand will never ask you for withdrawal access.
          </p>
          <a
            href="/methodology"
            className="inline-flex items-center gap-1.5 text-landing-violet-glow transition-colors hover:text-landing-cyan-glow"
          >
            <FileText size={14} />
            Read our methodology
          </a>
        </div>
      </Container>
    </section>
  );
}
