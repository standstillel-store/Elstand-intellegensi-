import { NextResponse } from "next/server";
import { removeWatchlistCoin } from "@/lib/elvoid/watchlist";

export async function POST(req: Request) {
  let body: { coin?: string };
  try {
    body = (await req.json()) as { coin?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const result = await removeWatchlistCoin(body.coin ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ coins: result.coins });
}
