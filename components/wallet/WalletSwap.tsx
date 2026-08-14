"use client";
import { useState } from "react";
import { ArrowDownUp, Settings2 } from "lucide-react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { WALLET_NETWORK_CONFIG, isWalletConnectConfigured } from "@/lib/web3/config";

const SLIPPAGE_OPTIONS = ["0.1%", "0.5%", "1%"];

export function WalletSwap() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5%");

  const nativeBalance = useBalance({
    address,
    chainId: WALLET_NETWORK_CONFIG.chainId,
    query: { enabled: Boolean(address) },
  });

  const swapConfigured = Boolean(WALLET_NETWORK_CONFIG.SWAP_CONTRACT) && Boolean(WALLET_NETWORK_CONFIG.ELS_CONTRACT);

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Swap</p>
        <Settings2 size={15} className="text-ink-faint" />
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-md border border-line bg-bg-raised p-3">
          <div className="flex items-center justify-between text-[11px] text-ink-faint">
            <span>From</span>
            <span>Balance: {address ? (nativeBalance.data ? Number(nativeBalance.data.formatted).toFixed(4) : "N/A") : "0.0000"} BNB</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">BNB Testnet</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-right text-lg text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-bg-surface">
            <ArrowDownUp size={13} className="text-ink-faint" />
          </div>
        </div>

        <div className="rounded-md border border-line bg-bg-raised p-3">
          <div className="flex items-center justify-between text-[11px] text-ink-faint">
            <span>To</span>
            <span>Balance: {WALLET_NETWORK_CONFIG.ELS_CONTRACT ? "N/A" : "0.00"} ELS</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">ELS (Testnet)</span>
            <span className="text-lg text-ink-faint">0.0</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
        <span>Slippage Tolerance</span>
        <div className="flex gap-1">
          {SLIPPAGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setSlippage(opt)}
              className={`rounded px-2 py-1 text-[11px] ${
                slippage === opt ? "bg-signal/20 text-signal-glow" : "border border-line text-ink-muted hover:bg-bg-raised"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {swapConfigured ? (
        <SwapSubmitButton isConnected={isConnected} />
      ) : (
        <div className="mt-4">
          <button
            disabled
            className="w-full cursor-not-allowed rounded-md border border-line bg-bg-raised py-3 text-sm font-medium text-ink-faint"
          >
            Testnet contract not configured
          </button>
          <p className="mt-1.5 text-center text-[11px] text-ink-faint">
            Swap execution is disabled until the BSC Testnet swap contract is deployed — no simulated transactions.
          </p>
        </div>
      )}
    </div>
  );
}

function SwapSubmitButton({ isConnected }: { isConnected: boolean }) {
  const { open } = useAppKit();
  if (!isWalletConnectConfigured) {
    return (
      <button disabled className="mt-4 w-full cursor-not-allowed rounded-md border border-line bg-bg-raised py-3 text-sm text-ink-faint">
        Wallet Connect not configured
      </button>
    );
  }
  if (!isConnected) {
    return (
      <button
        onClick={() => open()}
        className="mt-4 w-full rounded-md border border-signal/40 bg-signal/10 py-3 text-sm font-medium text-signal-glow hover:bg-signal/20"
      >
        Connect Wallet
      </button>
    );
  }
  // Contract is configured and wallet is connected: real execution wiring
  // (writeContract via wagmi) goes here once SWAP_CONTRACT is set — deferred
  // for now since WALLET_NETWORK_CONFIG.SWAP_CONTRACT is still null in this repo.
  return (
    <button className="mt-4 w-full rounded-md border border-signal/40 bg-signal/10 py-3 text-sm font-medium text-signal-glow hover:bg-signal/20">
      Swap
    </button>
  );
}
