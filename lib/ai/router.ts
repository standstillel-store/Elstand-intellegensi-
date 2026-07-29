// ---------------------------------------------------------------------------
// PHASE 3.0 — AI Infrastructure: free LLM Router (Groq primary, OpenRouter
// fallback). This is a SIBLING to lib/ai/provider.ts, not a replacement:
//
// - lib/ai/provider.ts  = explicit opt-in, single-provider selector for the
//   optional PAID providers (OpenAI/Claude/Gemini/DeepSeek/local) — used only
//   when a developer sets AI_CHAT_PROVIDER to one of those ids. Untouched by
//   this phase, kept around exactly so those stay a config change, not a
//   rewrite, if this project ever wants them later.
// - lib/ai/router.ts (this file) = the new default free path. Zero paid API,
//   zero Gemini/Claude/GPT calls. app/api/chat/route.ts calls routeChat()
//   whenever AI_CHAT_PROVIDER is unset/"auto" (the default) — see route.ts
//   for the one call site and how it falls back to the rule-based Intelligence
//   Engine (lib/analysis.ts) when neither key below is configured.
//
// Flow: user message -> Groq (retry once) -> OpenRouter (walks a prioritized
// list of FREE models: Qwen -> Mistral -> Llama -> one extra free safety net)
// -> if everything fails, the caller (route.ts) shows "AI sedang sibuk...".
// Every hop is invisible to the user — see logProviderUsed(), server logs
// only, never returned in the API response.
//
// Free-model note: OpenRouter's free (":free") lineup rotates as providers
// add/retire free capacity — this is a known characteristic of their free
// tier, not a bug in this file. That's exactly why OPENROUTER_FREE_MODELS is
// walked as an ordered list (a stale/retired id just 400s and this file moves
// to the next one) and overridable via the OPENROUTER_FREE_MODELS env var
// (comma-separated) without touching any code.
// ---------------------------------------------------------------------------

import { cached } from "@/lib/cache";

export type AiRouterProviderId = "groq" | "openrouter";

export interface AiRouterInput {
  message: string;
  /** Recent turns as plain "User: ...\nElVoid AI: ..." text, same contract as lib/ai/provider.ts. */
  history?: string;
  /** Short live-data digest (BTC price, Fear&Greed, etc.) so the reply stays grounded in real numbers. */
  liveContext?: string;
}

