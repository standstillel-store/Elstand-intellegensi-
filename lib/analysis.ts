import { formatUsd, formatPct, timeAgo } from "./format";
import { buildDumpCandidates, buildSmartMoneyAccumulation } from "./scanner-categories";
import type { NoctrunSnapshot } from "./snapshot";
import type { CoinMarket, WhaleTransfer, NewsItem, DexPool } from "./types";
import type { TerminalReport, ReportRow, ReportTone } from "./terminalReport";

// ---------------------------------------------------------------------------
// ElVoid AI is not a price oracle. Every line below is derived from the live
// snapshot (Fear & Greed, whale flow, funding/OI, pump & rugpull scores,
// news, economic calendar) with plain rule-based logic — no model call, no
// hallucinated numbers, no API cost. That's the whole point: it stays free
// and it stays honest about what it does and doesn't know.
//
// V3 note: everything below returns a TerminalReport (title + label/value
// rows + tone + optional list), not a markdown/emoji string. That's the
// "institutional terminal" format from the V3 brief — see
// lib/terminalReport.ts. The underlying math/thresholds are unchanged from
// the previous string-based version; only the output shape changed.
// ---------------------------------------------------------------------------

function findMarket(markets: CoinMarket[], query: string): CoinMarket | undefined {
  const q = query.trim().toLowerCase();
  return (
    markets.find((m) => m.symbol.toLowerCase() === q) ??
    markets.find((m) => m.name.toLowerCase() === q) ??
    markets.find((m) => m.name.toLowerCase().includes(q) && q.length >= 3)
  );
}

/** Pulls a candidate ticker out of free-text, e.g. "analisa ALLO dong" -> "ALLO". */
export function extractSymbolQuery(message: string, markets: CoinMarket[]): string | undefined {
  const words = message.match(/[a-zA-Z0-9]{2,15}/g) ?? [];
  const stop = new Set([
    "analisa", "analisis", "analysis", "tolong", "coba", "gimana", "bagaimana",
    "apakah", "apa", "dong", "yuk", "market", "crypto", "coin", "token", "the",
    "harga", "price", "of", "for", "about", "risk", "risiko", "whale", "news",
    "momentum", "pump", "rug", "rugpull", "summary", "kesimpulan", "conclusion",
  ]);
  for (const w of words) {
    const lw = w.toLowerCase();
    if (stop.has(lw)) continue;
    if (findMarket(markets, lw)) return lw;
  }
  return undefined;
}

function whaleFlowFor(symbol: string, whales: WhaleTransfer[]) {
  const matches = whales.filter((w) => w.asset.toLowerCase() === symbol.toLowerCase());
  const total = matches.reduce((sum, w) => sum + w.valueUsd, 0);
  return { matches, total };
}

function newsFor(symbol: string, name: string, news: NewsItem[]) {
  const s = symbol.toLowerCase();
  const n = name.toLowerCase();
  return news.filter((item) => {
    const t = item.title.toLowerCase();
    return t.includes(s) || (n.length > 2 && t.includes(n));
  });
}

function supportResistance(market: CoinMarket) {
  const points = market.sparkline_in_7d?.price ?? [];
  if (points.length < 2) return undefined;
  const high = Math.max(...points);
  const low = Math.min(...points);
  return { high, low };
}

function newsTone(sentiment?: NewsItem["sentiment"]): ReportTone {
  if (sentiment === "positive") return "up";
  if (sentiment === "negative") return "down";
  return "neutral";
}

function riskTone(score?: number): ReportTone {
  if (score === undefined) return "neutral";
  if (score >= 60) return "down";
  if (score >= 30) return "amber";
  return "up";
}

function momentumTone(score: number): ReportTone {
  if (score >= 70) return "up";
  if (score >= 40) return "amber";
  return "down";
}

