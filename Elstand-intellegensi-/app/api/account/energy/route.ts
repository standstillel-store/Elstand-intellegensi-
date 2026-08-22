import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getEnergyBalance } from "@/lib/energy";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [state, { data: transactions }] = await Promise.all([
    getEnergyBalance(supabase, user.id),
    supabase.from("ai_token_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);

  return NextResponse.json({ ...state, transactions: transactions ?? [] });
}
