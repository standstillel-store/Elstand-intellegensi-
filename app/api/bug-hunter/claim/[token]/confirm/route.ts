import { NextResponse, type NextRequest } from "next/server";
import { keccak256, toHex, isHash } from "viem";
import { getClaimTokenWithReport, markBugReportClaiming, markBugReportRewarded, revertBugReportClaiming, markClaimTokenUsed } from "@/lib/bugHunter/store";
import { verifyClaimTransaction } from "@/lib/bugHunter/onchain";
import { getBugBountyEscrowAddress } from "@/lib/bugHunter/config";
import { checkClaimRateLimit } from "@/lib/bugHunter/rateLimit";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";
import { logAdminAction } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 11/13/14/20 — finalize claim after the researcher's
// wallet has already signed and submitted claimBounty() directly.
//
// This route NEVER submits a transaction itself — by the time it's called,
// the tx already exists on-chain (or failed) from the researcher's own
// wallet. This route's only job is: confirm it really landed, really
// targeted this bounty, really came from the researcher's own wallet, and
// really left the bounty CLAIMED — then, and only then, flip the database
// to REWARDED.
//
// APPROVED -> CLAIMING happens BEFORE verification starts (closes the
// window where two confirm calls for the same report could both proceed
// past the status check), and rolls back to APPROVED if verification
// fails, so a legitimate retry (Section 20: "retry harus idempotent") is
// still possible instead of the report being stuck.
// ---------------------------------------------------------------------------

function bountyIdForReport(reportId: string): `0x${string}` {
  return keccak256(toHex(reportId));
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const ip = getRequestIp(request);
  const ipHash = hashIp(ip);
  const rateLimit = checkClaimRateLimit(ipHash);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  let body: { txHash?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  if (!isHash(txHash)) return NextResponse.json({ error: "Transaction hash tidak valid." }, { status: 400 });

  const lookup = await getClaimTokenWithReport(params.token).catch(() => null);
  if (!lookup) return NextResponse.json({ error: "Link klaim tidak valid." }, { status: 404 });
  const { token, report } = lookup;

  if (new Date(token.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Link klaim sudah kedaluwarsa." }, { status: 410 });
  if (report.status === "REWARDED") return NextResponse.json({ error: "Reward untuk laporan ini sudah diklaim." }, { status: 409 });

  const escrowAddress = getBugBountyEscrowAddress();
  if (!escrowAddress) return NextResponse.json({ error: "Escrow contract belum dikonfigurasi." }, { status: 503 });

  const claiming = await markBugReportClaiming(report.id);
  if (!claiming) {
    return NextResponse.json({ error: "Laporan sedang diproses atau statusnya sudah berubah. Refresh halaman." }, { status: 409 });
  }

  await logAdminAction("BUG_CLAIM_INITIATED", { ipHash, metadata: { reportId: report.id, txHash } }).catch(() => {});

  const bountyId = bountyIdForReport(report.id);
  const verified = await verifyClaimTransaction({
    txHash: txHash as `0x${string}`,
    bountyId,
    expectedResearcher: report.wallet_address as `0x${string}`,
  });

  if (!verified.ok) {
    await revertBugReportClaiming(report.id).catch(() => {});
    await logAdminAction("BUG_CLAIM_FAILED", { ipHash, metadata: { reportId: report.id, reason: verified.reason, detail: verified.detail } }).catch(() => {});
    return NextResponse.json({ error: `Verifikasi transaksi gagal (${verified.reason}). Silakan coba lagi.` }, { status: 400 });
  }

  const rewarded = await markBugReportRewarded(report.id, txHash);
  if (!rewarded) {
    return NextResponse.json({ error: "Gagal menyelesaikan status klaim. Hubungi admin dengan tx hash ini." }, { status: 500 });
  }

  // One-time-use: mark the token used only now, at the point of confirmed
  // success — not earlier, so a failed attempt doesn't burn the
  // researcher's only claim link.
  await markClaimTokenUsed(token.id).catch(() => {});

  await logAdminAction("BUG_CLAIM_COMPLETED", { ipHash, metadata: { reportId: report.id, txHash } }).catch(() => {});

  return NextResponse.json({
    ok: true,
    publicId: rewarded.public_id,
    rewardAmount: rewarded.reward_amount,
    txHash,
    walletAddress: rewarded.wallet_address,
  });
}
