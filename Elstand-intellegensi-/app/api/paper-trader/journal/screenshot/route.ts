import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "trade-screenshots";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Accepts { journalId, filename, dataUrl } where dataUrl is a base64
 * "data:image/png;base64,..." string from the browser's FileReader. Uploads
 * to the "trade-screenshots" Storage bucket (see supabase/schema.sql for the
 * one-time bucket setup note) and writes the resulting public URL onto the
 * matching ai_journal row. Runs server-side only — the service-role key
 * never reaches the browser, same rule as every other Supabase write here.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase belum dikonfigurasi — lihat Settings untuk instruksi setup." }, { status: 400 });
  }

  let body: { journalId?: string; filename?: string; dataUrl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const { journalId, filename, dataUrl } = body;
  if (!journalId || !dataUrl || !dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "journalId dan dataUrl (image) wajib disertakan." }, { status: 400 });
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Format image tidak dikenali." }, { status: 400 });
  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File terlalu besar (maks 5MB)." }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase client tidak tersedia." }, { status: 500 });

  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const path = `${journalId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) {
    console.error("[ElVoid AI] screenshot upload error:", uploadError.message);
    return NextResponse.json(
      { error: `Upload gagal — pastikan bucket Storage "${BUCKET}" sudah dibuat (lihat supabase/schema.sql).` },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = sb.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicUrlData.publicUrl;

  const { error: updateError } = await sb.from("ai_journal").update({ screenshot_url: publicUrl }).eq("id", journalId);
  if (updateError) {
    console.error("[ElVoid AI] journal screenshot_url update error:", updateError.message);
    return NextResponse.json({ error: "Upload berhasil tapi gagal menyimpan URL ke jurnal." }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl, filename: filename ?? path });
}
