// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — Canonical Indicator Registry
//
// Every economic release/observation in this subsystem is identified by a
// CanonicalIndicatorId, never by a provider's raw title string. This is the
// fix for the "CPI YoY silently merges with CPI MoM" failure mode: two
// different provider titles that describe the same measurement resolve to
// the same id; two titles that describe different measurements (even the
// same headline concept at a different cadence/variant) never do.
//
// resolveCanonicalIndicatorId() returns "UNKNOWN" for anything not in the
// alias table below — it never guesses. An unmapped title is honestly
// unusable for cross-provider merging, not silently coerced into the
// nearest-sounding indicator.
// ---------------------------------------------------------------------------

export const CANONICAL_INDICATOR_IDS = [
  "CPI_HEADLINE_YOY",
  "CPI_HEADLINE_MOM",
  "CORE_CPI_YOY",
  "CORE_CPI_MOM",

  "PPI_HEADLINE_YOY",
  "PPI_HEADLINE_MOM",
  "CORE_PPI_YOY",
  "CORE_PPI_MOM",

  "NFP",
  "UNEMPLOYMENT_RATE",
  "AVERAGE_HOURLY_EARNINGS_YOY",
  "AVERAGE_HOURLY_EARNINGS_MOM",

  "RETAIL_SALES_HEADLINE",
  "RETAIL_SALES_CORE",
  "DURABLE_GOODS_ORDERS",

  "REAL_GDP_QOQ",
  "REAL_GDP_YOY",

  "PMI_MANUFACTURING",
  "PMI_SERVICES",

  "FED_FUNDS_RATE",
  "TREASURY_YIELD_10Y",

  "FOMC_RATE_DECISION",

  "CONSUMER_CONFIDENCE",
  "MICHIGAN_SENTIMENT",
] as const;

export type CanonicalIndicatorId = (typeof CANONICAL_INDICATOR_IDS)[number];

export type IndicatorCategory = "INFLATION" | "LABOR" | "GROWTH" | "MONETARY_POLICY" | "SENTIMENT";

export const INDICATOR_CATEGORY: Record<CanonicalIndicatorId, IndicatorCategory> = {
  CPI_HEADLINE_YOY: "INFLATION",
  CPI_HEADLINE_MOM: "INFLATION",
  CORE_CPI_YOY: "INFLATION",
  CORE_CPI_MOM: "INFLATION",
  PPI_HEADLINE_YOY: "INFLATION",
  PPI_HEADLINE_MOM: "INFLATION",
  CORE_PPI_YOY: "INFLATION",
  CORE_PPI_MOM: "INFLATION",

  NFP: "LABOR",
  UNEMPLOYMENT_RATE: "LABOR",
  AVERAGE_HOURLY_EARNINGS_YOY: "LABOR",
  AVERAGE_HOURLY_EARNINGS_MOM: "LABOR",

  RETAIL_SALES_HEADLINE: "GROWTH",
  RETAIL_SALES_CORE: "GROWTH",
  DURABLE_GOODS_ORDERS: "GROWTH",
  REAL_GDP_QOQ: "GROWTH",
  REAL_GDP_YOY: "GROWTH",
  PMI_MANUFACTURING: "GROWTH",
  PMI_SERVICES: "GROWTH",

  FED_FUNDS_RATE: "MONETARY_POLICY",
  TREASURY_YIELD_10Y: "MONETARY_POLICY",
  FOMC_RATE_DECISION: "MONETARY_POLICY",

  CONSUMER_CONFIDENCE: "SENTIMENT",
  MICHIGAN_SENTIMENT: "SENTIMENT",
};

/**
 * Provider-title alias → canonical id. Keys are matched case-insensitively
 * against a normalized (lowercased, whitespace-collapsed) version of the
 * provider's raw title. Ordered roughly most-specific-first so a longer,
 * more specific alias never gets shadowed by a shorter substring alias
 * (matching is exact-string, not substring, so ordering here is only for
 * human readability — see resolveCanonicalIndicatorId()).
 *
 * This list is intentionally not exhaustive. Extending it is safe and
 * additive; an unmatched title simply resolves to "UNKNOWN" rather than
 * breaking anything.
 */
