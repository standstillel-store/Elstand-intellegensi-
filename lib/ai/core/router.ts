// ---------------------------------------------------------------------------
// Phase: AI CORE ENGINE — the module registry. This is the "AI Router" the
// brief asks for: every one of the 10 modules is independently callable
// (either directly from lib/ai/core/modules/<name>.ts, or via the named
// re-exports and AI_CORE_MODULES registry below), all sharing the same
// underlying provider chain (lib/ai/core/llm.ts -> lib/ai/router.ts's
// Groq/OpenRouter/paid-provider chain) without any module depending on
// another. Adding an 11th module later means adding one file here plus one
// line in AI_CORE_MODULES — nothing else in this list changes.
// ---------------------------------------------------------------------------

export { runAiOracle } from "./modules/oracle";
export { runAiTechnicalAnalyst } from "./modules/technicalAnalyst";
export { runAiScanner } from "./modules/scanner";
export { runAiConfidenceEngine } from "./modules/confidenceEngine";
export { runAiMarketIntelligence } from "./modules/marketIntelligence";
export { runAiNarrative } from "./modules/narrative";
export { runAiPaperTradingCoach } from "./modules/paperTradingCoach";
export { runAiJournal } from "./modules/journal";
export { runAiPersonalCoach } from "./modules/personalCoach";
export { runAiTokenAnalyzer } from "./modules/tokenAnalyzer";

export { buildMarketIntelligenceContext } from "./context";
export { isAiCoreConfigured } from "./llm";

export * from "./types";

/** Stable ids + short descriptions, e.g. for a future admin/status page listing what's active. Order matches Karin's brief priority list. */
export const AI_CORE_MODULES = [
  { id: "oracle", label: "AI Oracle", description: "Bias & confidence explanation untuk satu sinyal." },
  { id: "marketIntelligence", label: "AI Market Intelligence", description: "Pembacaan kondisi pasar per kategori (makro/likuiditas/whale/sentiment)." },
  { id: "technicalAnalyst", label: "AI Technical Analyst", description: "Penjelasan tiap indikator/scan yang aktif pada satu sinyal." },
  { id: "scanner", label: "AI Scanner", description: "Narasi & ranking peluang terbaik dari satu batch scan." },
  { id: "confidenceEngine", label: "AI Confidence Engine", description: "Breakdown kontribusi 12 faktor confluence di balik Confidence & Trade Grade." },
  { id: "narrative", label: "AI Narrative", description: "Satu paragraf naratif institusional kondisi pasar." },
  { id: "paperTradingCoach", label: "AI Paper Trading Coach", description: "Feedback pola dari trade-trade terakhir." },
  { id: "journal", label: "AI Journal", description: "Post-mortem naratif untuk satu trade yang sudah ditutup." },
  { id: "personalCoach", label: "AI Personal Coach", description: "Pola jangka panjang & coaching plan dari seluruh histori trade." },
  { id: "tokenAnalyzer", label: "AI Token Analyzer", description: "Kesehatan token, eksplisit soal data yang belum tersedia." },
] as const;

export type AiCoreModuleId = (typeof AI_CORE_MODULES)[number]["id"];
