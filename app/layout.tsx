import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { TokenAnalyzerProvider } from "@/components/token-analyzer/TokenAnalyzerContext";
import { TokenAnalyzerDrawer } from "@/components/token-analyzer/TokenAnalyzerDrawer";
import { ThemePreferenceProvider } from "@/components/ThemePreferenceProvider";
import { Web3Provider } from "@/components/providers/Web3Provider";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});
// Phase 5 — landing page display face only (`font-display` utility, opt-in).
// Loaded globally like sans/mono above so it's available site-wide as a CSS
// variable, but nothing outside new landing components references the
// `font-display` class, so the dashboard's typography is byte-for-byte
// unchanged.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://elstand.ai"),
  title: {
    default: "ElStand AI | AI-Powered Crypto Market Intelligence",
    template: "%s | ElStand AI",
  },
  description:
    "ElStand AI is an AI-powered crypto market intelligence platform: AI analysis, technical indicators, a crypto scanner, news sentiment, risk tools, and paper trading.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Passed straight through to wagmi's cookieToInitialState() inside
  // Web3Provider so a wallet connected in a previous visit is already
  // "known" on first server render — this is the piece that makes wallet
  // sessions survive refresh/close/reopen without a client-side flash of
  // "disconnected" before wagmi re-hydrates.
  const cookieHeader = headers().get("cookie");

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        <ThemePreferenceProvider />
        <Web3Provider cookies={cookieHeader}>
          <TokenAnalyzerProvider>
            {children}
            <TokenAnalyzerDrawer />
          </TokenAnalyzerProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
