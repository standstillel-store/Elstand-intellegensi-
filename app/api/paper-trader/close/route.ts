import { NextResponse } from "next/server";
import { closeSignalManually } from "@/lib/elvoid/paperTrader";
import { getTopMarkets } from "@/lib/coingecko";

export async function POST(req: Request) {
  let body: { signalId?: string; coin?: string };
  try {
    body = (await req.json()) as { signalId?: string; coin?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  if (!body.signalId || !body.coin) {
    return NextResponse.json({ error: "signalId dan coin wajib diisi." }, { status: 400 });
  }

  const markets = await getTopMarkets(200).catch(() => []);
  const market = markets.find((m) => m.symbol.toUpperCase() === body.coin!.toUpperCase());
  if (!market) return NextResponse.json({ error: "Harga live untuk coin ini tidak ditemukan." }, { status: 404 });

  const result = await closeSignalManually(body.signalId, market.current_price);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
