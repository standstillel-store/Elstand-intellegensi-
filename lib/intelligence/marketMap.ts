import type { NewsItem } from "@/lib/types";
import type { GlobalSentimentReading, ReasoningChainStep } from "./globalSentiment";
import { buildReasoningChain } from "./globalSentiment";
import type { MacroEventView, MacroCategory } from "./macroEvents";
import type { MarketSeriesReading } from "./sources/twelvedata";
import type { StocksReading } from "./sources/stocks";
import type { SectorRotationRow } from "./sectorRotation";
import type { AltcoinScannerRow } from "./altcoinScanner";
import type { StablecoinReading } from "@/lib/stablecoins";
import type { InstitutionalFlowData } from "./institutionalFlow";
import { deriveTrend, computeAssetAiScore, type DisplayTone } from "./shared";

// ---------------------------------------------------------------------------
// Global Market Intelligence Map V4 — "AI relationship graph" data model.
//
// V4 restructure (see CHANGES.md): the map is now a 4-tier tree —
//   tier 0: "global"   — the AI Hub, the map's literal center node
//   tier 1: 6 categories — crypto / forex / stocks / macro / news / sentiment
//   tier 2: each category's real assets/metrics
//   tier 3: altcoin's individual coins (sol/bnb/xrp/link/sui/render)
// `sections` keeps working exactly as before (list/stats/chart/text/chain) —
// every node, at every tier, still carries the same MarketMapNode shape, so
// the tree layout / drawer / line-renderer code doesn't need to know which
// tier it's drawing.
//
// Honesty rule carried over unchanged from V2/V3: every node has
// `connected: boolean`. false means "no live source wired for this yet" —
// the UI renders "Waiting for API Connection", never a fabricated number.
// A few of the new leaf nodes (dex, twitter, telegram) currently have no
// real source at all and are ALWAYS connected:false — they exist as real,
// clickable graph nodes (so the taxonomy Karin asked for is fully there to
// grow into) but never pretend to have data they don't.
//
// Where a new node's source is just "read something the app already
// computes, one level more granular" (individual stock tickers, individual
// FX pairs, individual macro-event categories, individual news sources,
// individual altcoins), it's wired to the SAME underlying values already
// used elsewhere on the dashboard (see CHANGES.md V4.1 for the exact list)
// — no new "is this bullish" rules were invented, only more of what's
// already computed got surfaced as its own node.
// ---------------------------------------------------------------------------

export type MarketMapNodeId =
  | "global"
  // Level 1 — six categories around the hub
  | "crypto"
  | "forex"
  | "stocks"
  | "macro"
  | "news"
  | "sentiment"
  // Level 2 — crypto
  | "btc"
  | "eth"
  | "altcoin"
  | "stablecoin"
  | "dex"
  // Level 2 — forex (+ gold, folded in here — see CHANGES.md V4.1)
  | "usd"
  | "eur"
  | "gbp"
  | "jpy"
  | "cny"
  | "gold"
  // Level 2 — stocks
  | "nasdaq"
  | "sp500"
  | "nvda"
  | "aapl"
  | "tsla"
  // Level 2 — macro
  | "interestrate"
  | "cpi"
  | "ppi"
  | "nfp"
  | "gdp"
  // Level 2 — news
  | "reuters"
  | "bloomberg"
  | "twitter"
  | "telegram"
  | "coindesk"
  // Level 2 — sentiment
  | "feargreed"
  | "funding"
  | "openinterest"
  | "whale"
  | "etfflow"
  // Level 3 — altcoin's own children
  | "sol"
  | "bnb"
  | "xrp"
  | "link"
  | "sui"
  | "render";

export interface MarketMapEdge {
  from: MarketMapNodeId;
  to: MarketMapNodeId;
}

export const MARKET_MAP_EDGES: MarketMapEdge[] = [
  { from: "global", to: "crypto" },
  { from: "global", to: "forex" },
  { from: "global", to: "stocks" },
  { from: "global", to: "macro" },
  { from: "global", to: "news" },
  { from: "global", to: "sentiment" },

  { from: "crypto", to: "btc" },
  { from: "crypto", to: "eth" },
  { from: "crypto", to: "altcoin" },
  { from: "crypto", to: "stablecoin" },
  { from: "crypto", to: "dex" },

  { from: "forex", to: "usd" },
  { from: "forex", to: "eur" },
  { from: "forex", to: "gbp" },
  { from: "forex", to: "jpy" },
  { from: "forex", to: "cny" },
  { from: "forex", to: "gold" },

  { from: "stocks", to: "nasdaq" },
  { from: "stocks", to: "sp500" },
  { from: "stocks", to: "nvda" },
  { from: "stocks", to: "aapl" },
  { from: "stocks", to: "tsla" },

  { from: "macro", to: "interestrate" },
  { from: "macro", to: "cpi" },
  { from: "macro", to: "ppi" },
  { from: "macro", to: "nfp" },
  { from: "macro", to: "gdp" },

  { from: "news", to: "reuters" },
  { from: "news", to: "bloomberg" },
  { from: "news", to: "twitter" },
  { from: "news", to: "telegram" },
  { from: "news", to: "coindesk" },

  { from: "sentiment", to: "feargreed" },
  { from: "sentiment", to: "funding" },
  { from: "sentiment", to: "openinterest" },
  { from: "sentiment", to: "whale" },
  { from: "sentiment", to: "etfflow" },

  { from: "altcoin", to: "sol" },
  { from: "altcoin", to: "bnb" },
  { from: "altcoin", to: "xrp" },
  { from: "altcoin", to: "link" },
  { from: "altcoin", to: "sui" },
  { from: "altcoin", to: "render" },

  // A few deliberate cross-branch relationships (not just parent->child) —
  // this is what makes it a *relationship graph* rather than a plain tree.
  // Kept small and specific rather than connecting everything to
  // everything, which would just be visual noise.
  { from: "usd", to: "crypto" },
  { from: "stocks", to: "crypto" },
  { from: "macro", to: "sentiment" },
];

export interface MarketMapMetric {
  label: string;
  value: string;
  tone: DisplayTone;
  connected: boolean;
}

export interface DrawerListItem {
  label: string;
  detail?: string;
  tone?: DisplayTone;
  timestamp?: string;
  url?: string;
}

export type DrawerSection =
  | { kind: "stats"; items: MarketMapMetric[] }
  | { kind: "list"; title: string; items: DrawerListItem[] }
  | { kind: "chart"; label: string; series: number[]; connected: boolean }
  | { kind: "text"; title: string; body: string }
  | { kind: "chain"; steps: ReasoningChainStep[]; verdict: { label: string; tone: DisplayTone; confidence: number } };

export interface MarketMapNode {
  id: MarketMapNodeId;
  code: string;
  title: string;
  /** 0 = hub, 1 = category, 2 = asset/metric, 3 = altcoin leaf. Purely a layout/styling hint. */
  tier: 0 | 1 | 2 | 3;
  tone: DisplayTone;
  connected: boolean;
  /** For tier 1/2 category nodes: their own children's ids, so the panel can list "related assets" without re-deriving it from the edge list every render. */
  childIds?: MarketMapNodeId[];
  summary: string;
  cardMetric: MarketMapMetric;
  aiExplanation: string;
  narrative: { up: string; down: string; neutral: string };
  /** One-line "what just happened" — the panel's "Latest Event" field. Undefined when nothing timestamped is available for this node. */
  latestEvent?: string;
  /** 0-100 where this node genuinely has one (AI Score, sentiment confidence) — never a fabricated fallback. Undefined hides the field entirely. */
  confidence?: number;
  sections: DrawerSection[];
}