// ---------------------------------------------------------------------------
// Per-coin report. Reuses the exact same lookups as getCoinReportData()
// below (same funding/whale/risk/support-resistance/news matches, same
// buildConclusion()) so the chat and the Token Analyzer widget never
// disagree on the same coin.
// ---------------------------------------------------------------------------
export function buildCoinTerminalReport(query: string, snap: NoctrunSnapshot): TerminalReport {
  const market = findMarket(snap.markets, query);
  if (!market) {
    return {
      eyebrow: "AI",
      title: "COIN NOT FOUND",
      found: false,
      emptyNote: `Saya tidak menemukan "${query}" di 150 coin teratas yang ElVoid AI pantau saat ini. Coba simbol lain, atau tanya soal market secara umum, whale activity, atau risk.`,
      rows: [],
    };
  }

  const symbol = market.symbol.toUpperCase();
  const pump = snap.pumpCandidates.find((c) => c.symbol === symbol);
  const risk = snap.rugpullRisks.find((r) => r.symbol === symbol);
  const { matches: whaleMatches, total: whaleTotal } = whaleFlowFor(market.symbol, snap.whales);
  const funding = snap.funding.find((f) => f.symbol.toUpperCase() === `${symbol}USDT`);
  const sr = supportResistance(market);
  const news = newsFor(market.symbol, market.name, snap.news);
  const score = pump?.score ?? 0;
  const change24h = market.price_change_percentage_24h_in_currency ?? 0;

  const rows: ReportRow[] = [
    {
      label: "PRICE",
      value: formatUsd(market.current_price),
      detail: `${formatPct(change24h)} 24h · Rank #${market.market_cap_rank ?? "-"}`,
      tone: change24h >= 0 ? "up" : "down",
      connected: true,
    },
    {
      label: "MOMENTUM",
      value: `${score}/100`,
      detail: pump?.reasons?.[0] ?? (pump ? `Confidence ${pump.confidence}%` : "Belum lolos threshold skor"),
      tone: momentumTone(score),
      connected: true,
    },
    {
      label: "WHALE",
      value: whaleMatches.length ? formatUsd(whaleTotal) : "Tidak Ada",
      detail: whaleMatches.length ? `${whaleMatches.length} transfer besar · 24 jam terakhir` : "Belum ada transfer besar terdeteksi",
      tone: whaleMatches.length ? "signal" : "neutral",
      connected: true,
    },
    {
      label: "RISK",
      value: risk ? `${risk.score}/100` : "Tidak Terdeteksi",
      detail: risk ? risk.flags.slice(0, 2).join("; ") || "-" : "Bukan jaminan aman — tetap DYOR",
      tone: riskTone(risk?.score),
      connected: true,
    },
  ];

  if (funding) {
    rows.push({
      label: "FUNDING",
      value: `${(funding.lastFundingRate * 100).toFixed(4)}%`,
      detail: funding.lastFundingRate < 0 ? "Negatif — short bayar long" : "Positif — long bayar short",
      tone: funding.lastFundingRate < -0.0005 ? "amber" : "neutral",
      connected: true,
    });
    if (funding.openInterestValue) {
      rows.push({ label: "OPEN INTEREST", value: formatUsd(funding.openInterestValue), tone: "neutral", connected: true });
    }
  }

  if (sr) {
    rows.push({
      label: "STRUCTURE",
      value: `R ${formatUsd(sr.high)}`,
      detail: `S ${formatUsd(sr.low)} · 7d range`,
      tone: "neutral",
      connected: true,
    });
  }

  const bearishRisk = (risk?.score ?? 0) >= 60;
  const bullish = score >= 60;
  const action: { label: string; tone: ReportTone } = bearishRisk
    ? { label: "Waspada", tone: "down" }
    : bullish && whaleTotal > 100_000
      ? { label: "Momentum Terkonfirmasi", tone: "up" }
      : bullish
        ? { label: "Monitor", tone: "amber" }
        : (funding?.lastFundingRate ?? 0) < -0.0005
          ? { label: "Pantau Short Squeeze", tone: "amber" }
          : { label: "Wait", tone: "neutral" };

  return {
    eyebrow: symbol,
    title: `${market.name.toUpperCase()} ANALYSIS`,
    found: true,
    statusLabel: change24h >= 2 ? "Bullish" : change24h <= -2 ? "Bearish" : "Neutral",
    statusTone: change24h >= 2 ? "up" : change24h <= -2 ? "down" : "neutral",
    rows,
    listItems: news.slice(0, 3).map((n) => ({
      primary: n.title,
      secondary: `${n.source} · ${timeAgo(n.publishedAt)}`,
      tone: newsTone(n.sentiment),
    })),
    conclusion: buildConclusion({ score, riskScore: risk?.score, funding, sr, market, whaleTotal }),
    actionLabel: action.label,
    actionTone: action.tone,
    chartSymbol: symbol,
  };
}