export interface AiRouterResult {
  text: string;
  provider: AiRouterProviderId;
  model: string;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Thrown when neither GROQ_API_KEY nor OPENROUTER_API_KEY is set — not a failure, just "not configured yet". route.ts treats this as a signal to fall back to the free rule-based engine, same zero-config default as before this phase. */
export class AiRouterNotConfiguredError extends Error {
  constructor() {
    super("Neither GROQ_API_KEY nor OPENROUTER_API_KEY is set.");
    this.name = "AiRouterNotConfiguredError";
  }
}

/** Thrown when at least one provider WAS configured but every attempt (Groq retry + every OpenRouter free model) failed. Carries each attempt's reason for server-side debugging. */
export class AiRouterExhaustedError extends Error {
  attempts: string[];
  constructor(attempts: string[]) {
    super(`All configured AI providers failed after ${attempts.length} attempt(s): ${attempts.join(" | ")}`);
    this.name = "AiRouterExhaustedError";
    this.attempts = attempts;
  }
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const REQUEST_TIMEOUT_MS = 15_000; // hard cap per attempt — exceed this and we fall back immediately
const MAX_TOKENS = 700;
const TEMPERATURE = 0.6; // same value for every provider so tone doesn't shift depending on who answered

// openai/gpt-oss-120b: Groq's current flagship production model and the
// official replacement for llama-3.3-70b-versatile (deprecated by Groq,
// shutting down 08/16/26 — see console.groq.com/docs/deprecations). Free-tier
// eligible, no card required. Override with GROQ_MODEL if Groq's lineup
// changes again.
function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
}

const DEFAULT_OPENROUTER_FREE_MODELS = [
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free", // extra free safety net beyond the brief's 3 — same $0 pricing, kept last in priority
];

function getOpenRouterFreeModels(): string[] {
  const override = process.env.OPENROUTER_FREE_MODELS;
  if (!override) return DEFAULT_OPENROUTER_FREE_MODELS;
  const parsed = override
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_OPENROUTER_FREE_MODELS;
}

function getCacheTtlMs(): number {
  const raw = Number(process.env.AI_ROUTER_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 1000) return raw;
  return 45_000; // within the requested 30-60s window
}

// Every provider gets the exact same voice — "SYSTEM PROMPT: semua provider
// menggunakan System Prompt yang sama" — so a Groq answer and an OpenRouter
// answer read as the same assistant, not two different bots.
const AI_ROUTER_SYSTEM_PROMPT =
  "Kamu adalah ElVoid AI dari ELSTAND INTEL. Jawab dengan natural dan mengalir, seperti asisten AI profesional (gaya ChatGPT) — jangan pakai format markdown (no #, ##, **, atau daftar bernomor kecuali user memang minta daftar) dan jangan pakai template kaku yang keliatan mesin. Jawaban boleh singkat atau panjang tergantung kebutuhan pertanyaannya, yang penting enak dibaca dan mengalir seperti obrolan manusia. Ini bukan nasihat keuangan — kalau relevan, selalu jujur soal ketidakpastian pasar.";

function buildMessages(input: AiRouterInput): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: AI_ROUTER_SYSTEM_PROMPT + (input.liveContext ? `\n\nData live saat ini:\n${input.liveContext}` : ""),
    },
  ];
  if (input.history) {
    messages.push({ role: "user", content: `Konteks percakapan sebelumnya:\n${input.history}` });
  }
  messages.push({ role: "user", content: input.message });
  return messages;
}

/** Server-side-only breadcrumb of which provider actually answered — "Jangan tampilkan kepada user": route.ts only ever reads `.text` off the result, this never reaches the HTTP response. */
function logProviderUsed(label: "Groq" | "OpenRouter", model: string, ms: number) {
  console.log(`[AI Router] Provider:\n${label}\n(model: ${model}, ${ms}ms)`);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatibleOnce(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>,
  opts?: { responseFormatJson?: boolean; maxTokens?: number }
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts?.maxTokens ?? MAX_TOKENS,
    temperature: TEMPERATURE,
  };
  // Groq and OpenRouter are both OpenAI-compatible and both support this for
  // JSON-capable models — asked for only by lib/ai/core (structured module
  // output), never by the plain-chat path below, so chat's request body is
  // byte-for-byte unchanged.
  if (opts?.responseFormatJson) body.response_format = { type: "json_object" };

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) {
    // Rate limit / quota habis / provider error / etc. — the exact HTTP code is
    // enough context for the retry/failover decision one level up.
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw new Error("empty response");
  return String(text).trim();
}

/** Cache key deliberately ignores `liveContext` (which ticks almost every request — BTC price, etc.) and conversation `history` — "untuk prompt yang sama" is read here as the same user message text. A 30-60s-old live-data digest reused for an identical question is an acceptable tradeoff (same one this codebase already makes everywhere else via lib/cache.ts) in exchange for real duplicate-request savings on repeated/FAQ-style questions. */
function cacheKeyFor(message: string): string {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);
  return `ai-router:${normalized}`;
}

/**
 * The actual Groq -> OpenRouter failover chain, generalized over a plain
 * `messages` array instead of `AiRouterInput` — this is the one place that
 * retry count, timeout, and free-model priority order live, so both the
 * chat path below and lib/ai/core (Phase: AI CORE ENGINE — the 10-module
 * reasoning layer, see lib/ai/core/llm.ts) share one failover policy
 * instead of two that could quietly drift apart.
 */
