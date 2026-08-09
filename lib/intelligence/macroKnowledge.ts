import type { MacroCategory } from "./macroEvents";

// ---------------------------------------------------------------------------
// Textbook macro cause -> typical-effect relationships, keyed by the same
// MacroCategory enum macroEvents.ts already classifies real calendar events
// into. This is general, well-established macro knowledge (e.g. "hot CPI
// tends to push DXY up, risk assets down") — not a live prediction and not
// fabricated market data. Only rendered for categories that actually appear
// in the real, currently-fetched economic calendar; nothing here invents an
// event that isn't really scheduled.
// ---------------------------------------------------------------------------

export interface MacroImpactAsset {
  label: string;
  direction: "up" | "down";
}

export interface MacroKnowledgeEntry {
  /** Short "why it matters" explainer for this event category. */
  why: string;
  /** Typical direction of commonly-watched assets when this category prints hot/hawkish. */
  assets: MacroImpactAsset[];
}

export const MACRO_KNOWLEDGE: Partial<Record<MacroCategory, MacroKnowledgeEntry>> = {
  CPI: {
    why: "Inflasi di atas ekspektasi bisa memperkuat ekspektasi rate hike \u2192 risk-off.",
    assets: [
      { label: "DXY", direction: "up" },
      { label: "Gold", direction: "down" },
      { label: "BTC", direction: "down" },
      { label: "Nasdaq", direction: "down" },
    ],
  },
  PPI: {
    why: "Kenaikan harga produsen sering mendahului tekanan CPI beberapa bulan ke depan.",
    assets: [
      { label: "DXY", direction: "up" },
      { label: "BTC", direction: "down" },
    ],
  },
  FOMC: {
    why: "Nada hawkish/dovish The Fed langsung menggerakkan ekspektasi suku bunga di semua aset risiko.",
    assets: [
      { label: "DXY", direction: "up" },
      { label: "BTC", direction: "down" },
      { label: "Nasdaq", direction: "down" },
    ],
  },
  "Interest Rate": {
    why: "Keputusan suku bunga memengaruhi volatilitas mata uang terkait dan sentimen risk-asset secara regional.",
    assets: [
      { label: "Local FX", direction: "up" },
      { label: "Risk Assets", direction: "up" },
    ],
  },
  NFP: {
    why: "Data ketenagakerjaan kuat memperkuat kasus The Fed menahan suku bunga lebih lama.",
    assets: [
      { label: "DXY", direction: "up" },
      { label: "BTC", direction: "down" },
    ],
  },
  PMI: {
    why: "PMI di atas 50 menandakan ekspansi manufaktur/jasa \u2014 biasanya risk-on jangka pendek.",
    assets: [
      { label: "Stocks", direction: "up" },
      { label: "BTC", direction: "up" },
    ],
  },
  GDP: {
    why: "Pertumbuhan GDP di atas ekspektasi mendukung mata uang lokal dan aset risiko domestik.",
    assets: [
      { label: "Local FX", direction: "up" },
      { label: "Risk Assets", direction: "up" },
    ],
  },
};
