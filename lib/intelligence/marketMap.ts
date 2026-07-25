import type { NewsItem } from "@/lib/types";
import type { GlobalSentimentReading, ReasoningChainStep } from "./globalSentiment";
import { buildReasoningChain } from "./globalSentiment";
import type { MacroEventView } from "./macroEvents";
import type { MarketSeriesReading } from "./sources/twelvedata";
import type { StocksReading } from "./sources/stocks";
import type { SectorRotationRow } from "./sectorRotation";
import { deriveTrend, computeAssetAiScore, type DisplayTone } from "./shared";

// ---------------------------------------------------------------------------
// Global Market Intelligence Map V2 — data model.
//
// Design notes for future maintainers:
//  - Every node carries `connected: boolean`. false means "no live source
//    wired for this yet" — the UI renders "Waiting for API Connection", it
//    never fabricates a number. This replaces the V1 "sample data" concept
//    entirely; there is no dummy data path left in this file.
//  - `sections` is a small, generic drawer-content system (list / stats /
//    chart / text) instead of one rigid shape per node. Adding a future
//    Whale, Order Flow, Footprint, or Liquidity Heatmap node/tier means:
//    add an id to MarketMapNodeId, add its edges, and write one more
//    `buildXNode()` function that returns whatever `sections` it needs — the
//    tree layout, the drawer, and the connecting-line renderer don't change.
// ---------------------------------------------------------------------------

export type MarketMapNodeId =
  | "macro"
  | "sentiment"
  | "usd"
  | "gold"
  | "stocks"
  | "crypto"
  | "btc"
  | "eth"
  | "altcoin";

export interface MarketMapEdge {
  from: MarketMapNodeId;
  to: MarketMapNodeId;
}

export const MARKET_MAP_EDGES: MarketMapEdge[] = [
  { from: "macro", to: "sentiment" },
  { from: "sentiment", to: "usd" },
  { from: "sentiment", to: "gold" },
  { from: "sentiment", to: "stocks" },
  { from: "usd", to: "crypto" },
  { from: "gold", to: "crypto" },
  { from: "stocks", to: "crypto" },
  { from: "crypto", to: "btc" },
  { from: "crypto", to: "eth" },
  { from: "crypto", to: "altcoin" },
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
  tier: 0 | 1 | 2 | 3 | 4;
  tone: DisplayTone;
  connected: boolean;
  summary: string;
  cardMetric: MarketMapMetric;
  aiExplanation: string;
  narrative: { up: string; down: string; neutral: string };
  sections: DrawerSection[];
}

