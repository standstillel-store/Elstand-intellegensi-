// ---------------------------------------------------------------------------
// Phase 8.6.7 — Human Approval Gate MUTATION fixtures (dev-only).
//
// Each case below deliberately BREAKS one safety property in the real source
// (bypass the approver check, bypass the recordHash/integrity check, approve a
// non-VALID record, bypass the webhook secret, overwrite an approval, sneak in
// auto-promotion, leak a secret, weaken the database migration, ...) and runs
// the real 8.6.7 fixtures against the broken code. The mutation counts as
// DETECTED only if the fixtures then FAIL (non-zero exit). A mutation that
// survives means a safety property is not actually being tested.
//
// SAFETY OF THIS HARNESS: every file is restored byte-for-byte in a `finally`
// block AND on process exit/interrupt, and the final check verifies each file
// against its original sha256. It edits real source files in the working tree
// for a few seconds at a time — do not run it while another process is editing
// them.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-approval-mutation-fixtures.ts
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const FIXTURE = "scripts/phase8/evolution-approval-fixtures.ts";

interface Mutation {
  readonly id: string;
  readonly what: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
}

const A = "lib/ai/evolutionApproval";
const MUTATIONS: readonly Mutation[] = [
  // --- bypass approver ID -------------------------------------------------
  { id: "approver-service", what: "bypass the approver id check in the decision service", file: `${A}/service.ts`, find: 'if (!isAuthorizedApprover(input.fromId, input.approverId)) return outcome("UNAUTHORIZED", null, null);', replace: 'if (false) return outcome("UNAUTHORIZED", null, null);' },
  { id: "approver-webhook", what: "bypass the approver id + private-chat check in the webhook", file: `${A}/webhook.ts`, find: "if (!isAuthorizedApprover(update.fromId, config.approverId) || !isPrivateChatWithUser(update)) {", replace: "if (false) {" },
  { id: "approver-private-chat", what: "drop the private-chat requirement (accept the approver's presses from anywhere)", file: `${A}/webhook.ts`, find: " || !isPrivateChatWithUser(update)) {", replace: ") {" },
  { id: "approver-always-true", what: "isAuthorizedApprover always returns true", file: `${A}/security.ts`, find: "return typeof fromId === \"number\" && Number.isSafeInteger(fromId) && Number.isSafeInteger(approverId) && approverId > 0 && fromId === approverId;", replace: "return true;" },

  // --- bypass recordHash / integrity ---------------------------------------
  { id: "hash-integrity", what: "skip the canonical integrity verification of the record", file: `${A}/eligibility.ts`, find: 'if (!verifyEvolutionValidationRecord(record).valid) return { eligible: false, code: "INTEGRITY_CHECK_FAILED" };', replace: "if (false) return { eligible: false, code: \"INTEGRITY_CHECK_FAILED\" };" },
  { id: "hash-exact-record", what: "accept a record whose hash is not the exact recordHash requested", file: `${A}/service.ts`, find: 'if (record.recordHash !== recordHash) return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, "IDENTITY_MISMATCH");', replace: "if (false) return outcome(\"INVALID_APPROVAL_REQUEST\", recordHash, null, \"IDENTITY_MISMATCH\");" },
  { id: "hash-approval-integrity", what: "trust a stored approval without verifying its own integrity", file: `${A}/service.ts`, find: 'if (existing.status === "FOUND" && !verifyApproval(existing.approval, record).valid) return outcome(', replace: 'if (false) return outcome(' },
  { id: "hash-approval-extra-fields", what: "let the row's id/timestamp/metadata leak into the approval hash input", file: `${A}/approvalRecord.ts`, find: ".update(HASH_DOMAIN + canonicalJson(approvalContentOf(content)))", replace: ".update(HASH_DOMAIN + canonicalJson(content))" },

  // --- approve non-VALID ---------------------------------------------------
  { id: "non-valid", what: "make a non-VALID record eligible", file: `${A}/eligibility.ts`, find: 'if (record.result !== "VALID" || record.snapshot.validation.result !== "VALID") return { eligible: false, code: "RESULT_NOT_VALID" };', replace: 'if (false) return { eligible: false, code: "RESULT_NOT_VALID" };' },
  { id: "non-valid-mapping", what: "treat an ineligible record as a normal request instead of INELIGIBLE", file: `${A}/service.ts`, find: 'return outcome("INELIGIBLE", recordHash, "INELIGIBLE", eligibility.code);', replace: 'return outcome("INVALID_APPROVAL_REQUEST", recordHash, null, eligibility.code);' },

  // --- bypass webhook secret / fail open ------------------------------------
  { id: "secret-compare", what: "webhook secret comparison always succeeds", file: `${A}/security.ts`, find: "return timingSafeEqual(digest(headerValue), digest(secret));", replace: "return true;" },
  { id: "secret-step", what: "skip the webhook secret check in the handler", file: `${A}/webhook.ts`, find: 'if (!verifyWebhookSecret(input.secretHeader, config.webhookSecret)) return { status: 401, body: { ok: false, error: "unauthorized" } };', replace: 'if (false) return { status: 401, body: { ok: false, error: "unauthorized" } };' },
  { id: "config-fail-open", what: "continue when Telegram config is missing (fail open)", file: `${A}/webhook.ts`, find: 'if (config === null) return { status: 503, body: { ok: false, error: "not_configured" } };', replace: 'if (false) return { status: 503, body: { ok: false, error: "not_configured" } };' },
  { id: "config-secret-validation", what: "accept a malformed webhook secret in config", file: `${A}/security.ts`, find: 'if (typeof webhookSecret !== "string" || !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) return null;', replace: "if (false) return null;" },

  // --- overwrite approval / idempotency -------------------------------------
  { id: "overwrite-approved", what: "allow REJECT to overwrite a HUMAN_APPROVED decision", file: `${A}/stateMachine.ts`, find: '? { kind: "IDEMPOTENT", outcome: "ALREADY_APPROVED" } : { kind: "INVALID_TRANSITION" };', replace: '? { kind: "IDEMPOTENT", outcome: "ALREADY_APPROVED" } : { kind: "RECORD", action, resultingStatus: STATUS_FOR_ACTION[action] };' },
  { id: "overwrite-rejected", what: "allow APPROVE to overwrite a HUMAN_REJECTED decision", file: `${A}/stateMachine.ts`, find: '? { kind: "IDEMPOTENT", outcome: "ALREADY_REJECTED" } : { kind: "INVALID_TRANSITION" };', replace: '? { kind: "IDEMPOTENT", outcome: "ALREADY_REJECTED" } : { kind: "RECORD", action, resultingStatus: STATUS_FOR_ACTION[action] };' },
  { id: "unknown-action", what: "an unknown action no longer fails closed", file: `${A}/stateMachine.ts`, find: 'if (action !== "APPROVE" && action !== "REJECT") return { kind: "INVALID_TRANSITION" };', replace: "" },
  { id: "idempotency", what: "a repeated decision is no longer treated as idempotent", file: `${A}/service.ts`, find: 'if (transition.kind === "IDEMPOTENT") {', replace: "if (false) {" },
  { id: "repo-upsert", what: "the approval adapter upserts instead of inserting (overwrite path)", file: `${A}/repository.ts`, find: '.insert(row).select("*").single()', replace: '.upsert(row).select("*").single()' },

  // --- auto-promotion / production coupling ---------------------------------
  { id: "promo-import", what: "the approval service imports the qualification decision path", file: `${A}/service.ts`, find: 'import { evaluateApprovalEligibility } from "./eligibility";', replace: 'import "@/lib/ai/decisionQualification/qualify";\nimport { evaluateApprovalEligibility } from "./eligibility";' },
  { id: "promo-status", what: "a DEPLOYED status appears in the approval contracts", file: `${A}/contracts.ts`, find: 'export type ResultingApprovalStatus = "HUMAN_APPROVED" | "HUMAN_REJECTED";', replace: 'export type ResultingApprovalStatus = "HUMAN_APPROVED" | "HUMAN_REJECTED" | "DEPLOYED";' },
  { id: "promo-wording", what: "the APPROVE answer claims a deployment", file: `${A}/wording.ts`, find: 'APPROVED: "Recorded: human approved. Nothing was deployed or activated.",', replace: 'APPROVED: "Approved and deployed.",' },
  { id: "promo-legacy-table", what: "the approval adapter reads the LEGACY evolution_validations table", file: `${A}/repository.ts`, find: 'learningDb.from("evolution_validation_records").select("record_hash");', replace: 'learningDb.from("evolution_validations").select("record_hash");' },

  // --- secret leakage / logging ---------------------------------------------
  { id: "leak-response", what: "the webhook response includes the bot token", file: `${A}/webhook.ts`, find: 'return { status: 401, body: { ok: false, error: "unauthorized" } };', replace: 'return { status: 401, body: { ok: false, error: "unauthorized", debug: config.botToken } as never };' },
  { id: "leak-log", what: "the webhook logs the raw request body", file: `${A}/webhook.ts`, find: "const parsed = parseTelegramUpdate(parsedJson);", replace: "const parsed = parseTelegramUpdate(parsedJson); console.log(input.bodyText);" },
  { id: "leak-upstream-error", what: "the Telegram client propagates an upstream error (which carries the token in its URL)", file: `${A}/telegramClient.ts`, find: "} catch {\n      return { ok: false };\n    } finally {", replace: "} catch (error) {\n      throw error;\n    } finally {" },

  // --- routes ----------------------------------------------------------------
  { id: "route-get-persist", what: "the read-only GET route imports the approval store (a path to persistence)", file: "app/api/ai-performance/approvals/route.ts", find: 'import { getApprovalViewByRecordHash } from "@/lib/ai/evolutionApproval/repository";', replace: 'import { getApprovalViewByRecordHash, createApprovalStore } from "@/lib/ai/evolutionApproval/repository";' },
  { id: "route-admin-gate", what: "the approval-request route no longer requires the admin session", file: "app/api/ai-performance/approvals/request/route.ts", find: 'if (!requireAdminSession()) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });', replace: 'if (false) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });' },
  { id: "route-webhook-get", what: "the webhook route also exports a GET handler", file: "app/api/ai-performance/approvals/telegram/route.ts", find: "export async function POST(request: Request) {", replace: "export async function GET() {\n  return NextResponse.json({ ok: true });\n}\n\nexport async function POST(request: Request) {" },
  { id: "route-cognitive-append", what: "the AI Performance GET route calls an append path", file: "app/api/ai-performance/cognitive/route.ts", find: "const approval = await getApprovalView(", replace: "await createApprovalStore().appendApproval(null as never, null as never);\n          const approval = await getApprovalView(" },

  // --- database migration ----------------------------------------------------
  { id: "sql-valid-pin", what: "the approvals table no longer pins validation_result to VALID", file: "supabase/learning/schema.sql", find: "validation_result text not null check (validation_result = 'VALID'),", replace: "validation_result text not null check (validation_result in ('VALID', 'INVALID')),", },
  { id: "sql-no-update-guard", what: "the approvals table no longer rejects UPDATE", file: "supabase/learning/schema.sql", find: "before update or delete on evolution_approvals", replace: "before delete on evolution_approvals" },
  { id: "sql-not-unique", what: "record_hash is no longer UNIQUE in the approvals table (idempotency key lost)", file: "supabase/learning/schema.sql", find: "record_hash text not null unique references evolution_validation_records (record_hash),", replace: "record_hash text not null references evolution_validation_records (record_hash)," },
  { id: "sql-insert-guard", what: "the insert guard no longer requires the record to be VALID", file: "supabase/learning/schema.sql", find: "and r.result = 'VALID'\n      and r.proposal_id = new.proposal_id", replace: "and r.result in ('VALID', 'INVALID')\n      and r.proposal_id = new.proposal_id" },
  { id: "sql-reject-dominance", what: "REJECT_DOMINANCE_GAP becomes approvable in the approvals table", file: "supabase/learning/schema.sql", find: "'EVIDENCE_GAP', 'PATTERN_GAP')),\n  validation_result text not null", replace: "'EVIDENCE_GAP', 'PATTERN_GAP', 'REJECT_DOMINANCE_GAP')),\n  validation_result text not null" },
];

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const originals = new Map<string, string>();
function backup(file: string): string {
  if (!originals.has(file)) originals.set(file, readFileSync(`${ROOT}/${file}`, "utf8"));
  return originals.get(file) as string;
}
function restoreAll() {
  for (const [file, text] of originals) writeFileSync(`${ROOT}/${file}`, text);
}
process.on("exit", restoreAll);
process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreAll();
  process.exit(143);
});

