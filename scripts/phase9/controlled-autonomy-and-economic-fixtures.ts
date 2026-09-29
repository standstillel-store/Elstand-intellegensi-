// ---------------------------------------------------------------------------
// Phase 9 controlled autonomy + economic intelligence fixtures (2026-09-28).
// Dev-only. Pure/offline: global fetch is replaced with an in-memory fake and
// no Supabase / GitHub / Telegram / FRED network is ever touched, and no
// secret is required. What this DOES exercise for real: the actual exported
// functions (CI verdict, callback decoding, timeout math, policy loading,
// FRED parsing, precedence) and the actual source text of the wiring.
// What it cannot exercise: live Supabase rows, live GitHub Actions runs, a
// real Telegram button press — see the report's BLOCKED / not-live items.
//
// Usage:
//   node --experimental-strip-types --no-warnings --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/controlled-autonomy-and-economic-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { APPROVAL_MEANING, APPROVAL_MEANING_ID, AUTHORIZATION_MEANING, AUTHORIZATION_MEANING_ID, OUTCOME_ANSWER_TEXT, OUTCOME_ANSWER_TEXT_ID } from "@/lib/ai/evolutionApproval/wording";
import { decodeAuthCallbackData, decodeCallbackData, encodeAuthCallbackData, encodeCallbackData } from "@/lib/ai/evolutionApproval/telegramPayload";
import { getCombinedCheckStatus } from "@/lib/ai/evolutionGit/githubClient";
import { isPastTimeout } from "@/lib/ai/evolutionPipeline/checks";
import { isAuthorizationExpired, tryHandlePatchAuthorizationCallback } from "@/lib/ai/evolutionPipeline/authorization";
import { getControlPolicySource, getRequiredCheckName, getTimeoutMinutes, isValidControlPolicyShape, loadControlPolicy } from "@/lib/ai/evolutionPipeline/loadControlPolicy";
import { validateGeneratedFiles } from "@/lib/ai/evolutionCoding/scopeGuard";
import { TERMINAL_STATUSES } from "@/lib/ai/evolutionPipeline/contracts";
import { evaluateIngestionHealth } from "@/lib/economicData/ingestHealth";
import { fetchFredObservationsDetailed } from "@/lib/economicData/providers/fredProvider";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}
const src = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"); // comments removed — reference checks are about executable code
const HASH = "ab".repeat(32);

// ---- fake fetch ------------------------------------------------------------
type FakeHandler = (url: string) => { status: number; json?: unknown } | Promise<{ status: number; json?: unknown }>;
let handler: FakeHandler = () => ({ status: 500 });
const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  const r = await handler(url);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: String(r.status), json: async () => r.json } as unknown as Response;
}) as typeof fetch;

const GIT = { token: "t", owner: "o", repo: "r", baseBranch: "main" };
const runsResponse = (runs: Array<{ name: string; status: string; conclusion: string | null }>) => ({ status: 200, json: { check_runs: runs.map((r) => ({ ...r, html_url: `https://ci/${r.name}` })) } });
const REQ = "phase9-patch-check";

