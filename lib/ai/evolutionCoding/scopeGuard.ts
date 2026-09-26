// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Code Generation scope guard (Step 1)
//
// Pure, deterministic, synchronous. No network, no clock, no LLM calls.
//
// WHY FULL-FILE REPLACEMENT, NOT A UNIFIED DIFF: this repository has no
// diff/patch-apply library and Section D of the Phase 9 brief explicitly
// forbids adding unnecessary execution surface. A model asked for a full,
// syntactically complete replacement of a small, named file is far more
// reliably checkable (and far less likely to silently corrupt a file with a
// malformed hunk) than a model asked to produce a patch this codebase would
// then have to apply blindly. The tradeoff — the model must be shown the
// CURRENT content of every affected file so it can reproduce the untouched
// parts — is accepted deliberately (see generate.ts).
//
// WHAT THIS GUARDS, INDEPENDENTLY OF THE ARTIFACT'S OWN allowedScope:
//   1. every generated path must be EXACTLY one of allowedScope (no subset
//      match, no new files, no case-insensitive match);
//   2. no path traversal / absolute path / null byte;
//   3. a fixed denylist of substrings that are OUT OF SCOPE FOR THE WHOLE OF
//      PHASE 9 per its own brief (Section A) — TickStorage, bn_trade_ticks,
//      Footprint, Orderbook, the Economic Learning DB migrations, and the
//      qualification/arbitration/execution/risk decision gate modules — is
//      checked against every path AND is rejected even if (by a future bug
//      upstream) it somehow appeared inside allowedScope itself. Denylist
//      wins over allowlist, always.
//   4. a fixed denylist of content substrings this repository must never
//      contain in generated code: eval(, new Function(, child_process, and
//      the three Telegram secret env var NAMES (a generated file has no
//      legitimate reason to reference them — only lib/ai/evolutionApproval
//      does, and this guard never touches that directory per (3)).
// ---------------------------------------------------------------------------

import type { GeneratedFile } from "./contracts";

export type ScopeGuardResult = { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly violatingPaths: readonly string[] };

/** Out of scope for ALL of Phase 9, regardless of what any artifact's affectedFiles claims. Matched as a plain substring, case-sensitive. */
const GLOBAL_DENYLIST_PATH_SUBSTRINGS: readonly string[] = [
  "TickStorage",
  "bn_trade_ticks",
  "Footprint",
  "Orderbook",
  "evolutionApproval/", // the approval gate itself is never a generation target
  "supabase/learning/migrations/", // Phase 9 never generates its own migrations (see Section A: "jangan membuat database baru")
  "lib/ai/decisionQualification/",
  "lib/ai/decisionOutcome/",
  "lib/ai/preEntryValidation/",
  "lib/ai/autonomousExecution/",
  "lib/ai/autonomousDecision/",
];

const FORBIDDEN_CONTENT_SUBSTRINGS: readonly string[] = [
  "eval(",
  "new Function(",
  "child_process",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
];

function hasPathTraversal(filePath: string): boolean {
  return filePath.includes("..") || filePath.startsWith("/") || filePath.includes("\0");
}

function matchesGlobalDenylist(filePath: string): boolean {
  return GLOBAL_DENYLIST_PATH_SUBSTRINGS.some((needle) => filePath.includes(needle));
}

function containsForbiddenContent(content: string): string | null {
  return FORBIDDEN_CONTENT_SUBSTRINGS.find((needle) => content.includes(needle)) ?? null;
}

/**
 * `allowedScope` MUST be the artifact's own `affectedFiles` — the caller
 * never widens it. Empty `files` is rejected too (a "successful" generation
 * that touches nothing is not a valid GENERATED outcome — see generate.ts).
 */
export function validateGeneratedFiles(files: readonly GeneratedFile[], allowedScope: readonly string[]): ScopeGuardResult {
  if (files.length === 0) return { ok: false, reason: "generation produced zero files", violatingPaths: [] };

  const allowedSet = new Set(allowedScope);
  const outOfScope: string[] = [];
  const denylisted: string[] = [];
  const traversal: string[] = [];
  let forbiddenContentPath: string | null = null;
  let forbiddenContentNeedle: string | null = null;

  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const file of files) {
    if (seen.has(file.filePath)) duplicates.push(file.filePath);
    seen.add(file.filePath);

    if (hasPathTraversal(file.filePath)) traversal.push(file.filePath);
    if (matchesGlobalDenylist(file.filePath)) denylisted.push(file.filePath);
    if (!allowedSet.has(file.filePath)) outOfScope.push(file.filePath);

    if (forbiddenContentPath === null) {
      const needle = containsForbiddenContent(file.content);
      if (needle !== null) {
        forbiddenContentPath = file.filePath;
        forbiddenContentNeedle = needle;
      }
    }
  }

  if (traversal.length > 0) return { ok: false, reason: "path traversal / absolute path in generated file path", violatingPaths: traversal };
  if (denylisted.length > 0) return { ok: false, reason: "generated path matches Phase 9's global denylist", violatingPaths: denylisted };
  if (outOfScope.length > 0) return { ok: false, reason: "generated path is not in the artifact's own affectedFiles scope", violatingPaths: outOfScope };
  if (duplicates.length > 0) return { ok: false, reason: "duplicate file path in one generation response", violatingPaths: duplicates };
  if (forbiddenContentPath !== null) {
    return { ok: false, reason: `generated content contains a forbidden pattern ("${forbiddenContentNeedle}")`, violatingPaths: [forbiddenContentPath] };
  }

  return { ok: true };
}