function runFixtures(): { status: number | null; summary: string } {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--loader", "./scripts/phase7/alias-loader.mjs", FIXTURE], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  const lines = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.split("\n");
  const failed = lines.filter((l) => l.startsWith("FAIL")).map((l) => l.slice(0, 90));
  const errored = lines.find((l) => /Error|Cannot find/.test(l) && !/ExperimentalWarning/.test(l));
  return { status: result.status, summary: failed[0] ?? errored ?? "" };
}

for (const file of new Set(MUTATIONS.map((m) => m.file))) backup(file);

const baseline = runFixtures();
check("BASELINE: the unmutated 8.6.7 fixtures pass (exit 0) — otherwise no mutation result means anything", baseline.status === 0, `exit ${baseline.status}: ${baseline.summary}`);

if (baseline.status === 0) {
  for (const m of MUTATIONS) {
    const original = backup(m.file);
    const occurrences = original.split(m.find).length - 1;
    if (occurrences < 1) {
      check(`MUTATION ${m.id}: ${m.what}`, false, "the target text was not found — the mutation is stale");
      continue;
    }
    try {
      writeFileSync(`${ROOT}/${m.file}`, original.replace(m.find, m.replace));
      const run = runFixtures();
      check(`MUTATION ${m.id}: ${m.what} -> DETECTED (fixtures fail)`, run.status !== 0, "the mutant SURVIVED: the 8.6.7 fixtures still passed");
    } finally {
      writeFileSync(`${ROOT}/${m.file}`, original);
    }
  }
}

const drift = [...originals].filter(([file, text]) => sha(readFileSync(`${ROOT}/${file}`, "utf8")) !== sha(text)).map(([file]) => file);
check("RESTORE: every mutated file is byte-for-byte identical to its original", drift.length === 0, `not restored: ${drift.join(", ")}`);

console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Phase 8.6.7 mutation fixtures passed (${MUTATIONS.length} mutations).`);
if (failures > 0) process.exitCode = 1;
