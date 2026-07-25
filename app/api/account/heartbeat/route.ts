import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { touchLastActive } from "@/lib/auth/profile";
import { touchDevice } from "@/lib/activityLog";
import { parseDeviceLabel } from "@/lib/device";

// Called every few minutes by <ActivityHeartbeat /> (mounted in
// app/layout.tsx) while a signed-in user has the app open — this is what
// "Last Active" actually means (currently using the app), as opposed to
// "Last Login" (the moment they signed in, tracked separately in
// app/auth/callback/route.ts). Deliberately NOT done in middleware: that
// runs on every single navigation on the Edge runtime, and a DB write on
// every request would add latency to the hot path for no real benefit —
// a five-minute-resolution "active" signal is all this needs.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false });

  const userAgent = request.headers.get("user-agent") ?? "";
  await Promise.all([touchLastActive(supabase, user.id), touchDevice(supabase, user.id, parseDeviceLabel(userAgent), userAgent)]);

  return NextResponse.json({ ok: true });
}
