// ---------------------------------------------------------------------------
// Phase 8.4.1 — External Source Registry fixtures (dev-only, not part of
// the app). Pure/offline — validates the registry's own internal
// consistency and the checkAvailability() env-var logic. No network call,
// no LLM call, no database access, no mocks that bypass real logic.
//
// Usage:
//   node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/external-source-registry-fixtures.ts
// ---------------------------------------------------------------------------

import {
  EXTERNAL_SOURCE_REGISTRY,
  getSourceById,
  getSourcesByCategory,
  getSourcesByCapability,
  checkAvailability,
  listAvailableSources,
} from "@/lib/ai/externalIntelligence/registry";

let failures = 0;
function check(name: string, pass: boolean, detail: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` | ${detail}`}`);
}

// ---------------------------------------------------------------------------
// 1. Structural integrity
// ---------------------------------------------------------------------------

const ids = EXTERNAL_SOURCE_REGISTRY.map((s) => s.source);
check("1. every source id is unique", new Set(ids).size === ids.length, `ids: ${ids.join(", ")}`);

check(
  "2. every entry has at least one capability",
  EXTERNAL_SOURCE_REGISTRY.every((s) => s.capability.length > 0),
  "found an entry with empty capability[]"
);

check(
  "3. every non-community entry has accessMethod !== NOT_INTEGRATED",
  EXTERNAL_SOURCE_REGISTRY.filter((s) => s.category !== "community").every((s) => s.accessMethod !== "NOT_INTEGRATED"),
  "a market/derivatives/macro entry was registered as NOT_INTEGRATED"
);

check(
  "4. every non-community entry has a real (non-placeholder) modulePath",
  EXTERNAL_SOURCE_REGISTRY.filter((s) => s.category !== "community").every((s) => !s.modulePath.startsWith("NOT_IMPLEMENTED")),
  "a market/derivatives/macro entry has a placeholder modulePath"
);

check(
  "5. every entry keyed by REST_KEYED/RPC_ONCHAIN has at least one requiredEnvVars entry",
  EXTERNAL_SOURCE_REGISTRY.filter((s) => s.accessMethod === "REST_KEYED" || s.accessMethod === "RPC_ONCHAIN").every((s) => s.requiredEnvVars.length > 0),
  "a keyed source declares zero required env vars"
);

check(
  "6. every REST_PUBLIC/UNOFFICIAL_FEED entry has zero requiredEnvVars",
  EXTERNAL_SOURCE_REGISTRY.filter((s) => s.accessMethod === "REST_PUBLIC" || s.accessMethod === "UNOFFICIAL_FEED").every((s) => s.requiredEnvVars.length === 0),
  "a public/unofficial-feed source declares a required env var it doesn't need"
);

check(
  "7. all four roadmap categories are represented",
  (["market", "derivatives", "macro", "community"] as const).every((c) => getSourcesByCategory(c).length > 0),
  "a roadmap category (market/derivatives/macro/community) has zero entries"
);

check(
  "8. exactly one community entry, and it declares all six community capabilities",
  getSourcesByCategory("community").length === 1 &&
    ["narrative_emergence", "discussion_velocity", "sentiment_divergence", "catalyst_announcement", "ecosystem_activity", "manipulation_risk"].every((cap) =>
      getSourcesByCategory("community")[0].capability.includes(cap as never)
    ),
  "community placeholder is missing or incomplete"
);

// ---------------------------------------------------------------------------
// 2. Lookup helpers
// ---------------------------------------------------------------------------

check("9. getSourceById finds a known id", getSourceById("binance_derivatives")?.label === "Binance Futures Derivatives", "lookup by id failed");
check("10. getSourceById returns undefined for an unknown id (no fabricated fallback)", getSourceById("does_not_exist") === undefined, "unknown id did not return undefined");

check(
  "11. getSourcesByCapability(funding_rate) returns all three funding sources",
  new Set(getSourcesByCapability("funding_rate").map((s) => s.source)).size === 3 &&
    ["binance_derivatives", "bybit_funding", "okx_funding"].every((id) => getSourcesByCapability("funding_rate").some((s) => s.source === id)),
  `got: ${getSourcesByCapability("funding_rate")
    .map((s) => s.source)
    .join(", ")}`
);

// ---------------------------------------------------------------------------
// 3. checkAvailability() — real env-var-driven logic, not a static flag
// ---------------------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};
function withEnv(key: string, value: string | undefined, fn: () => void) {
  savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

check(
  "12. community placeholder is always UNAVAILABLE_NOT_INTEGRATED regardless of env",
  checkAvailability(getSourceById("community_unintegrated")!) === "UNAVAILABLE_NOT_INTEGRATED",
  "community entry reported something other than UNAVAILABLE_NOT_INTEGRATED"
);

check(
  "13. a no-key public source is always AVAILABLE",
  checkAvailability(getSourceById("binance_spot")!) === "AVAILABLE",
  "public source reported unavailable with no key requirement"
);

withEnv("ALCHEMY_API_KEY", undefined, () => {
  check(
    "14. a keyed source with no env var set reports UNAVAILABLE_NO_KEY",
    checkAvailability(getSourceById("alchemy_whale_transfers")!) === "UNAVAILABLE_NO_KEY",
    "keyed source without key did not report UNAVAILABLE_NO_KEY"
  );
});

withEnv("ALCHEMY_API_KEY", "test-key-value", () => {
  check(
    "15. a keyed source with its env var set reports AVAILABLE",
    checkAvailability(getSourceById("alchemy_whale_transfers")!) === "AVAILABLE",
    "keyed source with key present did not report AVAILABLE"
  );
});

withEnv("NEWSAPI_KEY", undefined, () => {
  withEnv("GNEWS_API_KEY", undefined, () => {
    check(
      "16. a multi-key source with NEITHER env var set reports UNAVAILABLE_NO_KEY",
      checkAvailability(getSourceById("general_news_feed")!) === "UNAVAILABLE_NO_KEY",
      "multi-key source without any key did not report UNAVAILABLE_NO_KEY"
    );
  });
  withEnv("GNEWS_API_KEY", "test-key-value", () => {
    check(
      "17. a multi-key source with only its FALLBACK env var set reports AVAILABLE (either key satisfies it)",
      checkAvailability(getSourceById("general_news_feed")!) === "AVAILABLE",
      "multi-key source with fallback key present did not report AVAILABLE"
    );
  });
});

check(
  "18. listAvailableSources() never includes the community placeholder",
  !listAvailableSources().some((s) => s.source === "community_unintegrated"),
  "community placeholder leaked into listAvailableSources()"
);

check(
  "19. listAvailableSources() is a strict subset of the full registry",
  listAvailableSources().every((s) => EXTERNAL_SOURCE_REGISTRY.includes(s)),
  "listAvailableSources() returned an entry not present in the registry"
);

// ---------------------------------------------------------------------------
// 4. Honesty invariants — no fabricated rate limits / no undocumented "always true"
// ---------------------------------------------------------------------------

check(
  "20. Alpha Vantage explicitly documents NO fixed quota (per its own source file's Correction 2)",
  getSourceById("alphavantage_economic_observations")!.rateLimit.documented === false,
  "Alpha Vantage entry incorrectly claims a documented rate limit"
);

check(
  "21. NewsAPI/GNews and TwelveData/Finnhub DO carry documented provider-stated limits",
  getSourceById("general_news_feed")!.rateLimit.documented === true &&
    getSourceById("twelvedata_fx_commodity")!.rateLimit.documented === true &&
    getSourceById("finnhub_equity_proxy")!.rateLimit.documented === true,
  "a source with a real provider-published quota is not marked documented:true"
);

check(
  "22. no ReliabilityTier note claims a source is always correct",
  EXTERNAL_SOURCE_REGISTRY.every((s) => !/always (right|correct|accurate)/i.test(s.reliability.note)),
  "found a reliability note asserting infallibility"
);

console.log(failures === 0 ? `\nAll ${22} Phase 8.4.1 external source registry fixtures passed.` : `\n${failures} fixture(s) FAILED.`);
if (failures > 0) process.exit(1);