export interface MarketMapLiveInputs {
  sentiment: GlobalSentimentReading;
  macroEvents: MacroEventView[];
  newsItems: NewsItem[];
  usd?: MarketSeriesReading;
  gold?: MarketSeriesReading;
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

// ---------------------------------------------------------------------------
// Node builders — one per node, each a plain function so adding a new node
// later is additive (write one more function, call it from buildMarketMapNodes).
// ---------------------------------------------------------------------------

function buildMacroNode(live: MarketMapLiveInputs): MarketMapNode {
  const events = live.macroEvents;
  const news = live.newsItems;
  const connected = events.length > 0 || news.length > 0;
  const nextEvent = events.find((e) => e.status === "upcoming");
  const tone: DisplayTone = nextEvent?.impact === "high" ? "amber" : "neutral";

  const eventItems: DrawerListItem[] = events.length
    ? events.map(
        (e): DrawerListItem => ({
          label: `${e.category} — ${e.title}`,
          detail: `${e.status === "upcoming" ? "Upcoming" : "Released"} · Impact ${e.impact}${e.forecast ? ` · Forecast ${e.forecast}` : ""}${
            e.previous ? ` · Previous ${e.previous}` : ""
          }`,
          tone: e.impact === "high" ? "amber" : "neutral",
          timestamp: e.date,
        })
      )
    : [{ label: "Menunggu koneksi kalender makro", tone: "neutral" }];

  const newsItems: DrawerListItem[] = news.length
    ? news.slice(0, 10).map(
        (n): DrawerListItem => ({
          label: n.title,
          detail: n.source,
          tone: n.sentiment === "positive" ? "up" : n.sentiment === "negative" ? "down" : "neutral",
          timestamp: n.publishedAt,
          url: n.url,
        })
      )
    : [{ label: "Menunggu koneksi feed berita", tone: "neutral" }];

  return {
    id: "macro",
    code: "MAC",
    title: "News & Macro Event",
    tier: 0,
    tone,
    connected,
    summary: nextEvent
      ? `${nextEvent.category} "${nextEvent.title}" — ${
          nextEvent.status === "upcoming" ? `dalam ~${Math.max(1, Math.round(nextEvent.hoursAway))} jam` : "baru rilis"
        }.`
      : connected
        ? "Tidak ada event makro besar terjadwal dalam waktu dekat."
        : "Menunggu koneksi kalender & feed berita.",
    cardMetric: metric("Next Event", nextEvent ? nextEvent.category : "Tidak ada", tone, connected),
    aiExplanation: connected
      ? `${events.filter((e) => e.status === "upcoming").length} event makro mendatang dan ${news.length} berita crypto terbaru sedang dipantau.`
      : "Menunggu koneksi API untuk kalender makro dan feed berita.",
    narrative: {
      up: "Data makro lebih lunak dari ekspektasi -> ekspektasi suku bunga turun -> ruang naik untuk aset berisiko.",
      down: "Data makro lebih ketat dari ekspektasi -> ekspektasi suku bunga naik -> tekanan turun ke aset berisiko.",
      neutral: "Data makro sesuai ekspektasi -> dampak terbatas ke sentimen risk-on/off.",
    },
    sections: [
      { kind: "list", title: "Macro Events", items: eventItems },
      { kind: "list", title: "Breaking Crypto News", items: newsItems },
    ],
  };
}

function buildSentimentNode(live: MarketMapLiveInputs): MarketMapNode {
  const s = live.sentiment;
  const connected = s.signalsAvailable > 0;
  const tone: DisplayTone = s.status === "risk-on" ? "up" : s.status === "risk-off" ? "down" : s.status === "transition" ? "amber" : "neutral";
  const statusLabel = s.status === "risk-on" ? "Risk On" : s.status === "risk-off" ? "Risk Off" : s.status === "transition" ? "Transition" : "Neutral";

  return {
    id: "sentiment",
    code: "SENT",
    title: "Global Sentiment",
    tier: 1,
    tone,
    connected,
    summary: s.note ?? `${statusLabel} dengan confidence ${s.confidence}% dari ${s.signalsAvailable} sinyal.`,
    cardMetric: metric("Confidence", `${s.confidence}%`, tone, connected),
    aiExplanation: `${statusLabel} — dibaca dari ${s.signalsAvailable} sinyal di seluruh node peta (macro, USD, Gold, Stocks, BTC, Altcoin).`,
    narrative: {
      up: "Sentimen risk-on menguat -> likuiditas mengalir ke aset berisiko termasuk saham & crypto.",
      down: "Sentimen risk-off menguat -> dana berputar ke aset safe-haven (USD, Gold, obligasi).",
      neutral: "Sentimen belum menentu -> pasar cenderung sideways menunggu katalis berikutnya.",
    },
    sections: [
      { kind: "stats", items: [metric("Status", statusLabel, tone, connected), metric("Confidence", `${s.confidence}%`, tone, connected)] },
      { kind: "chain", steps: buildReasoningChain(s), verdict: { label: statusLabel, tone, confidence: s.confidence } },
    ],
  };
}

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
    summary: connected
      ? `DXY di ${usd!.value.toFixed(2)}, ${strengthLabel.toLowerCase()} ${fmtPctSigned(usd!.changePct ?? 0)}.`
      : "Menunggu koneksi TwelveData API untuk DXY.",
    cardMetric: metric("DXY", connected ? usd!.value.toFixed(2) : WAITING, tone, connected),
    aiExplanation: connected
      ? `USD ${strengthLabel.toLowerCase()} — historically ${tone === "down" ? "menekan" : tone === "up" ? "mendukung" : "berdampak netral ke"} likuiditas crypto.`
      : "Menunggu koneksi API untuk analisis kekuatan USD.",
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
    summary: connected
      ? `Gold di $${gold!.value.toFixed(2)}/oz, ${momentumLabel.toLowerCase()} ${fmtPctSigned(gold!.changePct ?? 0)}.`
      : "Menunggu koneksi TwelveData API untuk XAU/USD.",
    cardMetric: metric("XAU/USD", connected ? `$${gold!.value.toFixed(0)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Gold ${momentumLabel.toLowerCase()} — ${tone === "down" ? "safe-haven demand naik, minor headwind untuk BTC" : tone === "up" ? "safe-haven demand turun, minor tailwind untuk BTC" : "tanpa sinyal risk-on/off kuat"}.`
      : "Menunggu koneksi API untuk analisis hubungan Gold-BTC.",
    narrative: {
      up: "Emas naik tajam -> biasanya mencerminkan risk-off -> tekanan turun sementara ke aset spekulatif.",
      down: "Emas melemah -> minat ke safe-haven berkurang -> ruang bagi aset berisiko termasuk crypto.",
      neutral: "Emas sideways -> tidak ada sinyal risk-on/off yang kuat dari sisi ini.",
    },
    sections: [
      { kind: "chart", label: "XAU/USD", series: gold?.series ?? [], connected },
      {
        kind: "stats",
        items: [
          metric("Gold Price", connected ? `$${gold!.value.toFixed(2)}` : WAITING, tone, connected),
          metric("Momentum", momentumLabel, tone, connected),
        ],
      },
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

function buildStocksNode(live: MarketMapLiveInputs): MarketMapNode {
  const stocks = live.stocks;
  const connected = Boolean(stocks?.indices.length);
  const avgChange = connected ? average(stocks!.indices.map((i) => i.changePct ?? 0)) : undefined;
  const tone: DisplayTone = !connected || avgChange === undefined ? "neutral" : avgChange > 0.2 ? "up" : avgChange < -0.2 ? "down" : "neutral";
  const statusLabel = tone === "up" ? "Risk On" : tone === "down" ? "Risk Off" : "Neutral";

  const indexItems: DrawerListItem[] = connected
    ? stocks!.indices.map(
        (i): DrawerListItem => ({
          label: i.label,
          detail: `$${i.price.toFixed(2)} (${i.changePct !== undefined ? fmtPctSigned(i.changePct) : "—"})`,
          tone: (i.changePct ?? 0) > 0 ? "up" : (i.changePct ?? 0) < 0 ? "down" : "neutral",
        })
      )
    : [{ label: "Menunggu koneksi Finnhub API", tone: "neutral" }];

  return {
    id: "stocks",
    code: "EQT",
    title: "Stocks",
    tier: 2,
    tone,
    connected,
    summary: connected
      ? `Rata-rata indeks AS ${avgChange! >= 0 ? "menguat" : "melemah"} ${Math.abs(avgChange!).toFixed(2)}% — status ${statusLabel}.`
      : "Menunggu koneksi Finnhub API untuk Nasdaq/S&P500/Dow Jones.",
    cardMetric: metric("Avg Change", connected ? fmtPctSigned(avgChange!) : WAITING, tone, connected),
    aiExplanation: connected
      ? `Saham AS ${tone === "up" ? "menguat, risk appetite tinggi" : tone === "down" ? "melemah, risk-off berpotensi menyebar" : "bergerak flat"} — historically berkorelasi ${tone === "neutral" ? "lemah" : "positif"} dengan BTC.`
      : "Menunggu koneksi API untuk analisis korelasi saham-crypto.",
    narrative: {
      up: "Saham teknologi menguat -> risk appetite tinggi -> historically berkorelasi positif dengan BTC & altcoin.",
      down: "Saham teknologi melemah -> risk-off menyebar lintas aset -> crypto sering ikut tertekan jangka pendek.",
      neutral: "Saham bergerak flat -> korelasi ke crypto tidak signifikan hari ini.",
    },
    sections: [
      { kind: "list", title: "Indices", items: indexItems },
      { kind: "stats", items: [metric("Market Status", statusLabel, tone, connected)] },
    ],
  };
}

function buildCryptoNode(live: MarketMapLiveInputs): MarketMapNode {
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
    title: "Crypto Market",
    tier: 3,
    tone,
    connected,
    summary: connected
      ? `Total market cap ${fmtUsdShort(live.totalMarketCapUsd)}, ${fmtPctSigned(live.totalMarketCapChange24h ?? 0)} (24h).`
      : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Total Cap", connected ? fmtUsdShort(live.totalMarketCapUsd) : WAITING, tone, connected),
    aiExplanation: connected
      ? `Market cap crypto ${tone === "up" ? "naik" : tone === "down" ? "turun" : "stabil"} dalam 24 jam, BTC dominance ${
          live.btcDominance !== undefined ? `${live.btcDominance.toFixed(1)}%` : "—"
        }.`
      : "Menunggu koneksi API.",
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
    ],
  };
}

function buildBtcOrEthNode(
  live: MarketMapLiveInputs,
  which: "btc" | "eth"
): MarketMapNode {
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
    tier: 4,
    tone,
    connected,
    summary: connected
      ? `${which.toUpperCase()} di ${fmtUsdShort(asset!.price)}, struktur ${trend!.label.toLowerCase()}.`
      : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Trend", connected ? trend!.label : WAITING, tone, connected),
    aiExplanation: connected
      ? `Struktur ${trend!.label.toLowerCase()}${aiScore !== undefined ? `, AI Score ${aiScore}/100` : ""}${
          fundingRate !== undefined ? `, funding ${(fundingRate * 100).toFixed(4)}%` : ""
        }.`
      : "Menunggu koneksi API.",
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

function buildAltcoinNode(live: MarketMapLiveInputs): MarketMapNode {
  const connected = live.altseasonIndex !== undefined;
  const tone: DisplayTone = !connected ? "neutral" : live.altseasonIndex! >= 60 ? "up" : live.altseasonIndex! <= 40 ? "down" : "neutral";

  const sectorItems: DrawerListItem[] = live.sectorRotation?.length
    ? [...live.sectorRotation]
        .sort((a, b) => b.momentum - a.momentum)
        .map(
          (row): DrawerListItem => ({
            label: row.sector,
            detail: `${row.trendLabel} · momentum ${Math.round(row.momentum)}/100`,
            tone: row.trendTone,
          })
        )
    : [{ label: "Menunggu data Sector Rotation", tone: "neutral" }];

  return {
    id: "altcoin",
    code: "ALT",
    title: "Altcoin",
    tier: 4,
    tone,
    connected,
    summary: connected
      ? `Altseason Index ${Math.round(live.altseasonIndex!)} — ${tone === "up" ? "kondisi mendukung rotasi ke altcoin." : tone === "down" ? "likuiditas masih terpusat di BTC." : "kondisi campuran."}`
      : "Menunggu koneksi CoinGecko API.",
    cardMetric: metric("Altseason", connected ? `${Math.round(live.altseasonIndex!)}` : WAITING, tone, connected),
    aiExplanation: connected
      ? `Altseason Index ${Math.round(live.altseasonIndex!)}/100${
          live.altcoinTopGainer ? `, top gainer ${live.altcoinTopGainer.symbol} ${fmtPctSigned(live.altcoinTopGainer.change24h)}` : ""
        }.`
      : "Menunggu koneksi API.",
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
    ],
  };
}

export function buildMarketMapNodes(live: MarketMapLiveInputs): MarketMapNode[] {
  return [
    buildMacroNode(live),
    buildSentimentNode(live),
    buildUsdNode(live),
    buildGoldNode(live),
    buildStocksNode(live),
    buildCryptoNode(live),
    buildBtcOrEthNode(live, "btc"),
    buildBtcOrEthNode(live, "eth"),
    buildAltcoinNode(live),
  ];
}
