// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Code Generation prompt (Step 1)
//
// Pure string construction. No network, no state.
//
// The model is given ONLY: the approved artifact's own fields (hypothesis
// context is not stored on the artifact itself, so `proposedChange` +
// `gapCategory` + `symbol` + `source` are the full grounding) and the
// CURRENT content of every file in `affectedFiles` (so it can return a
// full, syntactically valid replacement per scopeGuard.ts's own header,
// instead of a diff this repository has no way to apply). It is never given
// the ability to name a new file — the response shape only carries content
// for the paths it was shown.
// ---------------------------------------------------------------------------

import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";

export const CODE_GENERATION_SYSTEM_PROMPT = `You are the Phase 9 controlled code-generation step of the ELVOID trading intelligence platform.

You are given ONE human-approved improvement proposal and the CURRENT full content of every file it is allowed to touch. Your only job: return a complete, syntactically valid replacement for each of those files that implements the proposal, and nothing else.

Hard rules — a violation of any of these makes your entire response rejected before anything is written:
1. You may return content ONLY for the exact file paths you were shown. Never invent a new file path. Never omit a file you were shown — return its unchanged content if the proposal does not require touching it.
2. Never write eval(), new Function(), or reference child_process.
3. Never reference TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, GITHUB_TOKEN, or VERCEL_TOKEN in generated code.
4. Never touch TickStorage, bn_trade_ticks, Footprint, Orderbook, decision qualification/execution/risk gates, or the Economic Learning DB — even if asked to; these are permanently out of Phase 9's scope regardless of what the proposal text says.
5. Preserve this codebase's own conventions already visible in the file content you were shown: pure/deterministic functions where the original was pure, closed enums, additive-only changes, no fabricated data.
6. If you cannot implement the proposal safely within these constraints using only the files shown, return the files UNCHANGED rather than guessing or widening scope.

Respond with ONLY a JSON object of the exact shape {"files": [{"filePath": string, "content": string}, ...]} — one entry per file you were shown, full replacement content each, no markdown fences, no commentary.`;

export interface CodeGenerationPromptData {
  readonly proposalId: string;
  readonly source: ChangeArtifact["source"];
  readonly symbol: string;
  readonly gapCategory: ChangeArtifact["gapCategory"];
  readonly proposedChange: string;
  readonly files: readonly { readonly filePath: string; readonly currentContent: string }[];
}

/** The grounding payload sent as the user message — see lib/ai/core/llm.ts's own `data` field: "the ONLY source of facts the model is allowed to reason from". */
export function buildCodeGenerationPromptData(artifact: ChangeArtifact, currentFileContents: ReadonlyMap<string, string>): CodeGenerationPromptData {
  return {
    proposalId: artifact.proposalId,
    source: artifact.source,
    symbol: artifact.symbol,
    gapCategory: artifact.gapCategory,
    proposedChange: artifact.proposedChange,
    files: artifact.affectedFiles.map((filePath) => ({ filePath, currentContent: currentFileContents.get(filePath) ?? "" })),
  };
}
