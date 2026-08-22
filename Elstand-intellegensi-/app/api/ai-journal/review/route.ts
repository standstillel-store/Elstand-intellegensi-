import { NextResponse } from "next/server";
import { getJournalEntryById } from "@/lib/elvoid/performance";
import { generateTradeReview } from "@/lib/elvoid/review";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";
import { runAiJournal } from "@/lib/ai/core/router";

// Phase: AI CORE ENGINE — new, additive route. Computed on demand for a
// single journal entry (rather than folded into GET /api/ai-journal's list
// response) so opening the Journal tab never fires N AI calls for N
// history rows — a real UI would call this only when the user opens one
// entry's detail/"AI review". Gated as "ai_journal_review", charged only
// when generateTradeReview()'s rule-based review actually got a narrated
// AI rewrite (see runAiJournal's own fallback-vs-ai contract).
export async function POST(req: Request) {
  let body: { journalEntryId?: string };
  try {
    body = (await req.json()) as { journalEntryId?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const journalEntryId = (body.journalEntryId ?? "").trim();
  if (!journalEntryId) return NextResponse.json({ error: "Sertakan journalEntryId." }, { status: 400 });

  const entry = await getJournalEntryById(journalEntryId);
  if (!entry) return NextResponse.json({ error: "Entri jurnal tidak ditemukan." }, { status: 404 });

  const gate = await reserveEnergy("ai_journal_review");
  if (!gate.ok) return gate.response;

  try {
    const review = generateTradeReview(entry);
    const aiJournal = await runAiJournal(entry, review);
    if (gate.reservation) await settleEnergy(gate.reservation, aiJournal.meta.source === "ai");
    return NextResponse.json({ review, aiJournal });
  } catch (err) {
    console.error("[ElVoid AI] ai-journal/review error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Gagal membuat review — coba lagi sebentar." }, { status: 500 });
  }
}
