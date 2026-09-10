# Phase 8.5 — Delta 4 hotfix: emit.ts build error

## Real production build error (thank you for the exact log)
```
Type error: Property 'catch' does not exist on type 'PromiseLike<void>'.
```

## Root cause
`learningDb.from("runtime_events").insert({...})` returns Supabase's query
builder, which is `PromiseLike`, not a full `Promise` — it has `.then()`
but no `.catch()`/`.finally()`. My original code chained `.then().catch()`
directly on that builder. This type distinction only surfaces with the
*real* `@supabase/supabase-js` type declarations — my sandbox has no
`node_modules`, so local `tsc` silently passed this through. Real Vercel
build (real types) correctly rejected it. Noted for every future delta:
raw Supabase builder chains are exactly the pattern this sandbox can't
fully validate — the safe move is always `await` inside an `async`
function (which always returns a genuine `Promise`), never `.then()` /
`.catch()` chained straight on the builder itself.

## Fix
Rewrote `emitRuntimeEvent` to `await` the insert inside an async IIFE with
try/catch — the exact same pattern already proven working in production
by `persistCognitiveTrace`/`persistDecisionTrace` (both `async function`s
that `await` their insert directly). No behavior change: still
fire-and-forget from the caller's side (`void (async () => {...})()`),
still never throws into `orchestrator.ts`, still logs a real failure
non-fatally instead of discarding it.

## Files changed
- `lib/ai/runtimeEvents/emit.ts` only

## Validation
- `tsc --noEmit`: clean (same caveat as above — this sandbox can't fully
  verify Supabase-specific typing; the fix matches proven-in-production
  code exactly rather than relying on that check alone this time).
- Full 36-script regression: still 8/8 matching baseline, unaffected
  (no fixture touches this file).
