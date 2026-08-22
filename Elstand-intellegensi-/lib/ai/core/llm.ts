import { routeStructured, AiRouterNotConfiguredError, AiRouterExhaustedError } from "../router";
import { getActiveProvider } from "../provider";

// ---------------------------------------------------------------------------
// Phase: AI CORE ENGINE — the one function every module in
// lib/ai/core/modules/*.ts calls to actually reach an LLM.
//
// Provider order: an explicitly-configured paid provider (AI_CHAT_PROVIDER
// set to openai/anthropic/gemini/deepseek/local, see lib/ai/provider.ts)
// first if present, otherwise the free Groq -> OpenRouter chain
// (lib/ai/router.ts's routeStructured — Phase 3.0's infrastructure, reused
// as-is). Same zero-config default as the rest of this app: with no keys
// set at all, every module below still returns a complete, correct result —
// just the deterministic one it already had, not an LLM-authored one.
//
// callAiCore() NEVER throws. Not configured, timeout, rate limit, invalid
// JSON, or a response that doesn't match the expected shape all collapse to
// the same thing: return null, log server-side why, let the caller fall
// back. A metering/reasoning bug in this file must never be the reason a
// feature that already worked (deterministic ElVoid AI) stops working.
// ---------------------------------------------------------------------------

export interface AiCoreCallResult<T> {
  data: T;
  provider: string;
  model: string;
}

export interface AiCoreCallOptions<T> {
  /** Full module prompt from lib/ai/core/prompts.ts (preamble + module instructions + JSON schema). */
  systemPrompt: string;
  /** The grounding data payload — JSON.stringify'd and sent as the user message. This must be the ONLY source of "facts" the model is allowed to reason from. */
  data: unknown;
  /** Type guard validating the parsed JSON actually matches the module's Result shape before it's trusted. A response that fails this is treated exactly like a network failure — logged, then null. */
  validate: (parsed: unknown) => parsed is T;
  /** Defaults to routeStructured's own default (1100) when omitted. */
  maxTokens?: number;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Most JSON-mode models comply, but a stray ```json fence or leading/trailing prose is common enough on free-tier models to be worth one cheap, local repair attempt before giving up on a whole response. */
function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(stripJsonFences(text));
  } catch {
    return undefined;
  }
}

async function callViaPaidProvider<T>(opts: AiCoreCallOptions<T>): Promise<AiCoreCallResult<T> | null> {
  const provider = getActiveProvider();
  if (provider.id === "rule-based") return null; // AI_CHAT_PROVIDER isn't set to a real paid provider
  try {
    const text = await provider.generate({
      message: JSON.stringify(opts.data),
      systemPromptOverride: opts.systemPrompt,
      maxTokensOverride: opts.maxTokens ?? 1100,
    });
    const parsed = tryParseJson(text);
    if (parsed !== undefined && opts.validate(parsed)) {
      return { data: parsed, provider: provider.id, model: provider.label };
    }
    console.error(`[AI Core] ${provider.label} returned unparsable/invalid JSON — falling back.`);
    return null;
  } catch (err) {
    console.error(`[AI Core] ${provider.label} call failed — falling back:`, err);
    return null;
  }
}

async function callViaFreeRouter<T>(opts: AiCoreCallOptions<T>): Promise<AiCoreCallResult<T> | null> {
  try {
    const result = await routeStructured({
      systemPrompt: opts.systemPrompt,
      userContent: JSON.stringify(opts.data),
      maxTokens: opts.maxTokens,
    });
    const parsed = tryParseJson(result.text);
    if (parsed !== undefined && opts.validate(parsed)) {
      return { data: parsed, provider: result.provider, model: result.model };
    }
    console.error(`[AI Core] ${result.provider}/${result.model} returned unparsable/invalid JSON — falling back.`);
    return null;
  } catch (err) {
    if (err instanceof AiRouterNotConfiguredError) return null; // zero-config default — not an error
    if (err instanceof AiRouterExhaustedError) {
      console.error("[AI Core] all free providers exhausted:", err.attempts.join(" | "));
      return null;
    }
    console.error("[AI Core] unexpected router error — falling back:", err);
    return null;
  }
}

export async function callAiCore<T>(opts: AiCoreCallOptions<T>): Promise<AiCoreCallResult<T> | null> {
  const explicitProvider = process.env.AI_CHAT_PROVIDER;
  const usesExplicitPaidProvider = !!explicitProvider && explicitProvider !== "auto" && explicitProvider !== "rule-based";

  if (usesExplicitPaidProvider) {
    const viaPaid = await callViaPaidProvider(opts);
    if (viaPaid) return viaPaid;
    // Configured-but-failed paid provider still falls through to the free
    // chain rather than giving up — same "an optional integration breaking
    // must never take the feature down" rule app/api/chat/route.ts follows.
  }
  return callViaFreeRouter(opts);
}

/**
 * Cheap synchronous check for "is any AI Core provider configured at all" —
 * modules/routes use this to skip the whole attempt (and the AI Energy
 * charge that would go with it) instead of paying a network round-trip
 * that's guaranteed to fall back. Approximate for the paid-provider case
 * (doesn't verify the matching *_API_KEY is actually set — getActiveProvider()
 * does that properly at call time) — good enough for a skip-or-not hint.
 */
export function isAiCoreConfigured(): boolean {
  const explicitProvider = process.env.AI_CHAT_PROVIDER;
  if (explicitProvider && explicitProvider !== "auto" && explicitProvider !== "rule-based") return true;
  return !!process.env.GROQ_API_KEY || !!process.env.OPENROUTER_API_KEY;
}