export interface MarketMapLiveInputs {
  sentiment: GlobalSentimentReading;
  macroEvents: MacroEventView[];
  newsItems: NewsItem[];
  usd?: MarketSeriesReading;
  gold?: MarketSeriesReading;
  eur?: MarketSeriesReading;
  gbp?: MarketSeriesReading;
  jpy?: MarketSeriesReading;
  cny?: MarketSeriesReading;
  stocks?: StocksReading;
  totalMarketCapUsd?: number;
  totalMarketCapChange24h?: number;
  totalVolume24hUsd?: number;
  btcDominance?: number;
  ethDominance?: number;
  btc?: { price: number; change24h?: number; change7d?: number; volume24h?: number };
  eth?: { price: number; change24h?: number; change7d?: number; volume24h?: number };
  btcFundingRate?: number;
  btcOpenInterestUsd?: number;
  ethFundingRate?: number;
  ethOpenInterestUsd?: number;
  fngValue?: number;
  btcWhaleNote?: string;
  ethWhaleNote?: string;
  altseasonIndex?: number;
  altcoinTopGainer?: { symbol: string; change24h: number };
  altcoinTopLoser?: { symbol: string; change24h: number };
  sectorRotation?: SectorRotationRow[];
  /** Full Altcoin Scanner rows — the source for sol/bnb/xrp/link/sui/render leaf nodes (looked up by symbol, not refetched). */
  altcoinScannerRows?: AltcoinScannerRow[];
  stablecoin?: StablecoinReading;
  etfFlow?: InstitutionalFlowData;
}

const WAITING = "Menunggu API";

function metric(label: string, value: string, tone: DisplayTone, connected: boolean): MarketMapMetric {
  return connected ? { label, value, tone, connected } : { label, value: WAITING, tone: "neutral", connected: false };
}

function average(nums: number[]): number | undefined {
  const valid = nums.filter((n) => isFinite(n));
  if (!valid.length) return undefined;
  return valid.reduce((s, n) => s + n, 0) / valid.length;
}

function fmtPctSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtUsdShort(n?: number): string {
  if (n === undefined || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Majority-tone summary for a category hub, from its already-built children. Ties / no connected children -> neutral — this never invents a lean the children don't actually show. */
function summarizeChildTone(children: MarketMapNode[]): DisplayTone {
  const connected = children.filter((c) => c.connected);
  if (!connected.length) return "neutral";
  const score = connected.reduce((s, c) => s + (c.tone === "up" ? 1 : c.tone === "down" ? -1 : 0), 0);
  if (score > 0) return "up";
  if (score < 0) return "down";
  return connected.some((c) => c.tone === "amber") ? "amber" : "neutral";
}

/** Every category hub gets the same "here are my children at a glance" section, reusing each child's own already-computed cardMetric/tone — no separate summary logic per hub. */
function childListSection(children: MarketMapNode[], title = "Cabang"): DrawerSection {
  return {
    kind: "list",
    title,
    items: children.map(
      (c): DrawerListItem => ({
        label: c.title,
        detail: c.connected ? c.cardMetric.value : WAITING,
        tone: c.connected ? c.tone : "neutral",
      })
    ),
  };
}

function fmtCoinPrice(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Tier 0 — the new center node.
// ---------------------------------------------------------------------------

function buildGlobalNode(live: MarketMapLiveInputs): MarketMapNode {
  const s = live.sentiment;
  const connected = s.signalsAvailable > 0;
  const tone: DisplayTone = s.status === "risk-on" ? "up" : s.status === "risk-off" ? "down" : s.status === "transition" ? "amber" : "neutral";
  const statusLabel = s.status === "risk-on" ? "Risk On" : s.status === "risk-off" ? "Risk Off" : s.status === "transition" ? "Transition" : "Neutral";

  return {
    id: "global",
    code: "AI",
    title: "Global Market",
    tier: 0,
    tone,
    connected,
    childIds: ["crypto", "forex", "stocks", "macro", "news", "sentiment"],
    summary: s.note ?? `${statusLabel} dengan confidence ${s.confidence}% dari ${s.signalsAvailable} sinyal lintas kategori.`,
    cardMetric: metric("AI Verdict", statusLabel, tone, connected),
    aiExplanation: `${statusLabel} — dibaca dari seluruh cabang peta (Crypto, Forex, Stocks, Macro, News, Sentiment), ${s.signalsAvailable} sinyal aktif saat ini.`,
    latestEvent: s.reasons[0]?.text,
    confidence: connected ? s.confidence : undefined,
    narrative: {
      up: "Mayoritas cabang membaca risk-on -> likuiditas mengalir ke aset berisiko termasuk crypto.",
      down: "Mayoritas cabang membaca risk-off -> dana berputar ke aset safe-haven (USD, Gold).",
      neutral: "Sinyal lintas cabang campuran -> AI menunggu konfirmasi arah berikutnya.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Status", statusLabel, tone, connected),
          metric("Confidence", `${s.confidence}%`, tone, connected),
          metric("Sinyal Aktif", `${s.signalsAvailable}`, "neutral", connected),
        ],
      },
      { kind: "chain", steps: buildReasoningChain(s), verdict: { label: statusLabel, tone, confidence: s.confidence } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tier 1 — generic category hub (Forex / Stocks / Macro / News / Sentiment).
// Crypto keeps its own richer builder below (it has a genuine aggregate
// number — total market cap — rather than just a connected-count).
// ---------------------------------------------------------------------------

function buildCategoryHubNode(
  id: MarketMapNodeId,
  code: string,
  title: string,
  children: MarketMapNode[],
  aiExplanation: string,
  narrative: { up: string; down: string; neutral: string }
): MarketMapNode {
  const tone = summarizeChildTone(children);
  const connectedCount = children.filter((c) => c.connected).length;
  const connected = connectedCount > 0;
  return {
    id,
    code,
    title,
    tier: 1,
    tone,
    connected,
    childIds: children.map((c) => c.id),
    summary: connected ? `${connectedCount}/${children.length} node tersambung di cabang ${title}.` : `Menunggu koneksi API untuk cabang ${title}.`,
    cardMetric: metric("Terhubung", connected ? `${connectedCount}/${children.length}` : WAITING, tone, connected),
    aiExplanation,
    latestEvent: children.find((c) => c.connected)?.latestEvent ?? children.find((c) => c.connected)?.summary,
    narrative,
    sections: [childListSection(children)],
  };
}

// ---------------------------------------------------------------------------
// Level 2 leaf builders — generic, one function reused across several nodes.
// ---------------------------------------------------------------------------

function buildFxLeafNode(reading: MarketSeriesReading | undefined, id: MarketMapNodeId, code: string, pairLabel: string): MarketMapNode {
  const connected = Boolean(reading);
  const changePct = reading?.changePct ?? 0;
  const tone: DisplayTone = !connected ? "neutral" : changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "neutral";
  return {
    id,
    code,
    title: code,
    tier: 2,
    tone,
    connected,
    summary: connected ? `${pairLabel} di ${reading!.value.toFixed(4)}, ${fmtPctSigned(changePct)}.` : `Menunggu koneksi TwelveData API untuk ${pairLabel}.`,
    cardMetric: metric(pairLabel, connected ? reading!.value.toFixed(4) : WAITING, tone, connected),
    aiExplanation: connected
      ? `${pairLabel} bergerak ${tone === "up" ? "menguat" : tone === "down" ? "melemah" : "flat"} ${fmtPctSigned(changePct)} — konteks FX tambahan, belum ditarik jadi kesimpulan risk-on/off tersendiri (beda dengan DXY di node USD).`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `${pairLabel} ${fmtPctSigned(changePct)} pada pembacaan terakhir.` : undefined,
    narrative: {
      up: `${pairLabel} menguat -> pergeseran tambahan di pasar FX terkait.`,
      down: `${pairLabel} melemah -> pelonggaran tambahan di pasar FX terkait.`,
      neutral: `${pairLabel} flat -> tidak ada dorongan arah baru dari sisi ini.`,
    },
    sections: [
      { kind: "chart", label: pairLabel, series: reading?.series ?? [], connected },
      {
        kind: "stats",
        items: [
          metric(pairLabel, connected ? reading!.value.toFixed(4) : WAITING, tone, connected),
          metric("Change", connected ? fmtPctSigned(changePct) : WAITING, tone, connected),
        ],
      },
    ],
  };
}

function buildStockLeafNode(stocks: StocksReading | undefined, id: MarketMapNodeId, code: string, title: string, ticker: string): MarketMapNode {
  const quote = stocks?.indices.find((i) => i.ticker === ticker);
  const connected = Boolean(quote);
  const changePct = quote?.changePct ?? 0;
  const tone: DisplayTone = !connected ? "neutral" : changePct > 0.2 ? "up" : changePct < -0.2 ? "down" : "neutral";
  return {
    id,
    code,
    title,
    tier: 2,
    tone,
    connected,
    summary: connected ? `${quote!.label} di $${quote!.price.toFixed(2)}, ${fmtPctSigned(changePct)}.` : `Menunggu koneksi Finnhub API untuk ${title}.`,
    cardMetric: metric("Price", connected ? `$${quote!.price.toFixed(2)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `${quote!.label} ${tone === "up" ? "menguat" : tone === "down" ? "melemah" : "bergerak flat"} ${fmtPctSigned(changePct)} — bagian dari pembacaan risk appetite di cabang Stocks.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `${quote!.label} ${fmtPctSigned(changePct)} pada quote terakhir.` : undefined,
    narrative: {
      up: `${title} menguat -> risk appetite di segmen ini meningkat, historically berkorelasi positif dengan crypto.`,
      down: `${title} melemah -> risk-off berpotensi menyebar dari segmen ini ke aset berisiko lain.`,
      neutral: `${title} bergerak flat -> tidak ada dorongan arah baru dari sisi ini.`,
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Price", connected ? `$${quote!.price.toFixed(2)}` : WAITING, tone, connected),
          metric("Change 24h", connected ? fmtPctSigned(changePct) : WAITING, tone, connected),
        ],
      },
    ],
  };
}

function buildMacroLeafNode(events: MacroEventView[], id: MarketMapNodeId, code: string, title: string, category: MacroCategory): MarketMapNode {
  const matches = events.filter((e) => e.category === category);
  const connected = matches.length > 0;
  const next = matches.find((e) => e.status === "upcoming") ?? matches[0];
  const tone: DisplayTone = !next ? "neutral" : next.impact === "high" ? "amber" : "neutral";
  return {
    id,
    code,
    title,
    tier: 2,
    tone,
    connected,
    summary: connected
      ? `${next!.status === "upcoming" ? "Akan rilis" : "Baru rilis"}: ${next!.title}${next!.forecast ? ` — forecast ${next!.forecast}` : ""}.`
      : `Belum ada event ${title} di kalender terdekat.`,
    cardMetric: metric(
      "Next",
      connected ? (next!.status === "upcoming" ? `~${Math.max(1, Math.round(next!.hoursAway))}j lagi` : "Released") : "Tidak ada",
      tone,
      connected
    ),
    aiExplanation: connected
      ? `${matches.length} event ${title} terpantau di kalender. Impact tertinggi: ${matches.some((m) => m.impact === "high") ? "High" : "Medium/Low"}.`
      : `Menunggu event ${title} berikutnya muncul di kalender.`,
    latestEvent: next ? `${next.title} — ${next.status === "upcoming" ? `dalam ~${Math.max(1, Math.round(next.hoursAway))} jam` : "baru rilis"}` : undefined,
    narrative: {
      up: `${title} lebih lunak dari ekspektasi -> ekspektasi kebijakan lebih longgar -> ruang naik untuk aset berisiko.`,
      down: `${title} lebih ketat dari ekspektasi -> ekspektasi kebijakan lebih ketat -> tekanan turun ke aset berisiko.`,
      neutral: `${title} sesuai ekspektasi -> dampak terbatas ke sentimen risk-on/off.`,
    },
    sections: [
      {
        kind: "list",
        title,
        items: matches.length
          ? matches.map(
              (e): DrawerListItem => ({
                label: e.title,
                detail: `${e.status === "upcoming" ? "Upcoming" : "Released"} · Impact ${e.impact}${e.forecast ? ` · Forecast ${e.forecast}` : ""}${
                  e.previous ? ` · Previous ${e.previous}` : ""
                }`,
                tone: e.impact === "high" ? "amber" : "neutral",
                timestamp: e.date,
              })
            )
          : [{ label: `Belum ada event ${title} terjadwal`, tone: "neutral" }],
      },
    ],
  };
}

function buildNewsSourceLeafNode(
  news: NewsItem[],
  id: MarketMapNodeId,
  code: string,
  title: string,
  match: (sourceLower: string) => boolean
): MarketMapNode {
  const matches = news.filter((n) => match(n.source.toLowerCase()));
  const connected = matches.length > 0;
  const latest = matches[0];
  const tone: DisplayTone = !latest ? "neutral" : latest.sentiment === "positive" ? "up" : latest.sentiment === "negative" ? "down" : "neutral";
  return {
    id,
    code,
    title,
    tier: 2,
    tone,
    connected,
    summary: connected ? latest.title : `Belum ada berita dari ${title} di feed saat ini.`,
    cardMetric: metric("Items", connected ? `${matches.length}` : "0", tone, connected),
    aiExplanation: connected
      ? `${matches.length} berita dari ${title} ada di feed saat ini.`
      : `${title} belum terdeteksi di feed berita yang tersambung saat ini — bukan berarti tidak ada beritanya, feed gratis yang dipakai app ini belum tentu mencakup semua outlet.`,
    latestEvent: latest?.title,
    narrative: {
      up: `Berita dari ${title} condong positif -> mendukung sentimen risk-on.`,
      down: `Berita dari ${title} condong negatif -> mendukung sentimen risk-off.`,
      neutral: `Berita dari ${title} netral -> tidak mengubah sentimen secara signifikan.`,
    },
    sections: [
      {
        kind: "list",
        title,
        items: matches.length
          ? matches.slice(0, 8).map(
              (n): DrawerListItem => ({
                label: n.title,
                detail: n.source,
                tone: n.sentiment === "positive" ? "up" : n.sentiment === "negative" ? "down" : "neutral",
                timestamp: n.publishedAt,
                url: n.url,
              })
            )
          : [{ label: `Belum ada berita dari ${title} di feed saat ini`, tone: "neutral" }],
      },
    ],
  };
}

function buildAltcoinLeafNode(rows: AltcoinScannerRow[] | undefined, id: MarketMapNodeId, symbol: string): MarketMapNode {
  const row = rows?.find((r) => r.symbol.toUpperCase() === symbol);
  const connected = Boolean(row);
  const tone: DisplayTone = row?.trendTone ?? "neutral";
  return {
    id,
    code: symbol,
    title: symbol,
    tier: 3,
    tone,
    connected,
    summary: connected ? `${symbol} di ${fmtCoinPrice(row!.price)}, ${row!.trendLabel} — AI Score ${row!.aiScore}/100.` : `Menunggu ${symbol} muncul di Altcoin Scanner.`,
    cardMetric: metric("AI Score", connected ? `${row!.aiScore}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `${symbol}: ${row!.trendLabel}, momentum ${Math.round(row!.momentum)}/100, likuiditas ${row!.liquidity}, sektor ${row!.sector}.`
      : "Menunggu koneksi CoinGecko API / coin ini belum masuk radar top market cap saat ini.",
    latestEvent: connected ? `${symbol} ${fmtCoinPrice(row!.price)} — ${row!.trendLabel}` : undefined,
    confidence: connected ? row!.aiScore : undefined,
    narrative: {
      up: `${symbol} menguat -> menambah momentum rotasi ke altcoin.`,
      down: `${symbol} melemah -> menyeret sentimen altcoin ikut tertekan.`,
      neutral: `${symbol} konsolidasi -> tidak banyak menggerakkan sentimen altcoin.`,
    },
    sections: [
      {
        kind: "stats",
        items: connected
          ? [
              metric("Price", fmtCoinPrice(row!.price), tone, true),
              metric("AI Score", `${row!.aiScore}/100`, tone, true),
              metric("Momentum", `${Math.round(row!.momentum)}/100`, tone, true),
              metric("Liquidity", row!.liquidity, row!.liquidityTone, true),
              metric("Sector", row!.sector, "neutral", true),
            ]
          : [metric("Status", WAITING, "neutral", false)],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sentiment category's 5 children — each bespoke (shapes differ too much
// for one generic helper to stay readable).
// ---------------------------------------------------------------------------

function buildFearGreedLeafNode(live: MarketMapLiveInputs): MarketMapNode {
  const connected = live.fngValue !== undefined;
  const v = live.fngValue ?? 0;
  const tone: DisplayTone = !connected ? "neutral" : v >= 55 ? "up" : v <= 45 ? "down" : "neutral";
  const label = !connected ? WAITING : v >= 75 ? "Extreme Greed" : v >= 55 ? "Greed" : v >= 45 ? "Neutral" : v >= 25 ? "Fear" : "Extreme Fear";
  return {
    id: "feargreed",
    code: "F&G",
    title: "Fear & Greed",
    tier: 2,
    tone,
    connected,
    summary: connected ? `Fear & Greed Index ${Math.round(v)} — ${label}.` : "Menunggu koneksi Fear & Greed Index API.",
    cardMetric: metric("Index", connected ? `${Math.round(v)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Index ${Math.round(v)}/100 (${label}) — dibaca sebagai kontra-indikator saat berada di level ekstrem.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `Index terbaru: ${Math.round(v)} (${label})` : undefined,
    narrative: {
      up: "Greed meningkat -> partisipasi ritel naik, waspada euforia berlebih di level ekstrem.",
      down: "Fear meningkat -> tekanan jual panik, historically kadang jadi zona akumulasi.",
      neutral: "Index di rentang netral -> tidak ada bias ekstrem dari sisi ini.",
    },
    sections: [{ kind: "stats", items: [metric("Fear & Greed Index", connected ? `${Math.round(v)}` : WAITING, tone, connected), metric("Klasifikasi", label, tone, connected)] }],
  };
}

function buildFundingLeafNode(live: MarketMapLiveInputs): MarketMapNode {
  const connected = live.btcFundingRate !== undefined;
  const rate = live.btcFundingRate ?? 0;
  const extreme = Math.abs(rate) > 0.0005;
  const tone: DisplayTone = !connected ? "neutral" : extreme ? "amber" : rate > 0 ? "up" : rate < 0 ? "down" : "neutral";
  return {
    id: "funding",
    code: "FND",
    title: "Funding Rate",
    tier: 2,
    tone,
    connected,
    summary: connected ? `BTC funding rate ${(rate * 100).toFixed(4)}%${extreme ? " — crowded, waspada risiko squeeze." : "."}` : "Menunggu koneksi funding rate API.",
    cardMetric: metric("BTC Funding", connected ? `${(rate * 100).toFixed(4)}%` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Funding ${rate > 0 ? "positif" : "negatif"}${extreme ? ", cukup ekstrem — posisi crowded, risiko squeeze naik" : ", masih dalam rentang wajar"}.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `BTC funding ${(rate * 100).toFixed(4)}%${live.ethFundingRate !== undefined ? `, ETH ${(live.ethFundingRate * 100).toFixed(4)}%` : ""}` : undefined,
    narrative: {
      up: "Funding positif tinggi -> posisi long crowded -> risiko long squeeze naik.",
      down: "Funding negatif dalam -> posisi short crowded -> risiko short squeeze naik.",
      neutral: "Funding dalam rentang wajar -> tidak ada risiko squeeze signifikan dari sisi ini.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("BTC Funding", connected ? `${(rate * 100).toFixed(4)}%` : WAITING, tone, connected),
          metric("ETH Funding", live.ethFundingRate !== undefined ? `${(live.ethFundingRate * 100).toFixed(4)}%` : WAITING, "neutral", live.ethFundingRate !== undefined),
        ],
      },
    ],
  };
}

function buildOpenInterestLeafNode(live: MarketMapLiveInputs): MarketMapNode {
  const connected = live.btcOpenInterestUsd !== undefined;
  return {
    id: "openinterest",
    code: "OI",
    title: "Open Interest",
    tier: 2,
    tone: "neutral",
    connected,
    summary: connected ? `BTC Open Interest ${fmtUsdShort(live.btcOpenInterestUsd)}.` : "Menunggu koneksi Open Interest API.",
    cardMetric: metric("BTC OI", connected ? fmtUsdShort(live.btcOpenInterestUsd) : WAITING, "neutral", connected),
    aiExplanation: connected ? `Total posisi terbuka futures BTC ${fmtUsdShort(live.btcOpenInterestUsd)} — proxy leverage di pasar futures.` : "Menunggu koneksi API.",
    latestEvent: connected
      ? `BTC OI ${fmtUsdShort(live.btcOpenInterestUsd)}${live.ethOpenInterestUsd !== undefined ? `, ETH OI ${fmtUsdShort(live.ethOpenInterestUsd)}` : ""}`
      : undefined,
    narrative: {
      up: "OI naik bersama harga -> tren didukung leverage baru, cenderung lebih sehat.",
      down: "OI naik saat harga turun -> short baru masuk, tekanan turun berpotensi berlanjut.",
      neutral: "OI relatif stabil -> tidak ada perubahan leverage signifikan.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("BTC Open Interest", connected ? fmtUsdShort(live.btcOpenInterestUsd) : WAITING, "neutral", connected),
          metric("ETH Open Interest", live.ethOpenInterestUsd !== undefined ? fmtUsdShort(live.ethOpenInterestUsd) : WAITING, "neutral", live.ethOpenInterestUsd !== undefined),
        ],
      },
    ],
  };
}

function buildWhaleLeafNode(live: MarketMapLiveInputs): MarketMapNode {
  const connected = Boolean(live.btcWhaleNote || live.ethWhaleNote);
  const rawItems: (DrawerListItem | undefined)[] = [
    live.btcWhaleNote ? { label: "BTC", detail: live.btcWhaleNote, tone: "neutral" } : undefined,
    live.ethWhaleNote ? { label: "ETH", detail: live.ethWhaleNote, tone: "neutral" } : undefined,
  ];
  const items = rawItems.filter((x): x is DrawerListItem => Boolean(x));

  return {
    id: "whale",
    code: "WHL",
    title: "Whale Activity",
    tier: 2,
    tone: "neutral",
    connected,
    summary: connected ? (live.btcWhaleNote ?? live.ethWhaleNote!) : "Menunggu koneksi on-chain whale tracker.",
    cardMetric: metric("Status", connected ? "Terpantau" : WAITING, "neutral", connected),
    aiExplanation: connected ? `${live.btcWhaleNote ?? ""} ${live.ethWhaleNote ?? ""}`.trim() : "Menunggu koneksi API on-chain.",
    latestEvent: live.btcWhaleNote ?? live.ethWhaleNote,
    narrative: {
      up: "Akumulasi whale terdeteksi -> potensi tekanan beli lanjutan.",
      down: "Distribusi whale terdeteksi -> potensi tekanan jual lanjutan.",
      neutral: "Tidak ada pola whale signifikan yang menonjol saat ini.",
    },
    sections: [{ kind: "list", title: "Whale Notes", items: items.length ? items : [{ label: "Menunggu koneksi whale tracker", tone: "neutral" }] }],
  };
}

function buildEtfFlowLeafNode(live: MarketMapLiveInputs): MarketMapNode {
  const flow = live.etfFlow;
  const connected = Boolean(flow?.connected);
  const net = flow?.etfNetTotalUsd ?? 0;
  const tone: DisplayTone = !connected ? "neutral" : net > 0 ? "up" : net < 0 ? "down" : "neutral";
  return {
    id: "etfflow",
    code: "ETF",
    title: "ETF Flow",
    tier: 2,
    tone,
    connected,
    summary: connected ? `Net ETF flow ${net >= 0 ? "+" : ""}${fmtUsdShort(net)}.` : "Menunggu koneksi data ETF flow (Farside).",
    cardMetric: metric("Net Flow", connected ? `${net >= 0 ? "+" : ""}${fmtUsdShort(net)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `ETF spot BTC/ETH mencatat net flow ${net >= 0 ? "masuk" : "keluar"} ${fmtUsdShort(Math.abs(net))} — sinyal minat institusional.`
      : "Menunggu koneksi API.",
    latestEvent: flow?.movements[0] ? `${flow.movements[0].label}: ${flow.movements[0].detail}` : undefined,
    narrative: {
      up: "Net inflow ETF -> minat institusional naik -> tailwind untuk BTC/ETH.",
      down: "Net outflow ETF -> minat institusional turun -> headwind untuk BTC/ETH.",
      neutral: "Flow ETF relatif seimbang -> tidak ada dorongan arah baru dari sisi ini.",
    },
    sections: [
      { kind: "stats", items: [metric("Net Flow", connected ? `${net >= 0 ? "+" : ""}${fmtUsdShort(net)}` : WAITING, tone, connected)] },
      {
        kind: "list",
        title: "ETF Flows",
        items: flow?.etfFlows.length
          ? flow.etfFlows.map(
              (f): DrawerListItem => ({
                label: `${f.ticker} (${f.asset})`,
                detail: `${f.netFlowUsd >= 0 ? "+" : ""}${fmtUsdShort(f.netFlowUsd)}`,
                tone: f.netFlowUsd >= 0 ? "up" : "down",
              })
            )
          : [{ label: "Menunggu koneksi data ETF flow", tone: "neutral" }],
      },
    ],
  };
}

function buildStablecoinNode(live: MarketMapLiveInputs): MarketMapNode {
  const s = live.stablecoin;
  const connected = Boolean(s);
  const changeUsd = s?.change24hUsd ?? 0;
  const tone: DisplayTone = !connected ? "neutral" : changeUsd > 0 ? "up" : changeUsd < 0 ? "down" : "neutral";
  return {
    id: "stablecoin",
    code: "USDX",
    title: "Stablecoin",
    tier: 2,
    tone,
    connected,
    summary: connected
      ? `Total supply stablecoin ${fmtUsdShort(s!.totalUsd)}${s!.change24hUsd !== undefined ? `, ${s!.change24hUsd >= 0 ? "+" : ""}${fmtUsdShort(s!.change24hUsd)} (24h)` : ""}.`
      : "Menunggu koneksi DefiLlama stablecoins API.",
    cardMetric: metric("Total Supply", connected ? fmtUsdShort(s!.totalUsd) : WAITING, tone, connected),
    aiExplanation: connected
      ? `Supply stablecoin ${tone === "up" ? "bertambah — potensi dry powder baru masuk crypto" : tone === "down" ? "berkurang — dana keluar dari ekosistem crypto" : "relatif stabil"}.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `Total supply ${fmtUsdShort(s!.totalUsd)}${s!.topSymbol ? `, terbesar ${s!.topSymbol}` : ""}` : undefined,
    narrative: {
      up: "Supply stablecoin bertambah -> dry powder baru siap masuk ke crypto.",
      down: "Supply stablecoin berkurang -> dana keluar dari ekosistem crypto sepenuhnya.",
      neutral: "Supply stablecoin stabil -> tidak ada perubahan likuiditas signifikan.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Total Supply", connected ? fmtUsdShort(s!.totalUsd) : WAITING, tone, connected),
          metric("Perubahan 24h", s?.change24hUsd !== undefined ? `${s.change24hUsd >= 0 ? "+" : ""}${fmtUsdShort(s.change24hUsd)}` : WAITING, tone, s?.change24hUsd !== undefined),
          metric("Terbesar", s?.topSymbol ?? WAITING, "neutral", Boolean(s?.topSymbol)),
        ],
      },
    ],
  };
}

