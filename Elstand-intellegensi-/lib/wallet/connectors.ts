export type WalletType = "metamask" | "rabby" | "okx" | "coinbase" | "walletconnect" | "other";

// MetaMask, Rabby, and OKX Wallet all announce themselves as injected
// providers via EIP-6963 — AppKit/wagmi surfaces whichever ones are
// installed with their own self-reported name, so this is just pattern
// matching on that name, not a per-wallet integration.
export function connectorNameToWalletType(connectorName: string | undefined | null): WalletType {
  const name = (connectorName ?? "").toLowerCase();
  if (name.includes("metamask")) return "metamask";
  if (name.includes("rabby")) return "rabby";
  if (name.includes("okx")) return "okx";
  if (name.includes("coinbase")) return "coinbase";
  if (name.includes("walletconnect")) return "walletconnect";
  return "other";
}

export const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  metamask: "MetaMask",
  rabby: "Rabby",
  okx: "OKX Wallet",
  coinbase: "Coinbase Wallet",
  walletconnect: "WalletConnect",
  other: "Wallet",
};
