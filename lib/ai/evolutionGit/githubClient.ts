// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, GitHub REST client (Step 2)
//
// The ONLY place GITHUB_TOKEN is used. Every method catches everything and
// returns a plain result object — never a thrown error, never the raw
// upstream body (which could echo request details) — same secret-handling
// rule as lib/ai/evolutionApproval/telegramClient.ts. Nothing here logs.
//
// Five operations only, each mapping to exactly the manual steps a human
// already does through the GitHub web UI: read a file, read a branch ref,
// create a branch, write a file (create-or-update commit), merge a branch.
// No arbitrary Git plumbing (no raw tree/blob construction) beyond what the
// Contents API already does per file — kept deliberately minimal.
// ---------------------------------------------------------------------------

import type { GitConfig, GitEnvInput } from "./contracts";

const REQUEST_TIMEOUT_MS = 10_000;
const API_BASE = "https://api.github.com";

/** `null` unless all required values are present. GITHUB_BASE_BRANCH defaults to "main". Never echoes the token. */
export function readGitConfig(env: GitEnvInput): GitConfig | null {
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof owner !== "string" || owner.length === 0) return null;
  if (typeof repo !== "string" || repo.length === 0) return null;
  const baseBranch = typeof env.GITHUB_BASE_BRANCH === "string" && env.GITHUB_BASE_BRANCH.length > 0 ? env.GITHUB_BASE_BRANCH : "main";
  return { token, owner, repo, baseBranch };
}

export type GitHubCallResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly status: number | null };

async function callGitHub<T>(config: GitConfig, path: string, init: RequestInit = {}): Promise<GitHubCallResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = (await res.json()) as T;
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Head SHA of an existing branch, or `null` (missing or any error — caller decides how to treat that). */
export async function getBranchHeadSha(config: GitConfig, branch: string): Promise<string | null> {
  const result = await callGitHub<{ object: { sha: string } }>(config, `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return result.ok ? result.data.object.sha : null;
}

/** `true` only on a real 2xx create. `false` for "already exists" (422) too — caller treats that as a retry-safe no-op, never as success it can't verify. */
export async function createBranch(config: GitConfig, branch: string, fromSha: string): Promise<boolean> {
  const result = await callGitHub(config, `/repos/${config.owner}/${config.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
  return result.ok;
}

export interface ExistingFile {
  readonly sha: string;
  readonly content: string;
}

/** Current content of a file on `ref` (base64-decoded to UTF-8), or `null` if it does not exist there yet or on any error. */
export async function getFileContent(config: GitConfig, path: string, ref: string): Promise<ExistingFile | null> {
  const result = await callGitHub<{ sha: string; content: string; encoding: string }>(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
  );
  if (!result.ok) return null;
  if (result.data.encoding !== "base64") return null;
  return { sha: result.data.sha, content: Buffer.from(result.data.content, "base64").toString("utf8") };
}

export type PutFileResult = { readonly ok: true; readonly commitSha: string } | { readonly ok: false; readonly reason: string };

/** Creates the file if `existingSha` is omitted, updates it otherwise. Each call is its own commit on `branch` — callers must await sequentially, never in parallel, so each commit's parent is correct. */
export async function putFileContents(config: GitConfig, branch: string, path: string, content: string, message: string, existingSha: string | null): Promise<PutFileResult> {
  const result = await callGitHub<{ commit: { sha: string } }>(config, `/repos/${config.owner}/${config.repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!result.ok) return { ok: false, reason: `GitHub contents PUT failed (status ${result.status ?? "network"})` };
  return { ok: true, commitSha: result.data.commit.sha };
}

export type MergeResult = { readonly ok: true; readonly mergeCommitSha: string } | { readonly ok: false; readonly conflict: boolean; readonly reason: string };

/** Merges `head` into `base`. A 409 from GitHub means a real merge conflict — surfaced as `conflict: true` so the caller reports MERGE_CONFLICT distinctly from any other failure. */
export async function mergeBranch(config: GitConfig, base: string, head: string, commitMessage: string): Promise<MergeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/repos/${config.owner}/${config.repo}/merges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ base, head, commit_message: commitMessage }),
      signal: controller.signal,
    });
    if (res.status === 409) return { ok: false, conflict: true, reason: "merge conflict" };
    if (!res.ok) return { ok: false, conflict: false, reason: `GitHub merge failed (status ${res.status})` };
    const json = (await res.json()) as { sha: string };
    return { ok: true, mergeCommitSha: json.sha };
  } catch {
    return { ok: false, conflict: false, reason: "GitHub merge request errored or timed out" };
  } finally {
    clearTimeout(timer);
  }
}
