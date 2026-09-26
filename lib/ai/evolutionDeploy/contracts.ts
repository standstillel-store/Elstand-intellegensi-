// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, deployment verification contracts (Step 3)
//
// TYPES ONLY.
//
// WHY THERE IS NO "TRIGGER DEPLOYMENT" FUNCTION HERE: Section I of the
// Phase 9 brief says "jangan membuat deployment mechanism baru jika yang
// existing sudah dapat digunakan". The existing mechanism is Vercel's own
// Git integration — merging into the base branch (lib/ai/evolutionGit)
// already starts a Production deployment automatically, exactly as it does
// today for a manual GitHub web UI upload. This module only WATCHES for the
// result: a Vercel Deploy Hook webhook (registered once, same one-time
// manual step as the Telegram webhook) posts here when that deployment
// reaches a terminal state, and vercelClient.ts's poll function exists only
// as a same-request fallback path (see lib/ai/evolutionPipeline/run.ts).
// ---------------------------------------------------------------------------

export interface VercelEnvInput {
  readonly VERCEL_TOKEN?: string | undefined;
  readonly VERCEL_PROJECT_ID?: string | undefined;
  readonly VERCEL_TEAM_ID?: string | undefined;
  readonly VERCEL_WEBHOOK_SECRET?: string | undefined;
}

export interface VercelConfig {
  readonly token: string;
  readonly projectId: string;
  readonly teamId: string | null;
}

/** Closed vocabulary — mirrors the Phase 9 brief's own required distinction (Section I) exactly. */
export type DeploymentState = "PENDING" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | "TIMEOUT" | "UNKNOWN" | "NOT_CONFIGURED";

export interface DeploymentSnapshot {
  readonly state: DeploymentState;
  readonly deploymentId: string | null;
  readonly url: string | null;
}
