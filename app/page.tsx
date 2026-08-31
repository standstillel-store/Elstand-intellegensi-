import type { Metadata } from "next";
import { JsonLd } from "@/components/landing/JsonLd";
import { AmbientField } from "@/components/landing/AmbientField";
import { BootIntro } from "@/components/landing/BootIntro";
import { SystemRail } from "@/components/landing/SystemRail";
import { SystemTicker } from "@/components/landing/SystemTicker";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { MacroSection } from "@/components/landing/MacroSection";
import { IntelligenceMapSection } from "@/components/landing/IntelligenceMapSection";
import { QuantSection } from "@/components/landing/QuantSection";
import { OrderFlowSection } from "@/components/landing/OrderFlowSection";
import { OracleSection } from "@/components/landing/OracleSection";
import { EvidenceLedgerSection } from "@/components/landing/EvidenceLedgerSection";
import { Web3Section } from "@/components/landing/Web3Section";
import { MembershipSection } from "@/components/landing/MembershipSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "ElStand AI | Market Intelligence, Reengineered",
  description:
    "ElStand AI is a crypto market intelligence platform: macro and micro context, order flow, the ELVOID PRO Oracle decision-support pipeline, paper trading, and an on-chain (BSC Testnet) membership layer.",
  keywords: [
    "crypto AI analysis",
    "AI crypto signals",
    "crypto market intelligence",
    "technical analysis tool",
    "crypto scanner",
    "paper trading",
    "ELVOID Oracle",
  ],
  openGraph: {
    title: "ElStand AI | Market Intelligence, Reengineered",
    description:
      "Macro and micro context, order flow, the ELVOID PRO Oracle decision-support pipeline, and an on-chain membership layer.",
    type: "website",
    siteName: "ElStand AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "ElStand AI | Market Intelligence, Reengineered",
    description:
      "Macro and micro context, order flow, the ELVOID PRO Oracle decision-support pipeline, and an on-chain membership layer.",
  },
  robots: { index: true, follow: true },
};

// Phase B — Landing Redesign. Presentation + navigation layer only:
// - Auth/wallet orchestration stays in app/login/page.tsx (see AuthAwareCta
//   / useAuthStatus.ts for the read-only status check used here).
// - Every CTA routes to /login or /dashboard, never renders its own
//   sign-in UI.
// - All CSS for this tree is scoped under .landing-root (this <main>) via
//   the `elv-` prefixed classes added to app/globals.css.
export default function LandingPage() {
  return (
    <main className="landing-root elv-page">
      <JsonLd />
      <BootIntro />
      <AmbientField />
      <SystemRail />
      <LandingHeader />

      <Hero />
      <MacroSection />
      <IntelligenceMapSection />
      <QuantSection />
      <OrderFlowSection />
      <OracleSection />
      <EvidenceLedgerSection />
      <Web3Section />
      <MembershipSection />
      <FinalCta />
      <LandingFooter />

      <SystemTicker />
    </main>
  );
}
