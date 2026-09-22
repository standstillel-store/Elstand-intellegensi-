// ---------------------------------------------------------------------------
// Phase 8.6.7 — Human Approval Gate fixtures (dev-only). Pure/offline.
//
// The whole decision path (webhook -> service -> eligibility -> state machine
// -> approval record) runs against an IN-MEMORY store and a FAKE Telegram
// client, so every behavior below is exercised for real without a database or
// the network. The Supabase adapter (repository.ts), the routes and the SQL
// migration are inspected statically; the SQL is NOT executed here.
//
// SECRETS: every token/secret below is an obvious FAKE SENTINEL used only to
// prove it can never appear in a response, a log, or a message. No real value
// is ever read, printed, or written by this file.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/evolution-approval-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from "node:fs";
import { checkCandidateScope, finalizeCandidate } from "@/lib/ai/evolutionCandidate/create";
import { buildReplayComparison } from "@/lib/ai/evolutionCandidate/replay";
import { buildEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";
import { draftEvolutionProposals } from "@/lib/ai/evolutionProposal/propose";
import { evaluateApprovalEligibility } from "@/lib/ai/evolutionApproval/eligibility";
import { decideTransition, resultingStatusFor } from "@/lib/ai/evolutionApproval/stateMachine";
import { approvalContentOf, buildApproval, computeApprovalHash, verifyApproval } from "@/lib/ai/evolutionApproval/approvalRecord";
import { decideApproval } from "@/lib/ai/evolutionApproval/service";
import { requestApproval } from "@/lib/ai/evolutionApproval/request";
import { handleTelegramWebhook, MAX_WEBHOOK_BODY_BYTES } from "@/lib/ai/evolutionApproval/webhook";
import { createTelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import { decodeCallbackData, encodeCallbackData, formatApprovalRequestMessage, parseTelegramUpdate } from "@/lib/ai/evolutionApproval/telegramPayload";
import { diagnoseTelegramConfig, isAuthorizedApprover, readTelegramConfig, redactSecrets, verifyWebhookSecret } from "@/lib/ai/evolutionApproval/security";
import { formatApprovalDiagnostic } from "@/lib/ai/evolutionApproval/diagnostics";
import type { ApprovalDiagnosticEvent } from "@/lib/ai/evolutionApproval/diagnostics";
import { APPROVAL_MEANING, APPROVAL_MEANING_ID, APPROVAL_STATUS_LABEL, OBSERVATIONAL_EVIDENCE_ONLY, OBSERVATIONAL_EVIDENCE_ONLY_ID, OBSERVATIONAL_VALIDATION_PASSED, OBSERVATIONAL_VALIDATION_PASSED_ID, OUTCOME_ANSWER_TEXT, OUTCOME_ANSWER_TEXT_ID, VALID_MEANING, VALID_MEANING_ID } from "@/lib/ai/evolutionApproval/wording";
import type { ApprovalStore, AppendApprovalResult, GetApprovalResult, GetRecordResult, ResolveResult } from "@/lib/ai/evolutionApproval/service";
import type { PreviousApprovalDecision } from "@/lib/ai/evolutionApproval/contracts";
import type { TelegramClient } from "@/lib/ai/evolutionApproval/telegramClient";
import type { ApprovalOutcomeCode, ApprovalTelegramMeta, EvolutionApproval, EvolutionApprovalWithoutTimestamp } from "@/lib/ai/evolutionApproval/contracts";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { EvolutionProposalWithoutTimestamp } from "@/lib/ai/evolutionProposal/contracts";
import type { EvolutionNeedAssessment } from "@/lib/ai/evolutionNeed/contracts";
import type { CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";
import type { GapCategory } from "@/lib/ai/evolutionCandidate/contracts";
import type { DecisionMemoryJoinedRow, DecisionExperienceRecord } from "@/lib/ai/decisionMemory/contracts";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail: string) {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
}
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const APPROVAL_FILES = walk(`${ROOT}/lib/ai/evolutionApproval`);
const APPROVAL_SOURCES = APPROVAL_FILES.map((f) => ({ file: f.slice(ROOT.length + 1), code: strip(readFileSync(f, "utf8")) }));

// ---------------------------------------------------------------------------
// Fake secrets (SENTINELS) and env
// ---------------------------------------------------------------------------

const FAKE_TOKEN = "999999:SENTINEL_FAKE_BOT_TOKEN_do_not_use_0123456789";
const FAKE_SECRET = "SENTINEL_FAKE_WEBHOOK_SECRET_do_not_use-42";
const APPROVER_ID = 424242;
const OTHER_ID = 777001;
const ENV = { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_APPROVER_ID: String(APPROVER_ID), TELEGRAM_WEBHOOK_SECRET: FAKE_SECRET };

// ---------------------------------------------------------------------------
// Validation records for every result kind, built through the REAL pipeline
// ---------------------------------------------------------------------------

let idCounter = 0;
function row(decisionTimestamp: string, tagged: boolean): DecisionMemoryJoinedRow {
  idCounter++;
  const experience: DecisionExperienceRecord = {
    id: `exp-${String(idCounter).padStart(5, "0")}`,
    source: "ELVOID_PRO_ORACLE",
    sourceSignalId: `sig-${String(idCounter).padStart(5, "0")}`,
    symbol: "BTCUSDT",
    side: "LONG",
    grade: "A",
    confidence: 70,
    decisionTimestamp,
    learningContext: null,
    createdAt: decisionTimestamp,
    outcome: { outcomeResult: "win", outcomeRr: 1.5, outcomeProfitPercent: 2.1, outcomeDurationMinutes: 60, outcomeClosedAt: decisionTimestamp },
  };
  const evaluation: DecisionEvaluation = {
    version: 1,
    sourceSignalId: experience.sourceSignalId,
    decisionQuality: "GOOD",
    marketOutcome: "POSITIVE",
    evaluationClass: "GOOD_DECISION_GOOD_OUTCOME",
    confidenceAlignment: "ALIGNED",
    riskAlignment: "NOT_APPLICABLE",
    conflictAlignment: "NOT_APPLICABLE",
    hypothesisAlignment: "NOT_APPLICABLE",
    evidence: (tagged ? ["CONFLICTED_STATE_PRESENT"] : []) as never,
    evaluatedAt: decisionTimestamp,
  };
  return { experience, evaluation };
}
const day = (d: number) => new Date(Date.UTC(2026, 7, d)).toISOString();
function window(startDay: number, n: number, tagged: number): DecisionMemoryJoinedRow[] {
  return Array.from({ length: n }, (_, i) => row(day(startDay + i), i < tagged));
}

function proposal(gapCategory: GapCategory = "CONTRADICTION_GAP", suffix = ""): EvolutionProposalWithoutTimestamp {
  return {
    proposalId: `ELVOID_PRO_ORACLE:BTCUSDT:${gapCategory}${suffix}`,
    proposalVersion: 1,
    source: "ELVOID_PRO_ORACLE",
    symbol: "BTCUSDT",
    currentSystemVersion: "phase-8.6.4",
    gapCategory,
    gapSeverity: "HIGH",
    evidence: { occurrenceCount: 8, evaluatedCount: 40, triggeringTags: [] },
    hypothesis: "Repeated unresolved contradiction observed for this source/symbol.",
    proposedChange: "Investigate whether the current contradiction-resolution logic under-resolves disagreement for this source/symbol; validate through historical replay before considering any production change.",
    expectedEffect: "Not yet demonstrated.",
    validationRequirements: ["Historical replay against past cycles for this source/symbol"],
    status: "DRAFT",
  };
}

function recordFor(p: EvolutionProposalWithoutTimestamp, rows: readonly DecisionMemoryJoinedRow[] | null): EvolutionValidationRecordWithoutTimestamp {
  const replay = rows === null ? null : buildReplayComparison(p.source, p.symbol, p.gapCategory, rows);
  const candidate = finalizeCandidate(p, checkCandidateScope(p.hypothesis, p.proposedChange), replay);
  const record = buildEvolutionValidationRecord(p, candidate);
  if (record === null) throw new Error("fixture record could not be built");
  return record;
}

function realRejectDominanceProposal(): EvolutionProposalWithoutTimestamp {
  const gap: CognitiveGap = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", category: "REJECT_DOMINANCE_GAP", severity: "HIGH", evidence: { occurrenceCount: 40, evaluatedCount: 45, triggeringTags: [] }, reasons: ["fixture"] };
  const need: EvolutionNeedAssessment = { source: "ELVOID_PRO_ORACLE", symbol: "BTCUSDT", need: "EVOLUTION_WARRANTED", consideredGaps: [gap], hasValidConstraint: false, reasons: ["fixture"] };
  return draftEvolutionProposals(need)[0];
}

/** The eligibility summary of a record that must be eligible — a fixture programming error otherwise. */
function summaryOf(record: EvolutionValidationRecordWithoutTimestamp) {
  const e = evaluateApprovalEligibility(record);
  if (!e.eligible) throw new Error("fixture: record is not eligible");
  return e.summary;
}

const VALID_ROWS = [...window(1, 20, 8), ...window(21, 20, 3)];
const validRecord = recordFor(proposal(), VALID_ROWS);
// INVALID: a newly active gap category in the newer window (regression) — built from real rows.
function regressionRows(): DecisionMemoryJoinedRow[] {
  const older = window(1, 20, 8);
  const newer = Array.from({ length: 20 }, (_, i) => {
    const r = row(day(21 + i), i < 3);
    if (i >= 3 && i < 8) (r.evaluation as unknown as { evidence: string[] }).evidence = ["CAUTIOUS_STATE_PRESENT"];
    return r;
  });
  return [...older, ...newer];
}
const regressionRecord = recordFor(proposal("CONTRADICTION_GAP", "#regression"), regressionRows());
const insufficientRecord = recordFor(proposal("CONTRADICTION_GAP", "#insufficient"), [...window(1, 6, 3), ...window(7, 6, 0)]);
const inconclusiveRecord = recordFor(proposal("CONTRADICTION_GAP", "#inconclusive"), [...window(1, 20, 6), ...window(21, 20, 6)]);
const notApplicableRecord = recordFor(realRejectDominanceProposal(), VALID_ROWS);

// ---------------------------------------------------------------------------
// In-memory store (models the table's uniqueness and refusal rules) and fake Telegram
// ---------------------------------------------------------------------------

interface CallCounts { resolve: number; getRecord: number; getApproval: number; append: number }

class MemoryStore implements ApprovalStore {
  records = new Map<string, EvolutionValidationRecordWithoutTimestamp>();
  approvals = new Map<string, EvolutionApproval>();
  calls: CallCounts = { resolve: 0, getRecord: 0, getApproval: 0, append: 0 };
  unavailable = false;
  /** Simulates a race: the next append reports DUPLICATE after quietly inserting the competing decision. */
  raceWith: EvolutionApproval | null = null;
  private seq = 0;

  add(record: EvolutionValidationRecordWithoutTimestamp): this {
    this.records.set(record.recordHash, record);
    return this;
  }
  total(): number {
    return this.calls.resolve + this.calls.getRecord + this.calls.getApproval + this.calls.append;
  }

  async resolveRecordHash(reference: string): Promise<ResolveResult> {
    this.calls.resolve++;
    if (this.unavailable) return { status: "UNAVAILABLE" };
    const matches = [...this.records.keys()].filter((h) => h.startsWith(reference));
    if (matches.length === 0) return { status: "NOT_FOUND" };
    if (matches.length > 1) return { status: "AMBIGUOUS" };
    return { status: "FOUND", recordHash: matches[0] };
  }
  async getRecord(recordHash: string): Promise<GetRecordResult> {
    this.calls.getRecord++;
    if (this.unavailable) return { status: "UNAVAILABLE" };
    const record = this.records.get(recordHash);
    return record ? { status: "FOUND", record } : { status: "NOT_FOUND" };
  }
  async getApproval(recordHash: string): Promise<GetApprovalResult> {
    this.calls.getApproval++;
    if (this.unavailable) return { status: "UNAVAILABLE" };
    const approval = this.approvals.get(recordHash);
    return approval ? { status: "FOUND", approval } : { status: "NOT_FOUND" };
  }
  async appendApproval(approval: EvolutionApprovalWithoutTimestamp, meta: ApprovalTelegramMeta): Promise<AppendApprovalResult> {
    this.calls.append++;
    if (this.unavailable) return { status: "UNAVAILABLE" };
    if (this.raceWith !== null) {
      this.approvals.set(this.raceWith.recordHash, this.raceWith);
      this.raceWith = null;
      return { status: "DUPLICATE" };
    }
    if (this.approvals.has(approval.recordHash)) return { status: "DUPLICATE" };
    const record = this.records.get(approval.recordHash);
    if (!record || record.result !== "VALID" || record.proposalId !== approval.proposalId || record.candidateId !== approval.candidateId) return { status: "REFUSED" };
    this.seq++;
    const stored: EvolutionApproval = { ...approval, approvalId: `approval-${this.seq}`, decidedAt: `2026-09-2${this.seq}T00:00:00.000Z`, telegramUpdateId: meta.updateId, telegramCallbackQueryId: meta.callbackQueryId };
    this.approvals.set(approval.recordHash, stored);
    return { status: "APPENDED", approval: stored };
  }
}

class FakeTelegram implements TelegramClient {
  answers: { id: string; text: string }[] = [];
  cleared: { chatId: number; messageId: number }[] = [];
  sent: { chatId: number; text: string; keyboard: unknown }[] = [];
  sendOk = true;
  async sendMessage(chatId: number, text: string, keyboard: unknown) {
    this.sent.push({ chatId, text, keyboard });
    return { ok: this.sendOk };
  }
  async answerCallbackQuery(id: string, text: string) {
    this.answers.push({ id, text });
    return { ok: true };
  }
  async clearInlineKeyboard(chatId: number, messageId: number) {
    this.cleared.push({ chatId, messageId });
    return { ok: true };
  }
}

// console spy — nothing on the approval path may log anything
const consoleLines: string[] = [];
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (!text.startsWith("PASS —") && !text.startsWith("FAIL —") && !text.startsWith("\n") && !text.includes("Phase 8.6.7 Human Approval Gate fixtures")) consoleLines.push(text);
    original(...args);
  };
}