async function runProviderChain(
  messages: ChatMessage[],
  groqKey: string | undefined,
  openRouterKey: string | undefined,
  opts?: { responseFormatJson?: boolean; maxTokens?: number }
): Promise<AiRouterResult> {
  const attempts: string[] = [];

  if (groqKey) {
    const model = getGroqModel();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now();
      try {
        const text = await callOpenAiCompatibleOnce(GROQ_URL, groqKey, model, messages, undefined, opts);
        logProviderUsed("Groq", model, Date.now() - startedAt);
        return { text, provider: "groq", model };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push(`Groq attempt ${attempt}/2 (${model}): ${reason}`);
        console.error(`[AI Router] Groq attempt ${attempt}/2 failed, ${attempt < 2 ? "retrying" : "moving to OpenRouter"}: ${reason}`);
      }
    }
  }

  if (openRouterKey) {
    for (const model of getOpenRouterFreeModels()) {
      const startedAt = Date.now();
      try {
        const text = await callOpenAiCompatibleOnce(
          OPENROUTER_URL,
          openRouterKey,
          model,
          messages,
          { "X-Title": "ElStand Intel" },
          opts
        );
        logProviderUsed("OpenRouter", model, Date.now() - startedAt);
        return { text, provider: "openrouter", model };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push(`OpenRouter ${model}: ${reason}`);
        console.error(`[AI Router] OpenRouter model "${model}" failed, trying next free model: ${reason}`);
      }
    }
  }

  throw new AiRouterExhaustedError(attempts);
}

/** Unchanged chat behavior — builds the same messages as before this refactor, hands off to runProviderChain() with no JSON mode and the default chat MAX_TOKENS. */
async function runRouterChain(input: AiRouterInput, groqKey?: string, openRouterKey?: string): Promise<AiRouterResult> {
  return runProviderChain(buildMessages(input), groqKey, openRouterKey);
}

/**
 * Main entry point for app/api/chat/route.ts's free-text path. Resolves to a
 * plain-text reply from whichever provider answers first (Groq, retried
 * once, then every OpenRouter free model in priority order), cached 30-60s
 * per distinct message so duplicate/FAQ-style questions don't re-hit any API.
 *
 * @throws {AiRouterNotConfiguredError} neither key is set — not an error, a signal to use the free rule-based fallback.
 * @throws {AiRouterExhaustedError} at least one key was set but every attempt failed.
 */
export async function routeChat(input: AiRouterInput): Promise<AiRouterResult> {
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !openRouterKey) throw new AiRouterNotConfiguredError();

  return cached(cacheKeyFor(input.message), getCacheTtlMs(), () => runRouterChain(input, groqKey, openRouterKey));
}

// ---------------------------------------------------------------------------
// Structured (JSON-mode) entry point — lib/ai/core/llm.ts's Phase: AI CORE
// ENGINE module layer (AI Oracle, Scanner, Confidence Engine, etc.) calls
// this instead of routeChat(): same Groq-first/OpenRouter-fallback chain,
// same GROQ_API_KEY/OPENROUTER_API_KEY env vars, same $0 default, but with a
// caller-supplied system prompt (each module has its own — see
// lib/ai/core/prompts.ts) instead of the fixed AI_ROUTER_SYSTEM_PROMPT
// above, and `response_format: json_object` requested from the provider so
// the reply is valid JSON the module layer can parse straight into its own
// typed result.
//
// Deliberately NOT cached (unlike routeChat) — module input is a market/
// trade data snapshot that's different almost every call, so a cache would
// rarely hit and risks serving stale numbers back into a "never hallucinate,
// state what's live" prompt. Deliberately does not touch AiRouterInput/
// buildMessages/the chat cache — chat's behavior above is unchanged by this
// function existing.
// ---------------------------------------------------------------------------
export interface AiRouterStructuredInput {
  /** Full module system prompt — ELSTAND_AI_CORE_SYSTEM_PROMPT + the specific module's instructions + its required JSON output shape. See lib/ai/core/prompts.ts. */
  systemPrompt: string;
  /** The grounding data payload (already-computed signal/market/performance data, as a JSON string) — this is the ONLY market truth the model is allowed to reason from. */
  userContent: string;
  /** Structured JSON with several fields needs more room than a chat reply — defaults higher than chat's 700 when omitted. */
  maxTokens?: number;
}

