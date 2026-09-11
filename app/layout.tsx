import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { TokenAnalyzerProvider } from "@/components/token-analyzer/TokenAnalyzerContext";
import { TokenAnalyzerDrawer } from "@/components/token-analyzer/TokenAnalyzerDrawer";
import { ThemePreferenceProvider } from "@/components/ThemePreferenceProvider";
import { Web3Provider } from "@/components/providers/Web3Provider";
import { PaperTraderAutoSync } from "@/components/providers/PaperTraderAutoSync";

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
      <head>
        {/*
          Phase 9 — runs before paint/hydration so a Light or System user
          doesn't see a flash of the dark default every reload/navigation.
          `ThemePreferenceProvider` (mounted below, in <body>) still owns the
          real, reactive logic (accent/density/motion, plus live OS
          scheme-change updates) — this script only sets the one attribute
          CSS actually reads before that provider's effect has had a chance
          to run. Necessarily a small standalone duplicate of
          resolveThemeMode()'s logic and the STORAGE_KEY string from
          lib/preferences.ts, since nothing importable is available yet at
          this point — if STORAGE_KEY there ever changes, update the literal
          below too.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("elstand:preferences:v2");var t="dark";if(s){var p=JSON.parse(s);t=(p&&p.appearance&&p.appearance.theme)||"dark";}if(t==="system"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-bg text-ink font-sans antialiased">
        <ThemePreferenceProvider />
        <PaperTraderAutoSync />
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