/**
 * Shared by buildCoinTerminalReport() above and getCoinReportData() below —
 * one place decides what the conclusion sentence says, so the chat dock and
 * the Token Analyzer widget can't ever tell two different stories about the
 * same coin.
 */
export function buildConclusion(args: {
  score: number;
  riskScore?: number;
  funding?: { lastFundingRate: number };
  sr?: { high: number; low: number };
  market: CoinMarket;
  whaleTotal: number;
}): string {
  const { score, riskScore, funding, sr, market, whaleTotal } = args;
  const bullish = score >= 60;
  const bearishRisk = (riskScore ?? 0) >= 60;
  const nearResistance = sr ? market.current_price >= sr.high * 0.97 : false;

  if (bearishRisk) {
    return "Sinyal risiko cukup tinggi — prioritaskan verifikasi kontrak, likuiditas, dan tim sebelum mempertimbangkan entry apa pun.";
  }
  if (bullish && whaleTotal > 100_000) {
    return `Momentum bullish mulai terbentuk didukung akumulasi whale${
      nearResistance ? ", tetapi harga sudah mendekati resistance — tunggu konfirmasi breakout" : ""
    }. Bukan sinyal beli otomatis — cek konfirmasi volume sebelum entry.`;
  }
  if (bullish) {
    return "Skor momentum cukup kuat, tapi belum didukung whale flow yang signifikan — tunggu konfirmasi tambahan sebelum entry.";
  }
  if ((funding?.lastFundingRate ?? 0) < -0.0005) {
    return "Funding negatif menandakan short crowded — berpotensi short-squeeze, tapi belum ada konfirmasi momentum kuat. Pantau dulu.";
  }
  return "Belum ada sinyal kuat ke satu arah saat ini. Data ini adalah bahan pertimbangan, bukan rekomendasi — selalu verifikasi mandiri sebelum ambil posisi.";
}

// ---------------------------------------------------------------------------
// Focused single-section answers (when the user asks about just one thing).
// ---------------------------------------------------------------------------
export function buildWhaleTerminalReport(snap: NoctrunSnapshot): TerminalReport {
  const whales = snap.whales;
  const total = whales.reduce((s, w) => s + w.valueUsd, 0);
  return {
    eyebrow: "WHALE",
    title: "WHALE ACTIVITY — 24H",
    found: true,
    rows: [
      {
        label: "TOTAL FLOW",
        value: whales.length ? formatUsd(total) : "Tidak Ada",
        detail: whales.length ? `${whales.length} transfer besar terdeteksi` : "Tidak ada transfer whale besar saat ini",
        tone: whales.length ? "signal" : "neutral",
        connected: true,
      },
    ],
    listItems: whales.slice(0, 8).map((w) => ({
      primary: `${w.asset} · ${formatUsd(w.valueUsd)}`,
      secondary: timeAgo(w.timestamp),
      tone: "signal" as ReportTone,
    })),
    conclusion: whales.length
      ? "Aktivitas di atas adalah transfer besar yang terdeteksi lintas watchlist — bukan sinyal beli/jual otomatis."
      : "Tidak ada transfer whale besar yang terdeteksi saat ini di watchlist.",
  };
}

