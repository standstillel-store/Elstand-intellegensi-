import { NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { normalizeWallet } from "@/lib/rewards/store";
import { verifyPaymentTransaction } from "@/lib/payments/verifier";
import { recordAndGrantPurchase, PurchaseAlreadyProcessedError } from "@/lib/payments/store";
import { PAYMENT_CONTRACT_CONFIG, PAYMENT_CONTRACT_CONFIGURED, isKnownProductId } from "@/lib/payments/config";

// POST /api/payments/verify — Phase 6.6.4. Same wallet-identity rule as
// /api/rewards/verify (see that route's header comment): walletAddress in
// the request body is UX-only, the wallet actually used for verification
// is always re-derived from the caller's linked-and-VERIFIED primary
// wallet, so a signed-in user can never claim a purchase made from a
// wallet they haven't proven ownership of.
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: { productId?: string; txHash?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { productId, txHash, walletAddress: claimedWalletAddress } = body;
  if (!productId || !txHash) {
    return NextResponse.json({ error: "missing_fields", message: "productId and txHash are required." }, { status: 400 });
  }
  if (!isHash(txHash)) return NextResponse.json({ status: "INVALID", reason: "Malformed transaction hash." }, { status: 400 });
  if (claimedWalletAddress !== undefined && !isAddress(claimedWalletAddress)) {
    return NextResponse.json({ status: "INVALID", reason: "Malformed wallet address." }, { status: 400 });
  }
  if (!isKnownProductId(productId)) {
    return NextResponse.json({ status: "INVALID", reason: `Unknown productId: ${productId}` }, { status: 400 });
  }
  if (!PAYMENT_CONTRACT_CONFIGURED) {
    return NextResponse.json({ status: "SYSTEM_ERROR", reason: "Payment is not yet configured on this deployment." }, { status: 503 });
  }

  const linkedWallet = await getPrimaryVerifiedWallet(supabase, user.id);
  if (!linkedWallet) {
    return NextResponse.json(
      { status: "INVALID", reason: "No verified wallet is linked to your account. Connect and verify a wallet in Settings before purchasing." },
      { status: 409 }
    );
  }
  if (claimedWalletAddress && normalizeWallet(claimedWalletAddress) !== normalizeWallet(linkedWallet.wallet_address)) {
    return NextResponse.json(
      { status: "INVALID", reason: "Your connected wallet doesn't match your verified linked wallet. Switch wallets, or update your primary wallet in Settings." },
      { status: 409 }
    );
  }
  const walletAddress = linkedWallet.wallet_address;

  try {
    const outcome = await verifyPaymentTransaction(txHash, walletAddress, productId);

    if (outcome.status === "SYSTEM_ERROR") {
      return NextResponse.json({ status: "SYSTEM_ERROR", reason: outcome.reason }, { status: 502 });
    }
    if (outcome.status === "INVALID") {
      return NextResponse.json({ status: "INVALID", reason: outcome.reason }, { status: 422 });
    }

    const grant = await recordAndGrantPurchase({
      userId: user.id,
      walletAddress,
      chainId: PAYMENT_CONTRACT_CONFIG.chainId,
      txHash,
      paymentId: outcome.paymentId,
      productId: outcome.productId,
      amountElsRaw: outcome.amount,
      blockNumber: outcome.blockNumber,
    });

    return NextResponse.json({ status: "GRANTED", ...grant });
  } catch (err) {
    if (err instanceof PurchaseAlreadyProcessedError) {
      // Not an error from the user's perspective — the purchase they're
      // asking about was already granted (e.g. a retried request after a
      // flaky network response). Report success, not failure.
      return NextResponse.json({ status: "ALREADY_GRANTED" });
    }
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[api/payments/verify]", message);
    return NextResponse.json({ status: "SYSTEM_ERROR", reason: "Payment verification service temporarily unavailable." }, { status: 500 });
  }
}
