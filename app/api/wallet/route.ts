import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ wallets: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .order("last_connected_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wallets: data });
}

export async function DELETE(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing wallet id." }, { status: 400 });

  // RLS (wallets_delete_own) already scopes this to auth.uid() = user_id —
  // the .eq("user_id", ...) below is defense in depth, not the only guard.
  const { data: deleted, error } = await supabase.from("wallets").delete().eq("id", id).eq("user_id", user.id).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Wallet not found." }, { status: 404 });

  await logActivity(supabase, user.id, "wallet_disconnected", { address: deleted.wallet_address });
  return NextResponse.json({ ok: true });
}
