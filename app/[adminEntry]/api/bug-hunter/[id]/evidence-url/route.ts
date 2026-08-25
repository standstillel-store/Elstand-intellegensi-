import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { getBugReportById, EVIDENCE_BUCKET } from "@/lib/bugHunter/store";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Section 15: "jangan expose arbitrary filesystem path" — the bucket is
// private, so evidence is only ever viewable through a short-lived signed
// URL minted here, server-side, after an admin session check. Nothing
// exposes bug_reports.evidence_path directly to the browser as a public
// URL anywhere else in this integration.
export async function GET(_request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Storage tidak tersedia." }, { status: 500 });

  try {
    const report = await getBugReportById(params.id);
    if (!report) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });

    const { data, error } = await sb.storage.from(EVIDENCE_BUCKET).createSignedUrl(report.evidence_path, 300); // 5 minutes
    if (error || !data) throw new Error(error?.message ?? "signed_url_failed");

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error("[bug-hunter admin] evidence-url failed:", err);
    return NextResponse.json({ error: "Gagal memuat evidence." }, { status: 500 });
  }
}
