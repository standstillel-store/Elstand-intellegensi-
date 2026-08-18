import { NextResponse } from "next/server";
import { getJournalEntries } from "@/lib/elvoid/performance";
import { maskPremiumJournalEntries } from "@/lib/ai/oracle/presentation";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 200);
  const entries = await getJournalEntries(limit);
  return NextResponse.json({ entries: maskPremiumJournalEntries(entries) });
}
