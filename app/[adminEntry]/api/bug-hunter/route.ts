import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { listBugReports, type BugReportStatus } from "@/lib/bugHunter/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && ["PENDING", "APPROVED", "REJECTED", "CLAIMING", "REWARDED"].includes(statusParam) ? (statusParam as BugReportStatus) : undefined;

  try {
    const reports = await listBugReports(status);
    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        publicId: r.public_id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        walletAddress: r.wallet_address,
        email: r.email,
        status: r.status,
        rewardAmount: r.reward_amount,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[bug-hunter admin] list failed:", err);
    return NextResponse.json({ error: "Gagal memuat daftar laporan." }, { status: 500 });
  }
}
