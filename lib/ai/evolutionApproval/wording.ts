// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate wording (Phase 8.6.7)
//
// ONE source of wording for the AI Performance UI and the Telegram message,
// so the two can never drift into saying different things. No imports, no
// logic — safe to import from a client component.
//
// What the words are careful about: `VALID` means every OBSERVATIONAL
// validation gate was met. It is not proven improvement, not proven
// profitability, not causal or counterfactual proof, and not a statement
// that anything is safe for production.
//
// CORRECTED 2026-09-28 (confirmed-live finding from the Final Master
// Audit): APPROVAL_MEANING previously said approving "does not deploy,
// activate or promote anything" — but lib/ai/evolutionPipeline/run.ts was,
// at that time, already wired to generate code AND merge it to production
// immediately afterward. The wording was true when Phase 8.6.7 shipped and
// became false the moment Phase 9 (self-coding) was added on top of it
// without updating this file — exactly the kind of stale-messaging-vs-
// runtime-reality gap this file's own "ONE source of wording" goal exists
// to prevent. It is now updated to describe the ACTUAL current pipeline:
// approving starts a controlled, still-autonomous-supervised process
// (generate -> push a branch -> automated CI checks) that CANNOT reach
// production on its own — a SECOND, separate human decision
// (AUTHORIZATION_MEANING below, a distinct Telegram message sent only
// after CI passes) is required before anything merges or deploys. The
// autonomous system can never satisfy either human gate itself.
// ---------------------------------------------------------------------------

export type ApprovalStatus = "AWAITING_HUMAN_APPROVAL" | "HUMAN_APPROVED" | "HUMAN_REJECTED" | "INELIGIBLE";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  AWAITING_HUMAN_APPROVAL: "Awaiting human approval",
  HUMAN_APPROVED: "Human approved (recorded decision only)",
  HUMAN_REJECTED: "Human rejected",
  INELIGIBLE: "Ineligible for approval",
};

export const OBSERVATIONAL_VALIDATION_PASSED = "Observational validation passed";

/** The one-line reading of the triple that every approval surface shows. */
export const OBSERVATIONAL_EVIDENCE_ONLY = "VALID + OBSERVATIONAL_SPLIT_HISTORY + counterfactualAvailable=false means observational evidence only.";

export const VALID_MEANING = "Every observational validation gate was met. This is not proven improvement, not proven profitability, not causal or counterfactual proof, and not a statement that anything is safe for production.";

export const APPROVAL_MEANING =
  "Approving records a human decision AND authorizes a controlled code-change pipeline to start: the system may generate a patch and push it to an isolated branch, where automated checks (type-check + build) run. Approving does NOT merge or deploy anything by itself — a second, separate human authorization is required after the checks pass. It changes no trading behavior directly, and the autonomous system can never approve or authorize on its own behalf.";

/** Shown on the SECOND gate (after CI passes): authorizing is the step that actually merges to the production branch and, through Vercel's Git integration, deploys. */
export const AUTHORIZATION_MEANING =
  "Authorizing MERGES the checked patch into the production branch, which automatically triggers a production deployment. This is the final human gate — declining leaves the branch unmerged and nothing is deployed.";

/** Fixed, secret-free reply texts for each outcome, used as the Telegram callback answer. */
export const OUTCOME_ANSWER_TEXT = {
  APPROVED: "Recorded: human approved. Controlled patch pipeline started — nothing is merged or deployed until you separately authorize it after checks pass.",
  REJECTED: "Recorded: human rejected.",
  ALREADY_APPROVED: "Already approved. No new decision recorded.",
  ALREADY_REJECTED: "Already rejected. No new decision recorded.",
  INVALID_TRANSITION: "Not allowed: a decision on this record already exists and cannot be reversed.",
  UNAUTHORIZED: "Unauthorized.",
  INVALID_APPROVAL_REQUEST: "Invalid approval request.",
  INELIGIBLE: "Ineligible: only observational validation that passed can be decided.",
  UNAVAILABLE: "Temporarily unavailable. Nothing was recorded.",
} as const;

