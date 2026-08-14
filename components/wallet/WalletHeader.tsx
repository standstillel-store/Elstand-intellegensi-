"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink, ShieldCheck } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { WALLET_NETWORK_CONFIG } from "@/lib/web3/config";

/**
 * Total portfolio value is intentionally always "N/A" for this phase — there
 * is no configured USD price source for ELS (testnet token, no market), and
 * fabricating a number from BNB testnet's worthless price would violate the
 * "no fake portfolio value" rule in the wallet spec. Once a real price feed
 * exists for the configured assets, wire it in here.
 */
export function WalletHeader({ address }: { address: `0x${string}` | undefined }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[10px] tracking-[0.14em] text-ink-faint">
            Portfolio Overview ({WALLET_NETWORK_CONFIG.chainName.split(" ").pop()?.toUpperCase()})
          </p>
          <p className="mt-2 text-xs text-ink-muted">Total Portfolio Value</p>
          <p className="mt-0.5 text-3xl font-bold tracking-tight">N/A</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">No price feed configured</p>
        </div>

        <div className="flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1.5 text-[11px] text-signal-glow">
          <ShieldCheck size={13} />
          Assets are self-custodied — verify every transaction
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">Wallet Address</p>
        {address ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="mono-num rounded-md border border-line bg-bg-raised px-3 py-1.5 text-sm">
              {shortAddr(address)}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:bg-bg-raised hover:text-ink"
            >
              {copied ? <Check size={13} className="text-up" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={`${WALLET_NETWORK_CONFIG.explorerUrl}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:bg-bg-raised hover:text-ink"
            >
              <ExternalLink size={13} />
              Explorer
            </a>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-ink-faint">Connect a wallet to see your address.</p>
        )}
      </div>
    </div>
  );
}