/**
 * @throws {AiRouterNotConfiguredError} neither GROQ_API_KEY nor OPENROUTER_API_KEY is set — callers (lib/ai/core/llm.ts) treat this as "AI reasoning not available right now", not a hard failure, and fall back to the deterministic-only output every module already computes.
 * @throws {AiRouterExhaustedError} at least one key was set but every attempt failed.
 */
export async function routeStructured(input: AiRouterStructuredInput): Promise<AiRouterResult> {
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !openRouterKey) throw new AiRouterNotConfiguredError();

  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.userContent },
  ];
  return runProviderChain(messages, groqKey, openRouterKey, {
    responseFormatJson: true,
    maxTokens: input.maxTokens ?? 1100,
  });
}

// ---------------------------------------------------------------------------
// Streaming (optional, additive — not wired into any UI yet)
//
// app/api/chat/route.ts and lib/hooks/useElVoidChat.ts both expect one JSON
// blob back (`await res.json()`), by design unchanged in this phase (no UI
// work here). routeChatStream() below is a genuine token-by-token streaming
// path — exposed at app/api/chat/stream/route.ts as an SSE endpoint — ready
// for a future frontend change to adopt without touching this file again.
//
// Failover honesty note: once a provider has emitted its first real token,
// this stops retrying/failing over even if that provider then dies mid-
// stream — switching providers after content has already reached the client
// would duplicate/garble what's already been sent. Failover only happens
// before any token has been yielded (bad key, 429, 5xx, connect timeout —
// the overwhelming majority of real failures), which is the same standard
// streaming semantics any provider-agnostic chat client relies on.
// ---------------------------------------------------------------------------

async function* streamOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model, messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, stream: true }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") throw new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`);
    throw err;
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAny = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) {
            receivedAny = true;
            yield delta as string;
          }
        } catch {
          // keep-alive / malformed SSE line — ignore and keep reading
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  if (!receivedAny) throw new Error("empty stream response");
}

export type AiRouterStreamChunk = { delta: string } | { done: true; provider: AiRouterProviderId; model: string };

/** Streaming counterpart to routeChat() — see the module header above for the failover contract once a token has been emitted. */
export async function* routeChatStream(input: AiRouterInput): AsyncGenerator<AiRouterStreamChunk, void, unknown> {
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey && !openRouterKey) throw new AiRouterNotConfiguredError();

  const messages = buildMessages(input);
  const attempts: string[] = [];
  let hasYieldedAny = false;

  if (groqKey) {
    const model = getGroqModel();
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        for await (const delta of streamOpenAiCompatible(GROQ_URL, groqKey, model, messages)) {
          hasYieldedAny = true;
          yield { delta };
        }
        logProviderUsed("Groq", model, 0);
        yield { done: true, provider: "groq", model };
        return;
      } catch (err) {
        if (hasYieldedAny) throw err; // content already reached the client — don't fail over mid-stream
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push(`Groq attempt ${attempt}/2 (${model}): ${reason}`);
        console.error(`[AI Router] (stream) Groq attempt ${attempt}/2 failed: ${reason}`);
      }
    }
  }

  if (openRouterKey) {
    for (const model of getOpenRouterFreeModels()) {
      try {
        for await (const delta of streamOpenAiCompatible(OPENROUTER_URL, openRouterKey, model, messages, {
          "X-Title": "ElStand Intel",
        })) {
          hasYieldedAny = true;
          yield { delta };
        }
        logProviderUsed("OpenRouter", model, 0);
        yield { done: true, provider: "openrouter", model };
        return;
      } catch (err) {
        if (hasYieldedAny) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push(`OpenRouter ${model}: ${reason}`);
        console.error(`[AI Router] (stream) OpenRouter model "${model}" failed: ${reason}`);
      }
    }
  }

  throw new AiRouterExhaustedError(attempts);
}
