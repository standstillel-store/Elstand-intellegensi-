// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Code Generation contracts (Step 1)
//
// TYPES ONLY. Zero logic.
//
// WHAT THIS IS: the first thing Phase 9 adds on top of a P4 `ChangeArtifact`
// (lib/ai/evolutionArtifact) whose `artifactStatus === "AWAITING_HUMAN_PATCH"`.
// P4 deliberately stopped there — this module is the "future promotion
// phase" P4's own CHANGES.md said would have to be "separately specified and
// approved" (it now has been, by the human approver, for Phase 9 as a
// whole). This file does NOT reopen or widen `ChangeArtifact` itself
// (`patchStatus` stays permanently `"NOT_EXECUTED"` there) — Phase 9 tracks
// its OWN, separate, additive state in evolution_patch_runs /
// evolution_patch_events (see lib/ai/evolutionPipeline/repository.ts and the
// 2026-09d migration), keyed off the artifact's own `recordHash`.
//
// SCOPE IS FIXED BY THE ARTIFACT, NOT BY THE MODEL: `affectedFiles` on the
// artifact (deterministic regex extraction over the approved proposal's own
// text, see evolutionArtifact/create.ts) IS the approved scope. Generation
// never gets to choose which files it may touch.
// ---------------------------------------------------------------------------

export interface GeneratedFile {
  /** Must be one of the artifact's own `affectedFiles` — enforced by scopeGuard.ts, never trusted from the model alone. */
  readonly filePath: string;
  /** Full replacement content for filePath (not a unified diff — see scopeGuard.ts header for why). */
  readonly content: string;
}

/**
 * Closed outcome vocabulary for one code-generation attempt. No value here
 * means "deployed", "merged" or "success" — generation only ever produces
 * candidate file content; everything after this is Phase 9's Git/Deploy
 * layer, which independently re-validates before doing anything.
 */
export type CodeGenerationOutcome =
  /** Artifact's own `affectedFiles` is empty — there is no approved scope to generate into. Never falls back to "generate anywhere". */
  | "NO_AFFECTED_FILES_SCOPE"
  /** No AI Core provider is configured (`isAiCoreConfigured()` false, or the call itself returned null) — same "degrade, never fabricate" rule as every other AI Core module. */
  | "NOT_CONFIGURED"
  /** The model's response was not valid JSON, or did not match `GeneratedFile[]` shape. */
  | "INVALID_RESPONSE"
  /** scopeGuard.ts rejected the response: an out-of-scope path, a forbidden path, or a forbidden content pattern. */
  | "SCOPE_VIOLATION"
  /** Passed shape + scope validation. Still NOT tested, typechecked, built, committed or deployed — see lib/ai/evolutionGit and lib/ai/evolutionDeploy. */
  | "GENERATED";

export type CodeGenerationResult =
  | { readonly outcome: "GENERATED"; readonly files: readonly GeneratedFile[] }
  | { readonly outcome: Exclude<CodeGenerationOutcome, "GENERATED">; readonly reason: string; readonly violatingPaths?: readonly string[] };
