// ---------------------------------------------------------------------------
// Phase 9, Step 1 — Code Generation fixtures (dev-only). Pure/offline.
//
// Runs against the REAL scopeGuard.ts and generate.ts with NO network and
// NO AI Core provider configured in this sandbox (no AI_CHAT_PROVIDER /
// GROQ_API_KEY / OPENROUTER_API_KEY set here) — that is itself exercised
// below as the real, honest "NOT_CONFIGURED, never fabricate a generated
// file" path, not a mock standing in for one.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/evolution-coding-fixtures.ts
// ---------------------------------------------------------------------------

import { validateGeneratedFiles } from "@/lib/ai/evolutionCoding/scopeGuard";
import { generateCodeForArtifact } from "@/lib/ai/evolutionCoding/generate";
import type { GeneratedFile } from "@/lib/ai/evolutionCoding/contracts";
import type { ChangeArtifact } from "@/lib/ai/evolutionArtifact/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const SCOPE = ["lib/ai/evolutionCoding/example.ts", "app/api/example/route.ts"];

function file(filePath: string, content: string): GeneratedFile {
  return { filePath, content };
}

// 1. Happy path — exact scope match, clean content.
{
  const result = validateGeneratedFiles([file(SCOPE[0], "export const x = 1;"), file(SCOPE[1], "export async function GET() { return null; }")], SCOPE);
  check("1a in-scope files pass", result.ok === true, JSON.stringify(result));
}

// 2. Out-of-scope path.
{
  const result = validateGeneratedFiles([file("lib/ai/evolutionCoding/example.ts", "x"), file("lib/ai/somethingElse.ts", "y")], SCOPE);
  check("2a out-of-scope path rejected", result.ok === false && !result.ok && result.violatingPaths.includes("lib/ai/somethingElse.ts"), JSON.stringify(result));
}

// 3. Global denylist wins even if (hypothetically) in scope.
{
  const scopeWithDenylisted = [...SCOPE, "lib/ai/decisionQualification/gate.ts"];
  const result = validateGeneratedFiles([file("lib/ai/decisionQualification/gate.ts", "x")], scopeWithDenylisted);
  check("3a denylisted path rejected even when in scope", result.ok === false, JSON.stringify(result));
}

// 4. Path traversal.
{
  const result = validateGeneratedFiles([file("../../etc/passwd", "x")], ["../../etc/passwd"]);
  check("4a path traversal rejected", result.ok === false && !result.ok && result.reason.includes("traversal"), JSON.stringify(result));
}

// 5. Forbidden content patterns.
{
  const r1 = validateGeneratedFiles([file(SCOPE[0], "eval('1+1')")], SCOPE);
  check("5a eval( rejected", r1.ok === false, JSON.stringify(r1));
  const r2 = validateGeneratedFiles([file(SCOPE[0], "require('child_process').exec('ls')")], SCOPE);
  check("5b child_process rejected", r2.ok === false, JSON.stringify(r2));
  const r3 = validateGeneratedFiles([file(SCOPE[0], "const t = process.env.TELEGRAM_BOT_TOKEN")], SCOPE);
  check("5c TELEGRAM_BOT_TOKEN reference rejected", r3.ok === false, JSON.stringify(r3));
}

// 6. Duplicate path in one response.
{
  const result = validateGeneratedFiles([file(SCOPE[0], "a"), file(SCOPE[0], "b")], SCOPE);
  check("6a duplicate path rejected", result.ok === false, JSON.stringify(result));
}

// 7. Zero files.
{
  const result = validateGeneratedFiles([], SCOPE);
  check("7a empty file list rejected", result.ok === false, JSON.stringify(result));
}

// 8. generateCodeForArtifact — NO_AFFECTED_FILES_SCOPE short-circuits before any AI Core call.
async function testGenerateNoScope() {
  const artifact = { affectedFiles: [] } as unknown as ChangeArtifact;
  const result = await generateCodeForArtifact(artifact, async () => "unused");
  check("8a empty affectedFiles -> NO_AFFECTED_FILES_SCOPE, no model call attempted", result.outcome === "NO_AFFECTED_FILES_SCOPE", JSON.stringify(result));
}

// 9. generateCodeForArtifact — with a real non-empty scope but NO AI Core
// provider configured in this sandbox (genuinely true here, not simulated):
// must return NOT_CONFIGURED, never a fabricated GENERATED result.
async function testGenerateNotConfigured() {
  const artifact = { affectedFiles: ["lib/ai/evolutionCoding/example.ts"] } as unknown as ChangeArtifact;
  const result = await generateCodeForArtifact(artifact, async () => "current content");
  check("9a no AI Core configured -> NOT_CONFIGURED, never fabricated", result.outcome === "NOT_CONFIGURED", JSON.stringify(result));
}

async function main() {
  await testGenerateNoScope();
  await testGenerateNotConfigured();
  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
}

void main();
