import { NextResponse } from "next/server";
import { getWhaleTransfers } from "@/features/whale-tracker/lib/transfersStore";
import { DEFAULT_PAGE_SIZE } from "@/features/whale-tracker/lib/config";
import type { TransferFilters } from "@/features/whale-tracker/types";

// All Transfers table data source. Server-side pagination + filtering only
// — spec: "Pagination harus dilakukan di server/database, bukan mengambil
// ribuan rows ke browser." The browser never talks to Supabase directly for
// this data (no service-role key ever reaches the client bundle).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE));

  const filters: TransferFilters = {
    minUsd: url.searchParams.get("minUsd") ? Number(url.searchParams.get("minUsd")) : undefined,
    tokenSymbol: url.searchParams.get("token") ?? undefined,
    address: url.searchParams.get("address") ?? undefined,
    fromAddress: url.searchParams.get("from") ?? undefined,
    toAddress: url.searchParams.get("to") ?? undefined,
    sinceIso: url.searchParams.get("since") ?? undefined,
    untilIso: url.searchParams.get("until") ?? undefined,
  };

  try {
    const result = await getWhaleTransfers(filters, page, pageSize);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Whale] /api/whale/transfers:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gagal memuat whale transfers." }, { status: 500 });
  }
}
