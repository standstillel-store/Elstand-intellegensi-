// ---------------------------------------------------------------------------
// macro_ingestion_lock claim/release lifecycle fixtures (2026-09-30).
// Dev-only, pure/offline: no real Supabase connection. `claimIngestionLock`
// and the `release()` it returns are exercised against an in-memory fake
// Learning DB client injected via the `dbOverride` test seam (see
// lib/economicData/ingestionLock.ts) — the SAME atomic conditional-UPDATE
// code path production uses, not a re-implemented model of it.
//
// Root cause under test: claimIngestionLock() used to try an INSERT first
// and fall back to UPDATE on a 23505 unique-violation. That INSERT only
// ever succeeds once (the lock's very first-ever claim); every claim after
// that hit the duplicate-key path, which Postgres logs as an ERROR-severity
// line every single day forever (production evidence: postgres_logs,
// 2026-09-29 23:10:01 UTC, "Key (id)=(economic-data-ingest) already
// exists."). The fix drops the INSERT entirely — UPDATE-only, same
// convention as lib/ai/autonomousRuntime/lock.ts — and a genuinely missing
// row is now reported as UNAVAILABLE via an explicit existence check
// instead of being silently created.
//
// Usage:
//   node --experimental-strip-types --no-warnings --loader ./scripts/phase7/alias-loader.mjs scripts/phase9/macro-ingestion-lock-fixtures.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { claimIngestionLock } from "@/lib/economicData/ingestionLock";

let failures = 0;
let passed = 0;
function check(name: string, pass: boolean, detail = "") {
  if (pass) passed++;
  else failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}
const src = (p: string) => readFileSync(p, "utf8");

const LOCK_ID = "economic-data-ingest";

interface Row {
  id: string;
  running: boolean;
  started_at: string | null;
  updated_at: string;
}
type Filter = { col: string; op: "eq" | "lt"; val: unknown };
interface Result {
  data: { id: string } | null;
  error: { message: string } | null;
}

