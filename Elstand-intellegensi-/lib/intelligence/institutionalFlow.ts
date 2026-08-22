import * as cheerio from "cheerio";
import { cached } from "../cache";
import type { TrendTone } from "./shared";

// ---------------------------------------------------------------------------
// Institutional Flow panel — ETF Flow, Smart Money Activity, Institutional
// Movement.
//
// ETF flow has no free, no-key JSON API, so per the brief's own instruction
// ("do NOT use a paid API, scrape/parse public info, priority Farside") this
// scrapes Farside Investors' public Bitcoin ETF flow table
// (https://farside.co.uk/btc/), which is plain server-rendered HTML, no key
// needed. IMPORTANT HONESTY NOTE: this was written by reading that page's
// HTML once — I have no way to run this scraper against a live Farside
// response from this environment, so it is best-effort, not verified
// end-to-end. After deploying, check your server logs for a `[farside]`
// line: none at all means it parsed fine; any `[farside] ...` message
// means the page layout drifted from what this was written against and
// the panel is falling back to "Waiting for API Connection" (never wrong
// numbers — see scrapeFarside() below, every failure path returns
// undefined rather than guessing).
//
// Smart Money Activity is NOT included here — it's already real, computed
// by lib/scanner-categories.ts's buildSmartMoneyAccumulation() from live
// on-chain data, and passed into the panel directly by the dashboard page.
// ---------------------------------------------------------------------------

export interface EtfFlowEntry {
  ticker: string;
  name: string;
  asset: "BTC" | "ETH";
  netFlowUsd: number;
}

export interface InstitutionalMovementEntry {
  label: string;
  detail: string;
  tone: TrendTone;
}

export interface InstitutionalFlowData {
  etfFlows: EtfFlowEntry[];
  etfNetTotalUsd: number;
  movements: InstitutionalMovementEntry[];
  connected: boolean;
}

const FARSIDE_URL = "https://farside.co.uk/btc/";

// Best-known issuer per ticker, for display only — wrong/missing name here
// never affects the flow numbers themselves.
const ISSUER_NAME: Record<string, string> = {
  IBIT: "BlackRock",
  FBTC: "Fidelity",
  BITB: "Bitwise",
  ARKB: "Ark / 21Shares",
  BTCO: "Invesco",
  EZBC: "Franklin Templeton",
  BRRR: "Valkyrie",
  HODL: "VanEck",
  BTCW: "WisdomTree",
  GBTC: "Grayscale",
  BTC: "Grayscale (Mini Trust)",
};

const TICKER_RE = /^[A-Z]{2,6}$/;
const DATE_RE = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/;

/** Farside shows negative flow as "(12.3)" and uses "-" or "0.0" for no flow; values are US$ millions. */
function parseFlowCell(text: string): number | undefined {
  const t = text.trim().replace(/,/g, "");
  if (!t || t === "-") return 0;
  const negative = t.startsWith("(") && t.endsWith(")");
  const num = Number(negative ? t.slice(1, -1) : t);
  if (!isFinite(num)) return undefined;
  return negative ? -num : num;
}

async function scrapeFarside(): Promise<{ flows: EtfFlowEntry[]; asOf: string } | undefined> {
  try {
    const res = await fetch(FARSIDE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElstandIntelligence/1.0)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[farside] HTTP ${res.status} ${res.statusText}`);
      return undefined;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const table = $("table").first();
    if (!table.length) {
      console.error("[farside] no <table> found on page — layout may have changed");
      return undefined;
    }

    const rows = table.find("tr").toArray();
    let tickerRow: string[] | undefined;
    let latestRow: { date: string; cells: string[] } | undefined;

    for (const row of rows) {
      const cells = $(row)
        .find("td, th")
        .toArray()
        .map((c) => $(c).text().trim());
      if (!cells.length) continue;
      const bodyCells = cells.slice(1); // first column is the row's own date/label

      // The ticker row is the one where every non-label cell is a short
      // all-caps symbol (IBIT, FBTC, ...) — detected structurally rather
      // than by a fixed row index, so it survives Farside adding/removing
      // an ETF or reordering rows above it.
      if (!tickerRow && bodyCells.length >= 3 && bodyCells.every((c) => TICKER_RE.test(c))) {
        tickerRow = bodyCells;
        continue;
      }
      // Keep overwriting so the LAST matching row (latest date, table is
      // chronological) wins.
      if (DATE_RE.test(cells[0])) {
        latestRow = { date: cells[0], cells: bodyCells };
      }
    }

    if (!tickerRow || !latestRow) {
      console.error("[farside] could not find both a ticker header row and a dated data row — layout may have changed");
      return undefined;
    }

    const flows: EtfFlowEntry[] = [];
    tickerRow.forEach((ticker, i) => {
      if (i >= latestRow!.cells.length - 1) return; // last column is the row's own Total, not a fund
      const value = parseFlowCell(latestRow!.cells[i]);
      if (value === undefined) return;
      flows.push({ ticker, name: ISSUER_NAME[ticker] ?? ticker, asset: "BTC", netFlowUsd: value * 1_000_000 });
    });

    if (!flows.length) {
      console.error("[farside] found the table but parsed 0 usable flow numbers from the latest row");
      return undefined;
    }
    return { flows, asOf: latestRow.date };
  } catch (err) {
    console.error(`[farside] ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function getInstitutionalFlowData(): Promise<InstitutionalFlowData> {
  const result = await cached("institutional:farside", 30 * 60_000, scrapeFarside);
  if (!result) {
    return { etfFlows: [], etfNetTotalUsd: 0, movements: [], connected: false };
  }

  const etfNetTotalUsd = result.flows.reduce((sum, f) => sum + f.netFlowUsd, 0);
  const biggestMoves = [...result.flows].sort((a, b) => Math.abs(b.netFlowUsd) - Math.abs(a.netFlowUsd)).slice(0, 3);
  const movements: InstitutionalMovementEntry[] = biggestMoves.map((f) => ({
    label: `${f.ticker} · ${f.name}`,
    detail: `${f.netFlowUsd >= 0 ? "Inflow" : "Outflow"} · ${result.asOf}`,
    tone: f.netFlowUsd > 0 ? "up" : f.netFlowUsd < 0 ? "down" : "neutral",
  }));

  return { etfFlows: result.flows, etfNetTotalUsd, movements, connected: true };
}