export function buildRiskTerminalReport(snap: NoctrunSnapshot): TerminalReport {
  const risks = snap.rugpullRisks;
  return {
    eyebrow: "RISK",
    title: "RISK ASSESSMENT — TOP FLAGS",
    found: true,
    rows: [{ label: "FLAGGED TOKENS", value: String(risks.length), tone: risks.length ? "down" : "up", connected: true }],
    listItems: risks.slice(0, 8).map((r) => ({
      primary: `${r.symbol} · ${r.score}/100`,
      secondary: `Confidence ${r.confidence}% · ${r.flags.slice(0, 2).join("; ") || "-"}`,
      tone: riskTone(r.score),
    })),
    conclusion: risks.length
      ? "Skor risiko di atas berbasis data DEX (likuiditas, kontrak, distribusi holder) — bukan jaminan aman, tetap DYOR."
      : "Tidak ada token dengan skor risiko tinggi yang terdeteksi saat ini.",
  };
}

export function buildMomentumTerminalReport(snap: NoctrunSnapshot): TerminalReport {
  const candidates = snap.pumpCandidates;
  return {
    eyebrow: "MOMENTUM",
    title: "HIGH MOMENTUM WATCHLIST",
    found: true,
    rows: [{ label: "CANDIDATES", value: String(candidates.length), tone: candidates.length ? "up" : "neutral", connected: true }],
    listItems: candidates.slice(0, 8).map((c) => ({
      primary: `${c.symbol} · ${c.score}/100`,
      secondary: `Confidence ${c.confidence}% · ${c.reasons.slice(0, 2).join("; ") || "-"}`,
      tone: momentumTone(c.score),
    })),
    conclusion: candidates.length
      ? "Watchlist di atas lolos threshold skor momentum rule-based — layak diperiksa lebih lanjut, bukan instruksi entry."
      : "Belum ada token di watchlist momentum yang lolos threshold skor saat ini.",
  };
}

export function buildNewsTerminalReport(snap: NoctrunSnapshot): TerminalReport {
  const news = snap.news;
  return {
    eyebrow: "NEWS",
    title: "NEWS IMPACT — LATEST",
    found: true,
    rows: [],
    listItems: news.slice(0, 8).map((n) => ({
      primary: n.title,
      secondary: `${n.source} · ${timeAgo(n.publishedAt)}`,
      tone: newsTone(n.sentiment),
    })),
    conclusion: news.length ? undefined : "Tidak ada feed berita aktif saat ini (NEWSAPI_KEY belum di-set, atau rate limit).",
  };
}

export function buildGreetingTerminalReport(): TerminalReport {
  return {
    eyebrow: "AI",
    title: "ELVOID AI",
    found: true,
    rows: [],
    conclusion:
      "Halo, saya ElVoid AI — asisten intelijen pasar ELSTAND INTELLIGENCE. Bekerja langsung dari data live (Fear & Greed, whale flow, funding/OI, momentum, risk, news, kalender ekonomi), tanpa model berbayar di baliknya. Coba salah satu prompt cepat di bawah, atau ketik simbol coin.",
  };
}

// ---------------------------------------------------------------------------
// Router: decide what the user is actually asking for. Split into a cheap,
// synchronous classifier (needs nothing beyond the base snapshot already in
// hand) so the caller only pays for the heavier cross-asset market-snapshot
// fetch (sentiment / macro / ETF flow — see marketSnapshotReport.ts) when
// it's actually a general market question.
// ---------------------------------------------------------------------------
export type ChatIntent =
  | { type: "greeting" }
  | { type: "coin"; symbol: string }
  | { type: "whale" }
  | { type: "risk" }
  | { type: "momentum" }
  | { type: "news" }
  | { type: "market" };

