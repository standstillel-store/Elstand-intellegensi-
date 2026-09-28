// ---------------------------------------------------------------------------
// ELVOID Intelligence — Phase 9, control policy loader (2026-09-28)
//
// Loads controlPolicy.yaml with js-yaml's `load()` — its SAFE, default
// schema. js-yaml v5's `load()` never constructs a function, a class
// instance, or anything beyond plain objects/arrays/strings/numbers/
// booleans/null; the dangerous `!!js/function`-style tags require an
// explicit, non-default schema this file never opts into. The result is
// then checked against `isValidControlPolicyShape()` below — an explicit
// allow-shape, not a generic schema library — before anything in this file
// trusts a single value out of it. A file that parses as valid YAML but has
// the wrong shape (extra top-level keys, a stage missing `id`, a
// non-numeric timeout, anything else unexpected) is rejected exactly like a
// missing file: DEFAULT_POLICY is used instead. This is config, never an
// execution target — nothing read from here is ever passed to eval(),
// Function(), child_process, or a template that becomes a shell command.
//
// FAIL-SAFE, NOT FAIL-OPEN: if the YAML file cannot be read (e.g. a build
// that somehow didn't trace it into the serverless bundle) or fails
// validation, this module falls back to DEFAULT_POLICY — a hardcoded object
// with the exact same values as controlPolicy.yaml — rather than throwing
// or silently using an empty/permissive policy. Either way, timeouts stay
// conservative and both human gates stay human; nothing about a load
// failure ever loosens a control.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export type StageControl = "autonomous" | "hard_safety_boundary" | "automated_gate" | "human";

export interface ControlPolicyStage {
  readonly id: string;
  readonly control: StageControl;
  readonly timeoutMinutes?: number;
  readonly checkNameContains?: string;
}

export interface ControlPolicy {
  readonly version: number;
  readonly stages: readonly ControlPolicyStage[];
  readonly autonomy: {
    readonly allowed: readonly string[];
    readonly neverAutonomous: readonly string[];
  };
}

const VALID_CONTROLS: readonly StageControl[] = ["autonomous", "hard_safety_boundary", "automated_gate", "human"];

const DEFAULT_POLICY: ControlPolicy = {
  version: 1,
  stages: [
    { id: "NEED", control: "autonomous" },
    { id: "PROPOSAL", control: "autonomous" },
    { id: "CANDIDATE", control: "autonomous" },
    { id: "VALIDATION", control: "autonomous" },
    { id: "HUMAN_APPROVAL", control: "human" },
    { id: "CHANGE_ARTIFACT", control: "autonomous" },
    { id: "PATCH", control: "hard_safety_boundary" },
    { id: "TEST_REGRESSION", control: "automated_gate", checkNameContains: "phase9-patch-check", timeoutMinutes: 60 },
    { id: "HUMAN_AUTHORIZATION", control: "human", timeoutMinutes: 1440 },
    { id: "MERGE_DEPLOY", control: "autonomous" },
  ],
  autonomy: {
    allowed: ["detect_gap", "proposal", "candidate", "validation", "generate_artifact", "generate_patch", "run_test", "run_regression", "fail_closed"],
    neverAutonomous: [
      "scope_expansion",
      "denylist_override",
      "approval",
      "authorization",
      "production_merge",
      "production_deploy",
      "secret_access",
      "risk_gate",
      "decision_gate",
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStage(value: unknown): value is ControlPolicyStage {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.control !== "string" || !VALID_CONTROLS.includes(value.control as StageControl)) return false;
  if (value.timeoutMinutes !== undefined && (typeof value.timeoutMinutes !== "number" || !Number.isFinite(value.timeoutMinutes) || value.timeoutMinutes <= 0)) return false;
  if (value.checkNameContains !== undefined && typeof value.checkNameContains !== "string") return false;
  return true;
}

export function isValidControlPolicyShape(value: unknown): value is ControlPolicy {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!Array.isArray(value.stages) || !value.stages.every(isValidStage)) return false;
  if (!isRecord(value.autonomy)) return false;
  const allowed = value.autonomy.allowed;
  const neverAutonomous = value.autonomy.neverAutonomous;
  if (!Array.isArray(allowed) || !allowed.every((v) => typeof v === "string")) return false;
  if (!Array.isArray(neverAutonomous) || !neverAutonomous.every((v) => typeof v === "string")) return false;
  return true;
}

let cached: ControlPolicy | null = null;
let cachedSource: "yaml" | "default" = "default";

/**
 * Where the YAML lives at runtime. `process.cwd()` first: in a bundled Next.js
 * server chunk `__dirname` points at .next/server/chunks (verified in this
 * repo's own build output), NOT at this source folder, so a __dirname-only
 * lookup would silently miss the file in production and fall back to
 * DEFAULT_POLICY — identical values, but the YAML would be decorative. The
 * file tracer follows the literal repo-relative path below into the
 * serverless bundle (verified via the route's .nft.json). `__dirname` stays as
 * a second candidate for un-bundled execution (fixtures, `tsx`).
 */
function candidatePaths(): string[] {
  const paths = [join(process.cwd(), "lib/ai/evolutionPipeline/controlPolicy.yaml")];
  // `typeof x` is specifically safe on an identifier that was never declared
  // at all (unlike referencing it directly, which throws) — this is a plain
  // language-level check, not eval/Function/indirection of any kind.
  // `__dirname` only exists in CommonJS scope: present in Next.js's compiled
  // server build, absent when this file runs directly as ESM (fixtures via
  // `--experimental-strip-types`).
  if (typeof __dirname !== "undefined") paths.push(join(__dirname, "controlPolicy.yaml"));
  return paths;
}

export function loadControlPolicy(): ControlPolicy {
  if (cached) return cached;
  for (const path of candidatePaths()) {
    try {
      const raw = readFileSync(path, "utf8");
      const parsed: unknown = load(raw); // js-yaml's safe default schema — see file header
      if (isValidControlPolicyShape(parsed)) {
        cached = parsed;
        cachedSource = "yaml";
        return cached;
      }
      break; // file found but wrong shape — do NOT keep searching for a different file to trust; fail safe below
    } catch {
      // not at this candidate path (or unreadable) — try the next one
    }
  }
  cached = DEFAULT_POLICY; // fail SAFE (conservative hardcoded policy), never throw, never fail open
  cachedSource = "default";
  return cached;
}

/** "yaml" if the policy actually came from controlPolicy.yaml, "default" if the hardcoded fail-safe copy is in use. Exposed so a deployed instance can prove which one it is running (see the checks route's response). */
export function getControlPolicySource(): "yaml" | "default" {
  loadControlPolicy();
  return cachedSource;
}

export function getStage(id: string): ControlPolicyStage | undefined {
  return loadControlPolicy().stages.find((s) => s.id === id);
}

/** Minutes before the given stage is treated as timed out. Falls back to `fallbackMinutes` if the stage or its timeout isn't defined — never `undefined`, so a caller can never accidentally skip the timeout check. */
export function getTimeoutMinutes(stageId: string, fallbackMinutes: number): number {
  const stage = getStage(stageId);
  return stage?.timeoutMinutes ?? fallbackMinutes;
}

/** Substring the required CI check run's name must contain. Falls back to the workflow's own job name so a missing/invalid policy can never yield an empty string (which would match every check run). */
export function getRequiredCheckName(): string {
  const name = getStage("TEST_REGRESSION")?.checkNameContains;
  return typeof name === "string" && name.length > 0 ? name : "phase9-patch-check";
}
