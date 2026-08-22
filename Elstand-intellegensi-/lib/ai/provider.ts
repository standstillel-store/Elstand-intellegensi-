// ---------------------------------------------------------------------------
// Phase 2.8, section 12 ("Future Ready"): one interface, swappable backend.
//
// Today, with no key set, AI_CHAT_PROVIDER defaults to "rule-based" — ElVoid
// AI's existing free Intelligence Engine (lib/analysis.ts), unchanged, $0/
// request, same as it's been since the OpenAI proxy was removed (see
// app/api/chat/route.ts). Setting AI_CHAT_PROVIDER + the matching *_API_KEY
// env var switches the free-text fallback path (only — the structured
// "analisa BTC" / "whale activity" style routed reports always stay
// rule-based, see route.ts) to a real LLM. No component, page, or API
// contract changes either way — see app/api/chat/route.ts for the one call
// site.
//
// Each provider here is a real client, not a mock: it calls the actual API
// when configured. `available` is false — not an error — whenever its key
// isn't set, so route.ts can fall back cleanly.
// ---------------------------------------------------------------------------

export type AiProviderId = "rule-based" | "openai" | "anthropic" | "gemini" | "deepseek" | "local";

export interface AiProviderInput {
  message: string;
  /** Recent turns as plain "User: ...\nElVoid AI: ..." text — only LLM-backed providers use this; the rule-based engine is stateless by design (see useElVoidChat.ts). */
  history?: string;
  /** A short live-data digest (BTC price, Fear&Greed, etc.) so an LLM reply stays grounded instead of hallucinating market state. */
  liveContext?: string;
  /**
   * Phase: AI CORE ENGINE — when set, replaces SYSTEM_VOICE below entirely
   * instead of being appended to it. Used only by lib/ai/core/llm.ts, only
   * when a developer has explicitly opted into a paid provider via
   * AI_CHAT_PROVIDER (see getActiveProvider()) and wants ONE of the 10 AI
   * Core modules (Oracle, Scanner, etc.) to run on that provider instead of
   * the free Groq/OpenRouter default. Omitted (undefined) for every
   * existing call site — app/api/chat/route.ts never sets this — so chat's
   * behavior through this file is byte-for-byte unchanged.
   */
  systemPromptOverride?: string;
  /** Requests a larger reply than chat's 600-token default — module output is structured JSON with several fields, not a short chat reply. Ignored unless systemPromptOverride is also set. */
  maxTokensOverride?: number;
}

export interface AiProvider {
  id: AiProviderId;
  label: string;
  available: boolean;
  generate(input: AiProviderInput): Promise<string>;
}

function unavailable(id: AiProviderId, label: string, reason: string): AiProvider {
  return {
    id,
    label,
    available: false,
    async generate() {
      throw new Error(reason);
    },
  };
}

const SYSTEM_VOICE =
  "Kamu adalah ElVoid AI dari ElStand Intelligence. Jawab natural, mengalir seperti manusia, santai tapi tetap profesional — bukan format markdown (jangan pakai ##, **, atau ---). Boleh panjang boleh singkat sesuai kebutuhan. Ini bukan nasihat keuangan; selalu jujur soal ketidakpastian.";

function makeOpenAiCompatible(id: AiProviderId, label: string, envKey: string, model: string, baseUrl: string): AiProvider {
  const apiKey = process.env[envKey];
  if (!apiKey) return unavailable(id, label, `${envKey} belum diset.`);
  return {
    id,
    label,
    available: true,
    async generate({ message, history, liveContext, systemPromptOverride, maxTokensOverride }) {
      const systemContent =
        systemPromptOverride ?? SYSTEM_VOICE + (liveContext ? `\n\nData live saat ini:\n${liveContext}` : "");
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemContent },
            ...(history ? [{ role: "user" as const, content: `Konteks percakapan sebelumnya:\n${history}` }] : []),
            { role: "user", content: message },
          ],
          max_tokens: maxTokensOverride ?? 600,
          ...(systemPromptOverride ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${label} error ${res.status}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${label} returned an empty reply`);
      return text as string;
    },
  };
}

function makeAnthropic(): AiProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return unavailable("anthropic", "Claude", "ANTHROPIC_API_KEY belum diset.");
  return {
    id: "anthropic",
    label: "Claude",
    available: true,
    async generate({ message, history, liveContext, systemPromptOverride, maxTokensOverride }) {
      const systemContent =
        systemPromptOverride ?? SYSTEM_VOICE + (liveContext ? `\n\nData live saat ini:\n${liveContext}` : "");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: maxTokensOverride ?? 600,
          system: systemContent,
          messages: [
            ...(history ? [{ role: "user" as const, content: `Konteks percakapan sebelumnya:\n${history}` }] : []),
            { role: "user", content: message },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Claude error ${res.status}`);
      const data = await res.json();
      const text = data?.content?.find((b: { type: string }) => b.type === "text")?.text;
      if (!text) throw new Error("Claude returned an empty reply");
      return text as string;
    },
  };
}

function makeGemini(): AiProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return unavailable("gemini", "Gemini", "GEMINI_API_KEY belum diset.");
  return {
    id: "gemini",
    label: "Gemini",
    available: true,
    async generate({ message, history, liveContext, systemPromptOverride }) {
      const voice = systemPromptOverride ?? `${SYSTEM_VOICE}${liveContext ? `\n\nData live saat ini:\n${liveContext}` : ""}`;
      const prompt = `${voice}${history ? `\n\nKonteks percakapan sebelumnya:\n${history}` : ""}\n\nPertanyaan: ${message}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned an empty reply");
      return text as string;
    },
  };
}

function makeLocal(): AiProvider {
  const baseUrl = process.env.LOCAL_LLM_URL; // e.g. http://localhost:11434/v1/chat/completions (Ollama-compatible)
  if (!baseUrl) return unavailable("local", "Local LLM", "LOCAL_LLM_URL belum diset.");
  return makeOpenAiCompatible("local", "Local LLM", "LOCAL_LLM_URL_UNUSED_KEY", process.env.LOCAL_LLM_MODEL ?? "local-model", baseUrl);
}

const ruleBased: AiProvider = {
  id: "rule-based",
  label: "ElVoid AI (rule-based, gratis)",
  available: true,
  async generate() {
    throw new Error("rule-based provider is handled directly in app/api/chat/route.ts via lib/analysis.ts, not through generate()");
  },
};

/** Reads AI_CHAT_PROVIDER (defaults to "rule-based") and returns the matching client. Falls back to rule-based automatically if the selected provider's key isn't configured, so a typo in the env var never breaks chat. */
export function getActiveProvider(): AiProvider {
  const selected = (process.env.AI_CHAT_PROVIDER ?? "rule-based") as AiProviderId;
  const candidates: Record<AiProviderId, () => AiProvider> = {
    "rule-based": () => ruleBased,
    openai: () => makeOpenAiCompatible("openai", "OpenAI", "OPENAI_API_KEY", "gpt-4o-mini", "https://api.openai.com/v1/chat/completions"),
    anthropic: makeAnthropic,
    gemini: makeGemini,
    deepseek: () =>
      makeOpenAiCompatible("deepseek", "DeepSeek", "DEEPSEEK_API_KEY", "deepseek-chat", "https://api.deepseek.com/chat/completions"),
    local: makeLocal,
  };
  const provider = (candidates[selected] ?? candidates["rule-based"])();
  return provider.available ? provider : ruleBased;
}
