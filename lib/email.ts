import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Phase 6.6.1 Section 4/8/16 — email notifications.
//
// SMTP via Gmail App Password (per final decision). Server-side only —
// this file imports "nodemailer" which has no browser build, so importing
// it from a "use client" component would fail at build time anyway; the
// real guardrail is still discipline (never import lib/email from a
// client component).
//
// Credentials come from env only, never hardcoded (Section 16). Every send
// function is fire-and-forget-tolerant at the call site (callers should not
// let an email failure block the underlying state transition — see
// Section 20 "Handle: ... email failure"), but this module itself throws
// on failure so the caller can decide to log/retry rather than silently
// losing the error.
// ---------------------------------------------------------------------------

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  if (!isEmailConfigured()) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD, // Gmail App Password, NOT the main account password
    },
  });
  return transporter;
}

const SENDER = `"ELSTAND Bug Hunter" <${process.env.SMTP_USER ?? "standstillel@gmail.com"}>`;

async function send(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(`[bug-hunter email] SMTP not configured — skipping "${subject}" to ${to}`);
    return;
  }
  await t.sendMail({ from: SENDER, to, subject, html });
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.elstand-intellegence.my.id";

export async function sendAdminNewReportEmail(report: {
  publicId: string;
  title: string;
  severity: string;
  walletAddress: string;
  createdAt: string;
}): Promise<void> {
  const adminEmail = process.env.BUG_HUNTER_ADMIN_EMAIL || "standstillel@gmail.com";
  const dashboardUrl = `${SITE_URL}${process.env.ADMIN_ENTRY_PATH ?? ""}/dashboard`;
  await send(
    adminEmail,
    `[Bug Hunter] New report ${report.publicId} — ${report.severity.toUpperCase()}`,
    `
      <p>A new bug report has been submitted.</p>
      <ul>
        <li><strong>Report ID:</strong> ${escapeHtml(report.publicId)}</li>
        <li><strong>Title:</strong> ${escapeHtml(report.title)}</li>
        <li><strong>Severity:</strong> ${escapeHtml(report.severity)}</li>
        <li><strong>Wallet:</strong> ${escapeHtml(report.walletAddress)}</li>
        <li><strong>Submitted:</strong> ${escapeHtml(report.createdAt)}</li>
        <li><strong>Status:</strong> PENDING</li>
      </ul>
      <p><a href="${dashboardUrl}">Open Admin Dashboard</a></p>
    `
  );
}

export async function sendUserApprovedEmail(opts: {
  toEmail: string;
  publicId: string;
  title: string;
  rewardAmount: string;
  claimToken: string;
}): Promise<void> {
  const claimUrl = `${SITE_URL}/earn/bug-hunter/claim/${encodeURIComponent(opts.claimToken)}`;
  await send(
    opts.toEmail,
    `Your bug report ${opts.publicId} has been approved!`,
    `
      <p>Good news — your bug report has been approved.</p>
      <ul>
        <li><strong>Report ID:</strong> ${escapeHtml(opts.publicId)}</li>
        <li><strong>Title:</strong> ${escapeHtml(opts.title)}</li>
        <li><strong>Reward:</strong> ${escapeHtml(opts.rewardAmount)} ELS</li>
        <li><strong>Status:</strong> APPROVED</li>
      </ul>
      <p><a href="${claimUrl}">Claim your reward</a></p>
      <p style="color:#888;font-size:12px">This link is unique to you and expires in 14 days. Do not share it.</p>
    `
  );
}

export async function sendUserRejectedEmail(opts: { toEmail: string; publicId: string; title: string; reason: string }): Promise<void> {
  await send(
    opts.toEmail,
    `Update on your bug report ${opts.publicId}`,
    `
      <p>Thanks for the report — after review it was not approved for reward.</p>
      <ul>
        <li><strong>Report ID:</strong> ${escapeHtml(opts.publicId)}</li>
        <li><strong>Title:</strong> ${escapeHtml(opts.title)}</li>
        <li><strong>Reason:</strong> ${escapeHtml(opts.reason)}</li>
      </ul>
    `
  );
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
