import { recoverMessageAddress, isAddress, type Hex } from "viem";
import { RECENCY_WINDOW_MS } from "./message";

export interface VerifyWalletSignatureParams {
  address: string;
  message: string;
  signature: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Confirms `signature` was produced by the private key for `address` over
 * exactly `message`, and that the message's own embedded Address/Timestamp
 * lines match and are recent. Does NOT call an RPC — recoverMessageAddress
 * is pure ECDSA recovery, so this has no dependency on chain uptime and
 * works for any EOA wallet (MetaMask/Rabby/OKX/Coinbase's own extension).
 * Smart-contract wallets (ERC-1271, e.g. Safe via WalletConnect) aren't
 * covered by this path — a real signature check for those needs an RPC call
 * against the contract, which this lightweight scheme deliberately skips.
 */
export async function verifyWalletSignature({ address, message, signature }: VerifyWalletSignatureParams): Promise<VerifyResult> {
  if (!isAddress(address)) return { ok: false, reason: "Invalid address." };

  const addressLine = message.match(/^Address:\s*(0x[a-fA-F0-9]{40})$/m)?.[1];
  const timestampLine = message.match(/^Timestamp:\s*(.+)$/m)?.[1];
  if (!addressLine || !timestampLine) return { ok: false, reason: "Malformed verification message." };
  if (addressLine.toLowerCase() !== address.toLowerCase()) return { ok: false, reason: "Address mismatch in message." };

  const signedAt = Date.parse(timestampLine);
  if (Number.isNaN(signedAt) || Date.now() - signedAt > RECENCY_WINDOW_MS) {
    return { ok: false, reason: "Signature expired — please reconnect and try again." };
  }

  try {
    const recovered = await recoverMessageAddress({ message, signature: signature as Hex });
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, reason: "Signature does not match the connected address." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Signature verification failed." };
  }
}