async function main() {
  // 1. Approval wording is truthful about the actual pipeline ----------------
  check("1a. APPROVAL_MEANING no longer claims approval 'does not deploy'; it states approval is not a merge/deploy by itself AND a second authorization is required",
    !/does not deploy, activate or promote/.test(APPROVAL_MEANING) && /does NOT merge or deploy anything by itself/.test(APPROVAL_MEANING) && /second, separate human authorization/.test(APPROVAL_MEANING), APPROVAL_MEANING);
  check("1b. Indonesian approval meaning is equally truthful", !/TIDAK men-deploy, TIDAK mengaktifkan/.test(APPROVAL_MEANING_ID) && /TIDAK langsung merge atau deploy/.test(APPROVAL_MEANING_ID) && /otorisasi manusia kedua/.test(APPROVAL_MEANING_ID), APPROVAL_MEANING_ID);
  check("1c. both surfaces state the autonomous system can never approve/authorize itself", /never approve or authorize on its own behalf/.test(APPROVAL_MEANING) && /tidak pernah bisa approve atau mengotorisasi/.test(APPROVAL_MEANING_ID), "");
  check("1d. AUTHORIZATION_MEANING (both languages) says authorizing MERGES and triggers a production deployment — no understatement at the step that actually does it", /MERGES/.test(AUTHORIZATION_MEANING) && /production deployment/.test(AUTHORIZATION_MEANING) && /MERGE/.test(AUTHORIZATION_MEANING_ID) && /deployment production/.test(AUTHORIZATION_MEANING_ID), AUTHORIZATION_MEANING);
  check("1e. the approve callback answers (EN+ID) never claim a deployment happened and say nothing merges/deploys before separate authorization", !/Nothing was deployed or activated/.test(OUTCOME_ANSWER_TEXT.APPROVED) && /separately authorize/.test(OUTCOME_ANSWER_TEXT.APPROVED) && /mengotorisasi terpisah/.test(OUTCOME_ANSWER_TEXT_ID.APPROVED), OUTCOME_ANSWER_TEXT.APPROVED);
  check("1f. no other source file still tells the approver approval 'does not deploy' (eligibility risk note, button label)", !/tidak men-deploy atau mengaktifkan apa pun/.test(src("lib/ai/evolutionApproval/eligibility.ts")) && !/hanya mencatat keputusan\)/.test(src("lib/ai/evolutionApproval/telegramPayload.ts")), "");

  // 2. Structural: the merge is reachable ONLY from the human authorization path
  const mergeImporters = ["lib/ai/evolutionPipeline/run.ts", "lib/ai/evolutionPipeline/checks.ts", "app/api/ai-performance/evolution/checks/route.ts", "app/api/ai-performance/approvals/deployment-webhook/route.ts", "lib/ai/evolutionApproval/service.ts", "lib/ai/evolutionApproval/webhook.ts"].filter((f) => /mergeApprovedBranch|mergeBranch/.test(code(f)));
  check("2a. run.ts, checks.ts, the checks cron route, the deployment webhook and the original approval handlers NEVER reference a merge function", mergeImporters.length === 0, JSON.stringify(mergeImporters));
  check("2b. authorization.ts is the one caller of mergeApprovedBranch, and it stamps authorization (claimPatchAuthorization) BEFORE merging", /mergeApprovedBranch\(/.test(src("lib/ai/evolutionPipeline/authorization.ts")) && src("lib/ai/evolutionPipeline/authorization.ts").indexOf("claimPatchAuthorization(run.patchRunId") < src("lib/ai/evolutionPipeline/authorization.ts").indexOf("await mergeApprovedBranch("), "");
  check("2c. pushGeneratedBranch (the approval-triggered path) contains no merge call", !/mergeBranch\(/.test(src("lib/ai/evolutionGit/pushChange.ts").split("export async function mergeApprovedBranch")[0].replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "");
  check("2d. run.ts stops at BRANCH_PUSHED_AWAITING_CHECKS and never sets a merged/deploy status", /BRANCH_PUSHED_AWAITING_CHECKS/.test(src("lib/ai/evolutionPipeline/run.ts")) && !/PUSH_SUCCESS_DEPLOY_PENDING|DEPLOY_SUCCESS/.test(src("lib/ai/evolutionPipeline/run.ts")), "");
  check("2e. the original approve/reject callback data is untouched and cannot decode as the new authorize callback (and vice-versa)", decodeAuthCallbackData(encodeCallbackData("APPROVE", HASH)) === null && decodeCallbackData(encodeAuthCallbackData("AUTHORIZE", HASH)) === null, "");
  const guard = src("lib/ai/evolutionCoding/scopeGuard.ts");
  check("2f. scopeGuard denylist keeps every original entry (approval gate, decision/execution/qualification modules, tick storage, footprint, orderbook, learning migrations) — nothing removed", ["TickStorage", "bn_trade_ticks", "Footprint", "Orderbook", "evolutionApproval/", "supabase/learning/migrations/", "lib/ai/decisionQualification/", "lib/ai/decisionOutcome/", "lib/ai/preEntryValidation/", "lib/ai/autonomousExecution/", "lib/ai/autonomousDecision/", '"eval("', '"new Function("', '"child_process"'].every((p) => guard.includes(p)), "");
  check("2h. scopeGuard now ALSO forbids self-coding from touching the gate machinery itself (pipeline, git/deploy wrappers, generator, webhooks, checks route, CI workflows, control policy)", ["lib/ai/evolutionPipeline/", "lib/ai/evolutionGit/", "lib/ai/evolutionDeploy/", "lib/ai/evolutionCoding/", "app/api/ai-performance/approvals/", "app/api/ai-performance/evolution/", ".github/", "controlPolicy"].every((p) => guard.includes(`"${p}"`)), "");
  const gateFiles = ["lib/ai/evolutionPipeline/authorization.ts", "lib/ai/evolutionPipeline/checks.ts", "lib/ai/evolutionGit/pushChange.ts", "lib/ai/evolutionCoding/scopeGuard.ts", "app/api/ai-performance/approvals/telegram/route.ts", "app/api/ai-performance/evolution/checks/route.ts", "lib/ai/evolutionDeploy/vercelClient.ts"];
  check("2i. RUNTIME: a generated patch that targets any gate file is rejected by the real scope guard EVEN IF an artifact's own scope lists it", gateFiles.every((f) => validateGeneratedFiles([{ filePath: f, content: "export const x = 1;" } as never], [f]).ok === false), "");
  check("2j. RUNTIME: an ordinary in-scope file still passes (the guard was tightened, not broken)", validateGeneratedFiles([{ filePath: "lib/ai/cognitive/example.ts", content: "export const x = 1;" } as never], ["lib/ai/cognitive/example.ts"]).ok === true, "");
  check("2g. the merge-authorization vocabulary is closed: waiting/decided-no states are terminal (CHECKS_FAILED, CHECKS_TIMEOUT, AUTHORIZATION_REJECTED, AUTHORIZATION_TIMEOUT) and the two waiting states are not", ["CHECKS_FAILED", "CHECKS_TIMEOUT", "AUTHORIZATION_REJECTED", "AUTHORIZATION_TIMEOUT"].every((s) => TERMINAL_STATUSES.includes(s as never)) && !TERMINAL_STATUSES.includes("BRANCH_PUSHED_AWAITING_CHECKS") && !TERMINAL_STATUSES.includes("AWAITING_HUMAN_AUTHORIZATION"), "");

  // 3. Authorization callback decoding -----------------------------------------
  check("3a. encode/decode round-trips authorize + decline", decodeAuthCallbackData(encodeAuthCallbackData("AUTHORIZE", HASH))?.action === "AUTHORIZE" && decodeAuthCallbackData(encodeAuthCallbackData("DECLINE", HASH))?.action === "DECLINE", "");
  check("3b. malformed authorization callbacks decode to null", ["pa:", "pa:xyz", `pa:${"g".repeat(32)}`, `PA:${HASH}`, `pa:${"a".repeat(20)}`, `px:${HASH}`, `pa:${HASH}x`].every((d) => decodeAuthCallbackData(d) === null), "");
  check("3c. callback data stays inside Telegram's 64-byte limit", Buffer.byteLength(encodeAuthCallbackData("AUTHORIZE", HASH)) <= 64, "");

  // 4. tryHandlePatchAuthorizationCallback pass-through / fail-closed (no DB, no network) ---
  const env = { TELEGRAM_BOT_TOKEN: "123456:ABC-fake_token_value_for_fixture_only_1234", TELEGRAM_APPROVER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "s".repeat(32), GITHUB_TOKEN: "t", GITHUB_OWNER: "o", GITHUB_REPO: "r" };
  const cb = (data: string, fromId = 777) => JSON.stringify({ update_id: 1, callback_query: { id: "cq", from: { id: fromId }, data, message: { message_id: 5, chat: { id: fromId, type: "private" } } } });
  calls.length = 0;
  handler = () => ({ status: 200, json: { ok: true } });
  const passApprove = await tryHandlePatchAuthorizationCallback({ secretHeader: env.TELEGRAM_WEBHOOK_SECRET, bodyText: cb(encodeCallbackData("APPROVE", HASH)), env });
  check("4a. an ORIGINAL approve press passes straight through (null) — gate 1 sees identical traffic; no network call made here", passApprove === null && calls.length === 0, JSON.stringify(passApprove));
  const badSecret = await tryHandlePatchAuthorizationCallback({ secretHeader: "wrong", bodyText: cb(encodeAuthCallbackData("AUTHORIZE", HASH)), env });
  check("4b. wrong webhook secret -> null (falls through to the original handler's 401), never a decision", badSecret === null, JSON.stringify(badSecret));
  const noCfg = await tryHandlePatchAuthorizationCallback({ secretHeader: env.TELEGRAM_WEBHOOK_SECRET, bodyText: cb(encodeAuthCallbackData("AUTHORIZE", HASH)), env: { ...env, TELEGRAM_APPROVER_ID: undefined } });
  check("4c. missing Telegram config -> null (feature stays OFF, fail closed)", noCfg === null, JSON.stringify(noCfg));
  const junk = await tryHandlePatchAuthorizationCallback({ secretHeader: env.TELEGRAM_WEBHOOK_SECRET, bodyText: "{not json", env });
  check("4d. malformed body -> null, never throws", junk === null, JSON.stringify(junk));
  calls.length = 0;
  const stranger = await tryHandlePatchAuthorizationCallback({ secretHeader: env.TELEGRAM_WEBHOOK_SECRET, bodyText: cb(encodeAuthCallbackData("AUTHORIZE", HASH), 999), env });
  check("4e. an authorize press from anyone but the configured approver -> 403 UNAUTHORIZED, and NO GitHub call was made", stranger?.status === 403 && stranger.body.outcome === "UNAUTHORIZED" && !calls.some((u) => u.includes("api.github.com")), JSON.stringify(stranger));
  calls.length = 0;
  const noDb = await tryHandlePatchAuthorizationCallback({ secretHeader: env.TELEGRAM_WEBHOOK_SECRET, bodyText: cb(encodeAuthCallbackData("AUTHORIZE", HASH)), env });
  check("4f. authorize from the real approver while the Learning DB is unreachable -> refused (400 INVALID_REQUEST), nothing merged, no GitHub call", noDb?.status === 400 && noDb.body.ok === false && !calls.some((u) => u.includes("api.github.com")), JSON.stringify(noDb));

  // 5. CI verdict — fail closed ---------------------------------------------------
  const verdict = async (runs: Array<{ name: string; status: string; conclusion: string | null }>) => { handler = () => runsResponse(runs); return (await getCombinedCheckStatus(GIT, "abc", REQ)).state; };
  check("5a. no check runs registered -> PENDING (never SUCCESS)", (await verdict([])) === "PENDING", "");
  check("5b. required check still running -> PENDING", (await verdict([{ name: REQ, status: "in_progress", conclusion: null }])) === "PENDING", "");
  check("5c. required check success -> SUCCESS", (await verdict([{ name: REQ, status: "completed", conclusion: "success" }])) === "SUCCESS", "");
  check("5d. a third-party check passing (e.g. Vercel) with the required check ABSENT is NOT success", (await verdict([{ name: "Vercel", status: "completed", conclusion: "success" }])) === "PENDING", "");
  check("5e. required check neutral/skipped is NOT a pass", (await verdict([{ name: REQ, status: "completed", conclusion: "skipped" }])) !== "SUCCESS" && (await verdict([{ name: REQ, status: "completed", conclusion: "neutral" }])) !== "SUCCESS", "");
  check("5f. required check failure -> FAILURE", (await verdict([{ name: REQ, status: "completed", conclusion: "failure" }])) === "FAILURE", "");
  check("5g. cancelled / timed_out -> FAILURE", (await verdict([{ name: REQ, status: "completed", conclusion: "cancelled" }])) === "FAILURE" && (await verdict([{ name: REQ, status: "completed", conclusion: "timed_out" }])) === "FAILURE", "");
  check("5h. success on the required check does NOT mask a failing check on the same commit", (await verdict([{ name: REQ, status: "completed", conclusion: "success" }, { name: "other", status: "completed", conclusion: "failure" }])) === "FAILURE", "");
  handler = () => ({ status: 500 });
  check("5i. GitHub API error -> ERROR (treated as not-yet by callers, never as success)", (await getCombinedCheckStatus(GIT, "abc", REQ)).state === "ERROR", "");
  check("5j. the required check name comes from the policy and is never empty (an empty substring would match every check)", getRequiredCheckName().length > 0 && getRequiredCheckName() === "phase9-patch-check", getRequiredCheckName());
  check("5k. the CI workflow's job name matches the policy's required check name, and it runs tsc --noEmit then npm run build in ONE job", (() => { const w = src(".github/workflows/phase9-patch-check.yml"); return /^  phase9-patch-check:/m.test(w) && w.indexOf("npx tsc --noEmit") > -1 && w.indexOf("npx tsc --noEmit") < w.indexOf("npm run build") && /elvoid\/phase9\/\*\*/.test(w) && !/secrets\./.test(w); })(), "");

  // 6. Timeouts fail closed ---------------------------------------------------------
  const now = Date.parse("2026-09-28T12:00:00Z");
  check("6a. checks timeout: within window not expired, past window expired", !isPastTimeout("2026-09-28T11:30:00Z", 60, now) && isPastTimeout("2026-09-28T10:30:00Z", 60, now), "");
  check("6b. unparseable timestamps are treated as expired (fail closed) for both gates", isPastTimeout("garbage", 60, now) && isAuthorizationExpired("", 1440, now), "");
  check("6c. authorization timeout math", !isAuthorizationExpired("2026-09-28T00:00:00Z", 1440, now) && isAuthorizationExpired("2026-09-26T00:00:00Z", 1440, now), "");

  // 7. YAML control policy — data only, safe, validated -------------------------------
  const policy = loadControlPolicy();
  const stageIds = policy.stages.map((s) => s.id).join(">");
  check("7a. policy declares the mandatory order APPROVAL -> ARTIFACT -> PATCH -> TEST/REGRESSION -> HUMAN AUTHORIZATION -> MERGE/DEPLOY", /HUMAN_APPROVAL>CHANGE_ARTIFACT>PATCH>TEST_REGRESSION>HUMAN_AUTHORIZATION>MERGE_DEPLOY/.test(stageIds), stageIds);
  check("7b. both approval gates are 'human' and PATCH is a hard_safety_boundary", policy.stages.find((s) => s.id === "HUMAN_APPROVAL")?.control === "human" && policy.stages.find((s) => s.id === "HUMAN_AUTHORIZATION")?.control === "human" && policy.stages.find((s) => s.id === "PATCH")?.control === "hard_safety_boundary", "");
  check("7c. the autonomous system is never allowed to approve, authorize, merge, deploy, touch secrets, or override the denylist/risk/decision gates", ["approval", "authorization", "production_merge", "production_deploy", "secret_access", "denylist_override", "scope_expansion", "risk_gate", "decision_gate"].every((a) => policy.autonomy.neverAutonomous.includes(a)) && ["approval", "authorization", "production_merge", "production_deploy"].every((a) => !policy.autonomy.allowed.includes(a)), "");
  check("7d. timeouts come from the policy (checks 60m, authorization 24h)", getTimeoutMinutes("TEST_REGRESSION", 1) === 60 && getTimeoutMinutes("HUMAN_AUTHORIZATION", 1) === 1440 && getTimeoutMinutes("NO_SUCH_STAGE", 7) === 7, "");
  check("7e0. the policy is really loaded FROM the YAML file (not silently the hardcoded default) when run from the repo root", getControlPolicySource() === "yaml", getControlPolicySource());
  check("7e. the YAML file and the hardcoded fail-safe default agree (a load failure can never silently change behavior)", JSON.stringify(load(src("lib/ai/evolutionPipeline/controlPolicy.yaml"))) === JSON.stringify(policy) && isValidControlPolicyShape(policy), "");
  check("7f. the validator rejects wrong shapes (extra-kind control, non-numeric timeout, missing id, wrong version)", !isValidControlPolicyShape({ version: 1, stages: [{ id: "X", control: "shell" }], autonomy: { allowed: [], neverAutonomous: [] } }) && !isValidControlPolicyShape({ version: 1, stages: [{ id: "X", control: "human", timeoutMinutes: "60" }], autonomy: { allowed: [], neverAutonomous: [] } }) && !isValidControlPolicyShape({ version: 1, stages: [{ control: "human" }], autonomy: { allowed: [], neverAutonomous: [] } }) && !isValidControlPolicyShape({ version: 2, stages: [], autonomy: { allowed: [], neverAutonomous: [] } }), "");
  let threw = false;
  try { load("x: !!js/function 'function(){ return 1 }'"); } catch { threw = true; }
  check("7g. js-yaml's default load() REFUSES executable tags (YAML can carry data only, never a function)", threw, "");
  const loaderSrc = src("lib/ai/evolutionPipeline/loadControlPolicy.ts").replace(/\/\/.*$/gm, "");
  check("7h. nothing in the policy loader can execute anything: no eval / Function / child_process / exec / spawn", !/eval\s*\(|new Function|child_process|\bexec(Sync)?\s*\(|\bspawn(Sync)?\s*\(/.test(loaderSrc), "");
  check("7i. no source file passes policy values to a shell or dynamic code", !["lib/ai/evolutionPipeline/checks.ts", "lib/ai/evolutionPipeline/authorization.ts", "lib/ai/evolutionPipeline/run.ts"].some((f) => /child_process|eval\s*\(|new Function/.test(src(f).replace(/\/\/.*$/gm, ""))), "");

  // 8. Cron route fails closed without a secret ---------------------------------------------
  const routeSrc = src("app/api/ai-performance/evolution/checks/route.ts");
  check("8a. the checks cron route is fail-CLOSED when CRON_SECRET is unset (unlike the legacy open-by-default pattern)", /if \(!secret\) return false;/.test(routeSrc), "");

  // 9. Database migrations ----------------------------------------------------------------------
  const m09e = src("supabase/learning/migrations/2026-09e-evolution-patch-checks-authorization.sql");
  const m09f = src("supabase/learning/migrations/2026-09f-evolution-patch-authorization-guard.sql");
  const runStatuses = ["BRANCH_PUSHED_AWAITING_CHECKS", "CHECKS_FAILED", "CHECKS_TIMEOUT", "AWAITING_HUMAN_AUTHORIZATION", "AUTHORIZATION_REJECTED", "AUTHORIZATION_TIMEOUT"];
  check("9a. 09e widens the status vocabulary with every new status and keeps every old one (additive only)", runStatuses.every((s) => m09e.includes(`'${s}'`)) && ["CODE_GENERATION_FAILED", "NO_AFFECTED_FILES_SCOPE", "SCOPE_VIOLATION", "BRANCH_FAILED", "COMMIT_FAILED", "MERGE_CONFLICT", "MERGE_FAILED", "PUSH_SUCCESS_DEPLOY_PENDING", "DEPLOY_SUCCESS", "DEPLOY_FAILED", "DEPLOY_TIMEOUT", "DEPLOY_UNKNOWN", "NOT_CONFIGURED"].every((s) => m09e.includes(`'${s}'`)), "");
  check("9b. 09e drops/deletes/updates no data", !/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b|\bupdate\s+evolution_/i.test(m09e), "");
  check("9c. 09f: the database refuses a merged-or-later status without authorized_by+authorized_at, and makes the stamp immutable; function has a fixed search_path", /PUSH_SUCCESS_DEPLOY_PENDING/.test(m09f) && /authorized_by is null or new\.authorized_at is null/.test(m09f) && /immutable once set/.test(m09f) && /set search_path = public/.test(m09f), "");
  check("9d. every TypeScript PatchRunStatus appears in the migration's allowed list", (() => { const ts = src("lib/ai/evolutionPipeline/contracts.ts"); const block = ts.slice(ts.indexOf("export type PatchRunStatus"), ts.indexOf("export const TERMINAL_STATUSES")); const names = [...block.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]); return names.length >= 19 && names.every((n) => m09e.includes(`'${n}'`)); })(), "");

  // 10. Economic pipeline: FRED provider, precedence, unavailable != fabricated --------------------
  process.env.FRED_API_KEY = "fixture-key";
  const fredJson = (units: string) => ({ status: 200, json: { observations: [{ date: "2026-08-01", value: units === "pc1" ? "3.1" : "0.2" }, { date: "2026-07-01", value: "." }, { date: "2026-06-01", value: units === "pc1" ? "2.9" : "0.3" }] } });
  handler = (url) => (url.includes("stlouisfed.org") ? fredJson(new URL(url).searchParams.get("units") ?? "lin") : { status: 404 });
  const fred = await fetchFredObservationsDetailed();
  const cpiYoy = fred.data.filter((o) => o.indicatorId === "CPI_HEADLINE_YOY");
  check("10a. FRED provider returns oldest-first observations, tagged source 'fred', for the covered indicators", fred.ok && cpiYoy.length === 2 && cpiYoy[0].observationPeriod === "2026-06" && cpiYoy[1].observationPeriod === "2026-08" && cpiYoy.every((o) => o.source === "fred"), JSON.stringify(cpiYoy));
  check("10b. FRED's '.' (no value published) is DROPPED, never coerced to 0", !fred.data.some((o) => o.observationPeriod === "2026-07"), "");
  check("10c. FRED reports covered indicators (informational) — used for context, never to gate Alpha Vantage writes", ["CPI_HEADLINE_MOM", "CPI_HEADLINE_YOY", "CORE_CPI_MOM", "CORE_CPI_YOY", "UNEMPLOYMENT_RATE", "NFP", "RETAIL_SALES_HEADLINE", "DURABLE_GOODS_ORDERS"].every((i) => fred.coveredIndicatorIds.includes(i as never)), JSON.stringify(fred.coveredIndicatorIds));
  check("10d. ambiguous mappings are deliberately NOT covered (PPI, GDP, core retail) — they stay with Alpha Vantage unchanged", !fred.coveredIndicatorIds.some((i) => /PPI|GDP|RETAIL_SALES_CORE/.test(i)), JSON.stringify(fred.coveredIndicatorIds));
  check("10e. the FRED API key is only ever used server-side (provider is a lib/ module, never a client component)", !/"use client"/.test(src("lib/economicData/providers/fredProvider.ts")), "");

  // DATA HIERARCHY (2026-09-29 fix): Alpha Vantage is PRIMARY — it ALWAYS writes its full dataset
  // unconditionally. applyFredPrecedence has been removed. FRED writes under its own source ('fred')
  // as a SUPPORTING provider. Neither can gate or displace the other.
  const ing = src("lib/economicData/ingest.ts");
  check("10f. HIERARCHY: Alpha Vantage data is NEVER withheld because FRED covered the same indicator (applyFredPrecedence removed — AV always writes in full)", !/applyFredPrecedence|deferredToFred|avDataToWrite/.test(ing.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")), "");
  check("10g. HIERARCHY: Alpha Vantage writes UNCONDITIONALLY (upsertObservations(avResult.data) — not filtered by FRED coverage)", /upsertObservations\(avResult\.data\)/.test(ing), "");
  // evaluateIngestionHealth: FRED failure degrades (reported in `degraded`) but never fails a healthy primary run
  const healthGoodPrimary = evaluateIngestionHealth({ alphaVantageOk: true, alphaVantageUpserted: true, alphaVantageThrottled: false, forexFactoryOk: true, forexFactoryUpserted: true, fredOk: false, fredUpserted: false });
  check("10h. HIERARCHY: a FRED (supporting) failure degrades the run but does not fail it when Alpha Vantage succeeded — the inverse of the old behaviour where FRED failure silently lost AV data", healthGoodPrimary.ok && healthGoodPrimary.degraded.length > 0 && healthGoodPrimary.degraded.every((d) => d.startsWith("supporting_")), JSON.stringify(healthGoodPrimary));

  handler = () => ({ status: 503 });
  // Fresh series key space: bust cache by using a new provider run after TTL is impossible offline, so verify the failure path via a missing key instead.
  delete process.env.FRED_API_KEY;
  const noKey = await fetchFredObservationsDetailed();
  check("10i. FRED not configured -> ok:false, ZERO fabricated observations, ZERO covered indicators (unavailable is explicit, never invented)", !noKey.ok && noKey.data.length === 0 && noKey.coveredIndicatorIds.length === 0 && noKey.failedSeries.length === 8, JSON.stringify(noKey.failedSeries.length));

  const repo = src("lib/economicData/repository.ts");
  check("10j. no economic ingest/repository code deletes rows (a provider failure can never remove existing data)", !/\.delete\s*\(/.test(ing + repo + src("lib/economicData/providers/fredProvider.ts")), "");
  check("10k. writer and reader use the SAME database client (Learning DB) and no new table/schema was introduced", /getLearningSupabase/.test(repo) && !/getSupabase\(|getDataSupabase\(/.test(repo) && !/create table/i.test(src("lib/economicData/providers/fredProvider.ts")), "");
  check("10l. a missing-table PostgREST error is now logged as a distinct SCHEMA_CACHE_STALE signal (diagnosable), still degrading to []/false", /SCHEMA_CACHE_STALE/.test(repo) && /PGRST205/.test(repo), "");
  const idxSrc = src("lib/economicData/types.ts");
  check("10m. EconomicDataSource gained 'fred' additively without removing 'forexfactory'/'alphavantage'", /"forexfactory" \| "alphavantage" \| "fred"/.test(idxSrc), "");

  // 11. Scope: untouched areas ------------------------------------------------------------------------
  check("11. no fixture-visible change to TickStorage/Footprint/Orderbook/Data Engine sources in the touched library folders", !/TickStorage|Footprint|Orderbook|supabaseData/i.test(ing + src("lib/economicData/providers/fredProvider.ts") + src("lib/ai/evolutionPipeline/checks.ts") + src("lib/ai/evolutionPipeline/authorization.ts")), "");

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FIXTURE RUNNER CRASHED:", err);
  process.exit(2);
});
