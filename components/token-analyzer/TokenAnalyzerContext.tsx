"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface TokenAnalyzerContextValue {
  openSymbol: string | null;
  open: (symbol: string) => void;
  close: () => void;
}

const TokenAnalyzerContext = createContext<TokenAnalyzerContextValue | null>(null);

export function TokenAnalyzerProvider({ children }: { children: ReactNode }) {
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);

  const open = useCallback((symbol: string) => setOpenSymbol(symbol.toUpperCase()), []);
  const close = useCallback(() => setOpenSymbol(null), []);

  const value = useMemo(() => ({ openSymbol, open, close }), [openSymbol, open, close]);

  return <TokenAnalyzerContext.Provider value={value}>{children}</TokenAnalyzerContext.Provider>;
}

/** Call open("BTC") from anywhere under the provider to launch the Token Analyzer drawer. */
export function useTokenAnalyzer() {
  const ctx = useContext(TokenAnalyzerContext);
  if (!ctx) throw new Error("useTokenAnalyzer must be used within TokenAnalyzerProvider");
  return ctx;
}
