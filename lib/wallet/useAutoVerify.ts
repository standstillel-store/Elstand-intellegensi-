"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildVerificationMessage, generateNonce } from "@/lib/wallet/message";

export interface AutoVerifyWalletRow {
  wallet_address: string;
  [key: string]: unknown;
}

/**
 * Connect → sign → POST /api/wallet/verify → row lands in `wallets`.
 *
 * This used to live only inside components/settings/sections/WalletSection.tsx,
 * which meant that page was the ONLY place in the app that ever wrote a row
 * to `wallets`. Every other entry point (WalletConnectGate on /wallet, the
 * bare AppKit `open()` button) only ever established a client-side
 * wagmi/AppKit session — it looked "connected" in the UI, but nothing was
 * ever persisted server-side, so the wallets table stayed empty and profile/
 * ELS balance stayed N/A no matter how many times someone connected there.
 *
 * Extracted here (same logic, same /api/wallet/verify contract, same
 * 5-minute-recency signed message from lib/wallet/message.ts) so any screen
 * can mount this hook and get the identical auto-verify-on-connect behavior
 * WalletSection.tsx already had, instead of re-implementing it or — worse —
 * leaving it missing.
 */
export function useWalletAutoVerify() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [knownAddresses, setKnownAddresses] = useState<string[] | null>(null);
  const attemptedAddress = useRef<string | null>(null);

  // Load already-saved addresses once so an already-verified wallet doesn't
  // get a fresh signature prompt every time this hook mounts (e.g. every
  // visit to /wallet) — matches WalletSection.tsx's `alreadySaved` check.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setKnownAddresses((data?.wallets ?? []).map((w: AutoVerifyWalletRow) => w.wallet_address.toLowerCase()));
      })
      .catch(() => {
        if (!cancelled) setKnownAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runVerification = useCallback(
    async (addr: string, cid: number) => {
      setVerifying(true);
      setVerifyError(null);
      try {
        const nonce = generateNonce();
        const timestamp = new Date().toISOString();
        const message = buildVerificationMessage({ address: addr, nonce, timestamp });
        const signature = await signMessageAsync({ message });
        const res = await fetch("/api/wallet/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, chainId: cid, connectorName: connector?.name, message, signature }),
        }).then((r) => r.json());
        if (res.error) {
          setVerifyError(res.error);
        } else {
          setVerifiedAddress(addr);
          setKnownAddresses((prev) => [...(prev ?? []), addr.toLowerCase()]);
        }
      } catch (err) {
        // Most common case: the user rejected the signature request in their wallet.
        setVerifyError(err instanceof Error ? err.message : "Verification cancelled.");
      } finally {
        setVerifying(false);
      }
    },
    [connector, signMessageAsync]
  );

  useEffect(() => {
    if (!isConnected || !address || !chainId || knownAddresses === null) return;
    const alreadySaved = knownAddresses.includes(address.toLowerCase());
    if (alreadySaved || attemptedAddress.current === address || verifying) return;
    attemptedAddress.current = address;
    runVerification(address, chainId);
  }, [isConnected, address, chainId, knownAddresses, verifying, runVerification]);

  return { verifying, verifyError, verifiedAddress };
}
