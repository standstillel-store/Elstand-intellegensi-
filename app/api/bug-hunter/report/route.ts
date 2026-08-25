import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { createBugReport, EVIDENCE_BUCKET } from "@/lib/bugHunter/store";
import { validateEvidenceImage, MAX_EVIDENCE_BYTES_LABEL } from "@/lib/bugHunter/imageValidation";
import { BUG_SEVERITIES, BUG_CATEGORIES } from "@/lib/bugHunter/config";
import { checkReportSubmitRateLimit } from "@/lib/bugHunter/rateLimit";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";
import { sendAdminNewReportEmail } from "@/lib/email";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 2/3/15 — bug report submission.
//
// Multipart form-data (not JSON) because of the evidence file. Every field
// that would determine reward/approval/researcher-identity (severity is
// accepted, but it's advisory only — Section 2 explicitly lists severity
// among fields the server must never TRUST as authoritative; the admin's
// own judgement on approve is what actually matters) is server-validated
// against a fixed allowlist, never templated from arbitrary client input.
//
// Wallet trust (Section 3): if the requester is signed in AND has a
// verified primary wallet on file, the submitted wallet_address MUST match
// it exactly — this is what stops "submit wallet A, but my verified
// account is wallet B" from redirecting a reward. Anonymous (not signed
// in) submissions are still allowed (Section 2 says "user ID jika
// tersedia" — optional), just without that cross-check; the admin sees
// user_id = null on review.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Server belum dikonfigurasi. Coba lagi nanti." }, { status: 503 });
  }

  const ip = getRequestIp(request);
  const ipHash = hashIp(ip);
  const rateLimit = checkReportSubmitRateLimit(ipHash);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti.", retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Form tidak valid." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const severity = String(form.get("severity") ?? "").trim().toLowerCase();
  const description = String(form.get("description") ?? "").trim();
  const reproductionSteps = String(form.get("reproductionSteps") ?? "").trim();
  const expectedBehavior = String(form.get("expectedBehavior") ?? "").trim();
  const actualBehavior = String(form.get("actualBehavior") ?? "").trim();
  const impact = String(form.get("impact") ?? "").trim();
  const walletAddress = String(form.get("walletAddress") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const confirmed = form.get("confirmed") === "true";
  const evidenceFile = form.get("evidence");

  // --- required-field validation -----------------------------------------
  if (!title || title.length > 200) return NextResponse.json({ error: "Judul bug wajib diisi (maks 200 karakter)." }, { status: 400 });
  if (!BUG_CATEGORIES.includes(category as (typeof BUG_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Kategori tidak valid." }, { status: 400 });
  }
  if (!BUG_SEVERITIES.includes(severity as (typeof BUG_SEVERITIES)[number])) {
    return NextResponse.json({ error: "Severity tidak valid." }, { status: 400 });
  }
  for (const [label, value] of [
    ["description", description],
    ["reproductionSteps", reproductionSteps],
    ["expectedBehavior", expectedBehavior],
    ["actualBehavior", actualBehavior],
    ["impact", impact],
  ] as const) {
    if (!value || value.length > 5000) {
      return NextResponse.json({ error: `Field "${label}" wajib diisi (maks 5000 karakter).` }, { status: 400 });
    }
  }
  if (!isAddress(walletAddress)) return NextResponse.json({ error: "Alamat wallet BSC Testnet tidak valid." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });
  if (!confirmed) return NextResponse.json({ error: "Kamu harus mencentang konfirmasi akurasi laporan." }, { status: 400 });
  if (!(evidenceFile instanceof File)) return NextResponse.json({ error: "Screenshot/evidence wajib disertakan." }, { status: 400 });

  // --- evidence validation (Section 15: never trust client MIME type) ----
  const bytes = Buffer.from(await evidenceFile.arrayBuffer());
  const validated = validateEvidenceImage(bytes);
  if (!validated) {
    return NextResponse.json({ error: `Evidence harus berupa file JPEG/PNG valid (maks ${MAX_EVIDENCE_BYTES_LABEL}).` }, { status: 400 });
  }

  // --- identity / wallet trust (Section 3) --------------------------------
  let userId: string | null = null;
  const authClient = createSupabaseServerClient();
  if (authClient) {
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (user) {
      userId = user.id;
      const sb = getSupabase();
      const verifiedWallet = sb ? await getPrimaryVerifiedWallet(sb, user.id) : null;
      if (verifiedWallet && verifiedWallet.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "Wallet yang dikirim tidak cocok dengan wallet terverifikasi di akunmu." },
          { status: 400 }
        );
      }
    }
  }

  // --- upload evidence (random filename, never user-controlled path) -----
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Storage tidak tersedia." }, { status: 500 });

  const objectPath = `${randomUUID()}.${validated.ext}`;
  const { error: uploadError } = await sb.storage.from(EVIDENCE_BUCKET).upload(objectPath, bytes, {
    contentType: validated.contentType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[bug-hunter] evidence upload failed:", uploadError.message);
    return NextResponse.json({ error: `Upload evidence gagal — pastikan bucket Storage "${EVIDENCE_BUCKET}" sudah dibuat.` }, { status: 500 });
  }

  // --- create report row ---------------------------------------------------
  let report;
  try {
    report = await createBugReport({
      userId,
      walletAddress,
      email,
      title,
      category,
      severity: severity as (typeof BUG_SEVERITIES)[number],
      description,
      reproductionSteps,
      expectedBehavior,
      actualBehavior,
      impact,
      evidencePath: objectPath,
    });
  } catch (err) {
    console.error("[bug-hunter] createBugReport failed:", err);
    return NextResponse.json({ error: "Gagal menyimpan laporan. Coba lagi." }, { status: 500 });
  }

  // Fire-and-forget: an email failure must never fail the submission
  // itself (Section 20) — the report already exists and is visible in the
  // admin dashboard regardless.
  sendAdminNewReportEmail({
    publicId: report.public_id,
    title: report.title,
    severity: report.severity,
    walletAddress: report.wallet_address,
    createdAt: report.created_at,
  }).catch((err) => console.error("[bug-hunter] admin notification email failed:", err));

  return NextResponse.json({ ok: true, publicId: report.public_id });
}
