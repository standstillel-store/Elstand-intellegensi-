// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, Vercel deployment client (Step 3)
//
// The ONLY place VERCEL_TOKEN and VERCEL_WEBHOOK_SECRET are used. Same
// secret-handling rule as every other client in this codebase: every method
// catches everything, never throws, never echoes the token or an upstream
// body. Nothing here logs.
// ---------------------------------------------------------------------------

import { timingSafeEqual, createHmac } from "node:crypto";
import type { DeploymentSnapshot, DeploymentState, VercelConfig, VercelEnvInput } from "./contracts";

const REQUEST_TIMEOUT_MS = 10_000;

export function readVercelConfig(env: VercelEnvInput): VercelConfig | null {
  const token = env.VERCEL_TOKEN;
  const projectId = env.VERCEL_PROJECT_ID;
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof projectId !== "string" || projectId.length === 0) return null;
  const teamId = typeof env.VERCEL_TEAM_ID === "string" && env.VERCEL_TEAM_ID.length > 0 ? env.VERCEL_TEAM_ID : null;
  return { token, projectId, teamId };
}

function mapReadyState(raw: unknown): DeploymentState {
  switch (raw) {
    case "READY":
      return "READY";
    case "ERROR":
      return "ERROR";
    case "CANCELED":
      return "CANCELED";
    case "QUEUED":
    case "INITIALIZING":
      return "PENDING";
    case "BUILDING":
      return "BUILDING";
    default:
      return "UNKNOWN";
  }
}

/** Most recent deployment for `projectId` whose `meta.githubCommitSha` matches `commitSha`, or `state: "UNKNOWN"` if none is found yet (a fresh merge can take a few seconds before Vercel's own deployment record appears) or on any request error. Never throws. */
export async function findDeploymentByCommitSha(config: VercelConfig, commitSha: string): Promise<DeploymentSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ projectId: config.projectId, limit: "20" });
    if (config.teamId) params.set("teamId", config.teamId);
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    });
    if (!res.ok) return { state: "UNKNOWN", deploymentId: null, url: null };
    const json = (await res.json()) as { deployments?: readonly { uid: string; url: string; readyState: string; meta?: Record<string, string> }[] };
    const match = (json.deployments ?? []).find((d) => d.meta?.githubCommitSha === commitSha);
    if (!match) return { state: "UNKNOWN", deploymentId: null, url: null };
    return { state: mapReadyState(match.readyState), deploymentId: match.uid, url: `https://${match.url}` };
  } catch {
    return { state: "UNKNOWN", deploymentId: null, url: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Single deployment lookup by its own id — used by the deploy-webhook route, which already knows the id from the incoming Vercel event. */
export async function getDeploymentById(config: VercelConfig, deploymentId: string): Promise<DeploymentSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const params = config.teamId ? `?teamId=${encodeURIComponent(config.teamId)}` : "";
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${params}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    });
    if (!res.ok) return { state: "UNKNOWN", deploymentId, url: null };
    const json = (await res.json()) as { url?: string; readyState?: string };
    return { state: mapReadyState(json.readyState), deploymentId, url: json.url ? `https://${json.url}` : null };
  } catch {
    return { state: "UNKNOWN", deploymentId, url: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Constant-time HMAC-SHA1 check of Vercel's `x-vercel-signature` header against the raw request body. A missing header or secret never matches. */
export function verifyVercelSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