export function classifyChatIntent(message: string, markets: CoinMarket[]): ChatIntent {
  const m = message.toLowerCase().trim();
  if (/^(hi|halo|hai|hey|hello|p)\b/.test(m) || m.length < 3) return { type: "greeting" };

  const symbol = extractSymbolQuery(message, markets);
  if (symbol) return { type: "coin", symbol };

  if (/whale/.test(m)) return { type: "whale" };
  if (/rug|risk|risiko/.test(m)) return { type: "risk" };
  if (/momentum|pump/.test(m)) return { type: "momentum" };
  if (/news|berita/.test(m)) return { type: "news" };
  return { type: "market" };
}

/**
 * Handles every intent except "market" (returns null for that one — the
 * caller builds the richer cross-asset snapshot via
 * lib/intelligence/marketSnapshotReport.ts, since that needs sources this
 * function's NoctrunSnapshot argument doesn't carry).
 */
export function routeTerminalMessage(message: string, snap: NoctrunSnapshot): TerminalReport | null {
  const intent = classifyChatIntent(message, snap.markets);
  switch (intent.type) {
    case "greeting":
      return buildGreetingTerminalReport();
    case "coin":
      return buildCoinTerminalReport(intent.symbol, snap);
    case "whale":
      return buildWhaleTerminalReport(snap);
    case "risk":
      return buildRiskTerminalReport(snap);
    case "momentum":
      return buildMomentumTerminalReport(snap);
    case "news":
      return buildNewsTerminalReport(snap);
    case "market":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Structured version of the coin lookup, for UI widgets (Token Analyzer)
// that need each section as its own field instead of a TerminalReport's
// row list. Reuses the exact same lookups as buildCoinTerminalReport() /
// buildConclusion() above, so the numbers never drift between the chat dock
// and the widget.
// ---------------------------------------------------------------------------
export interface CoinReport {
  found: boolean;
  query: string;
  symbol?: string;
  name?: string;
  price?: number;
  change24h?: number;
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
  aiAnalysis: { summary: string; pumpScore?: number; confidence?: number; reasons: string[] };
  whale: { totalUsd: number; count: number; text: string };
  risk: { score?: number; confidence?: number; flags: string[]; text: string };
  momentum: { fundingRate?: number; openInterestValue?: number; support?: number; resistance?: number };
  news: { title: string; source: string; publishedAt: string; sentiment?: NewsItem["sentiment"] }[];
  onchain?: { network: string; liquidityUsd: number; volume24hUsd: number; fdvUsd?: number; poolCreatedAt?: string };
  /** Bearish mirror of aiAnalysis.pumpScore — undefined when no bearish signal fires (never forced to 0). */
  dumpScore?: number;
  /** Net whale inflow score (0-100) — undefined when no meaningful net inflow was detected. */
  smartMoneyScore?: number;
  /**
   * Holder count and next unlock are NOT wired to a live data source yet —
   * this app has no on-chain holder-count or vesting-schedule provider
   * configured. Left `null` (never fabricated) so the UI can show an honest
   * "data provider not connected" placeholder instead of a fake number.
   */
  holders: number | null;
  nextUnlock: { date: string; amountUsd?: number } | null;
  /** Market-wide upcoming events — relevant to every coin, not coin-specific (no per-token calendar source exists). */
  upcomingEvents: { title: string; country: string; date: string; impact: "high" | "medium" | "low" }[];
  conclusion: string;
}

function findPool(pools: DexPool[], symbol: string): DexPool | undefined {
  return pools.find((p) => p.baseSymbol?.toLowerCase() === symbol.toLowerCase());
}

export function getCoinReportData(query: string, snap: NoctrunSnapshot): CoinReport {
  const market = findMarket(snap.markets, query);
  if (!market) {
    return {
      found: false,
      query,
      aiAnalysis: { summary: "", reasons: [] },
      whale: { totalUsd: 0, count: 0, text: "" },
      risk: { flags: [], text: "" },
      momentum: {},
      news: [],
      holders: null,
      nextUnlock: null,
      upcomingEvents: [],
      conclusion: "",
    };
  }

  const symbol = market.symbol.toUpperCase();
  const pump = snap.pumpCandidates.find((c) => c.symbol === symbol);
  const risk = snap.rugpullRisks.find((r) => r.symbol === symbol);
  const { matches: whaleMatches, total: whaleTotal } = whaleFlowFor(market.symbol, snap.whales);
  const funding = snap.funding.find((f) => f.symbol.toUpperCase() === `${symbol}USDT`);
  const sr = supportResistance(market);
  const news = newsFor(market.symbol, market.name, snap.news);
  const pool = findPool(snap.pools, market.symbol);
  const score = pump?.score ?? 0;

  // Reuses the exact same Token Scanner category logic as the Home dashboard
  // — one rule set, never two different answers for the same symbol.
  const dump = buildDumpCandidates(snap.markets, snap.funding, snap.whales).find((d) => d.symbol === symbol);
  const smartMoney = buildSmartMoneyAccumulation(snap.whales, snap.markets).find((s) => s.symbol === symbol);
  const smartMoneyScore = smartMoney ? Math.min(100, Math.round((smartMoney.netInflowUsd / 5_000_000) * 100)) : undefined;
  const upcomingEvents = snap.calendar
    .filter((e) => new Date(e.date).getTime() >= Date.now())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3)
    .map((e) => ({ title: e.title, country: e.country, date: e.date, impact: e.impact }));

  return {
    found: true,
    query,
    symbol,
    name: market.name,
    price: market.current_price,
    change24h: market.price_change_percentage_24h_in_currency ?? 0,
    marketCap: market.market_cap,
    marketCapRank: market.market_cap_rank,
    volume24h: market.total_volume,
    aiAnalysis: {
      summary: `${symbol} di ${formatUsd(market.current_price)} (${formatPct(market.price_change_percentage_24h_in_currency ?? 0)} 24h). Market cap ${formatUsd(market.market_cap)} (rank #${market.market_cap_rank}).`,
      pumpScore: pump?.score,
      confidence: pump?.confidence,
      reasons: pump?.reasons ?? [],
    },
    whale: {
      totalUsd: whaleTotal,
      count: whaleMatches.length,
      text: whaleMatches.length
        ? `${whaleMatches.length} transfer besar, total ${formatUsd(whaleTotal)} dalam 24 jam terakhir.`
        : "Tidak ada transfer whale besar yang terdeteksi untuk token ini.",
    },
    risk: {
      score: risk?.score,
      confidence: risk?.confidence,
      flags: risk?.flags ?? [],
      text: risk
        ? `Risk score ${risk.score}/100.`
        : "Tidak ada sinyal risiko dari data DEX saat ini — bukan jaminan aman, tetap DYOR.",
    },
    momentum: {
      fundingRate: funding?.lastFundingRate,
      openInterestValue: funding?.openInterestValue,
      support: sr?.low,
      resistance: sr?.high,
    },
    news: news.slice(0, 3).map((n) => ({
      title: n.title,
      source: n.source,
      publishedAt: n.publishedAt,
      sentiment: n.sentiment,
    })),
    onchain: pool
      ? {
          network: pool.network,
          liquidityUsd: pool.liquidityUsd,
          volume24hUsd: pool.volume24hUsd,
          fdvUsd: pool.fdvUsd,
          poolCreatedAt: pool.poolCreatedAt,
        }
      : undefined,
    dumpScore: dump?.score,
    smartMoneyScore,
    holders: null,
    nextUnlock: null,
    upcomingEvents,
    conclusion: buildConclusion({ score, riskScore: risk?.score, funding, sr, market, whaleTotal }),
  };
}
