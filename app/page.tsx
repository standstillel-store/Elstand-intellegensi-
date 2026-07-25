import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { About } from "@/components/landing/About";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AiSignalShowcase } from "@/components/landing/AiSignalShowcase";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { JsonLd } from "@/components/landing/JsonLd";

export const metadata: Metadata = {
  title: "AI-Powered Crypto Market Intelligence",
  description:
    "Analyze crypto markets smarter with AI-driven insights, technical analysis, a crypto scanner, news sentiment, risk management tools, and paper trading. Start free.",
  keywords: [
    "crypto AI analysis",
    "AI crypto signals",
    "crypto market intelligence",
    "technical analysis tool",
    "crypto scanner",
    "paper trading",
  ],
  openGraph: {
    title: "ElStand AI | AI-Powered Crypto Market Intelligence",
    description:
      "Analyze crypto markets smarter with AI-driven insights, technical analysis, and market monitoring tools.",
    type: "website",
    siteName: "ElStand AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "ElStand AI | AI-Powered Crypto Market Intelligence",
    description:
      "Analyze crypto markets smarter with AI-driven insights, technical analysis, and market monitoring tools.",
  },
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <JsonLd />
      <LandingHeader />
      <Hero />
      <About />
      <Features />
      <HowItWorks />
      <AiSignalShowcase />
      <Pricing />
      <Faq />
      <LandingFooter />
    </main>
  );
}
