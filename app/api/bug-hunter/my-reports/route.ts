import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { listBugReportsForUser } from "@/lib/bugHunter/store";

// Read-only list for the signed-in user's own "My Reports" view — mirrors
// what RLS already enforces at the DB layer (bug_reports_select_own), this
// route just gives the frontend a single fetch instead of a raw Supabase
// client call from the browser.
export async function GET() {
  const authClient = createSupabaseServerClient();
  if (!authClient) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ reports: [] });

  try {
    const reports = await listBugReportsForUser(user.id);
    return NextResponse.json({
      reports: reports.map((r) => ({
        publicId: r.public_id,
        title: r.title,
        severity: r.severity,
        status: r.status,
        rewardAmount: r.reward_amount,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[bug-hunter] my-reports failed:", err);
    return NextResponse.json({ reports: [] });
  }
}
