import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/dashboardSnapshot";
import { routeTerminalMessage } from "@/lib/analysis";
import { deriveGlobalSentiment } from "@/lib/intelligence/globalSentiment";
import { deriveMarketPulse, type MarketPulseInputs } from "@/lib/intelligence/marketPulse";
import { deriveFinalConclusion } from "@/lib/intelligence/finalConclusion";
import { buildMarketSnapshotReport } from "@/lib/intelligence/marketSnapshotReport";
import { getInstitutionalFlowData } from "@/lib/intelligence/institutionalFlow";
import { getUsdReading } from "@/lib/intelligence/sources/usd";
import { getGoldReading } from "@/lib/intelligence/sources/gold";
import { getStocksReading } from "@/lib/intelligence/sources/stocks";
import { getNextHighImpactEvent } from "@/lib/intelligence/macroEvents";
import { isRelevantAsset } from "@/lib/asset-filters";
import { getActiveProvider } from "@/lib/ai/provider";
import { routeChat, AiRouterNotConfiguredError } from "@/lib/ai/router";
import type { TerminalReport } from "@/lib/terminalReport";
import { reserveEnergy, settleEnergy, INSUFFICIENT_ENERGY_MESSAGE } from "@/lib/energyGate";

interface ChatBody {
  message: string;
  /** Recent turns as plain text, only used when an LLM provider is active — see lib/ai/provider.ts. */
  history?: string;
}

function errorReport(message: string, eyebrow = "ERR"): TerminalReport {
  return { eyebrow, title: "SYSTEM", found: false, emptyNote: message, rows: [] };
}

// ELSTAND INTELLIGENCE's chat dock (ElVoid AI) used to proxy every question to the
// OpenAI API, which costs real money per request. Structured questions
// ("analisa BTC", "whale activity", etc.) still run entirely on ElVoid AI's
// own rule-based Intelligence Engine (lib/analysis.ts) below — live data in,
// a structured TerminalReport out, no LLM call, no API key, no cost, ever.
// See lib/terminalReport.ts for the response shape (V3 "institutional
// terminal" format — no more markdown/emoji strings).
//
// PHASE 3.0: free-text questions that Intelligence Engine doesn't recognize
// now first try the AI Router (lib/ai/router.ts — Groq primary, OpenRouter
// free-model fallback, both $0) before falling back to the market-snapshot
// report below. Still zero-config-safe: with no GROQ_API_KEY/OPENROUTER_API_KEY
// set at all, behavior is identical to before this phase.
export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ report: errorReport("Pesan tidak valid.") }, { status: 400 });
  }

  const message = (body.message ?? "").toString().slice(0, 500);
  if (!message.trim()) {
    return NextResponse.json({
      report: errorReport('Tanya sesuatu dulu — misalnya "analisa BTC" atau "whale activity".', "AI"),
    });
  }

  // Phase 3.2: gated as "AI Agent Chat" (-2 AI Energy), reserved before doing
  // any real work below and settled right before each return. Deliberately
  // NOT reusing reserveEnergy()'s generic 402 body here — useElVoidChat.ts
  // (the only caller) expects every response to have a `report` field, so
  // an insufficient-balance reply needs to be wrapped in one too, or the
  // hook treats it as a network failure and shows a generic "Retrying..."
  // instead of the actual message.
  const gate = await reserveEnergy("ai_chat");
  if (!gate.ok) {
    return NextResponse.json({ report: errorReport(INSUFFICIENT_ENERGY_MESSAGE, "AI") }, { status: 402 });
  }

  try {
    const snap = await getDashboardSnapshot();
    const { base } = snap;

    let report = routeTerminalMessage(message, base);

    if (!report) {
      const explicitProvider = process.env.AI_CHAT_PROVIDER;
      const usesExplicitPaidProvider = !!explicitProvider && explicitProvider !== "auto" && explicitProvider !== "rule-based";

      if (usesExplicitPaidProvider) {
        // A developer explicitly opted into one of the optional paid providers
        // (lib/ai/provider.ts) via AI_CHAT_PROVIDER — unchanged path, the
        // Phase 3.0 Groq/OpenRouter router below is skipped entirely here.
        const provider = getActiveProvider();
        if (provider.id !== "rule-based") {
          try {
            const text = await provider.generate({
              message,
              history: body.history?.slice(0, 4000),
              liveContext: buildLiveContextDigest(snap),
            });
            report = { eyebrow: "AI", title: "ElVoid AI", found: true, rows: [], conclusion: text };
          } catch (err) {
            console.error(`[ElVoid AI] ${provider.label} error, falling back to market snapshot:`, err);
          }
        }
      } else if (explicitProvider !== "rule-based") {
        // Default path (AI_CHAT_PROVIDER unset or "auto"): Phase 3.0 AI Router
        // — Groq (retry once) -> OpenRouter free models, both $0. See
        // lib/ai/router.ts for the full failover/retry/timeout/cache policy.
        try {
          const result = await routeChat({
            message,
            history: body.history?.slice(0, 4000),
            liveContext: buildLiveContextDigest(snap),
          });
          report = { eyebrow: "AI", title: "ElVoid AI", found: true, rows: [], conclusion: result.text };
        } catch (err) {
          if (err instanceof AiRouterNotConfiguredError) {
            // Zero-config default (no GROQ_API_KEY / OPENROUTER_API_KEY at
            // all) — not an error, just falls through to the free rule-based
            // market snapshot below, exactly like before this phase.
          } else {
            // Both Groq and OpenRouter were configured but every attempt
            // failed (rate limit, timeout, 5xx, quota habis). Tell the user
            // plainly instead of silently swapping in a market snapshot they
            // didn't ask for.
            console.error("[AI Router] all providers exhausted:", err);
            report = errorReport("AI sedang sibuk. Silakan coba beberapa saat lagi.", "AI");
          }
        }
      }
    }

    if (!report) {
      report = await buildGeneralMarketReport(snap);
    }

    // "SYSTEM" is errorReport()'s own marker (see its definition above) for
    // "this is an internal system/error message, not a real answer" — used
    // above for both "AI sedang sibuk" (all providers exhausted) and this
    // function's own outer catch. A rule-based "COIN NOT FOUND" reply is a
    // genuine, useful answer (title "COIN NOT FOUND", not "SYSTEM") and
    // still charges — the engine did respond, it just didn't have data.
    if (gate.reservation) await settleEnergy(gate.reservation, report.title !== "SYSTEM");
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[ElVoid AI] chat engine error:", err);
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({
      report: errorReport("Data live sedang tidak bisa diambil sebentar — coba lagi dalam beberapa detik."),
    });
  }
}

