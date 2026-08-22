import { routeChatStream, AiRouterNotConfiguredError } from "@/lib/ai/router";

// ---------------------------------------------------------------------------
// PHASE 3.0 (optional/additive) — Server-Sent-Events version of /api/chat.
//
// Not called by any current component: components/AIChatDock.tsx,
// components/right-rail/ElVoidChatPanel.tsx, components/mobile/AskNocturnBar.tsx,
// and lib/hooks/useElVoidChat.ts all still call POST /api/chat and expect one
// JSON blob (`await res.json()`) — untouched by this phase, per brief ("Tidak
// ada perubahan UI"). This route exists so a *future* frontend change can get
// real token-by-token streaming from the same Groq -> OpenRouter router
// without any backend rework: just point a new fetch/EventSource at this URL.
//
// Response is `text/event-stream`; each event is `data: {...}\n\n` with one
// of three shapes: {"delta": "..."} (a text chunk), {"done": true} (stream
// finished normally), or {"error": "..."} (every provider failed / not
// configured — same "AI sedang sibuk" message as the non-streaming route).
// ---------------------------------------------------------------------------

interface StreamChatBody {
  message: string;
  history?: string;
  liveContext?: string;
}

export async function POST(req: Request) {
  let body: StreamChatBody;
  try {
    body = (await req.json()) as StreamChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Pesan tidak valid." }), { status: 400 });
  }

  const message = (body.message ?? "").toString().slice(0, 500);
  if (!message.trim()) {
    return new Response(JSON.stringify({ error: "Tanya sesuatu dulu." }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        for await (const chunk of routeChatStream({
          message,
          history: body.history?.slice(0, 4000),
          liveContext: body.liveContext,
        })) {
          if ("delta" in chunk) send({ delta: chunk.delta });
          else send({ done: true });
        }
      } catch (err) {
        // Same distinction as app/api/chat/route.ts: "not configured" (no keys
        // set) vs "every provider failed" both surface as one honest message
        // here — there's no rule-based fallback to hand a raw stream off to.
        console.error("[AI Router] (stream) failed:", err);
        const message = err instanceof AiRouterNotConfiguredError ? "AI Router belum dikonfigurasi." : "AI sedang sibuk. Silakan coba beberapa saat lagi.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
