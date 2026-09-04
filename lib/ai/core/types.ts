// ---------------------------------------------------------------------------
// Phase: AI CORE ENGINE — shared types for the 10-module reasoning layer.
//
// Every module in lib/ai/core/modules/*.ts returns one of the Result types
// below, and every one of them ALWAYS resolves to a complete, valid object —
// never null, never throws to the caller. When no AI provider is configured
// (or every attempt fails), the module falls back to a deterministic,
// templated version of the same result built from the real numbers it
// already has, and sets `meta.source = "fallback"` so a caller/UI can tell
// the difference. Routes never need to null-check; the zero-config default
// (no GROQ_API_KEY/OPENROUTER_API_KEY set) stays exactly as functional as
// every other feature in this codebase.
//
// The other invariant every module follows: the AI layer never invents or
// recomputes a number ElVoid AI's deterministic engine already produced
// (confidence, entry/SL/TP, trade grade, win rate, etc.). It only explains,
// narrates, and contextualizes those numbers — see each module file's own
// header comment for how it stays grounded to its specific input.
// ---------------------------------------------------------------------------

export type AiCoreSource = "ai" | "fallback";

export interface AiCoreMeta {
  /** "ai" = a real LLM (Groq/OpenRouter/or an explicitly-configured paid provider) generated this. "fallback" = no provider configured or every attempt failed, so this is deterministic-only text — still real, still grounded, just not LLM-authored. Always surface which one a result is; never present a fallback as "AI insight". */
  source: AiCoreSource;
  provider?: string;
  model?: string;
  generatedAt: string;
}

export function nowMeta(source: AiCoreSource, provider?: string, model?: string): AiCoreMeta {
  return { source, provider, model, generatedAt: new Date().toISOString() };
}

// --- Module 1: AI Oracle ----------------------------------------------------
export interface AiOracleResult {
  /** Mirrors the signal's own side/scan balance — this module explains the bias, it never sets or overrides it. */
  bias: "bullish" | "neutral" | "bearish";
  /** Always the signal's own `confidence` verbatim — never a second, competing number. */
  confidence: number;
  narrative: string;
  keyDrivers: string[];
  caution: string;
  meta: AiCoreMeta;
}

// --- Module 2: AI Technical Analyst -----------------------------------------
export interface AiIndicatorNote {
  key: string;
  label: string;
  explanation: string;
}
export interface AiTechnicalAnalystResult {
  summary: string;
  /** One entry per scan/extraReasoning category that actually fired for this signal — never a fixed list, and never an indicator this engine didn't compute (no invented EMA/RSI/Bollinger numbers; see the module file header for why). */
  indicatorNotes: AiIndicatorNote[];
  structureNote: string;
  meta: AiCoreMeta;
}

// --- Module 3: AI Scanner ----------------------------------------------------
export interface AiScannerOpportunity {
  coin: string;
  side: "LONG" | "SHORT";
  whyItMadeTheCut: string;
}
export interface AiScannerResult {
  marketRead: string;
  /** A re-ordered/annotated subset of the coins actually passed in — the module is never allowed to introduce a coin that wasn't in the scanned batch. */
  topOpportunities: AiScannerOpportunity[];
  meta: AiCoreMeta;
}

// --- Module 4: AI Confidence Engine -----------------------------------------
export interface AiConfidenceFactorNote {
  factor: string;
  contribution: "supports" | "against" | "neutral";
  note: string;
}
export interface AiConfidenceResult {
  /** Always the signal's own `confidence` verbatim. */
  confidence: number;
  /** Always the signal's own `tradeGrade` verbatim. */
  grade: string;
  explanation: string;
  breakdown: AiConfidenceFactorNote[];
  meta: AiCoreMeta;
}

// --- Module 5: AI Market Intelligence ---------------------------------------
export interface MarketIntelligenceContext {
  btcPrice?: number;
  btcChange24h?: number;
  ethPrice?: number;
  ethChange24h?: number;
  btcDominance?: number;
  totalMarketCapUsd?: number;
  marketCapChange24h?: number;
  fngValue?: number;
  fngClassification?: string;
  dxyChangePct?: number;
  goldChangePct?: number;
  stocksChangePct?: number;
  stablecoinChange24hUsd?: number;
  etfNetTotalUsd?: number;
  btcFundingRate?: number;
  btcOpenInterestUsd?: number;
  altseasonScore?: number;
  whaleTotalUsd?: number;
  sentimentStatus?: string;
  sentimentConfidence?: number;
  /** Matches getNextHighImpactEvent()'s own return shape (lib/intelligence/macroEvents.ts) — no country/date/impact fields exist on it, only these two. */
  nextHighImpactEvent?: { title: string; hoursAway: number } | null;
  topMovers?: { symbol: string; change24h: number }[];
  /** ADDITIVE (Phase G) — the same MacroIntelligenceContext produced by lib/ai/macroIntelligence/composeMacroContext.ts, reused as-is rather than recomputed here. Optional and may be absent if macro composition failed — see buildMarketIntelligenceContext()'s try/catch; its absence never blocks the rest of this context from being built. */
  macroIntelligence?: import("@/lib/ai/macroIntelligence/contracts").MacroIntelligenceContext;
}
export interface AiMarketIntelligenceCategory {
  category: string;
  read: string;
}
export interface AiMarketIntelligenceResult {
  headline: string;
  categories: AiMarketIntelligenceCategory[];
  watchItems: string[];
  meta: AiCoreMeta;
}

// --- Module 6: AI Token Analyzer ---------------------------------------------
export interface AiTokenAnalyzerResult {
  healthSummary: string;
  strengths: string[];
  concerns: string[];
  /** Explicit, e.g. "Holder distribution", "Audit status", "Treasury wallet", "Unlock schedule" — this system has no live data source for these yet (see lib/analysis.ts CoinReport.holders/nextUnlock), so the module states that plainly instead of inventing a number. */
  unavailableChecks: string[];
  meta: AiCoreMeta;
}

// --- Module 5 (brief numbering) / AI Narrative ------------------------------
export interface AiNarrativeResult {
  narrative: string;
  meta: AiCoreMeta;
}

// --- Module 7: AI Paper Trading Coach ----------------------------------------
export interface AiCoachFinding {
  type: "mistake" | "bias" | "strength" | "habit";
  label: string;
  note: string;
}
export interface AiPaperTradingCoachResult {
  summary: string;
  findings: AiCoachFinding[];
  recommendations: string[];
  meta: AiCoreMeta;
}

// --- Module 8: AI Journal -----------------------------------------------------
export interface AiJournalResult {
  summary: string;
  reason: string;
  mistake: string | null;
  strength: string | null;
  improvement: string;
  confidenceNote: string;
  checklist: string[];
  meta: AiCoreMeta;
}

// --- Module 9: AI Personal Coach ----------------------------------------------
export interface AiPersonalCoachResult {
  favoriteSetup: string | null;
  mostProfitablePattern: string | null;
  worstMistakePattern: string | null;
  riskBehaviorNote: string;
  disciplineNote: string;
  coachingPlan: string[];
  meta: AiCoreMeta;
}
