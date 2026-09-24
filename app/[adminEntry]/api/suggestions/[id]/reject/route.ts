import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { rejectSuggestion } from "@/lib/suggestions/store";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "Alasan penolakan wajib diisi." }, { status: 400 });

  try {
    const suggestion = await rejectSuggestion(params.id, reason);
    if (!suggestion) {
      return NextResponse.json({ error: "Saran tidak ditemukan atau sudah diproses sebelumnya." }, { status: 409 });
    }

    const ip = getRequestIp(request as unknown as import("next/server").NextRequest);
    await logAdminAction("SUGGESTION_REJECTED", {
      ipHash: hashIp(ip),
      metadata: { suggestionId: suggestion.id, publicId: suggestion.public_id },
    }).catch(() => {});

    return NextResponse.json({ ok: true, publicId: suggestion.public_id });
  } catch (err) {
    console.error("[suggestions admin] reject failed:", err);
    return NextResponse.json({ error: "Gagal menolak saran." }, { status: 500 });
  }
}
