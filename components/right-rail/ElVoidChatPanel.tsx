"use client";
import { Send } from "lucide-react";
import { useRef, useEffect } from "react";
import { useElVoidChat } from "@/lib/hooks/useElVoidChat";
import { SectionHeader } from "@/components/SectionHeader";
import { TerminalReportView } from "@/components/ui/TerminalReportView";
import { TerminalPromptLine, TerminalLoadingLine, TerminalErrorLine } from "@/components/ui/TerminalChatUI";

const QUICK_PROMPTS = ["Analisa BTC", "Whale activity", "Risk tertinggi", "Momentum sekarang"];

/** Inline chat panel (right rail). V3: terminal prompt/response instead of chat bubbles — see lib/terminalReport.ts. */
export function ElVoidChatPanel() {
  const { msgs, input, setInput, loading, loadingLabel, send, retry } = useElVoidChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  return (
    <div className="glow-card flex h-[420px] flex-col p-4">
      <SectionHeader code="AI" title="ElVoid AI Chat" hint="Live" />
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.map((m, i) => {
          if (m.role === "user") return <TerminalPromptLine key={i} text={m.text} />;
          if (m.role === "error") {
            return (
              <TerminalErrorLine
                key={i}
                reason={`Gagal memproses "${m.text}".`}
                retrying={m.retrying}
                onRetry={() => retry(m.text)}
              />
            );
          }
          return <TerminalReportView key={i} report={m.report} variant="inline" />;
        })}
        {loading && <TerminalLoadingLine label={loadingLabel} />}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={loading}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-signal/40 hover:text-ink disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="analisa btc, whale activity..."
          className="mono-num flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-signal"
        />
        <button
          onClick={() => send()}
          disabled={loading}
          aria-label="Send"
          className="rounded-md bg-signal p-1.5 text-white transition-colors hover:bg-signal-glow disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
