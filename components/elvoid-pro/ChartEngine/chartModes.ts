// ELVOID PRO chart mode registry. `activeChartMode` (see AdvancedChart.tsx)
// switches the ONE main chart area between these — never render more than
// one at a time (per spec). Only "candlestick" is wired to real data in
// Phase 1; everything else is a real menu entry with an honest "coming
// soon" surface (per project rule: no fabricated live data / no fake
// indicators) until its own phase lands.
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
}

export const CHART_MODE_GROUPS: ChartModeGroup[] = [
  {
    label: "Primary Chart",
    items: [
      { id: "candlestick", label: "Candlestick", ready: true },
      { id: "heikin-ashi", label: "Heikin Ashi", ready: false, phase: "Phase 2" },
    ],
  },
  {
    label: "Order Flow",
    items: [
      { id: "footprint", label: "Footprint", ready: false, phase: "Phase 5" },
      { id: "delta", label: "Delta", ready: false, phase: "Phase 5" },
      { id: "cvd", label: "CVD", ready: false, phase: "Phase 3 (live below the chart today)" },
      { id: "imbalance", label: "Imbalance", ready: false, phase: "Phase 5" },
    ],
  },
  {
    label: "Liquidity",
    items: [
      { id: "liquidity-heatmap", label: "Liquidity Heatmap", ready: false, phase: "Phase 6" },
      { id: "order-book-chart", label: "Order Book", ready: false, phase: "Phase 6 (live in right rail today)" },
      { id: "liquidity-walls", label: "Liquidity Walls", ready: false, phase: "Phase 6" },
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
      { id: "liquidation-map", label: "Liquidation Map", ready: false, phase: "Phase 6" },
    ],
  },
];

export const CHART_MODE_LABEL: Record<ChartMode, string> = CHART_MODE_GROUPS.flatMap((g) => g.items).reduce(
  (acc, item) => ({ ...acc, [item.id]: item.label }),
  {} as Record<ChartMode, string>
);
