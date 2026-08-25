import { NextResponse, type NextRequest } from "next/server";
import { keccak256, toHex, isAddress } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { getClaimTokenWithReport } from "@/lib/bugHunter/store";
import { ensureBountyPrepared } from "@/lib/bugHunter/onchain";
import { setBugReportBountyId } from "@/lib/bugHunter/store";
import { checkClaimRateLimit } from "@/lib/bugHunter/rateLimit";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";
import { BUG_BOUNTY_ESCROW_CONFIGURED, getBugBountyEscrowAddress } from "@/lib/bugHunter/config";
import { logAdminAction } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 9/11 — claim info + on-chain preparation.
//
// Order of checks matters and mirrors Section 9's numbered list exactly:
// token valid -> not expired -> not used -> report APPROVED -> reward not
// yet claimed -> wallet ownership still valid -> THEN touch the chain.
// Every one of those is a reason to stop before spending gas.
//
// bountyId is derived deterministically from the report's own id (same
// "reuse an existing unique identity as the on-chain nonce" pattern as
// lib/rewards/distributor.ts's claimIdFromSubmissionId) — never accepted
// from the client (Section 11: "Jangan percaya bounty ID dari client").
// ---------------------------------------------------------------------------

function bountyIdForReport(reportId: string): `0x${string}` {
  return keccak256(toHex(reportId));
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const ip = getRequestIp(request);
  const ipHash = hashIp(ip);
  const rateLimit = checkClaimRateLimit(ipHash);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  if (!BUG_BOUNTY_ESCROW_CONFIGURED || !getBugBountyEscrowAddress()) {
    return NextResponse.json({ error: "Escrow contract belum dikonfigurasi." }, { status: 503 });
  }

  const lookup = await getClaimTokenWithReport(params.token).catch(() => null);
  if (!lookup) return NextResponse.json({ error: "Link klaim tidak valid." }, { status: 404 });
  const { token, report } = lookup;

  if (token.used_at) return NextResponse.json({ error: "Link klaim ini sudah pernah digunakan." }, { status: 410 });
  if (new Date(token.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Link klaim sudah kedaluwarsa." }, { status: 410 });
  if (report.status === "REWARDED") return NextResponse.json({ error: "Reward untuk laporan ini sudah diklaim." }, { status: 409 });
  if (report.status !== "APPROVED" && report.status !== "CLAIMING") {
    return NextResponse.json({ error: "Laporan ini belum berstatus APPROVED." }, { status: 409 });
  }
  if (!report.reward_amount) return NextResponse.json({ error: "Reward belum ditentukan." }, { status: 409 });

  // Wallet ownership re-check at claim time (Section 9 point 6) — if the
  // researcher is signed in, their currently-verified primary wallet must
  // still match the wallet the report was filed under. Catches the case
  // where wallet verification was revoked/changed between report
  // submission and claim.
  const authClient = createSupabaseServerClient();
  if (authClient) {
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (user) {
      const sb = getSupabase();
      const verifiedWallet = sb ? await getPrimaryVerifiedWallet(sb, user.id) : null;
      if (verifiedWallet && verifiedWallet.wallet_address.toLowerCase() !== report.wallet_address.toLowerCase()) {
        return NextResponse.json({ error: "Wallet yang terhubung tidak cocok dengan wallet researcher pada laporan ini." }, { status: 403 });
      }
    }
  }

  if (!isAddress(report.wallet_address)) {
    return NextResponse.json({ error: "Wallet pada laporan tidak valid." }, { status: 500 });
  }

  const bountyId = bountyIdForReport(report.id);
  const amountWei = BigInt(Math.round(Number(report.reward_amount) * 10 ** 18));
  const expiryTimeSeconds = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60); // 30 days from now

  const prepared = await ensureBountyPrepared({
    bountyId,
    researcherWallet: report.wallet_address as `0x${string}`,
    amountWei,
    expiryTimeSeconds,
  });

  if (!prepared.ok) {
    await logAdminAction("BUG_CLAIM_FAILED", { metadata: { reportId: report.id, reason: prepared.reason, detail: prepared.detail } }).catch(() => {});
    return NextResponse.json({ error: `Gagal menyiapkan bounty di blockchain (${prepared.reason}). Hubungi admin.` }, { status: 502 });
  }

  if (report.bounty_id !== bountyId) {
    await setBugReportBountyId(report.id, bountyId).catch(() => {});
  }

  return NextResponse.json({
    publicId: report.public_id,
    title: report.title,
    rewardAmount: report.reward_amount,
    researcherWallet: report.wallet_address,
    bountyId,
    escrowAddress: getBugBountyEscrowAddress(),
    status: report.status,
  });
}
