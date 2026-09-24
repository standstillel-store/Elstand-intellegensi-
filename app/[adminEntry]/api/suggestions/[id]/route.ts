import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { getSuggestionById } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const suggestion = await getSuggestionById(params.id);
    if (!suggestion) return NextResponse.json({ error: "Saran tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[suggestions admin] detail failed:", err);
    return NextResponse.json({ error: "Gagal memuat detail." }, { status: 500 });
  }
}
