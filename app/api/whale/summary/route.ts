import { NextResponse } from "next/server";
import { getWhaleSummary } from "@/features/whale-tracker/lib/transfersStore";

export async function GET() {
  try {
    const summary = await getWhaleSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[Whale] /api/whale/summary:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal memuat ringkasan whale tracker." }, { status: 500 });
  }
}
