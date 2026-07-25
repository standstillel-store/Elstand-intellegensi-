"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { wagmiAdapter, wagmiConfig, projectId, networks, isWalletConnectConfigured } from "@/lib/web3/config";

const queryClient = new QueryClient();

// createAppKit() must run once at module scope (not inside the component,
// which would re-run it every render) — this is the modal AppKitButton /
// useAppKit() talk to. Skipped entirely when NEXT_PUBLIC_REOWN_PROJECT_ID
// isn't set, same "degrade gracefully instead of throwing" rule as the rest
// of the app's optional integrations.
if (isWalletConnectConfigured) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId: projectId!,
    networks,
    defaultNetwork: networks[0],
    metadata: {
      name: "ELSTAND INTELLIGENCE",
      description: "AI-powered crypto market intelligence",
      url: process.env.NEXT_PUBLIC_SITE_URL || "https://elstand.ai",
      icons: ["https://elstand.ai/icon.png"],
    },
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
  });
}

export function Web3Provider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
