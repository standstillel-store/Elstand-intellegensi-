// ELVOID Oracle macro context — ECONOMIC INTELLIGENCE (Phase 9). See oracleMacroPure.ts for the rules.
import type { MacroIntelligenceContext } from "@/lib/ai/macroIntelligence/contracts";
import { composeMacroContext } from "@/lib/ai/macroIntelligence/composeMacroContext";
import { assembleWithCompose } from "./oracleMacroPure";

export { mapCompletenessToAvailability, mapRiskEnvironmentToEventRisk, buildUnavailableMacroContext, toOracleMacroContext } from "./oracleMacroPure";

/** Never throws. Reads FRED / Alpha Vantage releases via the existing composeMacroContext pipeline; the ForexFactory calendar is never an input. */
export function assembleOracleMacroContext(asOf: string): Promise<MacroIntelligenceContext> {
  return assembleWithCompose(asOf, composeMacroContext);
}
