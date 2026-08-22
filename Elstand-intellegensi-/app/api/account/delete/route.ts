import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activityLog";

// Deleting auth.users via the ADMIN API requires SUPABASE_SERVICE_ROLE_KEY
// (lib/supabase.ts's getSupabase(), the same client the trading engine uses
// for its own single-tenant tables) — the anon-key session client can never
// do this itself, by design. Cascades through ON DELETE CASCADE to
// public.users and everything chained from it (profiles, wallets, devices,
// ai_token[_transactions], user_settings, activity_log, payment_history,
// topup_history, wallet_topup — see the Phase 3 section of
// supabase/schema.sql). Does NOT touch ai_signals/ai_journal/paper_wallet —
// those are the shared single-tenant Paper Trader tables, unrelated to any
// one account (see the note in schema.sql for why).
export async function POST() {
  const userClient = createSupabaseServerClient();
  if (!userClient) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const adminClient = getSupabase();
  if (!adminClient) {
    return NextResponse.json({ error: "Penghapusan akun butuh SUPABASE_SERVICE_ROLE_KEY di server — belum dikonfigurasi." }, { status: 503 });
  }

  // Logged before deletion — this row (and this user's whole activity_log
  // with it) is about to cease to exist.
  await logActivity(userClient, user.id, "account_delete_requested");

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[api/account/delete] deleteUser failed:", error.message);
    return NextResponse.json({ error: "Gagal menghapus akun — coba lagi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