const ALIAS_MAP: Record<string, CanonicalIndicatorId> = {
  // --- CPI ---
  "cpi y/y": "CPI_HEADLINE_YOY",
  "cpi yoy": "CPI_HEADLINE_YOY",
  "consumer price index y/y": "CPI_HEADLINE_YOY",
  "consumer price index (yoy)": "CPI_HEADLINE_YOY",
  "us cpi y/y": "CPI_HEADLINE_YOY",
  "inflation rate y/y": "CPI_HEADLINE_YOY",
  "inflation rate yoy": "CPI_HEADLINE_YOY",

  "cpi m/m": "CPI_HEADLINE_MOM",
  "cpi mom": "CPI_HEADLINE_MOM",
  "consumer price index m/m": "CPI_HEADLINE_MOM",
  "inflation rate m/m": "CPI_HEADLINE_MOM",

  "core cpi y/y": "CORE_CPI_YOY",
  "core cpi yoy": "CORE_CPI_YOY",
  "core consumer price index y/y": "CORE_CPI_YOY",

  "core cpi m/m": "CORE_CPI_MOM",
  "core cpi mom": "CORE_CPI_MOM",
  "core consumer price index m/m": "CORE_CPI_MOM",

  // --- PPI ---
  "ppi y/y": "PPI_HEADLINE_YOY",
  "producer price index y/y": "PPI_HEADLINE_YOY",
  "ppi m/m": "PPI_HEADLINE_MOM",
  "producer price index m/m": "PPI_HEADLINE_MOM",
  "core ppi y/y": "CORE_PPI_YOY",
  "core ppi m/m": "CORE_PPI_MOM",

  // --- Labor ---
  "non-farm employment change": "NFP",
  "nonfarm payrolls": "NFP",
  "non farm payrolls": "NFP",
  "nfp": "NFP",
  "unemployment rate": "UNEMPLOYMENT_RATE",
  "average hourly earnings y/y": "AVERAGE_HOURLY_EARNINGS_YOY",
  "average hourly earnings yoy": "AVERAGE_HOURLY_EARNINGS_YOY",
  "average hourly earnings m/m": "AVERAGE_HOURLY_EARNINGS_MOM",
  "average hourly earnings mom": "AVERAGE_HOURLY_EARNINGS_MOM",

  // --- Growth ---
  "retail sales m/m": "RETAIL_SALES_HEADLINE",
  "retail sales": "RETAIL_SALES_HEADLINE",
  "core retail sales m/m": "RETAIL_SALES_CORE",
  "core retail sales": "RETAIL_SALES_CORE",
  "durable goods orders m/m": "DURABLE_GOODS_ORDERS",
  "durable goods orders": "DURABLE_GOODS_ORDERS",
  "gdp q/q": "REAL_GDP_QOQ",
  "gdp qoq": "REAL_GDP_QOQ",
  "prelim gdp q/q": "REAL_GDP_QOQ",
  "gdp y/y": "REAL_GDP_YOY",
  "ism manufacturing pmi": "PMI_MANUFACTURING",
  "s&p global manufacturing pmi": "PMI_MANUFACTURING",
  "ism services pmi": "PMI_SERVICES",
  "ism non-manufacturing pmi": "PMI_SERVICES",
  "s&p global services pmi": "PMI_SERVICES",

  // --- Monetary policy ---
  "fed interest rate decision": "FOMC_RATE_DECISION",
  "fomc statement": "FOMC_RATE_DECISION",
  "federal funds rate": "FED_FUNDS_RATE",
  "10-year treasury yield": "TREASURY_YIELD_10Y",
  "10 year treasury yield": "TREASURY_YIELD_10Y",

  // --- Sentiment ---
  "cb consumer confidence": "CONSUMER_CONFIDENCE",
  "consumer confidence": "CONSUMER_CONFIDENCE",
  "prelim umich consumer sentiment": "MICHIGAN_SENTIMENT",
  "michigan consumer sentiment": "MICHIGAN_SENTIMENT",
  "umich consumer sentiment": "MICHIGAN_SENTIMENT",
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolves a provider's raw event/indicator title to a CanonicalIndicatorId,
 * or "UNKNOWN" when no alias matches. Exact-match only (against the
 * normalized title) — deliberately no fuzzy/substring matching, since a
 * substring match is exactly the kind of "silent guess" this registry
 * exists to prevent (e.g. a substring match could conflate "Core CPI m/m"
 * with "CPI m/m").
 */
export function resolveCanonicalIndicatorId(title: string): CanonicalIndicatorId | "UNKNOWN" {
  const normalized = normalizeTitle(title);
  return ALIAS_MAP[normalized] ?? "UNKNOWN";
}

/**
 * Alpha Vantage `function` param → what its raw series actually is, and
 * which canonical id(s) it backs.
 *
 * IMPORTANT HONESTY NOTE — read before extending this table:
 * Alpha Vantage's ECONOMIC_INDICATORS functions return raw LEVELS or a
 * RATE already, never a "market-consensus surprise" figure and, for the
 * level-type series, never a pre-computed MoM/YoY % change. Specifically:
 *   - CPI: monthly CPI INDEX LEVEL (e.g. "312.3"), not a % change. The
 *     market-relevant "CPI m/m" / "CPI y/y" prints must be DERIVED by
 *     diffing consecutive observations — see normalize.ts's
 *     deriveChangeSeries(). Backs both CPI_HEADLINE_MOM and
 *     CPI_HEADLINE_YOY from the one raw series.
 *   - NONFARM_PAYROLL: monthly total-employment LEVEL (thousands of
 *     persons), not the month-over-month net change markets quote as
 *     "NFP". Derived as an absolute (not %) month-over-month diff — see
 *     normalize.ts's `derivationKind: "DIFF_ABSOLUTE"` path. Backs NFP.
 *   - UNEMPLOYMENT: already a RATE (%) — no derivation needed. Backs
 *     UNEMPLOYMENT_RATE directly.
 *   - RETAIL_SALES / DURABLES: monthly LEVEL ($M) — derived as a MoM %
 *     change, same as CPI. Back RETAIL_SALES_HEADLINE / DURABLE_GOODS_ORDERS.
 *   - REAL_GDP: quarterly LEVEL (chained $B) — derived as QoQ and YoY %
 *     change. Backs REAL_GDP_QOQ and REAL_GDP_YOY.
 * `INFLATION` (annual, already a rate) is deliberately NOT used — it
 * would be a second, lower-frequency, ambiguous source for the same
 * CPI_HEADLINE_YOY id the derived monthly CPI series already covers more
 * usefully; using both would reintroduce exactly the "which source wins"
 * ambiguity this registry exists to avoid.
 */
export type AlphaVantageSeriesKind = "LEVEL" | "RATE";
export type DerivationKind = "NONE" | "PCT_CHANGE_MOM" | "PCT_CHANGE_YOY" | "DIFF_ABSOLUTE_MOM";

export interface AlphaVantageFunctionMapping {
  seriesKind: AlphaVantageSeriesKind;
  /** Canonical ids derived from this one raw series, each with how it's derived. */
  targets: { indicatorId: CanonicalIndicatorId; derivation: DerivationKind }[];
}

export const ALPHA_VANTAGE_FUNCTION_MAP: Record<string, AlphaVantageFunctionMapping> = {
  CPI: {
    seriesKind: "LEVEL",
    targets: [
      { indicatorId: "CPI_HEADLINE_MOM", derivation: "PCT_CHANGE_MOM" },
      { indicatorId: "CPI_HEADLINE_YOY", derivation: "PCT_CHANGE_YOY" },
    ],
  },
  NONFARM_PAYROLL: {
    seriesKind: "LEVEL",
    targets: [{ indicatorId: "NFP", derivation: "DIFF_ABSOLUTE_MOM" }],
  },
  UNEMPLOYMENT: {
    seriesKind: "RATE",
    targets: [{ indicatorId: "UNEMPLOYMENT_RATE", derivation: "NONE" }],
  },
  RETAIL_SALES: {
    seriesKind: "LEVEL",
    targets: [{ indicatorId: "RETAIL_SALES_HEADLINE", derivation: "PCT_CHANGE_MOM" }],
  },
  DURABLES: {
    seriesKind: "LEVEL",
    targets: [{ indicatorId: "DURABLE_GOODS_ORDERS", derivation: "PCT_CHANGE_MOM" }],
  },
  REAL_GDP: {
    seriesKind: "LEVEL",
    targets: [
      { indicatorId: "REAL_GDP_QOQ", derivation: "PCT_CHANGE_MOM" }, // "MOM" here means "vs prior period in the series" (quarter, for this function) — see normalize.ts
      { indicatorId: "REAL_GDP_YOY", derivation: "PCT_CHANGE_YOY" },
    ],
  },
};
