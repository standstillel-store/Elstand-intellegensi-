import type { Metadata } from "next";
import { Mail, Twitter, Send, MessageCircle } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Container, Eyebrow } from "@/components/landing/shared";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the ElStand AI team.",
};

const CHANNELS = [
  { icon: Mail, label: "Email", value: "support@elstand.ai", href: "mailto:support@elstand.ai" },
  { icon: Twitter, label: "X / Twitter", value: "@elstandai", href: "https://x.com/elstandai" },
  { icon: Send, label: "Telegram", value: "t.me/elstandai", href: "https://t.me/elstandai" },
  { icon: MessageCircle, label: "WhatsApp Community", value: "Join the community", href: "https://chat.whatsapp.com/elstandai" },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <LandingHeader />

      <section className="py-20 sm:py-24">
        <Container className="max-w-2xl">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Get in touch</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            Questions about ElStand AI, a plan, or something you saw on the dashboard — pick whichever channel is
            easiest for you.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="glow-card flex items-center gap-3 p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-signal/10 text-signal-glow">
                  <c.icon size={16} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{c.label}</span>
                  <span className="block text-xs text-ink-muted">{c.value}</span>
                </span>
              </a>
            ))}
          </div>

          <p className="mt-8 text-xs leading-relaxed text-ink-faint">
            ElStand AI provides analytical tools and educational insights, not financial advice — our team can't
            advise on individual trades or guarantee outcomes.
          </p>
        </Container>
      </section>

      <LandingFooter />
    </main>
  );
}
