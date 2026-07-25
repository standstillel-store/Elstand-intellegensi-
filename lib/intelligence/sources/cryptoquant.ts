import { cached } from "@/lib/cache";

// ---------------------------------------------------------------------------
// CryptoQuant Exchange Flows — real Exchange Inflow / Outflow / Netflow for
// the Whale & Liquidity Intelligence panel's Whale Tracker cards.
//
// Provider: https://cryptoquant.com/docs (Data API).
// Needs CRYPTOQUANT_API_KEY in .env.local — without it this returns
// `undefined` and whaleLiquidity.ts falls back to the existing
// wallet-transfer-derived numbers (see the honesty note at the top of that
// file), same graceful-degrade rule as every other source in this folder.
//
// Honesty note — this is NOT a free-tier key like TwelveData/FRED/Alchemy:
// CryptoQuant only issues the Bearer access token on a Professional or
// Premium subscription (https://cryptoquant.com/pricing). Put a real token
// from Settings > API in CRYPTOQUANT_API_KEY once you're on that plan; a
// bad/expired token behaves exactly like a missing one (undefined, logged),
// it will not crash the dashboard.
//
// `exchange` defaults to `all_exchange`, CryptoQuant's own aggregate across
// every exchange it tracks — this is what should back a single "Exchange
// Inflow/Outflow" card rather than one specific venue. `window=hour` +
// `limit=2` pulls the freshest completed hourly bucket (the very latest
// bucket is sometimes partial) — see the openapi note on this endpoint that
// values for the newest points can still shift as wallet clustering updates.
// ---------------------------------------------------------------------------

const CRYPTOQUANT_BASE = "https://api.cryptoquant.com/v1";

export type CryptoQuantAsset = "btc" | "eth";

export interface ExchangeFlowReading {
  asset: string;
  exchange: string;
  window: "hour" | "day";
  /** Native-unit inflow/outflow/netflow for the latest completed bucket. */
  inflow: number;
  outflow: number;
  netflow: number;
  asOf: string;
}

interface CqEnvelope<T> {
  status: { code: number; message: string };
  result?: { window: string; data: T[] };
}
interface CqNetflowPoint {
  date?: string;
  datetime?: string;
  netflow_total: number | null;
}
interface CqInflowPoint {
  date?: string;
  datetime?: string;
  inflow_total: number | null;
}
interface CqOutflowPoint {
  date?: string;
  datetime?: string;
  outflow_total: number | null;
}

async function cqFetch<T>(path: string, params: Record<string, string>): Promise<T[] | undefined> {
  const apiKey = process.env.CRYPTOQUANT_API_KEY;
  if (!apiKey) return undefined;

  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${CRYPTOQUANT_BASE}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      // 401/403 here almost always means the key isn't on a Professional/
      // Premium plan yet (see honesty note above), not a code bug.
      console.error(`[cryptoquant] ${path}: HTTP ${res.status} ${res.statusText}`);
      return undefined;
    }
    const json = (await res.json()) as CqEnvelope<T>;
    if (json.status?.code !== 200 || !json.result?.data?.length) {
      console.error(`[cryptoquant] ${path}: ${json.status?.message ?? "empty result"}`);
      return undefined;
    }
    return json.result.data;
  } catch (err) {
    console.error(`[cryptoquant] ${path}: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

/**
 * Real exchange inflow + outflow + netflow for one asset, aggregated across
 * exchanges. Returns undefined on any failure (no key, wrong plan tier,
 * rate limit, network error) — callers should treat that exactly like the
 * existing "hasDirectionalData" fallback in whaleLiquidity.ts.
 */
export async function getExchangeFlow(asset: CryptoQuantAsset = "btc", exchange = "all_exchange"): Promise<ExchangeFlowReading | undefined> {
  return cached(`cq:flow:${asset}:${exchange}`, 60_000, async () => {
    const params = { exchange, window: "hour", limit: "2" };

    const [netflowData, inflowData, outflowData] = await Promise.all([
      cqFetch<CqNetflowPoint>(`/${asset}/exchange-flows/netflow`, params),
      cqFetch<CqInflowPoint>(`/${asset}/exchange-flows/inflow`, params),
      cqFetch<CqOutflowPoint>(`/${asset}/exchange-flows/outflow`, params),
    ]);
    if (!netflowData || !inflowData || !outflowData) return undefined;

    // [0] is the newest bucket in CryptoQuant's response ordering.
    const netflowPoint = netflowData[0];
    const inflowPoint = inflowData[0];
    const outflowPoint = outflowData[0];
    if (netflowPoint.netflow_total == null || inflowPoint.inflow_total == null || outflowPoint.outflow_total == null) {
      return undefined;
    }

    return {
      asset: asset.toUpperCase(),
      exchange,
      window: "hour",
      inflow: inflowPoint.inflow_total,
      outflow: outflowPoint.outflow_total,
      netflow: netflowPoint.netflow_total,
      asOf: inflowPoint.datetime ?? inflowPoint.date ?? new Date().toISOString(),
    };
  });
}
