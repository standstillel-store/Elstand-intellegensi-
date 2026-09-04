// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — indicator definitions.
//
// DELIBERATELY does NOT contain a `higher_is: "bullish" | "bearish"` field
// or any equivalent generic directional flag (architecture correction §2 /
// Rule 4). This table only holds STRUCTURAL facts about each indicator —
// what category it belongs to, what unit it's expressed in, what
// comparisons it supports. The actual economic-meaning interpretation
// (surprise → macro pressure → policy implication) is explicit,
// per-indicator logic in interpret.ts — never a boolean flag looked up
// here and blindly applied.
// ---------------------------------------------------------------------------

import { CANONICAL_INDICATOR_IDS, INDICATOR_CATEGORY, type CanonicalIndicatorId, type IndicatorCategory } from "./canonicalIndicators";

export interface IndicatorDefinition {
  id: CanonicalIndicatorId;
  category: IndicatorCategory;
  displayName: string;
  unit: "PERCENT" | "PERCENT_POINTS" | "THOUSANDS_OF_PERSONS" | "INDEX" | "USD_MILLIONS";
  /** Whether this indicator's release event carries a forecast/consensus figure worth comparing actual against (some, like FOMC statements, often don't). */
  supportsForecastComparison: boolean;
  /** Whether this indicator's prior print is meaningfully revisable (NFP, GDP, Retail Sales, Durable Goods routinely are; a point-in-time rate print like the Fed Funds Rate is not). */
  supportsRevisionAnalysis: boolean;
  /** Human-readable notes on what this indicator structurally measures — descriptive only, never consumed as a directional rule by interpret.ts. */
  notes: string;
}

const DEFINITIONS: Record<CanonicalIndicatorId, Omit<IndicatorDefinition, "id" | "category">> = {
  CPI_HEADLINE_YOY: {
    displayName: "CPI (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Headline Consumer Price Index, year-over-year. Broadest US inflation gauge tracked by markets.",
  },
  CPI_HEADLINE_MOM: {
    displayName: "CPI (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Headline CPI, month-over-month. More reactive to a single month's price moves than the YoY print.",
  },
  CORE_CPI_YOY: {
    displayName: "Core CPI (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "CPI excluding food & energy, year-over-year. The print the Fed weights most heavily for underlying trend.",
  },
  CORE_CPI_MOM: {
    displayName: "Core CPI (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Core CPI, month-over-month.",
  },
  PPI_HEADLINE_YOY: {
    displayName: "PPI (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Producer Price Index, year-over-year — upstream/wholesale price pressure, a leading signal for CPI.",
  },
  PPI_HEADLINE_MOM: {
    displayName: "PPI (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "PPI, month-over-month.",
  },
  CORE_PPI_YOY: {
    displayName: "Core PPI (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "PPI excluding food & energy, year-over-year.",
  },
  CORE_PPI_MOM: {
    displayName: "Core PPI (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Core PPI, month-over-month.",
  },

  NFP: {
    displayName: "Nonfarm Payrolls",
    unit: "THOUSANDS_OF_PERSONS",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes:
      "Net monthly change in US nonfarm employment. Routinely revised in subsequent months — see revisionEngine.ts. Should always be read alongside Unemployment Rate and Average Hourly Earnings, not in isolation — see employmentComposite.ts.",
  },
  UNEMPLOYMENT_RATE: {
    displayName: "Unemployment Rate",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Share of the labor force unemployed. A RISING rate structurally means a WEAKER labor market — the inverse relationship of NFP.",
  },
  AVERAGE_HOURLY_EARNINGS_YOY: {
    displayName: "Average Hourly Earnings (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Wage growth, year-over-year — a lagging labor-tightness and inflation-persistence signal.",
  },
  AVERAGE_HOURLY_EARNINGS_MOM: {
    displayName: "Average Hourly Earnings (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Wage growth, month-over-month.",
  },

  RETAIL_SALES_HEADLINE: {
    displayName: "Retail Sales (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes: "Consumer spending proxy, month-over-month. Subject to prior-month revision.",
  },
  RETAIL_SALES_CORE: {
    displayName: "Core Retail Sales (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes: "Retail sales excluding autos.",
  },
  DURABLE_GOODS_ORDERS: {
    displayName: "Durable Goods Orders (MoM)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes: "New orders for long-lasting manufactured goods — a business-investment/growth signal.",
  },
  REAL_GDP_QOQ: {
    displayName: "Real GDP (QoQ)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes: "Quarterly economic growth, annualized where the source states so. Published in advance/preliminary/final revisions.",
  },
  REAL_GDP_YOY: {
    displayName: "Real GDP (YoY)",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: true,
    notes: "Year-over-year real GDP growth.",
  },
  PMI_MANUFACTURING: {
    displayName: "Manufacturing PMI",
    unit: "INDEX",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Manufacturing sector activity index. 50 is the conventional expansion/contraction threshold.",
  },
  PMI_SERVICES: {
    displayName: "Services PMI",
    unit: "INDEX",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Services sector activity index. 50 is the conventional expansion/contraction threshold.",
  },

  FED_FUNDS_RATE: {
    displayName: "Fed Funds Rate",
    unit: "PERCENT",
    supportsForecastComparison: false,
    supportsRevisionAnalysis: false,
    notes: "Sourced from FRED via lib/macro.ts, not this subsystem — listed here only so MONETARY_POLICY cluster logic can reference it by canonical id.",
  },
  TREASURY_YIELD_10Y: {
    displayName: "US 10-Year Treasury Yield",
    unit: "PERCENT",
    supportsForecastComparison: false,
    supportsRevisionAnalysis: false,
    notes: "Sourced from FRED via lib/macro.ts, not this subsystem — same reason as FED_FUNDS_RATE.",
  },
  FOMC_RATE_DECISION: {
    displayName: "FOMC Rate Decision",
    unit: "PERCENT",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Discrete policy-rate decision, not a continuous surprise/momentum series — interpret.ts handles it via its own branch, not the generic numeric pipeline.",
  },

  CONSUMER_CONFIDENCE: {
    displayName: "Consumer Confidence",
    unit: "INDEX",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "Conference Board consumer confidence index.",
  },
  MICHIGAN_SENTIMENT: {
    displayName: "Michigan Consumer Sentiment",
    unit: "INDEX",
    supportsForecastComparison: true,
    supportsRevisionAnalysis: false,
    notes: "University of Michigan consumer sentiment index.",
  },
};

export const INDICATOR_DEFINITIONS: Record<CanonicalIndicatorId, IndicatorDefinition> = Object.fromEntries(
  CANONICAL_INDICATOR_IDS.map((id) => [id, { id, category: INDICATOR_CATEGORY[id], ...DEFINITIONS[id] }])
) as Record<CanonicalIndicatorId, IndicatorDefinition>;

export function getIndicatorDefinition(id: CanonicalIndicatorId): IndicatorDefinition {
  return INDICATOR_DEFINITIONS[id];
}
