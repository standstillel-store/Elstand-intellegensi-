import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { getBugReportById } from "@/lib/bugHunter/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const report = await getBugReportById(params.id);
    if (!report) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[bug-hunter admin] detail failed:", err);
    return NextResponse.json({ error: "Gagal memuat detail laporan." }, { status: 500 });
  }
}
