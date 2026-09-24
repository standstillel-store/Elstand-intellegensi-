import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { createSuggestion } from "@/lib/suggestions/store";
import { SUGGESTION_CATEGORIES } from "@/lib/suggestions/config";
import { checkSuggestionSubmitRateLimit } from "@/lib/suggestions/rateLimit";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

// ---------------------------------------------------------------------------
// Phase 6.6.4 — Suggestion submission.
//
// Same wallet-trust rule as app/api/bug-hunter/report/route.ts (Section 3):
// if the requester is signed in AND has a verified primary wallet on file,
// the submitted wallet_address MUST match it exactly. Anonymous submissions
// are allowed without that cross-check.
//
// A submission alone never grants a reward — reward_amount / claim_id are
// never set here, only by the admin approve route.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Server belum dikonfigurasi. Coba lagi nanti." }, { status: 503 });
  }

  const ip = getRequestIp(request);
  const ipHash = hashIp(ip);
  const rateLimit = checkSuggestionSubmitRateLimit(ipHash);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti.", retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
  }

  let body: {
    title?: unknown;
    category?: unknown;
    description?: unknown;
    supportingInfo?: unknown;
    walletAddress?: unknown;
    email?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "").trim();
  const description = String(body.description ?? "").trim();
  const supportingInfo = body.supportingInfo ? String(body.supportingInfo).trim() : null;
  const walletAddress = String(body.walletAddress ?? "").trim();
  const email = body.email ? String(body.email).trim() : null;

  if (!title || title.length > 200) return NextResponse.json({ error: "Judul wajib diisi (maks 200 karakter)." }, { status: 400 });
  if (!SUGGESTION_CATEGORIES.includes(category as (typeof SUGGESTION_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Kategori tidak valid." }, { status: 400 });
  }
  if (!description || description.length > 5000) {
    return NextResponse.json({ error: "Deskripsi wajib diisi (maks 5000 karakter)." }, { status: 400 });
  }
  if (supportingInfo && supportingInfo.length > 5000) {
    return NextResponse.json({ error: "Informasi pendukung maks 5000 karakter." }, { status: 400 });
  }
  if (!isAddress(walletAddress)) return NextResponse.json({ error: "Alamat wallet BSC Testnet tidak valid." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });

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

  try {
    const suggestion = await createSuggestion({
      userId,
      walletAddress,
      email,
      title,
      category,
      description,
      supportingInfo,
    });
    return NextResponse.json({ ok: true, publicId: suggestion.public_id });
  } catch (err) {
    console.error("[suggestions] createSuggestion failed:", err);
    return NextResponse.json({ error: "Gagal menyimpan saran. Coba lagi." }, { status: 500 });
  }
}