function callbackBody(opts: { fromId?: unknown; chatId?: unknown; chatType?: unknown; data?: unknown; updateId?: number; cbId?: string; messageId?: number; noMessage?: boolean }): string {
  const fromId = "fromId" in opts ? opts.fromId : APPROVER_ID;
  const message = opts.noMessage ? undefined : { message_id: opts.messageId ?? 9001, chat: { id: "chatId" in opts ? opts.chatId : fromId, type: "chatType" in opts ? opts.chatType : "private" } };
  return JSON.stringify({ update_id: opts.updateId ?? 1, callback_query: { id: opts.cbId ?? "cb-1", from: { id: fromId }, data: opts.data, ...(message ? { message } : {}) } });
}

interface Harness {
  store: MemoryStore;
  telegram: FakeTelegram;
  call(input: { body: string; secret?: string | null; env?: Record<string, string | undefined> }): ReturnType<typeof handleTelegramWebhook>;
}
function harness(records: EvolutionValidationRecordWithoutTimestamp[] = [validRecord]): Harness {
  const store = new MemoryStore();
  records.forEach((r) => store.add(r));
  const telegram = new FakeTelegram();
  return {
    store,
    telegram,
    call: ({ body, secret, env }) => handleTelegramWebhook({ secretHeader: secret === undefined ? FAKE_SECRET : secret, bodyText: body, env: env ?? ENV }, { store, createTelegram: () => telegram }),
  };
}
const approveData = (r: EvolutionValidationRecordWithoutTimestamp) => encodeCallbackData("APPROVE", r.recordHash);
const rejectData = (r: EvolutionValidationRecordWithoutTimestamp) => encodeCallbackData("REJECT", r.recordHash);

const responses: string[] = []; // every webhook response body ever produced, for the secret-leak check
async function post(h: Harness, input: Parameters<Harness["call"]>[0]) {
  const result = await h.call(input);
  responses.push(JSON.stringify(result));
  return result;
}

