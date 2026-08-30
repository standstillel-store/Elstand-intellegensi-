// ---------------------------------------------------------------------------
// Phase 8.1.0 — ELVOID Learning Database environment finalization fixtures
// (dev-only, not part of the app). Source-scan / static verification only —
// no live Supabase connection, no network. Confirms the environment
// boundary between Main Supabase (lib/supabase.ts), Data Supabase
// (lib/supabaseData.ts), and the isolated ELVOID Learning Supabase
// (lib/ai/learning/db.ts) after the ELVOID_LEARNING_* env var rename.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/learning-db-env-fixtures.ts
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
// NOTE: lib/ai/learning/db.ts is intentionally NOT imported live here — it
// pulls in @supabase/supabase-js, an external package this offline fixture
// script must not require (same reasoning already documented in
// scripts/phase8/decision-outcome-fixtures.ts). All checks below are
// static source-scan / string-level verification instead.

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const dbSource = await readFile(new URL("../../lib/ai/learning/db.ts", import.meta.url), "utf-8");
const envExampleSource = await readFile(new URL("../../.env.example", import.meta.url), "utf-8");

// ---------------------------------------------------------------------------
// 1. Learning DB client references the new variable name.
// ---------------------------------------------------------------------------
check("1. lib/ai/learning/db.ts references ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY", dbSource.includes("ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY"), "new var name not found in db.ts");
check("1b. lib/ai/learning/db.ts references ELVOID_LEARNING_SUPABASE_URL", dbSource.includes("ELVOID_LEARNING_SUPABASE_URL"), "URL var name not found in db.ts");

// ---------------------------------------------------------------------------
// 2. Old ELVOID_LEARNING_SERVICE_ROLE_KEY has zero references (in this file).
// ---------------------------------------------------------------------------
// Safe as a plain substring check: "ELVOID_LEARNING_SERVICE_ROLE_KEY" is
// NOT a substring of "ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY" (they
// differ at "_SUPABASE_"), so this cannot false-positive against the new,
// correct variable name still being present.
check("2. Old name is not a substring of the new name (sanity check for the assertion below)", !"ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY".includes("ELVOID_LEARNING_SERVICE_ROLE_KEY"), "unexpected substring relationship");
check("2b. lib/ai/learning/db.ts has zero references to the old ELVOID_LEARNING_SERVICE_ROLE_KEY name", !dbSource.includes("ELVOID_LEARNING_SERVICE_ROLE_KEY"), "old var name still present in db.ts");

// ---------------------------------------------------------------------------
// 3. ELVOID_LEARNING_SUPABASE_ANON_KEY has zero references (in db.ts and .env.example).
// ---------------------------------------------------------------------------
check("3a. lib/ai/learning/db.ts does not reference ELVOID_LEARNING_SUPABASE_ANON_KEY", !dbSource.includes("ELVOID_LEARNING_SUPABASE_ANON_KEY"), "anon key reference still present in db.ts");
check("3b. .env.example does not reference ELVOID_LEARNING_SUPABASE_ANON_KEY", !envExampleSource.includes("ELVOID_LEARNING_SUPABASE_ANON_KEY"), "anon key reference still present in .env.example");

// ---------------------------------------------------------------------------
// 4. Learning DB URL is not NEXT_PUBLIC.
// ---------------------------------------------------------------------------
check("4. ELVOID_LEARNING_SUPABASE_URL is not prefixed NEXT_PUBLIC_ anywhere in db.ts", !dbSource.includes("NEXT_PUBLIC_ELVOID_LEARNING"), "found a NEXT_PUBLIC_ELVOID_LEARNING* reference");

// ---------------------------------------------------------------------------
// 5. Learning service role key is not NEXT_PUBLIC.
// ---------------------------------------------------------------------------
check("5. ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY is never prefixed NEXT_PUBLIC_", !dbSource.includes("NEXT_PUBLIC") , "found a NEXT_PUBLIC reference in db.ts");

// ---------------------------------------------------------------------------
// 6. db.ts does not reference Main Supabase credentials.
// ---------------------------------------------------------------------------
{
  const mainDbVars = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  // "SUPABASE_SERVICE_ROLE_KEY" is a substring of
  // "ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY" — check for the Main DB
  // var as a `process.env.X` read specifically, not a raw substring, to
  // avoid a false positive against the Learning DB's own (differently
  // prefixed) variable.
  const readsMainServiceRole = dbSource.includes("process.env.SUPABASE_SERVICE_ROLE_KEY");
  const readsMainUrl = dbSource.includes("process.env.NEXT_PUBLIC_SUPABASE_URL");
  const readsMainAnon = dbSource.includes("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
  check("6. db.ts does not read() any Main Supabase (lib/supabase.ts) credential", !readsMainServiceRole && !readsMainUrl && !readsMainAnon, `mainDbVars checked=${mainDbVars.join(",")}`);
}

// ---------------------------------------------------------------------------
// 7. db.ts does not reference Data Supabase credentials.
// ---------------------------------------------------------------------------
check("7. db.ts does not read() any Data Supabase (lib/supabaseData.ts) credential", !dbSource.includes("process.env.DATA_SUPABASE_URL") && !dbSource.includes("process.env.DATA_SUPABASE_SERVICE_ROLE_KEY"), "found a DATA_SUPABASE_* read in db.ts");

// ---------------------------------------------------------------------------
// 8. Missing Learning DB credentials cause graceful null behavior.
// ---------------------------------------------------------------------------
{
  // Verified by source inspection (live execution would require
  // @supabase/supabase-js, unavailable in this offline sandbox — see the
  // header note above): getLearningSupabase() must set `client = null` and
  // `return client;` inside its `if (!url || !key)` guard, never a
  // `throw`, so a missing env var degrades gracefully rather than
  // crashing the caller (execute.ts's fire-and-forget capture call).
  const guardBlockMatch = dbSource.match(/if\s*\(!url\s*\|\|\s*!key\)\s*\{([^}]*)\}/);
  const guardBody = guardBlockMatch?.[1] ?? "";
  const returnsNullNotThrow = guardBody.includes("null") && !guardBody.includes("throw");
  check("8. Missing-config guard in getLearningSupabase() returns null rather than throwing", returnsNullNotThrow, `guard body="${guardBody.trim()}"`);
}

// ---------------------------------------------------------------------------
// 9. No credentials are logged.
// ---------------------------------------------------------------------------
check("9. db.ts contains no console.log/console.error/console.warn calls", !/console\.(log|error|warn|info|debug)\s*\(/.test(dbSource), "found a console.* call in db.ts");

// ---------------------------------------------------------------------------
// 10. No browser/client component imports the Learning DB client.
// ---------------------------------------------------------------------------
{
  const repositorySource = await readFile(new URL("../../lib/ai/decisionOutcome/repository.ts", import.meta.url), "utf-8");
  const noUseClientInDb = !dbSource.trimStart().startsWith('"use client"') && !dbSource.trimStart().startsWith("'use client'");
  const noUseClientInRepository = !repositorySource.trimStart().startsWith('"use client"') && !repositorySource.trimStart().startsWith("'use client'");
  check("10. Neither lib/ai/learning/db.ts nor lib/ai/decisionOutcome/repository.ts (its only consumer) is a \"use client\" module", noUseClientInDb && noUseClientInRepository, "found a \"use client\" directive");
}

console.log(failures === 0 ? "\nAll Phase 8.1.0 Learning Database environment finalization fixtures passed." : `\n${failures} Learning Database environment fixture(s) FAILED.`);
if (failures > 0) process.exitCode = 1;
