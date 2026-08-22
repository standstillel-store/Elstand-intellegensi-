import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/snapshot";
import { listSignals } from "@/lib/elvoid/signals";
import { detectAlerts } from "@/lib/alerts";

export const revalidate = 60;

export async function GET() {
  try {
    const [base, openSignals] = await Promise.all([getSnapshot(), listSignals({ status: ["new", "open", "tp1_hit"], limit: 30 })]);
    const alerts = detectAlerts(base, openSignals);
    return NextResponse.json({ alerts });
  } catch (err) {
    console.error("[ElVoid AI] alerts error:", err);
    return NextResponse.json({ alerts: [] });
  }
}