async function main() {
  // =========================================================================
  // 1-5  Eligibility by validation result
  // =========================================================================
  {
    const e = evaluateApprovalEligibility(validRecord);
    check(
      "1. VALID record -> eligible, with a summary carrying the exact identity, mode and counterfactual flag",
      validRecord.result === "VALID" && e.eligible === true && e.summary.recordHash === validRecord.recordHash && e.summary.validationResult === "VALID" && e.summary.validationMode === "OBSERVATIONAL_SPLIT_HISTORY" && e.summary.counterfactualAvailable === false && e.summary.gatesPassed === 7 && e.summary.gatesTotal === 7 && e.summary.proposalId === validRecord.proposalId && e.summary.candidateId === validRecord.candidateId,
      JSON.stringify(e)
    );
  }
  {
    const cases: [string, EvolutionValidationRecordWithoutTimestamp, string][] = [
      ["2. INVALID", regressionRecord, "INVALID"],
      ["3. INSUFFICIENT_EVIDENCE", insufficientRecord, "INSUFFICIENT_EVIDENCE"],
      ["4. INCONCLUSIVE", inconclusiveRecord, "INCONCLUSIVE"],
      ["5. NOT_APPLICABLE", notApplicableRecord, "NOT_APPLICABLE"],
    ];
    for (const [label, record, expectedResult] of cases) {
      const e = evaluateApprovalEligibility(record);
      const h = harness([record]);
      const out = await post(h, { body: callbackBody({ data: approveData(record) }) });
      const parsed = JSON.parse(JSON.stringify(out.body)) as { outcome?: string; status?: string };
      check(
        `${label} record -> NOT eligible (RESULT_NOT_VALID), APPROVE through the webhook is INELIGIBLE and records nothing`,
        record.result === expectedResult && e.eligible === false && e.code === "RESULT_NOT_VALID" && parsed.outcome === "INELIGIBLE" && parsed.status === "INELIGIBLE" && out.status === 200 && h.store.approvals.size === 0 && h.store.calls.append === 0,
        JSON.stringify({ result: record.result, e, out })
      );
    }
  }

  // =========================================================================
  // 6  Invalid recordHash
  // =========================================================================
  {
    const h = harness();
    const unknown = await post(h, { body: callbackBody({ data: `a:${"0".repeat(32)}` }) });
    check("6a. a well-formed but UNKNOWN recordHash reference -> INVALID_APPROVAL_REQUEST, nothing recorded", (unknown.body as { outcome?: string }).outcome === "INVALID_APPROVAL_REQUEST" && h.store.approvals.size === 0 && h.store.calls.append === 0, JSON.stringify(unknown));

    for (const bad of ["a:zz", "a:", "x:" + "a".repeat(32), "a:" + "A".repeat(32), "a:" + "a".repeat(31), "a:" + "a".repeat(33), "approve", "a:" + "a".repeat(32) + "%", "a:%"]) {
      const out = await post(h, { body: callbackBody({ data: bad }) });
      if (out.status !== 400) check(`6b. malformed callback data ${JSON.stringify(bad)} -> 400`, false, JSON.stringify(out));
    }
    check("6b. malformed / wildcard / wrong-length / upper-case callback data is rejected as malformed (400) before any store access", h.store.calls.append === 0 && h.store.approvals.size === 0, JSON.stringify(h.store.calls));

    // Two records sharing a 32-hex prefix -> ambiguous -> rejected (a prefix is only a lookup key).
    const twin: EvolutionValidationRecordWithoutTimestamp = { ...validRecord, recordHash: validRecord.recordHash.slice(0, 32) + "f".repeat(32) };
    const h2 = harness([validRecord, twin]);
    const ambiguous = await post(h2, { body: callbackBody({ data: approveData(validRecord) }) });
    check("6c. a reference matching TWO records is ambiguous -> INVALID_APPROVAL_REQUEST, nothing recorded", (ambiguous.body as { outcome?: string }).outcome === "INVALID_APPROVAL_REQUEST" && h2.store.approvals.size === 0, JSON.stringify(ambiguous));
  }

  // =========================================================================
  // 7  Tampered record
  // =========================================================================
  {
    const tamperedSnapshot = JSON.parse(JSON.stringify(validRecord)) as EvolutionValidationRecordWithoutTimestamp;
    (tamperedSnapshot.snapshot.proposal as { hypothesis: string }).hypothesis = "a rewritten hypothesis";
    const tamperedResult = JSON.parse(JSON.stringify(inconclusiveRecord)) as EvolutionValidationRecordWithoutTimestamp;
    (tamperedResult as { result: string }).result = "VALID";
    (tamperedResult.snapshot.validation as { result: string }).result = "VALID";
    const tamperedGate = JSON.parse(JSON.stringify(validRecord)) as EvolutionValidationRecordWithoutTimestamp;
    (tamperedGate.snapshot.validation.gates[0] as { passed: boolean }).passed = false;

    for (const [label, record] of [["snapshot text rewritten", tamperedSnapshot], ["a non-VALID record relabelled VALID in column and snapshot", tamperedResult], ["a gate flipped inside the snapshot", tamperedGate]] as const) {
      const h = harness([record]);
      const out = await post(h, { body: callbackBody({ data: approveData(record) }) });
      const e = evaluateApprovalEligibility(record);
      check(`7. tampered record (${label}) -> INVALID_APPROVAL_REQUEST (INTEGRITY_CHECK_FAILED), nothing recorded`, (out.body as { outcome?: string }).outcome === "INVALID_APPROVAL_REQUEST" && e.eligible === false && e.code === "INTEGRITY_CHECK_FAILED" && h.store.approvals.size === 0 && h.store.calls.append === 0, JSON.stringify({ out, e }));
    }
    // A store that returns a DIFFERENT record than the one asked for is refused.
    class WrongRecordStore extends MemoryStore {
      async getRecord(): Promise<GetRecordResult> {
        this.calls.getRecord++;
        return { status: "FOUND", record: regressionRecord };
      }
    }
    const wrong = new WrongRecordStore().add(validRecord);
    const outcome = await decideApproval(wrong, { action: "APPROVE", reference: validRecord.recordHash, fromId: APPROVER_ID, approverId: APPROVER_ID, meta: { updateId: 1, callbackQueryId: "c" } });
    check("7b. a store handing back a different record than the exact recordHash requested -> IDENTITY_MISMATCH, nothing recorded", outcome.code === "INVALID_APPROVAL_REQUEST" && outcome.failure === "IDENTITY_MISMATCH" && wrong.approvals.size === 0, JSON.stringify(outcome));
  }

  // =========================================================================
  // 8  Wrong Telegram user id -> unauthorized (before ANY store access)
  // =========================================================================
  {
    const h = harness();
    const wrongUser = await post(h, { body: callbackBody({ fromId: OTHER_ID, data: approveData(validRecord) }) });
    check("8a. a different numeric user id -> 403 UNAUTHORIZED, ZERO store calls, nothing recorded, the presser is told (in Indonesian) 'Tidak diotorisasi.'", wrongUser.status === 403 && (wrongUser.body as { outcome?: string }).outcome === "UNAUTHORIZED" && h.store.total() === 0 && h.store.approvals.size === 0 && h.telegram.answers.at(-1)?.text === OUTCOME_ANSWER_TEXT_ID.UNAUTHORIZED, JSON.stringify({ wrongUser, calls: h.store.calls }));

    const group = await post(h, { body: callbackBody({ chatId: -100123, chatType: "supergroup", data: approveData(validRecord) }) });
    const foreignChat = await post(h, { body: callbackBody({ chatId: OTHER_ID, chatType: "private", data: approveData(validRecord) }) });
    const noMessage = await post(h, { body: callbackBody({ noMessage: true, data: approveData(validRecord) }) });
    check("8b. the RIGHT user pressing in a group, in someone else's chat, or with no chat context is unauthorized too (fail closed), zero store calls", [group, foreignChat, noMessage].every((r) => r.status === 403) && h.store.total() === 0, JSON.stringify([group.status, foreignChat.status, noMessage.status]));

    const asString = await post(h, { body: callbackBody({ fromId: String(APPROVER_ID), data: approveData(validRecord) }) });
    const username = await post(h, { body: JSON.stringify({ update_id: 5, callback_query: { id: "c", from: { id: 424242, username: "elstand_admin" }, data: "a:" + validRecord.recordHash.slice(0, 32), message: { message_id: 1, chat: { id: 7, type: "private" } } } }) });
    check("8c. identity is the NUMERIC id only: a string id is malformed (400) and a matching username with a different numeric chat is unauthorized", asString.status === 400 && username.status === 403 && h.store.total() === 0, JSON.stringify([asString.status, username.status]));

    // The SERVICE enforces the approver check itself, independent of the webhook in front of it.
    const direct = harness();
    const wrongDirect = await decideApproval(direct.store, { action: "APPROVE", reference: validRecord.recordHash, fromId: OTHER_ID, approverId: APPROVER_ID, meta: { updateId: 1, callbackQueryId: "c" } });
    const stringDirect = await decideApproval(direct.store, { action: "APPROVE", reference: validRecord.recordHash, fromId: String(APPROVER_ID), approverId: APPROVER_ID, meta: { updateId: 1, callbackQueryId: "c" } });
    const undefinedDirect = await decideApproval(direct.store, { action: "REJECT", reference: validRecord.recordHash, fromId: undefined, approverId: APPROVER_ID, meta: { updateId: 1, callbackQueryId: "c" } });
    check("8e. the decision SERVICE itself refuses a wrong / string / missing user id (UNAUTHORIZED) with zero store calls, independent of the webhook in front of it", [wrongDirect, stringDirect, undefinedDirect].every((o) => o.code === "UNAUTHORIZED" && o.recordHash === null) && direct.store.total() === 0 && direct.store.approvals.size === 0, JSON.stringify([wrongDirect, stringDirect, undefinedDirect]));

    check("8d. isAuthorizedApprover is strict: number equality only (no string, no float, no zero, no NaN)", isAuthorizedApprover(APPROVER_ID, APPROVER_ID) && !isAuthorizedApprover(String(APPROVER_ID), APPROVER_ID) && !isAuthorizedApprover(APPROVER_ID + 0.5, APPROVER_ID) && !isAuthorizedApprover(0, 0) && !isAuthorizedApprover(NaN, APPROVER_ID) && !isAuthorizedApprover(undefined, APPROVER_ID) && !isAuthorizedApprover(null, APPROVER_ID) && !isAuthorizedApprover(OTHER_ID, APPROVER_ID), "authorization was not strict");
  }

  // =========================================================================
  // 9  Valid approver -> accepted (immutable record naming the exact hash)
  // =========================================================================
  const h9 = harness();
  {
    const out = await post(h9, { body: callbackBody({ data: approveData(validRecord), updateId: 11, cbId: "cb-approve" }) });
    const stored = h9.store.approvals.get(validRecord.recordHash);
    check(
      "9. the valid approver + VALID record -> APPROVED: exactly one row, status HUMAN_APPROVED, numeric approver id, exact full recordHash, verifiable approvalHash, decidedAt set, Telegram delivery metadata kept",
      out.status === 200 && (out.body as { outcome?: string }).outcome === "APPROVED" && (out.body as { status?: string }).status === "HUMAN_APPROVED" && h9.store.approvals.size === 1 && stored !== undefined && stored.decision === "APPROVE" && stored.resultingStatus === "HUMAN_APPROVED" && stored.approverTelegramUserId === APPROVER_ID && stored.recordHash === validRecord.recordHash && stored.recordHash.length === 64 && stored.channel === "TELEGRAM" && stored.validationResult === "VALID" && stored.counterfactualAvailable === false && verifyApproval(stored, validRecord).valid && typeof stored.decidedAt === "string" && stored.telegramUpdateId === 11 && stored.telegramCallbackQueryId === "cb-approve" && h9.telegram.answers.at(-1)?.text === OUTCOME_ANSWER_TEXT_ID.APPROVED && h9.telegram.cleared.length === 1,
      JSON.stringify({ out, stored })
    );
  }

  // =========================================================================
  // 10-12  Idempotency and explicit transitions
  // =========================================================================
  {
    const first = h9.store.approvals.get(validRecord.recordHash);
    const again = await post(h9, { body: callbackBody({ data: approveData(validRecord), updateId: 12, cbId: "cb-approve-2" }) });
    const sameUpdate = await post(h9, { body: callbackBody({ data: approveData(validRecord), updateId: 11, cbId: "cb-approve" }) });
    check("10. duplicate APPROVE (and a redelivery of the SAME update) -> ALREADY_APPROVED, still ONE row, the original approvalId untouched", (again.body as { outcome?: string }).outcome === "ALREADY_APPROVED" && (sameUpdate.body as { outcome?: string }).outcome === "ALREADY_APPROVED" && again.status === 200 && h9.store.approvals.size === 1 && h9.store.approvals.get(validRecord.recordHash)?.approvalId === first?.approvalId && h9.store.calls.append === 1, JSON.stringify({ again, appends: h9.store.calls.append }));

    const flip = await post(h9, { body: callbackBody({ data: rejectData(validRecord), updateId: 13, cbId: "cb-flip" }) });
    check("11a. REJECT after APPROVE -> INVALID_TRANSITION (explicit, fail closed): the stored decision is untouched, no second row", (flip.body as { outcome?: string }).outcome === "INVALID_TRANSITION" && (flip.body as { status?: string }).status === "HUMAN_APPROVED" && h9.store.approvals.size === 1 && h9.store.approvals.get(validRecord.recordHash)?.resultingStatus === "HUMAN_APPROVED" && h9.store.calls.append === 1, JSON.stringify(flip));
  }
  {
    const h = harness();
    const rejected = await post(h, { body: callbackBody({ data: rejectData(validRecord), updateId: 21, cbId: "cb-r1" }) });
    const stored = h.store.approvals.get(validRecord.recordHash);
    const dup = await post(h, { body: callbackBody({ data: rejectData(validRecord), updateId: 22, cbId: "cb-r2" }) });
    const approveAfter = await post(h, { body: callbackBody({ data: approveData(validRecord), updateId: 23, cbId: "cb-r3" }) });
    check("11b. APPROVE after REJECT -> INVALID_TRANSITION: never a silent overwrite; the record stays HUMAN_REJECTED with one row", (rejected.body as { outcome?: string }).outcome === "REJECTED" && stored?.resultingStatus === "HUMAN_REJECTED" && (approveAfter.body as { outcome?: string }).outcome === "INVALID_TRANSITION" && (approveAfter.body as { status?: string }).status === "HUMAN_REJECTED" && h.store.approvals.size === 1 && h.store.approvals.get(validRecord.recordHash)?.approvalId === stored?.approvalId, JSON.stringify({ rejected, approveAfter }));
    check("12. duplicate REJECT -> ALREADY_REJECTED, still ONE row", (dup.body as { outcome?: string }).outcome === "ALREADY_REJECTED" && h.store.approvals.size === 1 && h.store.calls.append === 1, JSON.stringify(dup));
  }
  {
    const combos: [string | null, "APPROVE" | "REJECT", string][] = [
      [null, "APPROVE", "RECORD"], [null, "REJECT", "RECORD"], ["HUMAN_APPROVED", "APPROVE", "IDEMPOTENT"], ["HUMAN_REJECTED", "REJECT", "IDEMPOTENT"], ["HUMAN_APPROVED", "REJECT", "INVALID_TRANSITION"], ["HUMAN_REJECTED", "APPROVE", "INVALID_TRANSITION"],
    ];
    const wrong = combos.filter(([existing, action, kind]) => decideTransition(existing as never, action).kind !== kind);
    check("11c. the state machine table is exact for all six (state, action) pairs, and an unknown action or stored status is INVALID_TRANSITION", wrong.length === 0 && decideTransition(null, "DEPLOY" as never).kind === "INVALID_TRANSITION" && decideTransition("HUMAN_DEPLOYED" as never, "APPROVE").kind === "INVALID_TRANSITION" && resultingStatusFor("APPROVE") === "HUMAN_APPROVED" && resultingStatusFor("REJECT") === "HUMAN_REJECTED", JSON.stringify(wrong));
  }
  {
    // A race: another decision lands between our read and our insert.
    const h = harness();
    const competing = buildApproval({ summary: summaryOf(validRecord), action: "REJECT", approverTelegramUserId: APPROVER_ID }) as EvolutionApprovalWithoutTimestamp;
    h.store.raceWith = { ...competing, approvalId: "approval-race", decidedAt: "2026-09-20T00:00:00.000Z", telegramUpdateId: null, telegramCallbackQueryId: null };
    const out = await post(h, { body: callbackBody({ data: approveData(validRecord) }) });
    check("10b. a lost insert race (DUPLICATE) is re-read and re-decided: APPROVE against a concurrent REJECT -> INVALID_TRANSITION, one row, the earlier decision stands", (out.body as { outcome?: string }).outcome === "INVALID_TRANSITION" && h.store.approvals.size === 1 && h.store.approvals.get(validRecord.recordHash)?.resultingStatus === "HUMAN_REJECTED", JSON.stringify(out));
  }

  {
    // A stored approval whose content no longer matches its own hash is never trusted, and never built upon.
    const h = harness();
    await post(h, { body: callbackBody({ data: approveData(validRecord) }) });
    const stored = h.store.approvals.get(validRecord.recordHash)!;
    h.store.approvals.set(validRecord.recordHash, { ...stored, resultingStatus: "HUMAN_REJECTED", decision: "REJECT" });
    const out = await decideApproval(h.store, { action: "REJECT", reference: validRecord.recordHash, fromId: APPROVER_ID, approverId: APPROVER_ID, meta: { updateId: 99, callbackQueryId: "c" } });
    check("10c. a stored approval that fails its own integrity check (content altered after the fact) is never trusted: INVALID_APPROVAL_REQUEST / INTEGRITY_CHECK_FAILED, no new row", out.code === "INVALID_APPROVAL_REQUEST" && out.failure === "INTEGRITY_CHECK_FAILED" && h.store.calls.append === 1, JSON.stringify(out));
  }

  // =========================================================================
  // 13  Missing / malformed configuration and secret -> fail closed
  // =========================================================================
  {
    const h = harness();
    const variants: [string, Record<string, string | undefined>][] = [
      ["missing webhook secret", { ...ENV, TELEGRAM_WEBHOOK_SECRET: undefined }],
      ["empty webhook secret", { ...ENV, TELEGRAM_WEBHOOK_SECRET: "" }],
      ["webhook secret with illegal characters", { ...ENV, TELEGRAM_WEBHOOK_SECRET: "has spaces!" }],
      ["missing bot token", { ...ENV, TELEGRAM_BOT_TOKEN: undefined }],
      ["missing approver id", { ...ENV, TELEGRAM_APPROVER_ID: undefined }],
      ["approver id not numeric", { ...ENV, TELEGRAM_APPROVER_ID: "elstand_admin" }],
      ["approver id zero", { ...ENV, TELEGRAM_APPROVER_ID: "0" }],
      ["approver id negative", { ...ENV, TELEGRAM_APPROVER_ID: "-424242" }],
      ["approver id decimal", { ...ENV, TELEGRAM_APPROVER_ID: "424242.5" }],
      ["approver id padded", { ...ENV, TELEGRAM_APPROVER_ID: " 424242" }],
      ["no env at all", {}],
    ];
    const bad = [];
    for (const [label, env] of variants) {
      const out = await post(h, { body: callbackBody({ data: approveData(validRecord) }), env });
      if (out.status !== 503 || (out.body as { error?: string }).error !== "not_configured") bad.push(label);
    }
    check("13a. any missing or malformed Telegram config value -> 503 not_configured (the whole feature stays off), zero store calls", bad.length === 0 && h.store.total() === 0, `not failing closed: ${bad.join(", ")}`);

    const missingHeader = await post(h, { body: callbackBody({ data: approveData(validRecord) }), secret: null });
    const emptyHeader = await post(h, { body: callbackBody({ data: approveData(validRecord) }), secret: "" });
    const wrongHeader = await post(h, { body: callbackBody({ data: approveData(validRecord) }), secret: FAKE_SECRET + "x" });
    const truncated = await post(h, { body: callbackBody({ data: approveData(validRecord) }), secret: FAKE_SECRET.slice(0, -1) });
    check("13b. a missing, empty, wrong or truncated webhook secret header -> 401, before the body is even parsed, zero store calls", [missingHeader, emptyHeader, wrongHeader, truncated].every((r) => r.status === 401) && h.store.total() === 0, JSON.stringify([missingHeader.status, emptyHeader.status, wrongHeader.status, truncated.status]));

    const junkWithBadSecret = await post(h, { body: "not json at all", secret: "wrong" });
    check("13c. the secret is checked BEFORE the body: garbage with a wrong secret is 401, not 400", junkWithBadSecret.status === 401, JSON.stringify(junkWithBadSecret));
    check("13d. verifyWebhookSecret: exact match only, never for empty / null / undefined / different length", verifyWebhookSecret(FAKE_SECRET, FAKE_SECRET) && !verifyWebhookSecret("", FAKE_SECRET) && !verifyWebhookSecret(null, FAKE_SECRET) && !verifyWebhookSecret(undefined, FAKE_SECRET) && !verifyWebhookSecret(FAKE_SECRET, "") && !verifyWebhookSecret(FAKE_SECRET + "x", FAKE_SECRET), "secret comparison not strict");
    check("13e. readTelegramConfig returns a config only when all three values are present and well-formed", readTelegramConfig(ENV)?.approverId === APPROVER_ID && readTelegramConfig({ ...ENV, TELEGRAM_BOT_TOKEN: "has space" }) === null && readTelegramConfig({ ...ENV, TELEGRAM_BOT_TOKEN: "" }) === null, "config parsing wrong");
  }

  // =========================================================================
  // 14  Malformed requests
  // =========================================================================
  {
    const h = harness();
    const cases: [string, string][] = [
      ["not JSON", "{oops"],
      ["empty body", ""],
      ["JSON array", "[]"],
      ["JSON null", "null"],
      ["missing update_id", JSON.stringify({ callback_query: { id: "c", from: { id: APPROVER_ID }, data: "a:" + "a".repeat(32) } })],
      ["update_id not an integer", JSON.stringify({ update_id: "1", callback_query: {} })],
      ["callback_query not an object", JSON.stringify({ update_id: 1, callback_query: "x" })],
      ["callback id missing", JSON.stringify({ update_id: 1, callback_query: { from: { id: APPROVER_ID }, data: "a:" + "a".repeat(32) } })],
      ["from.id missing", JSON.stringify({ update_id: 1, callback_query: { id: "c", from: {}, data: "a:" + "a".repeat(32) } })],
      ["data not a string", JSON.stringify({ update_id: 1, callback_query: { id: "c", from: { id: APPROVER_ID }, data: 5 } })],
      ["data over 64 bytes", JSON.stringify({ update_id: 1, callback_query: { id: "c", from: { id: APPROVER_ID }, data: "a:" + "a".repeat(80) } })],
      ["message.chat invalid", JSON.stringify({ update_id: 1, callback_query: { id: "c", from: { id: APPROVER_ID }, data: "a:" + "a".repeat(32), message: { chat: { id: "x" } } } })],
      ["oversize body", JSON.stringify({ update_id: 1, pad: "x".repeat(MAX_WEBHOOK_BODY_BYTES) })],
    ];
    const notRejected = [];
    for (const [label, body] of cases) {
      const out = await post(h, { body });
      if (out.status !== 400) notRejected.push(`${label} -> ${out.status}`);
    }
    check("14a. malformed Telegram requests (bad JSON, wrong shapes, oversize, over-long callback data) -> 400, zero store calls", notRejected.length === 0 && h.store.total() === 0, `not rejected: ${notRejected.join("; ")}`);
    const text = await post(h, { body: JSON.stringify({ update_id: 9, message: { text: "hello" } }) });
    check("14b. a well-formed non-button update (a text message) is acknowledged and ignored: 200 IGNORED, nothing recorded", text.status === 200 && (text.body as { outcome?: string }).outcome === "IGNORED" && h.store.total() === 0, JSON.stringify(text));
    check("14c. parseTelegramUpdate distinguishes CALLBACK / IGNORED / MALFORMED", parseTelegramUpdate({ update_id: 1 }).kind === "IGNORED" && parseTelegramUpdate(null).kind === "MALFORMED" && parseTelegramUpdate({ update_id: 1, callback_query: { id: "c", from: { id: 5 }, data: "a:x" } }).kind === "CALLBACK", "parser kinds wrong");
    check("14d. callback data round-trips and stays within Telegram's 64-byte limit; only the first 32 hex are carried", (() => { const d = encodeCallbackData("APPROVE", validRecord.recordHash); const back = decodeCallbackData(d); return Buffer.byteLength(d) <= 64 && d === "a:" + validRecord.recordHash.slice(0, 32) && back?.action === "APPROVE" && back.reference === validRecord.recordHash.slice(0, 32) && decodeCallbackData(encodeCallbackData("REJECT", validRecord.recordHash))?.action === "REJECT"; })(), "callback data encoding wrong");
  }

  // =========================================================================
  // D  Operator diagnostics — a 503 must be explainable from the log, without a value
  // =========================================================================
  {
    const variants: [string, Record<string, string | undefined>, string][] = [
      ["missing bot token", { ...ENV, TELEGRAM_BOT_TOKEN: undefined }, "TELEGRAM_BOT_TOKEN=missing"],
      ["empty bot token", { ...ENV, TELEGRAM_BOT_TOKEN: "" }, "TELEGRAM_BOT_TOKEN=missing"],
      ["bot token with a trailing newline", { ...ENV, TELEGRAM_BOT_TOKEN: FAKE_TOKEN + "\n" }, "TELEGRAM_BOT_TOKEN=malformed"],
      ["missing approver id", { ...ENV, TELEGRAM_APPROVER_ID: undefined }, "TELEGRAM_APPROVER_ID=missing"],
      ["approver id with quotes", { ...ENV, TELEGRAM_APPROVER_ID: '"424242"' }, "TELEGRAM_APPROVER_ID=malformed"],
      ["approver id with a trailing newline", { ...ENV, TELEGRAM_APPROVER_ID: "424242\n" }, "TELEGRAM_APPROVER_ID=malformed"],
      ["missing webhook secret", { ...ENV, TELEGRAM_WEBHOOK_SECRET: undefined }, "TELEGRAM_WEBHOOK_SECRET=missing"],
      ["webhook secret with illegal characters", { ...ENV, TELEGRAM_WEBHOOK_SECRET: "abc+def/ghi=" }, "TELEGRAM_WEBHOOK_SECRET=malformed"],
      ["nothing set", {}, "TELEGRAM_BOT_TOKEN=missing, TELEGRAM_APPROVER_ID=missing, TELEGRAM_WEBHOOK_SECRET=missing"],
    ];
    const lines: string[] = [];
    const wrong: string[] = [];
    for (const [label, env, expected] of variants) {
      const events: ApprovalDiagnosticEvent[] = [];
      const h = harness();
      const out = await handleTelegramWebhook({ secretHeader: FAKE_SECRET, bodyText: callbackBody({ data: approveData(validRecord) }), env }, { store: h.store, createTelegram: () => h.telegram, diagnose: (e) => events.push(e) });
      const line = events[0] ? formatApprovalDiagnostic(events[0]) : "";
      lines.push(line);
      if (out.status !== 503 || events.length !== 1 || events[0].kind !== "WEBHOOK_NOT_CONFIGURED" || line !== `[approvals] webhook_not_configured: ${expected}` || (readTelegramConfig(env) === null) !== (diagnoseTelegramConfig(env).length > 0)) wrong.push(`${label}: ${line}`);
    }
    check("D1. a 503 not_configured names EXACTLY which variable is missing or malformed (names + 'missing'/'malformed' only), and the config is unusable exactly when the diagnosis is non-empty", wrong.length === 0, wrong.join(" | "));
    check("D2. none of those log lines contains a token, a secret, a value or a length — only allow-listed names and the two fixed words", lines.every((l) => /^\[approvals\] webhook_not_configured: (TELEGRAM_(BOT_TOKEN|APPROVER_ID|WEBHOOK_SECRET)=(missing|malformed)(, )?)+$/.test(l)) && !lines.join("\n").includes("SENTINEL") && !lines.join("\n").includes("424242"), lines.join(" | "));
  }
  {
    const events: ApprovalDiagnosticEvent[] = [];
    const h = harness();
    const call = (input: Parameters<Harness["call"]>[0]) => handleTelegramWebhook({ secretHeader: input.secret === undefined ? FAKE_SECRET : input.secret, bodyText: input.body, env: input.env ?? ENV }, { store: h.store, createTelegram: () => h.telegram, diagnose: (e) => events.push(e) });
    await call({ body: callbackBody({ data: approveData(validRecord) }), secret: "wrong" });
    await call({ body: "garbage" });
    await call({ body: callbackBody({ fromId: OTHER_ID, data: approveData(validRecord) }) });
    await call({ body: callbackBody({ data: approveData(validRecord) }) });
    h.store.unavailable = true;
    await call({ body: callbackBody({ data: rejectData(validRecord), updateId: 2, cbId: "cb-2" }) });
    const kinds = events.map((e) => (e.kind === "WEBHOOK_OUTCOME" ? `${e.kind}:${e.code}` : e.kind));
    check("D3. each failure mode leaves ONE distinct, explainable log event: secret mismatch, malformed body, unauthorized user, a recorded outcome, and a store outage (UNAVAILABLE)", JSON.stringify(kinds) === JSON.stringify(["WEBHOOK_SECRET_MISMATCH", "WEBHOOK_MALFORMED", "WEBHOOK_UNAUTHORIZED_USER", "WEBHOOK_OUTCOME:APPROVED", "WEBHOOK_OUTCOME:UNAVAILABLE"]), JSON.stringify(kinds));
    const text = events.map(formatApprovalDiagnostic).join("\n");
    check("D4. the diagnostic lines for those events carry no user id, no record hash, no header value, no body and no secret", !text.includes(String(OTHER_ID)) && !text.includes(String(APPROVER_ID)) && !text.includes(validRecord.recordHash.slice(0, 16)) && !text.includes("garbage") && !text.includes("wrong") && !text.includes("SENTINEL") && text.split("\n").every((l) => /^\[approvals\] [a-z_]+(: [A-Z_]+)?$/.test(l)), text);
  }
  {
    const h = harness();
    const out = await handleTelegramWebhook({ secretHeader: FAKE_SECRET, bodyText: callbackBody({ data: approveData(validRecord) }), env: ENV }, { store: h.store, createTelegram: () => h.telegram, diagnose: () => { throw new Error("sink exploded"); } });
    check("D5. a throwing diagnostics sink never changes the response or blocks the decision", out.status === 200 && (out.body as { outcome?: string }).outcome === "APPROVED" && h.store.approvals.size === 1, JSON.stringify(out));
    const tricky = formatApprovalDiagnostic({ kind: "WEBHOOK_NOT_CONFIGURED", problems: [{ name: FAKE_TOKEN as never, problem: FAKE_SECRET as never }] }) + formatApprovalDiagnostic({ kind: "WEBHOOK_OUTCOME", code: FAKE_SECRET as never });
    check("D6. even a WRONG event object (a secret smuggled in as a name, a word or an outcome) cannot put a value in the log line — the formatter allow-lists everything", !tricky.includes("SENTINEL") && tricky.includes("unspecified") && tricky.includes("unknown"), tricky);
  }
  {
    const diagnostics = strip(read("lib/ai/evolutionApproval/diagnostics.ts"));
    const telegramRoute = strip(read("app/api/ai-performance/approvals/telegram/route.ts"));
    const requestRoute = strip(read("app/api/ai-performance/approvals/request/route.ts"));
    check("D7. diagnostics.ts never reads the environment or holds a secret (no process.env, botToken, webhookSecret or header access), and both routes feed it the closed events only", !/process\.env|botToken|webhookSecret|headers\.get|bodyText/.test(diagnostics) && /diagnose: emitApprovalDiagnostic/.test(telegramRoute) && /emitApprovalDiagnostic\(\{ kind: "REQUEST_NOT_CONFIGURED", problems: diagnoseTelegramConfig\(telegramEnv\) \}\)/.test(requestRoute) && /emitApprovalDiagnostic\(\{ kind: "REQUEST_OUTCOME", code: outcome\.code \}\)/.test(requestRoute), "diagnostics wiring or purity wrong");
  }

  // =========================================================================
  // Store unavailable -> nothing recorded, redelivery requested
  // =========================================================================
  {
    const h = harness();
    h.store.unavailable = true;
    const out = await post(h, { body: callbackBody({ data: approveData(validRecord) }) });
    check("U1. an unavailable store -> 503 UNAVAILABLE (Telegram will redeliver), nothing recorded, the buttons are NOT removed", out.status === 503 && (out.body as { outcome?: string }).outcome === "UNAVAILABLE" && h.store.approvals.size === 0 && h.telegram.cleared.length === 0, JSON.stringify(out));
  }

  // =========================================================================
  // 15  Secrets never appear anywhere
  // =========================================================================
  {
    // Real Telegram client, upstream failing with an error message that CONTAINS the token.
    const leakyFetch = (async () => {
      throw new Error(`request to https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage failed`);
    }) as unknown as typeof fetch;
    const config = readTelegramConfig(ENV);
    const client = createTelegramClient(config!, leakyFetch);
    const r1 = await client.sendMessage(APPROVER_ID, "x", null);
    const r2 = await client.answerCallbackQuery("cb", "x");
    const r3 = await client.clearInlineKeyboard(1, 1);
    let urlSeen = "";
    const okFetch = (async (url: string) => {
      urlSeen = url;
      return { ok: true, json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch;
    const okClient = createTelegramClient(config!, okFetch);
    const r4 = await okClient.sendMessage(APPROVER_ID, "x", null);
    check("15a. the real Telegram client swallows an upstream error that contains the token and returns only { ok: false }; the token is used solely in the request URL", [r1, r2, r3].every((r) => JSON.stringify(r) === '{"ok":false}') && r4.ok === true && urlSeen.includes(FAKE_TOKEN), JSON.stringify([r1, r2, r3, r4]));

    check("15b. redactSecrets scrubs both the token and the webhook secret from any string", redactSecrets(`a ${FAKE_TOKEN} b ${FAKE_SECRET} c`, config!) === "a [redacted] b [redacted] c", "redaction incomplete");

    // Run every scenario category once more through a fresh harness to collect telegram-side text as well.
    const h = harness();
    await post(h, { body: callbackBody({ data: approveData(validRecord) }) });
    await post(h, { body: callbackBody({ fromId: OTHER_ID, data: approveData(validRecord) }) });
    await post(h, { body: "garbage" });
    await post(h, { body: callbackBody({ data: approveData(validRecord) }), secret: "wrong" });
    await post(h, { body: callbackBody({ data: approveData(validRecord) }), env: {} });
    const everything = [...responses, ...h.telegram.answers.map((a) => a.text), ...h.telegram.sent.map((s) => s.text), ...consoleLines].join("\n");
    check("15c. across every response body, every Telegram answer/message and every console line produced, neither the bot token nor the webhook secret ever appears", !everything.includes(FAKE_TOKEN) && !everything.includes(FAKE_SECRET) && !everything.includes("SENTINEL"), "a sentinel value leaked");
    check("15d. nothing on the approval path logged anything at all", consoleLines.length === 0, JSON.stringify(consoleLines.slice(0, 3)));

    const consoleUsers = APPROVAL_SOURCES.filter((s) => /\bconsole\s*\./.test(s.code)).map((s) => s.file);
    const routeSources = ["app/api/ai-performance/approvals/route.ts", "app/api/ai-performance/approvals/telegram/route.ts", "app/api/ai-performance/approvals/request/route.ts"].map((f) => ({ file: f, code: strip(read(f)) }));
    const routeConsole = routeSources.filter((s) => /\bconsole\s*\./.test(s.code)).map((s) => s.file);
    check("15e. console.* is used in exactly ONE approval file — diagnostics.ts, the fixed-vocabulary operator log — and in no other approval module and no approval route", JSON.stringify(consoleUsers) === JSON.stringify(["lib/ai/evolutionApproval/diagnostics.ts"]) && routeConsole.length === 0, JSON.stringify([...consoleUsers, ...routeConsole]));

    const literalSecretPattern = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/;
    const hardcoded = [...APPROVAL_SOURCES, ...routeSources].filter((s) => literalSecretPattern.test(s.code)).map((s) => s.file);
    const envReaders = [...APPROVAL_SOURCES, ...routeSources].filter((s) => /process\.env\.TELEGRAM_(BOT_TOKEN|WEBHOOK_SECRET)/.test(s.code)).map((s) => s.file).sort();
    check("15f. no token-shaped literal exists in any approval source, and the secret env values are read ONLY by the two routes", hardcoded.length === 0 && JSON.stringify(envReaders) === JSON.stringify(["app/api/ai-performance/approvals/request/route.ts", "app/api/ai-performance/approvals/telegram/route.ts"]), JSON.stringify({ hardcoded, envReaders }));
  }

  // =========================================================================
  // 16-19  Production isolation, no promotion, exact recordHash, no legacy table
  // =========================================================================
  {
    const forbiddenImports = ['@/lib/ai/oracle', '@/lib/elvoid', '@/lib/ai/decisionQualification', '@/lib/ai/preEntryValidation', '@/lib/ai/autonomousDecision', '@/lib/ai/autonomousExecution', '@/lib/ai/autonomousRuntime', '@/lib/binance', '@/lib/payments', '@/lib/wallet', '@/lib/energy', "paperTrader", "next/headers"];
    const routeFiles = ["app/api/ai-performance/approvals/route.ts", "app/api/ai-performance/approvals/telegram/route.ts", "app/api/ai-performance/approvals/request/route.ts"];
    const scanned = [...APPROVAL_SOURCES, ...routeFiles.map((f) => ({ file: f, code: strip(read(f)) }))];
    const hits: string[] = [];
    for (const { file, code } of scanned) {
      // every module specifier: `from "x"`, a bare side-effect `import "x"`, a dynamic `import("x")`, and `require("x")`
      for (const importPath of [...code.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1])) {
        if (forbiddenImports.some((f) => importPath.includes(f))) hits.push(`${file}: ${importPath}`);
      }
    }
    check("16a. no approval module or approval route imports Phase 7 Oracle, qualification, pre-entry, decide, execute, the autonomous runtime, paper trading, exchange, payments, wallet or energy code", hits.length === 0, JSON.stringify(hits));

    const livePath = ["decisionQualification", "preEntryValidation", "autonomousDecision", "autonomousExecution", "autonomousRuntime", "oracle", "decisionMemory"].flatMap((d) => walk(`${ROOT}/lib/ai/${d}`));
    const leaks = livePath.filter((f) => /evolutionApproval|evolution_approvals|TELEGRAM_/.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length + 1));
    const elvoidLeaks = walk(`${ROOT}/lib/elvoid`).filter((f) => /evolutionApproval|evolution_approvals|TELEGRAM_/.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length + 1));
    const cronLeak = /approvals|telegram/i.test(read("vercel.json"));
    check("16b. no live decision-path file (qualification, pre-entry, decide, execute, autonomous runtime, oracle, decision memory, lib/elvoid) references the approval layer or Telegram, and no cron calls it", leaks.length === 0 && elvoidLeaks.length === 0 && !cronLeak, JSON.stringify({ leaks, elvoidLeaks, cronLeak }));

    const transitively = APPROVAL_SOURCES.filter((s) => /from\s+"@\/lib\/ai\/(decisionMemory|selfPerformance|cognitiveGap|decisionPopulation|learningValidation)/.test(s.code)).map((s) => s.file);
    check("16c. the only approval file that reads observation data is derive.ts (the shared per-symbol derivation the route already used), and it is read-only", JSON.stringify(transitively) === JSON.stringify(["lib/ai/evolutionApproval/derive.ts"]) && !/\.(insert|update|upsert|delete)\(/.test(APPROVAL_SOURCES.find((s) => s.file.endsWith("derive.ts"))!.code), JSON.stringify(transitively));

    const banned = /["'`](DEPLOYED|ACTIVE|ACTIVATED|PROMOTED|PRODUCTION|LIVE|APPLIED)["'`]/;
    const statusLiterals = APPROVAL_SOURCES.filter((s) => banned.test(s.code)).map((s) => s.file);
    const approvalsSql = read("supabase/learning/schema.sql");
    const approvalsTable = approvalsSql.slice(approvalsSql.indexOf("create table if not exists evolution_approvals"));
    check("17a. no DEPLOYED / ACTIVE / PROMOTED / PRODUCTION / APPLIED status exists in any approval module or in the approvals table — the only statuses are the four display states and HUMAN_APPROVED / HUMAN_REJECTED", statusLiterals.length === 0 && !banned.test(approvalsTable) && Object.keys(APPROVAL_STATUS_LABEL).sort().join() === "AWAITING_HUMAN_APPROVAL,HUMAN_APPROVED,HUMAN_REJECTED,INELIGIBLE" && /resulting_status in \('HUMAN_APPROVED', 'HUMAN_REJECTED'\)/.test(approvalsTable), JSON.stringify(statusLiterals));

    const h = harness();
    await post(h, { body: callbackBody({ data: approveData(validRecord) }) });
    check("17b. an approval performs exactly ONE store write (the immutable insert) and nothing else — the store interface has no promote, apply, deploy or activate operation", h.store.calls.append === 1 && ["resolveRecordHash", "getRecord", "getApproval", "appendApproval"].every((m) => typeof (h.store as never)[m] === "function") && !Object.getOwnPropertyNames(Object.getPrototypeOf(h.store)).some((n) => /promote|apply|deploy|activate|update|delete/i.test(n)), JSON.stringify(h.store.calls));
    check("17c. the approval outcome answer says decision-only: 'Nothing was deployed or activated.'", OUTCOME_ANSWER_TEXT.APPROVED.includes("Nothing was deployed or activated") && APPROVAL_STATUS_LABEL.HUMAN_APPROVED.includes("recorded decision only"), OUTCOME_ANSWER_TEXT.APPROVED);

    const stored = h.store.approvals.get(validRecord.recordHash)!;
    const altered = { ...stored, recordHash: "0".repeat(64) };
    const content = approvalContentOf(stored);
    check(
      "18a. the stored approval names the EXACT full recordHash (64 hex), never a prefix or a proposalId alone, and the approvalHash covers it — and NOT the row's id, timestamp or Telegram metadata",
      stored.recordHash === validRecord.recordHash && /^[0-9a-f]{64}$/.test(stored.recordHash) && computeApprovalHash(content) === stored.approvalHash && computeApprovalHash({ ...content, recordHash: "0".repeat(64) }) !== stored.approvalHash && !verifyApproval(altered, validRecord).valid && Object.keys(content).sort().join() === "approvalVersion,approverTelegramUserId,candidateId,channel,counterfactualAvailable,decision,gapCategory,proposalId,reason,recordHash,resultingStatus,validationMode,validationResult" && computeApprovalHash({ ...content, approvalId: "x", decidedAt: "y" } as never) === stored.approvalHash,
      JSON.stringify(stored)
    );
    const otherRecord = recordFor(proposal("CONTRADICTION_GAP", "#other"), VALID_ROWS);
    check("18b. an approval cannot be re-pointed at a different record: verifying it against another record fails on recordHash, proposalId and candidateId", verifyApproval(stored, otherRecord).problems.filter((p) => /recordHash|proposalId|candidateId/.test(p)).length >= 3, JSON.stringify(verifyApproval(stored, otherRecord)));
    const wrongUserApproval = buildApproval({ summary: summaryOf(validRecord), action: "APPROVE", approverTelegramUserId: 0 });
    const stringUser = buildApproval({ summary: summaryOf(validRecord), action: "APPROVE", approverTelegramUserId: "424242" as never });
    const longReason = buildApproval({ summary: summaryOf(validRecord), action: "APPROVE", approverTelegramUserId: APPROVER_ID, reason: "x".repeat(501) });
    const badAction = buildApproval({ summary: summaryOf(validRecord), action: "DEPLOY" as never, approverTelegramUserId: APPROVER_ID });
    check("18c. buildApproval refuses a non-numeric or non-positive approver id, an over-long reason and an unknown action (returns null)", wrongUserApproval === null && stringUser === null && longReason === null && badAction === null, "buildApproval accepted bad input");

    const legacyHits = [...APPROVAL_SOURCES, ...["app/api/ai-performance/approvals/route.ts", "app/api/ai-performance/approvals/telegram/route.ts", "app/api/ai-performance/approvals/request/route.ts"].map((f) => ({ file: f, code: strip(read(f)) }))].filter((s) => /evolution_validations\b|persistEvolutionValidation|listEvolutionValidations|persistEvolutionCandidate|evolutionValidation\/repository"|persistEvolutionProposals/.test(s.code)).map((s) => s.file);
    const repoSource = strip(read("lib/ai/evolutionApproval/repository.ts"));
    const tables = [...repoSource.matchAll(/\.from\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
    check("19. the approval layer never reads or writes the LEGACY evolution_validations table (or any legacy persist function): the only tables it touches are evolution_validation_records and evolution_approvals", legacyHits.length === 0 && tables.length > 0 && tables.every((t) => t === "evolution_validation_records" || t === "evolution_approvals") && /getEvolutionValidationRecordByHash/.test(repoSource), JSON.stringify({ legacyHits, tables }));
  }

  // =========================================================================
  // 20  Append-only approval persistence (static — the SQL is not executed here)
  // =========================================================================
  {
    const schema = read("supabase/learning/schema.sql");
    const start = schema.indexOf("create table if not exists evolution_approvals");
    const sql = start === -1 ? "" : schema.slice(start);
    const repoSource = strip(read("lib/ai/evolutionApproval/repository.ts"));
    const writes = [...repoSource.matchAll(/\.(insert|update|upsert|delete|rpc|truncate)\s*\(/g)].map((m) => m[1]);
    check("20a. the approval adapter contains exactly ONE write — a plain insert — and no update, upsert, delete, rpc or truncate", writes.length === 1 && writes[0] === "insert", JSON.stringify(writes));
    check("20b. the migration rejects UPDATE and DELETE per row and TRUNCATE per statement on evolution_approvals, through a function that raises", /create or replace function evolution_approvals_reject_mutation\(\)/.test(sql) && /raise exception/.test(sql) && /before update or delete on evolution_approvals\s+for each row/.test(sql) && /before truncate on evolution_approvals\s+for each statement/.test(sql), "append-only triggers missing");
    check("20c. record_hash is UNIQUE and references the append-only record table; approval_hash is UNIQUE with a 64-hex CHECK (the idempotency key and integrity metadata)", /record_hash text not null unique references evolution_validation_records \(record_hash\)/.test(sql) && /approval_hash text not null unique check \(approval_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(sql), "uniqueness/reference missing");
    check("20d. the database itself pins the approvable shape: validation_result = 'VALID', observational mode, counterfactual false, numeric approver id, TELEGRAM channel, decision/status consistency, and REJECT_DOMINANCE_GAP excluded", /validation_result text not null check \(validation_result = 'VALID'\)/.test(sql) && /validation_mode = 'OBSERVATIONAL_SPLIT_HISTORY'/.test(sql) && /counterfactual_available = false/.test(sql) && /approver_telegram_user_id bigint not null check \(approver_telegram_user_id > 0\)/.test(sql) && /channel = 'TELEGRAM'/.test(sql) && /decision = 'APPROVE' and resulting_status = 'HUMAN_APPROVED'/.test(sql) && !/gap_category text not null check \(gap_category in \([^)]*REJECT_DOMINANCE_GAP/.test(sql), "a constraint is missing");
    check("20e. a BEFORE INSERT trigger requires the referenced record to exist, be VALID and match the proposal/candidate/gap — enforced by the database, not only the application", /before insert on evolution_approvals\s+for each row execute function evolution_approvals_require_valid_record\(\)/.test(sql) && /r\.result = 'VALID'/.test(sql) && /r\.candidate_id = new\.candidate_id/.test(sql), "insert guard missing");
    const statements = [...schema.matchAll(/^\s*(alter table|drop table|drop constraint|delete from|update|truncate)\b[^;]*;/gim)].map((m) => m[0].trim().replace(/\s+/g, " "));
    const touchingExisting = statements.filter((s) => /evolution_(proposals|candidates|validations|validation_records)\b/.test(s) && !/enable row level security/.test(s));
    check("20f. the migration is additive: no existing evolution_* table (including evolution_validation_records) is altered, dropped or rewritten, and it is idempotent (if not exists / drop trigger if exists / create or replace)", touchingExisting.length === 0 && /create index if not exists evolution_approvals_proposal_idx/.test(sql) && (sql.match(/drop trigger if exists/g) ?? []).length === 3 && /alter table evolution_approvals enable row level security/.test(sql) && !/create policy/.test(sql), JSON.stringify(touchingExisting));
    const mirrored = (source: string, typeName: string): string[] => {
      const m = source.match(new RegExp(`export type ${typeName} =([^;]+);`));
      return m ? [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort() : [];
    };
    const sqlGaps = (sql.match(/gap_category text not null check \(gap_category in \(([^)]+)\)\)/)?.[1].match(/'([A-Z_]+)'/g) ?? []).map((x) => x.replace(/'/g, "")).sort();
    const tsGaps = mirrored(read("lib/ai/cognitiveGap/contracts.ts"), "GapCategory").filter((g) => g !== "REJECT_DOMINANCE_GAP");
    check("20g. the approvals table's gap_category list equals the TypeScript GapCategory union minus REJECT_DOMINANCE_GAP (compared against the union itself, not a copy)", sqlGaps.length === 6 && JSON.stringify(sqlGaps) === JSON.stringify(tsGaps), JSON.stringify({ sqlGaps, tsGaps }));
  }

  // =========================================================================
  // Approval request (Telegram message) and shared wording
  // =========================================================================
  {
    const store = new MemoryStore().add(validRecord);
    const telegram = new FakeTelegram();
    const onePreviousDecision: readonly PreviousApprovalDecision[] = [{ decision: "REJECT", resultingStatus: "HUMAN_REJECTED", decidedAt: "2026-09-10T00:00:00.000Z", reason: "fixture: sample too small last time" }];
    const deps = {
      telegram,
      approverChatId: APPROVER_ID,
      getApproval: (h: string) => store.getApproval(h),
      listPreviousDecisions: async () => [] as readonly PreviousApprovalDecision[],
      appendRecord: async (r: EvolutionValidationRecordWithoutTimestamp) => {
        store.add(r);
        return { status: "APPENDED" as const };
      },
    };
    const sent = await requestApproval(deps, validRecord);
    const message = telegram.sent[0];
    const keyboard = JSON.stringify(message?.keyboard);
    check(
      "R1. requesting approval for a VALID record sends ONE message to the approver's chat with the FULL recordHash, identity, mode, counterfactual flag, sample accounting, regression status, risk note, a 'no previous decision' line, and both buttons (32-hex callback data) — IN BAHASA INDONESIA",
      sent.code === "REQUEST_SENT" && sent.status === "AWAITING_HUMAN_APPROVAL" && telegram.sent.length === 1 && message.chatId === APPROVER_ID && message.text.includes(validRecord.recordHash) && message.text.includes(validRecord.proposalId) && message.text.includes(validRecord.candidateId) && message.text.includes("OBSERVATIONAL_SPLIT_HISTORY") && message.text.includes("counterfactualAvailable=false") && /jendela lama: 20 memenuhi syarat \/ 0 dikecualikan/.test(message.text) && /Regresi: dievaluasi, tidak ada regresi/.test(message.text) && /Risiko: Ukuran sampel cukup memadai/.test(message.text) && message.text.includes("Belum ada keputusan sebelumnya") && keyboard.includes(`a:${validRecord.recordHash.slice(0, 32)}`) && keyboard.includes(`r:${validRecord.recordHash.slice(0, 32)}`) && message.text.length < 4096,
      JSON.stringify({ sent, text: message?.text })
    );
    const t6 = new FakeTelegram();
    await requestApproval({ ...deps, telegram: t6, listPreviousDecisions: async () => onePreviousDecision }, validRecord);
    check(
      "R6. a non-empty previousDecisions history is rendered into the message (count, resulting status IN INDONESIAN, decidedAt and the reason) and never affects eligibility of the CURRENT record",
      t6.sent[0]?.text.includes("1 keputusan sebelumnya") && t6.sent[0]?.text.includes("DITOLAK") && t6.sent[0]?.text.includes("2026-09-10T00:00:00.000Z") && t6.sent[0]?.text.includes("sample too small last time"),
      t6.sent[0]?.text
    );
    const decided = new MemoryStore().add(validRecord);
    const t2 = new FakeTelegram();
    await decideApproval(decided, { action: "APPROVE", reference: validRecord.recordHash, fromId: APPROVER_ID, approverId: APPROVER_ID, meta: { updateId: 1, callbackQueryId: "c" } });
    const again = await requestApproval({ ...deps, telegram: t2, getApproval: (h) => decided.getApproval(h), appendRecord: async () => ({ status: "ALREADY_RECORDED" as const }) }, validRecord);
    check("R2. requesting again after a decision exists sends NOTHING and reports ALREADY_DECIDED with the current status", again.code === "ALREADY_DECIDED" && again.status === "HUMAN_APPROVED" && t2.sent.length === 0, JSON.stringify(again));
    const t3 = new FakeTelegram();
    const ineligible = await requestApproval({ ...deps, telegram: t3 }, inconclusiveRecord);
    check("R3. requesting approval for a non-VALID record is INELIGIBLE and sends nothing and appends nothing", ineligible.code === "INELIGIBLE" && ineligible.failure === "RESULT_NOT_VALID" && t3.sent.length === 0, JSON.stringify(ineligible));
    const t4 = new FakeTelegram();
    t4.sendOk = false;
    const down = await requestApproval({ ...deps, telegram: t4 }, validRecord);
    check("R4. a Telegram send failure is reported as TELEGRAM_UNAVAILABLE and decides nothing", down.code === "TELEGRAM_UNAVAILABLE" && down.status === "AWAITING_HUMAN_APPROVAL", JSON.stringify(down));
    const tampered = JSON.parse(JSON.stringify(validRecord)) as EvolutionValidationRecordWithoutTimestamp;
    (tampered.snapshot.proposal as { proposedChange: string }).proposedChange = "rewritten";
    const t5 = new FakeTelegram();
    const refused = await requestApproval({ ...deps, telegram: t5 }, tampered);
    check("R5. a record that fails integrity is never sent to the approver", refused.code === "INELIGIBLE" && refused.failure === "INTEGRITY_CHECK_FAILED" && t5.sent.length === 0, JSON.stringify(refused));
  }
  {
    const message = formatApprovalRequestMessage(summaryOf(validRecord), []);
    const ui = read("components/ai-performance/SelfPerformancePanel.tsx");
    const wordingSource = read("lib/ai/evolutionApproval/wording.ts");
    check(
      "W1. the Telegram message (Indonesian) and the UI (English) use the SAME meaning via the shared wording.ts file: 'Observational validation passed', the VALID + OBSERVATIONAL_SPLIT_HISTORY + counterfactualAvailable=false reading, and what VALID / APPROVE do and do not mean",
      message.includes(OBSERVATIONAL_VALIDATION_PASSED_ID) && message.includes(OBSERVATIONAL_EVIDENCE_ONLY_ID) && message.includes(VALID_MEANING_ID) && message.includes(APPROVAL_MEANING_ID) && ui.includes('from "@/lib/ai/evolutionApproval/wording"') && /OBSERVATIONAL_VALIDATION_PASSED/.test(ui) && /OBSERVATIONAL_EVIDENCE_ONLY/.test(ui) && /VALID_MEANING/.test(ui) && /APPROVAL_MEANING/.test(ui),
      message
    );
    const positiveClaimsEn = ["AI improvement proven", "improvement proven", "Validated candidate", "validated candidate", "profitability proven", "safe for production.", "Approved for production", "Deployed", "now active", "has been promoted"];
    const englishSurfaces = [...Object.values(APPROVAL_STATUS_LABEL), strip(ui)];
    const hitsEn = positiveClaimsEn.filter((p) => englishSurfaces.some((s) => s.includes(p) && !(p === "safe for production." && s.includes("not a statement that anything is safe for production."))));
    check("W2a. no positive claim of proven improvement, profitability, validation, deployment, activation or promotion appears in the (English) status labels or the UI code", hitsEn.length === 0, JSON.stringify(hitsEn));
    const positiveClaimsId = ["peningkatan terbukti", "kandidat tervalidasi", "profitabilitas terbukti", "aman untuk production.", "disetujui untuk production", "di-deploy", "sekarang aktif", "telah dipromosikan"];
    const indonesianSurfaces = [message, ...Object.values(OUTCOME_ANSWER_TEXT_ID)];
    const negatedIdExceptions: Record<string, string> = { "aman untuk production.": "bukan pernyataan bahwa sesuatu aman untuk production.", "di-deploy": "tidak ada yang di-deploy" };
    const hitsId = positiveClaimsId.filter((p) => indonesianSurfaces.some((s) => s.toLowerCase().includes(p) && !(p in negatedIdExceptions && s.toLowerCase().includes(negatedIdExceptions[p]))));
    check("W2b. same guarantee for the Indonesian surface: no positive claim of proven improvement, profitability, deployment, activation or promotion appears in the Telegram message or the (Indonesian) callback answer texts", hitsId.length === 0, JSON.stringify(hitsId));
    check(
      "W3. wording.ts states, in BOTH languages, what VALID is NOT (not proven improvement, profitability, causal/counterfactual proof, production-safe) and that APPROVE is not deploy/activate/promote and changes no trading behavior",
      /not proven improvement/.test(wordingSource) && /not proven profitability/.test(wordingSource) && /causal or counterfactual proof/.test(wordingSource) && /safe for production/.test(wordingSource) && /does not deploy, activate or promote/.test(wordingSource) && /changes no trading behavior/.test(wordingSource) && /BUKAN bukti peningkatan performa/.test(wordingSource) && /BUKAN pernyataan bahwa sesuatu aman untuk production/.test(wordingSource) && /TIDAK men-deploy, TIDAK mengaktifkan, TIDAK mempromosikan/.test(wordingSource) && /TIDAK mengubah perilaku trading/.test(wordingSource),
      "disclaimer missing in one language"
    );
    check("W4. the UI shows all four statuses through one label map, the record hash, sample accounting and regression status, and its request button only asks the approver (it never decides)", ["AWAITING_HUMAN_APPROVAL", "HUMAN_APPROVED", "HUMAN_REJECTED", "INELIGIBLE"].every((s) => wordingSource.includes(s)) && /Record hash/.test(ui) && /describeSlice\(/.test(ui) && /Regression:/.test(ui) && /Send approval request to approver/.test(ui) && !/approvals\/telegram/.test(ui) && /Decisions are made only by the approver, in Telegram/.test(ui), "UI integration incomplete");
  }

  // =========================================================================
  // Route wiring (static)
  // =========================================================================
  {
    const webhookRoute = strip(read("app/api/ai-performance/approvals/telegram/route.ts"));
    const requestRoute = strip(read("app/api/ai-performance/approvals/request/route.ts"));
    const getRoute = strip(read("app/api/ai-performance/approvals/route.ts"));
    const cognitive = strip(read("app/api/ai-performance/cognitive/route.ts"));
    const exportsOf = (code: string) => [...code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    check("V1. the webhook route exports POST only; the approvals status route exports GET only; the request route exports POST only — no GET anywhere can cause persistence", JSON.stringify(exportsOf(webhookRoute)) === '["POST"]' && JSON.stringify(exportsOf(getRoute)) === '["GET"]' && JSON.stringify(exportsOf(requestRoute)) === '["POST"]', JSON.stringify([exportsOf(webhookRoute), exportsOf(getRoute), exportsOf(requestRoute)]));
    check("V2. the read-only GET routes (approvals status + AI Performance cognitive) import no store, request, append or webhook code", ["createApprovalStore", "createRequestDeps", "appendApproval", "requestApproval", "handleTelegramWebhook", "createTelegramClient", "sendMessage"].every((t) => !getRoute.includes(t) && !cognitive.includes(t)) && getRoute.includes("getApprovalViewByRecordHash") && cognitive.includes("getApprovalView"), "a GET route can write or message");
    const firstStatement = requestRoute.slice(requestRoute.indexOf("export async function POST"));
    check("V3. the request route requires the admin session as its FIRST action, checks same-origin, and takes only { symbol, proposalId } from the client — everything else is recomputed server-side", /export async function POST\(request: Request\) \{\s*if \(!requireAdminSession\(\)\) return NextResponse\.json\(\{ ok: false, error: "unauthorized" \}, \{ status: 401 \}\);/.test(firstStatement) && /new URL\(origin\)\.host/.test(requestRoute) && /gatherSymbolEvolution\(body\.symbol\)/.test(requestRoute) && !/body\.(record|validation|candidate|recordHash)/.test(requestRoute), "request route gating wrong");
    check("V4. the webhook route hands off to handleTelegramWebhook with the secret header and raw body and returns its status/body unchanged", /handleTelegramWebhook\(/.test(webhookRoute) && /x-telegram-bot-api-secret-token/.test(webhookRoute) && /NextResponse\.json\(result\.body, \{ status: result\.status \}\)/.test(webhookRoute), "webhook route wiring wrong");
    check("V5. the AI Performance route was refactored to the shared deriveSymbolEvolution and attaches approval status READ-ONLY", /deriveSymbolEvolution\(/.test(cognitive) && /getApprovalView\(/.test(cognitive) && !/persistEvolution|appendEvolution|insert\(/.test(cognitive), "cognitive route wiring wrong");
    check("V6. the OUTCOME_ANSWER_TEXT map covers every outcome code and none of the texts is empty", (["APPROVED", "REJECTED", "ALREADY_APPROVED", "ALREADY_REJECTED", "INVALID_TRANSITION", "UNAUTHORIZED", "INVALID_APPROVAL_REQUEST", "INELIGIBLE", "UNAVAILABLE"] as ApprovalOutcomeCode[]).every((c) => OUTCOME_ANSWER_TEXT[c as keyof typeof OUTCOME_ANSWER_TEXT].length > 10), "an outcome has no answer text");
  }

  console.log(`\n${failures === 0 ? "\u2713" : "\u2717"} ${passed}/${passed + failures} Phase 8.6.7 Human Approval Gate fixtures passed.`);
  if (failures > 0) throw new Error("fixtures failed");
}

main().catch(() => {
  // Any failure — a failed check or an unexpected throw — must exit non-zero (the mutation harness relies on it).
  process.exitCode = 1;
});
