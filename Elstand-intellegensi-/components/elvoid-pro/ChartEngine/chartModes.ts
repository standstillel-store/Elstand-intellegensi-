// ELVOID PRO chart mode registry. `activeChartMode` (see AdvancedChart.tsx)
// switches the ONE main chart area between these — never render more than
// one at a time (per spec). Each mode is either wired to real Binance data
// (klines/aggTrades/depth) or shown with an honest "coming soon" surface
// (per project rule: no fabricated live data) until its data source exists.
// Liquidation Map is the one hold-out — Binance only offers forceOrder
// liquidations as a live websocket stream, not a historical REST endpoint,
// so it needs a persistent listener/store before it can show real data.
export type ChartMode =
  | "candlestick"
  | "heikin-ashi"
  | "footprint"
  | "delta"
  | "cvd"
  | "imbalance"
  | "liquidity-heatmap"
  | "order-book-chart"
  | "liquidity-walls"
  | "tpo"
  | "volume-profile"
  | "open-interest"
  | "funding-rate"
  | "liquidation-map";

export interface ChartModeDef {
  id: ChartMode;
  label: string;
  ready: boolean;
  /** Which future build phase (from the ELVOID PRO spec) ships this mode. */
  phase?: string;
}

export interface ChartModeGroup {
  label: string;
  items: ChartModeDef[];
  /**
   * Primary groups render open in the selector by default — this is the
   * "Elvoid Pro = Footprint / Order Flow terminal" surface. Non-primary
   * groups (other/experimental order-flow visualizations, TPO, Market
   * Profile, Market Data) are still fully wired and real-data-backed, but
   * are tucked behind a "More tools" disclosure so they don't compete with
   * Footprint as the thing a new user sees first.
   */
  primary?: boolean;
}

export const CHART_MODE_GROUPS: ChartModeGroup[] = [
  {
    label: "Primary Chart",
    primary: true,
    items: [
      { id: "candlestick", label: "Candlestick", ready: true },
      { id: "heikin-ashi", label: "Heikin Ashi", ready: false, phase: "Phase 2" },
    ],
  },
  {
    label: "Order Flow",
    primary: true,
    items: [
      { id: "footprint", label: "Footprint", ready: true },
      { id: "delta", label: "Delta", ready: true },
      { id: "cvd", label: "CVD", ready: false, phase: "Phase 3 (live below the chart today)" },
      { id: "imbalance", label: "Imbalance", ready: true },
    ],
  },
  {
    label: "Liquidity",
    items: [
      { id: "liquidity-heatmap", label: "Liquidity Heatmap", ready: true },
      { id: "order-book-chart", label: "Order Book", ready: true },
      { id: "liquidity-walls", label: "Liquidity Walls", ready: true },
    ],
  },
  {
    label: "Market Profile",
    items: [
      { id: "tpo", label: "TPO / Market Profile", ready: true },
      { id: "volume-profile", label: "Volume Profile", ready: true },
    ],
  },
  {
    label: "Market Data",
    items: [
      { id: "open-interest", label: "Open Interest", ready: false, phase: "Phase 3 (live below the chart today)" },
      { id: "funding-rate", label: "Funding Rate", ready: false, phase: "Phase 3 (live below the chart today)" },
      { id: "liquidation-map", label: "Liquidation Map", ready: false, phase: "Phase 6 (needs a persistent forceOrder stream)" },
    ],
  },
];

export const CHART_MODE_LABEL: Record<ChartMode, string> = CHART_MODE_GROUPS.flatMap((g) => g.items).reduce(
  (acc, item) => ({ ...acc, [item.id]: item.label }),
  {} as Record<ChartMode, string>
);
