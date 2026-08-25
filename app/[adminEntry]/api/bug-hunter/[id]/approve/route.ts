import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { approveBugReport, createClaimToken, getBugReportById } from "@/lib/bugHunter/store";
import { generateClaimToken } from "@/lib/bugHunter/claimToken";
import { sendUserApprovedEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 6 — approve.
//
// reward_amount comes ONLY from this admin-submitted body, never echoed
// from anything the reporting user sent (the report row never had a
// reward_amount column populated by the submit route at all). Approval and
// on-chain bounty creation are deliberately NOT the same step (Section 6:
// "Jangan langsung menganggap approval = payment") — the actual
// createBounty/fundBounty/approveBounty calls happen lazily, the first
// time the researcher opens their claim link (see
// app/api/bug-hunter/claim/[token]/route.ts), so approving ten reports in
// a row doesn't synchronously fire ten on-chain transactions the admin has
// to wait on, and ELS isn't locked in escrow for a report the researcher
// never comes back to claim.
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { rewardAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const rewardAmount = typeof body.rewardAmount === "number" ? body.rewardAmount : Number(body.rewardAmount);
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    return NextResponse.json({ error: "Reward amount harus angka positif." }, { status: 400 });
  }

  try {
    const report = await approveBugReport(params.id, { rewardAmount: rewardAmount.toString(), approvedBy: "admin" });
    if (!report) {
      return NextResponse.json({ error: "Laporan tidak ditemukan atau sudah diproses sebelumnya." }, { status: 409 });
    }

    const { rawToken, tokenHash, expiresAt } = generateClaimToken();
    await createClaimToken({ bugReportId: report.id, tokenHash, expiresAt });

    await sendUserApprovedEmail({
      toEmail: report.email,
      publicId: report.public_id,
      title: report.title,
      rewardAmount: rewardAmount.toString(),
      claimToken: rawToken,
    }).catch((err) => console.error("[bug-hunter admin] approval email failed:", err));

    const ip = getRequestIp(request as unknown as import("next/server").NextRequest);
    await logAdminAction("BUG_REPORT_APPROVED", {
      ipHash: hashIp(ip),
      metadata: { reportId: report.id, publicId: report.public_id, rewardAmount },
    }).catch(() => {});

    return NextResponse.json({ ok: true, publicId: report.public_id });
  } catch (err) {
    console.error("[bug-hunter admin] approve failed:", err);
    return NextResponse.json({ error: "Gagal menyetujui laporan." }, { status: 500 });
  }
}
