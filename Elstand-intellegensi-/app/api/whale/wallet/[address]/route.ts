import { NextResponse } from "next/server";
import { getWalletDetail, refreshWalletEquity } from "@/features/whale-tracker/lib/walletEquity";

// Wallet Intelligence — spec: "Klik address harus membuka detail wallet."
// `?refresh=1` triggers a LIVE on-chain balance read (native + BEP-20
// balanceOf across this wallet's seen tokens) before returning — kept
// opt-in via query param rather than automatic on every click, since it's
// the one path in this feature that fires real RPC calls per request.
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Address BSC tidak valid." }, { status: 400 });
  }

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") === "1") {
      await refreshWalletEquity(address);
    }
    const detail = await getWalletDetail(address);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[Whale] /api/whale/wallet/[address]:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal memuat wallet intelligence." }, { status: 500 });
  }
}
