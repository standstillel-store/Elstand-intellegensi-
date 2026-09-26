// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Code Generation (Step 1)
//
// The ONLY new "AI writes code" call site in this repository. Reuses the
// existing AI Core plumbing (lib/ai/core/llm.ts's `callAiCore`) exactly as
// every other AI Core module does — same provider chain, same "never
// throws, null on anything wrong" contract, same JSON-mode validation
// pattern. No new provider, no new network client: this file adds zero new
// ways to reach a model.
//
// `fetchCurrentContent` is injected (never imported directly) so this file
// has no Git/GitHub dependency of its own and can be fixture-tested with a
// fake in-memory map — the real implementation (GitHub Contents API) lives
// in lib/ai/evolutionGit and is wired in by lib/ai/evolutionPipeline/run.ts.
// ---------------------------------------------------------------------------

import { callAiCore, isAiCoreConfigured } from "@/lib/ai/core/llm";
import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";
import { buildCodeGenerationPromptData, CODE_GENERATION_SYSTEM_PROMPT } from "./prompts";
import { validateGeneratedFiles } from "./scopeGuard";
import type { CodeGenerationResult, GeneratedFile } from "./contracts";

interface ModelResponseShape {
  readonly files: readonly { readonly filePath: unknown; readonly content: unknown }[];
}

function isModelResponseShape(v: unknown): v is ModelResponseShape {
  if (!v || typeof v !== "object") return false;
  const files = (v as Record<string, unknown>).files;
  if (!Array.isArray(files)) return false;
  return files.every((f) => f && typeof f === "object" && typeof (f as Record<string, unknown>).filePath === "string" && typeof (f as Record<string, unknown>).content === "string");
}

export type FetchCurrentContent = (filePath: string) => Promise<string | null>;

export async function generateCodeForArtifact(artifact: ChangeArtifact, fetchCurrentContent: FetchCurrentContent): Promise<CodeGenerationResult> {
  if (artifact.affectedFiles.length === 0) {
    return { outcome: "NO_AFFECTED_FILES_SCOPE", reason: "the approved artifact names no affected files — there is no scope to generate into" };
  }

  if (!isAiCoreConfigured()) {
    return { outcome: "NOT_CONFIGURED", reason: "no AI Core provider is configured for code generation" };
  }

  const currentContents = new Map<string, string>();
  for (const filePath of artifact.affectedFiles) {
    const content = await fetchCurrentContent(filePath);
    currentContents.set(filePath, content ?? "");
  }

  const promptData = buildCodeGenerationPromptData(artifact, currentContents);

  const result = await callAiCore<ModelResponseShape>({
    systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
    data: promptData,
    validate: isModelResponseShape,
    maxTokens: 4000,
  });

  if (result === null) {
    return { outcome: "NOT_CONFIGURED", reason: "AI Core call for code generation returned no usable result (not configured, exhausted, or invalid JSON)" };
  }

  const files: GeneratedFile[] = result.data.files.map((f) => ({ filePath: f.filePath as string, content: f.content as string }));

  const guard = validateGeneratedFiles(files, artifact.affectedFiles);
  if (!guard.ok) {
    return { outcome: "SCOPE_VIOLATION", reason: guard.reason, violatingPaths: guard.violatingPaths };
  }

  return { outcome: "GENERATED", files };
}
