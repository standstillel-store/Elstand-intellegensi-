import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { listSuggestions, type SuggestionStatus } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && ["PENDING", "APPROVED", "REJECTED", "CLAIMING", "CLAIMED"].includes(statusParam) ? (statusParam as SuggestionStatus) : undefined;

  try {
    const suggestions = await listSuggestions(status);
    return NextResponse.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        publicId: s.public_id,
        title: s.title,
        category: s.category,
        walletAddress: s.wallet_address,
        email: s.email,
        status: s.status,
        rewardAmount: s.reward_amount,
        baseRewardEls: s.base_reward_els,
        adminBonusEls: s.admin_bonus_els,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    console.error("[suggestions admin] list failed:", err);
    return NextResponse.json({ error: "Gagal memuat daftar saran." }, { status: 500 });
  }
}
