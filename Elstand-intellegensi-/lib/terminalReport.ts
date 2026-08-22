// ---------------------------------------------------------------------------
// Shared shape for every ElVoid AI text output — chat replies, the AI Summary
// card, anything that used to be a markdown/emoji paragraph. Per the V3
// brief: no markdown headings, no **bold**, no emoji, no walls of text.
// Everything is a title + label/value rows + (optional) a short list + a
// plain-language conclusion + a recommended action. Nothing in this file
// computes anything — it's just the shape. The actual numbers are derived
// in lib/analysis.ts and lib/intelligence/marketSnapshotReport.ts from data
// that's already trusted elsewhere on the dashboard.
// ---------------------------------------------------------------------------

export type ReportTone = "up" | "down" | "amber" | "neutral" | "signal";

export interface ReportRow {
  /** Short, ALL-CAPS terminal label, e.g. "MACRO", "WHALE", "PRICE". */
  label: string;
  value: string;
  /** Secondary explanatory line shown under the value, e.g. "CPI in 18h". */
  detail?: string;
  tone: ReportTone;
  /**
   * false = the underlying source isn't wired up / didn't return data.
   * The renderer shows "Waiting" instead of `value` — never a fabricated
   * number. Same rule this codebase already uses everywhere else.
   */
  connected: boolean;
}

export interface ReportListItem {
  primary: string;
  secondary?: string;
  tone?: ReportTone;
}

export interface ReportWatchlistEntry {
  symbol: string;
  change24h?: number;
}

export interface TerminalReport {
  /** Small code badge, e.g. "AI", "BTC", "WHALE" — mirrors SectionHeader's "<GO>" style. */
  eyebrow: string;
  /** Shown next to "ELVOID AI —" in the card header, e.g. "MARKET SNAPSHOT". */
  title: string;
  /** false = nothing to show but emptyNote (coin not found, empty message, error). */
  found: boolean;
  emptyNote?: string;
  /** Big highlighted status, e.g. Market Mode or a coin's Bullish/Bearish/Neutral read. */
  statusLabel?: string;
  statusTone?: ReportTone;
  /** 0-100. Omit rather than invent one when there isn't a real confidence figure. */
  confidence?: number;
  rows: ReportRow[];
  /** For whale/risk/momentum/news-style feeds — a short list instead of a bullet wall. */
  listItems?: ReportListItem[];
  /** Plain-language, no markdown, no emoji. Can be omitted (e.g. a pure news feed). */
  conclusion?: string;
  actionLabel?: string;
  actionTone?: ReportTone;
  actionNote?: string;
  watchlist?: ReportWatchlistEntry[];
  /** Symbol to link to the live chart view, when the query was about one coin. */
  chartSymbol?: string;
}
