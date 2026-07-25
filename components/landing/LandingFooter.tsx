import Link from "next/link";
import { Twitter, Send, MessageCircle, Mail } from "lucide-react";
import { Container } from "./shared";

const SOCIALS = [
  { icon: Twitter, label: "X / Twitter", href: "https://x.com/elstandai" },
  { icon: Send, label: "Telegram", href: "https://t.me/elstandai" },
  { icon: MessageCircle, label: "WhatsApp Community", href: "https://chat.whatsapp.com/elstandai" },
  { icon: Mail, label: "Email", href: "mailto:support@elstand.ai" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-line/70 py-14">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
              <span className="text-sm font-bold tracking-tight text-ink">ElStand AI</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
              AI-powered crypto market intelligence for traders and investors — analysis and tools, not advice.
            </p>
            <div className="mt-5 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-faint transition-colors hover:border-signal/40 hover:text-ink"
                >
                  <s.icon size={15} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow text-[11px] text-ink-faint">Company</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <a href="#about" className="text-ink-muted hover:text-ink">
                  About
                </a>
              </li>
              <li>
                <Link href="/contact" className="text-ink-muted hover:text-ink">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow text-[11px] text-ink-faint">Legal</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/privacy-policy" className="text-ink-muted hover:text-ink">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-ink-muted hover:text-ink">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-line/70 pt-6">
          <p className="text-xs leading-relaxed text-ink-faint">
            ElStand AI provides analytical tools and educational insights only — not financial advice, and not a
            guarantee of profit. Cryptocurrency markets are volatile; always do your own research.
          </p>
          <p className="mt-3 text-xs text-ink-faint">© {new Date().getFullYear()} ElStand AI. All rights reserved.</p>
        </div>
      </Container>
    </footer>
  );
}