/** Minimal in-memory fake of the one supabase-js chain shape ingestionLock.ts uses. */
function makeFakeDb(initialRows: Row[]) {
  const rows = new Map(initialRows.map((r) => [r.id, { ...r }]));

  class FakeBuilder implements PromiseLike<Result> {
    private filters: Filter[] = [];
    private kind: "update" | "select";
    private patch?: Partial<Row>;
    constructor(kind: "update" | "select", patch?: Partial<Row>) {
      this.kind = kind;
      this.patch = patch;
    }
    eq(col: string, val: unknown) {
      this.filters.push({ col, op: "eq", val });
      return this;
    }
    lt(col: string, val: unknown) {
      this.filters.push({ col, op: "lt", val });
      return this;
    }
    select(_cols?: string) {
      return this; // no-op chain after .update(...).select("id") — filters were already recorded via .eq()/.lt()
    }
    private matches(row: Row): boolean {
      return this.filters.every((f) => {
        const rowVal = (row as unknown as Record<string, unknown>)[f.col];
        return f.op === "eq" ? rowVal === f.val : (rowVal as string) < (f.val as string);
      });
    }
    private run(): Result {
      const idFilter = this.filters.find((f) => f.col === "id");
      if (idFilter === undefined) return { data: null, error: { message: "fake db: every call in this file always filters by id" } };
      const row = rows.get(idFilter.val as string);
      if (this.kind === "select") {
        return row && this.matches(row) ? { data: { id: row.id }, error: null } : { data: null, error: null };
      }
      if (!row || !this.matches(row)) return { data: null, error: null };
      Object.assign(row, this.patch);
      return { data: { id: row.id }, error: null };
    }
    async maybeSingle(): Promise<Result> {
      return this.run();
    }
    // Makes the builder awaitable directly (releaseLock() does `await db.from(...).update(...).eq(...)` with no .select()/.maybeSingle()).
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  return {
    from(_table: string) {
      return {
        update: (patch: Partial<Row>) => new FakeBuilder("update", patch),
        select: (_cols?: string) => new FakeBuilder("select"),
      };
    },
    rows,
  };
}

type DbOverride = Parameters<typeof claimIngestionLock>[1];

async function run() {
  const NOW = Date.now();
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  // ---- 1. First acquire: row pre-seeded (migration), never claimed before, running=false ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: false, started_at: null, updated_at: iso(0) }]);
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    check("L1. first acquire -> ACQUIRED (row pre-seeded, running=false)", claim.state === "ACQUIRED", JSON.stringify(claim));
    check("L1b. first acquire -> row flipped to running=true in storage", db.rows.get(LOCK_ID)?.running === true, JSON.stringify(db.rows.get(LOCK_ID)));
  }

  // ---- 2. Existing lock: row running=true, fresh (not stale) ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: true, started_at: iso(30_000), updated_at: iso(30_000) }]); // 30s ago, well under the 10min stale window
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    check("L2. existing (fresh) lock -> HELD_BY_OTHER, not stolen", claim.state === "HELD_BY_OTHER", JSON.stringify(claim));
    check("L2b. existing lock -> row untouched", db.rows.get(LOCK_ID)?.updated_at === iso(30_000), JSON.stringify(db.rows.get(LOCK_ID)));
  }

  // ---- 3. Concurrent acquire: two claims race the same free row ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: false, started_at: null, updated_at: iso(0) }]);
    // Sequential calls against the SAME row state model true concurrency here:
    // the second call's conditional UPDATE (running=false) matches zero rows
    // once the first has already flipped it to true — the exact mechanism
    // that makes this safe under real concurrent requests (no read-then-write
    // gap in either call).
    const claimA = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    const claimB = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    check(
      "L3. concurrent acquire -> exactly one caller gets ACQUIRED, the other HELD_BY_OTHER (no double-acquire)",
      claimA.state === "ACQUIRED" && claimB.state === "HELD_BY_OTHER",
      JSON.stringify({ a: claimA.state, b: claimB.state })
    );
  }

  // ---- 4. Stale lock recovery: row running=true but updated_at older than LOCK_STALE_MS (10min) ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: true, started_at: iso(20 * 60_000), updated_at: iso(20 * 60_000) }]); // 20 minutes ago
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    check("L4. stale lock (>10min, crashed prior run) -> reclaimed as ACQUIRED", claim.state === "ACQUIRED", JSON.stringify(claim));
    const row = db.rows.get(LOCK_ID);
    check("L4b. stale reclaim -> updated_at refreshed to now (no longer stale)", row?.running === true && row.updated_at !== iso(20 * 60_000), JSON.stringify(row));
  }

  // ---- 5. Successful release ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: false, started_at: null, updated_at: iso(0) }]);
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    if (claim.state !== "ACQUIRED") throw new Error(`setup failed: expected ACQUIRED, got ${claim.state}`);
    check("L5. after acquire, row is running=true before release", db.rows.get(LOCK_ID)?.running === true, "");
    await claim.release();
    check("L5b. successful release -> row flipped back to running=false", db.rows.get(LOCK_ID)?.running === false, JSON.stringify(db.rows.get(LOCK_ID)));
  }

  // ---- 6. Failed ingestion still releases the lock (try/finally, matches ingest.ts's real usage) ----
  {
    const db = makeFakeDb([{ id: LOCK_ID, running: false, started_at: null, updated_at: iso(0) }]);
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    if (claim.state !== "ACQUIRED") throw new Error(`setup failed: expected ACQUIRED, got ${claim.state}`);
    let threw = false;
    try {
      try {
        throw new Error("simulated ingestion failure");
      } finally {
        await claim.release(); // exactly the pattern in lib/economicData/ingest.ts's runMacroDataIngestion()
      }
    } catch {
      threw = true;
    }
    check("L6. failed ingestion -> release() still runs via finally, error still propagates", threw, "");
    check("L6b. failed ingestion -> row still ends up running=false (not stuck locked)", db.rows.get(LOCK_ID)?.running === false, JSON.stringify(db.rows.get(LOCK_ID)));
  }

  // ---- 7 (bonus). Row missing entirely -> UNAVAILABLE, never silently created ----
  // This is the direct regression guard for the root cause: the old code
  // would lazily INSERT a fresh row here (and 23505 forever after). The new
  // code must report UNAVAILABLE and create nothing.
  {
    const db = makeFakeDb([]); // no row at all, e.g. migration not yet run in this environment
    const claim = await claimIngestionLock(LOCK_ID, db as unknown as DbOverride);
    check(
      "L7. missing row -> UNAVAILABLE (not silently inserted, not treated as HELD_BY_OTHER)",
      claim.state === "UNAVAILABLE" && /row missing/.test(claim.reason),
      JSON.stringify(claim)
    );
    check("L7b. missing row -> nothing was created in storage", db.rows.size === 0, `rows=${db.rows.size}`);
  }

  // ---- 8 (bonus). Learning DB not configured -> UNAVAILABLE (existing behavior, unchanged) ----
  {
    const claim = await claimIngestionLock(LOCK_ID, null);
    check("L8. Learning DB not configured -> UNAVAILABLE, never proceeds", claim.state === "UNAVAILABLE" && /not configured/.test(claim.reason), JSON.stringify(claim));
  }
}

// ---- source-level regression guard: the 23505-causing INSERT must be gone ----
{
  const lockSrc = src("lib/economicData/ingestionLock.ts");
  check("L9. claimIngestionLock no longer INSERTs the lock row (UPDATE-only, matches autonomousRuntime/lock.ts's convention)", !/\.insert\(/.test(lockSrc), "");
  check("L10. seed migration exists and is additive-only (ON CONFLICT DO NOTHING, no destructive statements)", (() => {
    const mig = src("supabase/migrations/2026-09-30-macro-ingestion-lock-seed.sql");
    return /on conflict\s*\(id\)\s*do nothing/i.test(mig) && !/delete\s+from|drop\s+table|truncate/i.test(mig);
  })(), "");
}

run()
  .catch((err) => {
    failures++;
    console.log(`FAIL — lock fixtures threw: ${err instanceof Error ? err.stack : String(err)}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
  });