function buildDexNode(): MarketMapNode {
  return {
    id: "dex",
    code: "DEX",
    title: "DEX Volume",
    tier: 2,
    tone: "neutral",
    connected: false,
    summary: "Belum ada sumber data DEX volume yang tersambung.",
    cardMetric: metric("Volume", WAITING, "neutral", false),
    aiExplanation: "Node ini disiapkan untuk data volume DEX (mis. lewat DefiLlama) — belum disambungkan ke API manapun, sengaja ditampilkan apa adanya daripada diisi angka karangan.",
    narrative: {
      up: "Volume DEX naik -> aktivitas on-chain meningkat.",
      down: "Volume DEX turun -> aktivitas on-chain melambat.",
      neutral: "Menunggu koneksi data untuk baca arah dari sisi ini.",
    },
    sections: [{ kind: "stats", items: [metric("Volume 24h", WAITING, "neutral", false)] }],
  };
}
// ---------------------------------------------------------------------------
// Carried over from V3 — same computation, tier renumbered (usd/gold were
// already tier 2 and stay there; btc/eth/altcoin move from tier 4 to tier 2,
// one level shallower under the new "crypto" category hub).
// ---------------------------------------------------------------------------

function buildUsdNode(live: MarketMapLiveInputs): MarketMapNode {
  const usd = live.usd;
  const connected = Boolean(usd);
  const tone: DisplayTone = !connected ? "neutral" : (usd!.changePct ?? 0) > 0.1 ? "down" : (usd!.changePct ?? 0) < -0.1 ? "up" : "neutral";
  // Tone framed from crypto's perspective: USD strength is a headwind (down tone) for risk assets.
  const strengthLabel = !connected ? WAITING : (usd!.changePct ?? 0) > 0.1 ? "Menguat" : (usd!.changePct ?? 0) < -0.1 ? "Melemah" : "Netral";
  const liquidityLabel = !connected ? WAITING : (usd!.changePct ?? 0) > 0.1 ? "Tekanan ke crypto" : (usd!.changePct ?? 0) < -0.1 ? "Mendukung crypto" : "Netral";

  return {
    id: "usd",
    code: "USD",
    title: "USD",
    tier: 2,
    tone,
    connected,
    summary: connected ? `DXY di ${usd!.value.toFixed(2)}, ${strengthLabel.toLowerCase()} ${fmtPctSigned(usd!.changePct ?? 0)}.` : "Menunggu koneksi TwelveData API untuk DXY.",
    cardMetric: metric("DXY", connected ? usd!.value.toFixed(2) : WAITING, tone, connected),
    aiExplanation: connected
      ? `USD ${strengthLabel.toLowerCase()} — historically ${tone === "down" ? "menekan" : tone === "up" ? "mendukung" : "berdampak netral ke"} likuiditas crypto.`
      : "Menunggu koneksi API untuk analisis kekuatan USD.",
    latestEvent: connected ? `DXY ${fmtPctSigned(usd!.changePct ?? 0)} — ${strengthLabel}` : undefined,
    narrative: {
      up: "USD naik -> likuiditas dolar mengetat -> tekanan jual meningkat di crypto & aset berisiko lain.",
      down: "USD melemah -> risk appetite meningkat -> BTC dan altcoin berpotensi mendapatkan inflow.",
      neutral: "USD bergerak sideways -> dampak ke likuiditas crypto relatif netral.",
    },
    sections: [
      { kind: "chart", label: "DXY", series: usd?.series ?? [], connected },
      {
        kind: "stats",
        items: [
          metric("DXY Index", connected ? usd!.value.toFixed(2) : WAITING, tone, connected),
          metric("Dollar Strength", strengthLabel, tone, connected),
          metric("Liquidity Impact", liquidityLabel, tone, connected),
        ],
      },
      {
        kind: "text",
        title: "Correlation to Crypto",
        body: connected
          ? `Saat USD ${strengthLabel.toLowerCase()}, crypto historically bergerak ${tone === "down" ? "berlawanan arah (tertekan)" : tone === "up" ? "searah (terdukung)" : "tanpa pola kuat"}.`
          : "Menunggu koneksi API.",
      },
    ],
  };
}