// ---------------------------------------------------------------------------
// Indonesian (Bahasa Indonesia) — Telegram-facing surface ONLY.
//
// Added for the ELVOID 8.6.7 continuation audit's requirement that Telegram
// explanations be primarily Bahasa Indonesia. Deliberately ADDITIVE: nothing
// above this line changed, so `APPROVAL_STATUS_LABEL` and the English
// `OUTCOME_ANSWER_TEXT` keep serving the AI Performance UI panel exactly as
// before — this file's own header goal ("one source, so the two surfaces
// can't drift into saying different things") is kept in the sense that
// matters: every _ID string below is a faithful translation of the English
// original next to it, same meaning, same safety caveats, different
// language for a different surface (Telegram vs. the dashboard).
//
// Only telegramPayload.ts (the message body) and webhook.ts (the callback
// answer) read these. Nothing else should.
// ---------------------------------------------------------------------------

export const OBSERVATIONAL_VALIDATION_PASSED_ID = "Validasi observasional lolos";

export const OBSERVATIONAL_EVIDENCE_ONLY_ID = "VALID + OBSERVATIONAL_SPLIT_HISTORY + counterfactualAvailable=false berarti ini murni bukti observasional (observational evidence only).";

export const VALID_MEANING_ID =
  "Semua gate validasi observasional terpenuhi. Ini BUKAN bukti peningkatan performa, BUKAN bukti profitabilitas, BUKAN bukti kausal atau counterfactual, dan BUKAN pernyataan bahwa sesuatu aman untuk production.";

export const APPROVAL_MEANING_ID =
  "Approve mencatat keputusan manusia DAN mengotorisasi pipeline perubahan kode terkontrol untuk mulai berjalan: sistem boleh membuat patch dan mem-push-nya ke branch terisolasi, lalu pengecekan otomatis (type-check + build) dijalankan. Approve TIDAK langsung merge atau deploy apa pun — otorisasi manusia kedua yang terpisah diperlukan setelah pengecekan lolos. Tidak mengubah perilaku trading secara langsung, dan sistem otonom tidak pernah bisa approve atau mengotorisasi atas nama dirinya sendiri.";

export const AUTHORIZATION_MEANING_ID =
  "Otorisasi akan MERGE patch yang sudah lolos pengecekan ke branch production, yang otomatis memicu deployment production. Ini gate manusia terakhir — jika ditolak, branch tidak di-merge dan tidak ada yang di-deploy.";

/** Callback answers for the second (authorization) gate — Telegram-facing, Indonesian. */
export const PATCH_AUTHORIZATION_ANSWER_TEXT_ID = {
  AUTHORIZED: "Diotorisasi. Merge dijalankan; deployment production akan mengikuti.",
  DECLINED: "Tercatat: otorisasi ditolak. Tidak ada yang di-merge atau di-deploy.",
  NOT_AWAITING: "Tidak diizinkan: patch ini tidak sedang menunggu otorisasi (mungkin sudah diputuskan, gagal pengecekan, atau kedaluwarsa).",
  UNAUTHORIZED: "Tidak diotorisasi.",
  INVALID_REQUEST: "Permintaan otorisasi tidak valid.",
  MERGE_FAILED: "Otorisasi tercatat tetapi merge gagal. Tidak ada yang di-deploy.",
  CHECKS_NOT_CONFIRMED: "Ditolak: hasil pengecekan CI atau HEAD branch tidak lagi cocok dengan commit yang diperiksa. Tidak ada yang di-merge atau di-deploy.",
  UNAVAILABLE: "Sementara tidak tersedia. Tidak ada yang dicatat.",
} as const;

export const OUTCOME_ANSWER_TEXT_ID: Record<keyof typeof OUTCOME_ANSWER_TEXT, string> = {
  APPROVED: "Tercatat: disetujui. Pipeline patch terkontrol dimulai — belum ada yang di-merge dan tidak ada yang di-deploy sampai kamu mengotorisasi terpisah setelah pengecekan lolos.",
  REJECTED: "Tercatat: ditolak oleh manusia.",
  ALREADY_APPROVED: "Sudah disetujui sebelumnya. Tidak ada keputusan baru yang dicatat.",
  ALREADY_REJECTED: "Sudah ditolak sebelumnya. Tidak ada keputusan baru yang dicatat.",
  INVALID_TRANSITION: "Tidak diizinkan: keputusan untuk record ini sudah ada dan tidak dapat diubah.",
  UNAUTHORIZED: "Tidak diotorisasi.",
  INVALID_APPROVAL_REQUEST: "Permintaan approval tidak valid.",
  INELIGIBLE: "Tidak memenuhi syarat: hanya validasi observasional yang lolos yang dapat diputuskan.",
  UNAVAILABLE: "Sementara tidak tersedia. Tidak ada yang dicatat.",
} as const;