/** A short plain-text digest of live data so an LLM provider (when configured) answers grounded in real numbers instead of guessing. Deliberately compact — this is context, not the reply itself. */
function buildLiveContextDigest(snap: Awaited<ReturnType<typeof getDashboardSnapshot>>): string {
  const { markets, global, fng } = snap.base;
  const btc = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const parts: string[] = [];
  if (btc) parts.push(`BTC ${btc.current_price} USD (${btc.price_change_percentage_24h_in_currency?.toFixed(2)}% 24h)`);
  if (global?.market_cap_percentage.btc) parts.push(`BTC Dominance ${global.market_cap_percentage.btc.toFixed(1)}%`);
  if (fng?.now) parts.push(`Fear & Greed ${fng.now.value} (${fng.now.classification})`);
  return parts.join(" · ");
}

/**
 * Builds the "ringkasan market" reply. Mirrors the sentiment/pulse/final-
 * conclusion assembly in app/dashboard/page.tsx (same input fields, same
 * derive*() calls) so this chat reply can never disagree with the Map,
 * Market Pulse gauges, or Final Conclusion card shown on the dashboard
 * itself. Keep the two in sync if either one changes.
 */
async function buildGeneralMarketReport(snap: Awaited<ReturnType<typeof getDashboardSnapshot>>): Promise<TerminalReport> {
  const { base } = snap;
  const { markets, global, funding, fng, calendar } = base;

  const btcMarket = markets.find((m) => m.symbol.toLowerCase() === "btc");
  const ethMarket = markets.find((m) => m.symbol.toLowerCase() === "eth");
  const altMarkets = markets
    .filter((m) => isRelevantAsset(m))
    .filter((m) => m.symbol.toLowerCase() !== "btc" && m.symbol.toLowerCase() !== "eth");
  const altSample = altMarkets.slice(0, 30);
  const altChange24h = altSample.length
    ? altSample.reduce((s, m) => s + (m.price_change_percentage_24h_in_currency ?? 0), 0) / altSample.length
    : undefined;
  const rankedAlts = altMarkets.filter((m) => m.price_change_percentage_24h_in_currency !== undefined);
  const watchlist = [...rankedAlts]
    .sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0))
    .slice(0, 3)
    .map((m) => ({ symbol: m.symbol.toUpperCase(), change24h: m.price_change_percentage_24h_in_currency ?? 0 }));

  const [usd, gold, stocks, institutionalFlow] = await Promise.all([
    getUsdReading(),
    getGoldReading(),
    getStocksReading(),
    getInstitutionalFlowData(),
  ]);
  const nextHighImpact = getNextHighImpactEvent(calendar);
  const stocksChangePct = stocks?.indices.length
    ? stocks.indices.reduce((s, i) => s + (i.changePct ?? 0), 0) / stocks.indices.length
    : undefined;

  const sentiment = deriveGlobalSentiment({
    fngValue: fng?.now.value,
    mcChange24h: global?.market_cap_change_percentage_24h_usd,
    dxyChangePct: usd?.changePct,
    goldChangePct: gold?.changePct,
    stocksChangePct,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    btcChange7d: btcMarket?.price_change_percentage_7d_in_currency,
    altcoinChange24h: altChange24h,
    imminentHighImpactEvent: nextHighImpact,
  });

  const btcFunding = funding.find((f) => f.symbol.toUpperCase() === "BTCUSDT");
  const pulseInputs: MarketPulseInputs = {
    sentiment,
    macro: snap.macro,
    whaleSummary: snap.whaleSummary,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    stablecoinChange24hUsd: snap.stablecoin?.change24hUsd,
    btcFundingRate: btcFunding?.lastFundingRate,
    altseason: snap.altseason,
    etfNetTotalUsd: institutionalFlow.connected ? institutionalFlow.etfNetTotalUsd : undefined,
  };
  const pulse = deriveMarketPulse(pulseInputs);
  const finalConclusion = deriveFinalConclusion({
    sentiment,
    btcChange24h: btcMarket?.price_change_percentage_24h_in_currency,
    ethChange24h: ethMarket?.price_change_percentage_24h_in_currency,
    altChange24h,
    watchlist,
  });

  return buildMarketSnapshotReport({
    pulse,
    finalConclusion,
    totalMarketCapUsd: global?.total_market_cap.usd,
    marketCapChange24h: global?.market_cap_change_percentage_24h_usd,
    btcDominance: global?.market_cap_percentage.btc,
    fngValue: fng?.now.value,
    fngClassification: fng?.now.classification,
    btcFundingRate: btcFunding?.lastFundingRate,
    btcOpenInterestUsd: btcFunding?.openInterestValue,
  });
}
