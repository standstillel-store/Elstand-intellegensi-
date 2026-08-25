import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { rejectBugReport } from "@/lib/bugHunter/store";
import { sendUserRejectedEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 1000) {
    return NextResponse.json({ error: "Alasan penolakan wajib diisi (maks 1000 karakter)." }, { status: 400 });
  }

  try {
    const report = await rejectBugReport(params.id, reason);
    if (!report) {
      return NextResponse.json({ error: "Laporan tidak ditemukan atau sudah diproses sebelumnya." }, { status: 409 });
    }

    await sendUserRejectedEmail({ toEmail: report.email, publicId: report.public_id, title: report.title, reason }).catch((err) =>
      console.error("[bug-hunter admin] rejection email failed:", err)
    );

    const ip = getRequestIp(request);
    await logAdminAction("BUG_REPORT_REJECTED", {
      ipHash: hashIp(ip),
      metadata: { reportId: report.id, publicId: report.public_id },
    }).catch(() => {});

    return NextResponse.json({ ok: true, publicId: report.public_id });
  } catch (err) {
    console.error("[bug-hunter admin] reject failed:", err);
    return NextResponse.json({ error: "Gagal menolak laporan." }, { status: 500 });
  }
}
