import Link from "next/link";
import { Container } from "./shared";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "#ai-signal", label: "AI Signal" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
          <span className="text-[15px] font-bold tracking-tight text-ink">ElStand AI</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-ink-muted transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:block"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white shadow-glow-signal transition-colors hover:bg-signal-glow"
          >
            Start Free
          </Link>
        </div>
      </Container>
    </header>
  );
}
