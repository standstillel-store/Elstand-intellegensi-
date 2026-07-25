import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TokenAnalyzerProvider } from "@/components/token-analyzer/TokenAnalyzerContext";
import { TokenAnalyzerDrawer } from "@/components/token-analyzer/TokenAnalyzerDrawer";
import { ThemePreferenceProvider } from "@/components/ThemePreferenceProvider";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        <ThemePreferenceProvider />
        <TokenAnalyzerProvider>
          {children}
          <TokenAnalyzerDrawer />
        </TokenAnalyzerProvider>
      </body>
    </html>
  );
}