function buildGoldNode(live: MarketMapLiveInputs): MarketMapNode {
  const gold = live.gold;
  const connected = Boolean(gold);
  const tone: DisplayTone = !connected ? "neutral" : (gold!.changePct ?? 0) > 0.2 ? "down" : (gold!.changePct ?? 0) < -0.2 ? "up" : "neutral";
  // Tone framed from crypto's perspective: strong Gold = risk-off (down tone for risk assets).
  const momentumLabel = !connected ? WAITING : (gold!.changePct ?? 0) > 0.2 ? "Menguat" : (gold!.changePct ?? 0) < -0.2 ? "Melemah" : "Stabil";

  return {
    id: "gold",
    code: "XAU",
    title: "Gold",
    tier: 2,
    tone,
    connected,
    summary: connected ? `Gold di $${gold!.value.toFixed(2)}/oz, ${momentumLabel.toLowerCase()} ${fmtPctSigned(gold!.changePct ?? 0)}.` : "Menunggu koneksi TwelveData API untuk XAU/USD.",
    cardMetric: metric("XAU/USD", connected ? `$${gold!.value.toFixed(0)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Gold ${momentumLabel.toLowerCase()} — ${tone === "down" ? "safe-haven demand naik, minor headwind untuk BTC" : tone === "up" ? "safe-haven demand turun, minor tailwind untuk BTC" : "tanpa sinyal risk-on/off kuat"}.`
      : "Menunggu koneksi API untuk analisis hubungan Gold-BTC.",
    latestEvent: connected ? `XAU/USD ${fmtPctSigned(gold!.changePct ?? 0)} — ${momentumLabel}` : undefined,
    narrative: {
      up: "Emas naik tajam -> biasanya mencerminkan risk-off -> tekanan turun sementara ke aset spekulatif.",
      down: "Emas melemah -> minat ke safe-haven berkurang -> ruang bagi aset berisiko termasuk crypto.",
      neutral: "Emas sideways -> tidak ada sinyal risk-on/off yang kuat dari sisi ini.",
    },
    sections: [
      { kind: "chart", label: "XAU/USD", series: gold?.series ?? [], connected },
      { kind: "stats", items: [metric("Gold Price", connected ? `$${gold!.value.toFixed(2)}` : WAITING, tone, connected), metric("Momentum", momentumLabel, tone, connected)] },
      {
        kind: "text",
        title: "Correlation to BTC",
        body: connected
          ? `BTC kadang disebut "digital gold" — korelasinya dengan Gold naik saat keduanya sama-sama dipandang sebagai lindung nilai terhadap pelemahan mata uang fiat.`
          : "Menunggu koneksi API.",
      },
    ],
  };
}

function buildBtcOrEthNode(live: MarketMapLiveInputs, which: "btc" | "eth"): MarketMapNode {
  const asset = which === "btc" ? live.btc : live.eth;
  const fundingRate = which === "btc" ? live.btcFundingRate : live.ethFundingRate;
  const openInterestUsd = which === "btc" ? live.btcOpenInterestUsd : live.ethOpenInterestUsd;
  const whaleNote = which === "btc" ? live.btcWhaleNote : live.ethWhaleNote;
  const connected = Boolean(asset);
  const trend = connected ? deriveTrend(asset!.change24h, asset!.change7d) : undefined;
  const tone: DisplayTone = trend?.tone ?? "neutral";
  const aiScore = connected ? computeAssetAiScore({ change24h: asset!.change24h, change7d: asset!.change7d, fundingRate }) : undefined;
  const fngConnected = live.fngValue !== undefined;

  return {
    id: which,
    code: which.toUpperCase(),
    title: which.toUpperCase(),
    tier: 2,
    tone,
    connected,
    summary: connected ? `${which.toUpperCase()} di ${fmtUsdShort(asset!.price)}, struktur ${trend!.label.toLowerCase()}.` : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Trend", connected ? trend!.label : WAITING, tone, connected),
    aiExplanation: connected
      ? `Struktur ${trend!.label.toLowerCase()}${aiScore !== undefined ? `, AI Score ${aiScore}/100` : ""}${fundingRate !== undefined ? `, funding ${(fundingRate * 100).toFixed(4)}%` : ""}.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `${which.toUpperCase()} ${fmtPctSigned(asset!.change24h ?? 0)} (24h) — ${trend!.label}` : undefined,
    confidence: aiScore,
    narrative: {
      up: `Struktur harga higher-high/higher-low -> ${which.toUpperCase()} berperan sebagai penggerak utama capital inflow crypto.`,
      down: `Struktur harga lower-high/lower-low -> ${which.toUpperCase()} menyeret sentimen pasar ikut melemah.`,
      neutral: `${which.toUpperCase()} konsolidasi -> pasar menunggu breakout arah berikutnya.`,
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Trend", connected ? trend!.label : WAITING, tone, connected),
          metric("Momentum", connected ? fmtPctSigned(asset!.change24h ?? 0) : WAITING, tone, connected),
          metric("Volume 24h", asset?.volume24h !== undefined ? fmtUsdShort(asset.volume24h) : WAITING, "neutral", asset?.volume24h !== undefined),
          metric("Funding Rate", fundingRate !== undefined ? `${(fundingRate * 100).toFixed(4)}%` : WAITING, "neutral", fundingRate !== undefined),
          metric("Open Interest", openInterestUsd !== undefined ? fmtUsdShort(openInterestUsd) : WAITING, "neutral", openInterestUsd !== undefined),
          metric("Fear Score", fngConnected ? `${Math.round(live.fngValue!)}` : WAITING, "neutral", fngConnected),
          metric("Whale Activity", whaleNote ?? WAITING, "neutral", Boolean(whaleNote)),
          metric("AI Score", aiScore !== undefined ? `${aiScore}/100` : WAITING, tone, aiScore !== undefined),
        ],
      },
    ],
  };
}

function buildAltcoinNode(live: MarketMapLiveInputs, children: MarketMapNode[]): MarketMapNode {
  const connected = live.altseasonIndex !== undefined;
  const tone: DisplayTone = !connected ? "neutral" : live.altseasonIndex! >= 60 ? "up" : live.altseasonIndex! <= 40 ? "down" : "neutral";

  const sectorItems: DrawerListItem[] = live.sectorRotation?.length
    ? [...live.sectorRotation]
        .sort((a, b) => b.momentum - a.momentum)
        .map((row): DrawerListItem => ({ label: row.sector, detail: `${row.trendLabel} · momentum ${Math.round(row.momentum)}/100`, tone: row.trendTone }))
    : [{ label: "Menunggu data Sector Rotation", tone: "neutral" }];

  return {
    id: "altcoin",
    code: "ALT",
    title: "Altcoin",
    tier: 2,
    tone,
    connected,
    childIds: children.map((c) => c.id),
    summary: connected
      ? `Altseason Index ${Math.round(live.altseasonIndex!)} — ${tone === "up" ? "kondisi mendukung rotasi ke altcoin." : tone === "down" ? "likuiditas masih terpusat di BTC." : "kondisi campuran."}`
      : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Altseason", connected ? `${Math.round(live.altseasonIndex!)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Altseason Index ${Math.round(live.altseasonIndex!)}/100${live.altcoinTopGainer ? `, top gainer ${live.altcoinTopGainer.symbol} ${fmtPctSigned(live.altcoinTopGainer.change24h)}` : ""}. 6 koin dipantau langsung: SOL, BNB, XRP, LINK, SUI, RENDER.`
      : "Menunggu koneksi API.",
    latestEvent: live.altcoinTopGainer ? `Top gainer: ${live.altcoinTopGainer.symbol} ${fmtPctSigned(live.altcoinTopGainer.change24h)}` : undefined,
    narrative: {
      up: "BTC stabil & dominance turun -> likuiditas rotasi ke altcoin -> momentum sektor tertentu menguat.",
      down: "BTC dominance naik -> likuiditas keluar dari altcoin -> tekanan jual merata di luar BTC.",
      neutral: "Rotasi sektor campuran -> beberapa sektor menguat, lainnya tertinggal.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Altseason Index", connected ? `${Math.round(live.altseasonIndex!)}` : WAITING, tone, connected),
          metric("Top Gainer", live.altcoinTopGainer ? `${live.altcoinTopGainer.symbol} ${fmtPctSigned(live.altcoinTopGainer.change24h)}` : WAITING, "up", Boolean(live.altcoinTopGainer)),
          metric("Top Loser", live.altcoinTopLoser ? `${live.altcoinTopLoser.symbol} ${fmtPctSigned(live.altcoinTopLoser.change24h)}` : WAITING, "down", Boolean(live.altcoinTopLoser)),
        ],
      },
      { kind: "list", title: "Sector Momentum", items: sectorItems },
      childListSection(children, "6 Koin Terpantau"),
    ],
  };
}

function buildCryptoCategoryNode(live: MarketMapLiveInputs, children: MarketMapNode[]): MarketMapNode {
  const connected = live.totalMarketCapUsd !== undefined;
  const tone: DisplayTone =
    !connected || live.totalMarketCapChange24h === undefined
      ? "neutral"
      : live.totalMarketCapChange24h > 0.5
        ? "up"
        : live.totalMarketCapChange24h < -0.5
          ? "down"
          : "neutral";

  return {
    id: "crypto",
    code: "CRY",
    title: "Crypto",
    tier: 1,
    tone,
    connected,
    childIds: children.map((c) => c.id),
    summary: connected
      ? `Total market cap ${fmtUsdShort(live.totalMarketCapUsd)}, ${fmtPctSigned(live.totalMarketCapChange24h ?? 0)} (24h).`
      : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Total Cap", connected ? fmtUsdShort(live.totalMarketCapUsd) : WAITING, tone, connected),
    aiExplanation: connected
      ? `Market cap crypto ${tone === "up" ? "naik" : tone === "down" ? "turun" : "stabil"} dalam 24 jam, BTC dominance ${
          live.btcDominance !== undefined ? `${live.btcDominance.toFixed(1)}%` : "—"
        }. 5 cabang: BTC, ETH, Altcoin, Stablecoin, DEX.`
      : "Menunggu koneksi API.",
    latestEvent: connected ? `Market cap ${fmtPctSigned(live.totalMarketCapChange24h ?? 0)} (24h)` : undefined,
    narrative: {
      up: "Likuiditas makro mendukung -> capital inflow ke crypto -> BTC memimpin, altcoin menyusul.",
      down: "Likuiditas makro mengetat -> capital outflow dari crypto -> tekanan jual merata di BTC & altcoin.",
      neutral: "Likuiditas makro netral -> market cap crypto bergerak dalam rentang, menunggu katalis baru.",
    },
    sections: [
      {
        kind: "stats",
        items: [
          metric("Total Market Cap", connected ? fmtUsdShort(live.totalMarketCapUsd) : WAITING, tone, connected),
          metric("BTC Dominance", live.btcDominance !== undefined ? `${live.btcDominance.toFixed(1)}%` : WAITING, "neutral", live.btcDominance !== undefined),
          metric("ETH Dominance", live.ethDominance !== undefined ? `${live.ethDominance.toFixed(1)}%` : WAITING, "neutral", live.ethDominance !== undefined),
          metric("24h Volume", live.totalVolume24hUsd !== undefined ? fmtUsdShort(live.totalVolume24hUsd) : WAITING, "neutral", live.totalVolume24hUsd !== undefined),
          metric("Trend", connected ? (tone === "up" ? "Bullish" : tone === "down" ? "Bearish" : "Sideways") : WAITING, tone, connected),
        ],
      },
      childListSection(children),
    ],
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — builds leaves first (category hubs summarize from them).
// ---------------------------------------------------------------------------

export function buildMarketMapNodes(live: MarketMapLiveInputs): MarketMapNode[] {
  const btc = buildBtcOrEthNode(live, "btc");
  const eth = buildBtcOrEthNode(live, "eth");
  const altcoinLeaves = [
    buildAltcoinLeafNode(live.altcoinScannerRows, "sol", "SOL"),
    buildAltcoinLeafNode(live.altcoinScannerRows, "bnb", "BNB"),
    buildAltcoinLeafNode(live.altcoinScannerRows, "xrp", "XRP"),
    buildAltcoinLeafNode(live.altcoinScannerRows, "link", "LINK"),
    buildAltcoinLeafNode(live.altcoinScannerRows, "sui", "SUI"),
    buildAltcoinLeafNode(live.altcoinScannerRows, "render", "RENDER"),
  ];
  const altcoin = buildAltcoinNode(live, altcoinLeaves);
  const stablecoin = buildStablecoinNode(live);
  const dex = buildDexNode();
  const crypto = buildCryptoCategoryNode(live, [btc, eth, altcoin, stablecoin, dex]);

  const usd = buildUsdNode(live);
  const gold = buildGoldNode(live);
  const eur = buildFxLeafNode(live.eur, "eur", "EUR", "EUR/USD");
  const gbp = buildFxLeafNode(live.gbp, "gbp", "GBP", "GBP/USD");
  const jpy = buildFxLeafNode(live.jpy, "jpy", "JPY", "USD/JPY");
  const cny = buildFxLeafNode(live.cny, "cny", "CNY", "USD/CNY");
  const forex = buildCategoryHubNode(
    "forex",
    "FX",
    "Forex",
    [usd, eur, gbp, jpy, cny, gold],
    "Forex & Gold — kekuatan dolar dan komoditas safe-haven, konteks likuiditas makro untuk crypto.",
    {
      up: "USD & Gold melemah -> likuiditas mengalir ke aset berisiko.",
      down: "USD & Gold menguat -> likuiditas mengetat untuk aset berisiko.",
      neutral: "Forex & Gold bergerak campuran -> tidak ada dorongan arah yang jelas.",
    }
  );

  const nasdaq = buildStockLeafNode(live.stocks, "nasdaq", "IXIC", "Nasdaq", "QQQ");
  const sp500 = buildStockLeafNode(live.stocks, "sp500", "SPX", "S&P 500", "SPY");
  const nvda = buildStockLeafNode(live.stocks, "nvda", "NVDA", "NVIDIA", "NVDA");
  const aapl = buildStockLeafNode(live.stocks, "aapl", "AAPL", "Apple", "AAPL");
  const tsla = buildStockLeafNode(live.stocks, "tsla", "TSLA", "Tesla", "TSLA");
  const stocks = buildCategoryHubNode(
    "stocks",
    "EQT",
    "Stocks",
    [nasdaq, sp500, nvda, aapl, tsla],
    "Saham AS — proxy risk appetite institusional, historically berkorelasi dengan crypto saat regime risk-on/off jelas.",
    {
      up: "Saham AS menguat -> risk appetite tinggi -> historically berkorelasi positif dengan BTC & altcoin.",
      down: "Saham AS melemah -> risk-off menyebar lintas aset -> crypto sering ikut tertekan jangka pendek.",
      neutral: "Saham AS bergerak flat -> korelasi ke crypto tidak signifikan hari ini.",
    }
  );

  const interestrate = buildMacroLeafNode(live.macroEvents, "interestrate", "RATE", "Interest Rate", "Interest Rate");
  const cpi = buildMacroLeafNode(live.macroEvents, "cpi", "CPI", "CPI", "CPI");
  const ppi = buildMacroLeafNode(live.macroEvents, "ppi", "PPI", "PPI", "PPI");
  const nfp = buildMacroLeafNode(live.macroEvents, "nfp", "NFP", "NFP", "NFP");
  const gdp = buildMacroLeafNode(live.macroEvents, "gdp", "GDP", "GDP", "GDP");
  const macro = buildCategoryHubNode(
    "macro",
    "MAC",
    "Macro",
    [interestrate, cpi, ppi, nfp, gdp],
    "Kalender data makro AS — Interest Rate, CPI, PPI, NFP, GDP. Data lebih ketat dari ekspektasi = headwind untuk aset berisiko; lebih lunak = tailwind.",
    {
      up: "Data makro lebih lunak dari ekspektasi -> ekspektasi kebijakan lebih longgar -> ruang naik untuk aset berisiko.",
      down: "Data makro lebih ketat dari ekspektasi -> ekspektasi kebijakan lebih ketat -> tekanan turun ke aset berisiko.",
      neutral: "Data makro sesuai ekspektasi -> dampak terbatas ke sentimen risk-on/off.",
    }
  );

  const newsLower = live.newsItems;
  const reuters = buildNewsSourceLeafNode(newsLower, "reuters", "RTRS", "Reuters", (s) => s.includes("reuters"));
  const bloomberg = buildNewsSourceLeafNode(newsLower, "bloomberg", "BLMB", "Bloomberg", (s) => s.includes("bloomberg"));
  const twitter = buildNewsSourceLeafNode(newsLower, "twitter", "TWTR", "Twitter / X", (s) => s.includes("twitter") || s === "x");
  const telegram = buildNewsSourceLeafNode(newsLower, "telegram", "TG", "Telegram", (s) => s.includes("telegram"));
  const coindesk = buildNewsSourceLeafNode(newsLower, "coindesk", "CDSK", "CoinDesk", (s) => s.includes("coindesk"));
  const news = buildCategoryHubNode(
    "news",
    "NWS",
    "News",
    [reuters, bloomberg, twitter, telegram, coindesk],
    "Feed berita crypto & makro real-time — dikelompokkan per outlet. Twitter/Telegram belum tersambung (belum ada integrasi sosial media di app ini).",
    {
      up: "Arus berita condong positif -> mendukung sentimen risk-on.",
      down: "Arus berita condong negatif -> mendukung sentimen risk-off.",
      neutral: "Arus berita campuran -> tidak ada dorongan sentimen yang jelas.",
    }
  );

  const feargreed = buildFearGreedLeafNode(live);
  const funding = buildFundingLeafNode(live);
  const openinterest = buildOpenInterestLeafNode(live);
  const whale = buildWhaleLeafNode(live);
  const etfflow = buildEtfFlowLeafNode(live);
  const sentiment = buildCategoryHubNode(
    "sentiment",
    "SENT",
    "Sentiment",
    [feargreed, funding, openinterest, whale, etfflow],
    "Metrik sentimen & positioning pasar crypto — Fear & Greed, Funding, Open Interest, aktivitas whale, dan flow ETF institusional.",
    {
      up: "Metrik sentimen condong risk-on -> partisipasi & positioning mendukung kenaikan.",
      down: "Metrik sentimen condong risk-off -> partisipasi & positioning mendukung penurunan.",
      neutral: "Metrik sentimen campuran -> tidak ada bias positioning yang jelas.",
    }
  );

  const global = buildGlobalNode(live);

  return [
    global,
    crypto,
    forex,
    stocks,
    macro,
    news,
    sentiment,
    btc,
    eth,
    altcoin,
    stablecoin,
    dex,
    usd,
    eur,
    gbp,
    jpy,
    cny,
    gold,
    nasdaq,
    sp500,
    nvda,
    aapl,
    tsla,
    interestrate,
    cpi,
    ppi,
    nfp,
    gdp,
    reuters,
    bloomberg,
    twitter,
    telegram,
    coindesk,
    feargreed,
    funding,
    openinterest,
    whale,
    etfflow,
    ...altcoinLeaves,
  ];
}
