// ---------------------------------------------------------------------------
// ELVOID Intelligence — Research Trigger public surface (Phase 8.4.2)
//
// Single import point for consumers. UNWIRED as of this phase — nothing
// in the app imports from this module yet (per the task's explicit "don't
// wire to the orchestrator yet" instruction). Wiring a real caller
// (assembling a ResearchTriggerInput from live Oracle/autonomous-context
// output) is a separately-approved future step.
// ---------------------------------------------------------------------------

export { evaluateResearchTrigger } from "./evaluate";
export type {
  ResearchTriggerInput,
  ResearchTriggerResult,
  ResearchTriggerReason,
  ResearchPriority,
  TriggeredReason,
  CapabilityAvailability,
} from "./contracts";
