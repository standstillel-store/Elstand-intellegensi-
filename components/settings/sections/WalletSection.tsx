"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { Wallet as WalletIcon, Plug, Unplug, Loader2, ShieldCheck, X } from "lucide-react";
import { SettingsCard, SettingsRow } from "../SettingsCard";
import { isWalletConnectConfigured } from "@/lib/web3/config";
import { buildVerificationMessage, generateNonce } from "@/lib/wallet/message";
import { WALLET_TYPE_LABEL, type WalletType } from "@/lib/wallet/connectors";
import { timeAgo, shortAddr } from "@/lib/format";

interface WalletRow {
  id: string;
  wallet_address: string;
  wallet_type: WalletType;
  chain_id: number;
  verified: boolean;
  first_connected_at: string;
  last_connected_at: string;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base",
  137: "Polygon",
  56: "BNB Chain",
};

function ConnectButton() {
  // Safe to call unconditionally: ConnectButton only ever renders from the
  // branch below where isWalletConnectConfigured is already true, which is
  // the same condition Web3Provider uses to decide whether it called
  // createAppKit() at all — so an AppKit instance is guaranteed to exist
  // here.
  const { open } = useAppKit();
  return (
    <button
      onClick={() => open()}
      className="flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-3.5 py-2 text-xs font-medium text-signal-glow hover:bg-signal/20"
    >
      <Plug size={13} /> Connect Wallet
    </button>
  );
}

export function WalletSection() {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [attemptedAddress, setAttemptedAddress] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { address, isConnected, chainId, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet").then((r) => r.json());
      if (res.wallets) setWallets(res.wallets);
    } catch {
      setWallets([]);
    }
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

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
          await loadWallets();
        }
      } catch (err) {
        // Most common case: the user rejected the signature request in their wallet.
        setVerifyError(err instanceof Error ? err.message : "Verification cancelled.");
      } finally {
        setVerifying(false);
      }
    },
    [connector, signMessageAsync, loadWallets]
  );

  // Auto-prompt the ownership signature the moment a new address connects —
  // this is the "connect → sign to prove it's yours" flow, one continuous
  // action instead of a separate manual "Verify" step.
  useEffect(() => {
    if (!isConnected || !address || !chainId) return;
    const alreadySaved = wallets?.some((w) => w.wallet_address.toLowerCase() === address.toLowerCase());
    if (alreadySaved || attemptedAddress === address || verifying) return;
    setAttemptedAddress(address);
    runVerification(address, chainId);
  }, [isConnected, address, chainId, wallets, attemptedAddress, verifying, runVerification]);

  async function handleRemove(id: string, walletAddress: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/wallet?id=${id}`, { method: "DELETE" });
      if (address?.toLowerCase() === walletAddress.toLowerCase()) disconnect();
      await loadWallets();
    } finally {
      setRemovingId(null);
    }
  }

  if (!isWalletConnectConfigured) {
    return (
      <SettingsCard id="wallet" icon={WalletIcon} title="Wallet" description="Hubungkan wallet EVM untuk verifikasi kepemilikan alamat.">
        <p className="rounded-md border border-line px-3 py-2.5 text-xs text-ink-faint">
          Wallet Connect belum dikonfigurasi — tambahkan <code className="rounded bg-bg-raised px-1 py-0.5">NEXT_PUBLIC_REOWN_PROJECT_ID</code> di
          .env.local (project gratis di cloud.reown.com).
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      id="wallet"
      icon={WalletIcon}
      title="Wallet"
      description="MetaMask, Rabby, OKX Wallet, Coinbase Wallet, atau WalletConnect — dipakai hanya untuk verifikasi kepemilikan alamat, tidak pernah menyimpan private key atau mnemonic."
    >
      {wallets === null ? (
        <p className="text-xs text-ink-faint">Memuat…</p>
      ) : wallets.length === 0 ? (
        <p className="text-xs text-ink-faint">Belum ada wallet terhubung.</p>
      ) : (
        <div className="space-y-2">
          {wallets.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm text-ink">
                  <ShieldCheck size={13} className="shrink-0 text-up" />
                  {WALLET_TYPE_LABEL[w.wallet_type]}
                  <span className="mono-num text-ink-muted">{shortAddr(w.wallet_address)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {CHAIN_NAMES[w.chain_id] ?? `Chain ${w.chain_id}`} · Terhubung {timeAgo(w.last_connected_at)}
                </p>
              </div>
              <button
                onClick={() => handleRemove(w.id, w.wallet_address)}
                disabled={removingId === w.id}
                aria-label="Disconnect wallet"
                className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:border-down/40 hover:text-down disabled:opacity-50"
              >
                {removingId === w.id ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      <SettingsRow label="Connect a wallet" hint="Membuka modal pilihan wallet, lalu minta tanda tangan singkat untuk verifikasi.">
        <ConnectButton />
      </SettingsRow>

      {verifying && (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 size={12} className="animate-spin" /> Menunggu tanda tangan di wallet-mu…
        </p>
      )}
      {verifyError && (
        <p className="flex items-center justify-between gap-2 rounded-md border border-down/30 bg-down/5 px-3 py-2 text-xs text-down">
          {verifyError}
          <button onClick={() => setVerifyError(null)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </p>
      )}
    </SettingsCard>
  );
}
