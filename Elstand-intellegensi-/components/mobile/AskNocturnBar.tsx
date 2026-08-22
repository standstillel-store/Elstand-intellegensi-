"use client";
import { useState } from "react";
import { TerminalSquare, Send, X } from "lucide-react";
import { useElVoidChat } from "@/lib/hooks/useElVoidChat";
import { TerminalReportView } from "@/components/ui/TerminalReportView";
import { TerminalLoadingLine, TerminalErrorLine } from "@/components/ui/TerminalChatUI";

const SUGGESTIONS = ["ringkasan market", "whale activity", "risk tertinggi"];

/** Mobile quick-ask bar. Shares useElVoidChat with AIChatDock/ElVoidChatPanel but only ever shows the latest reply. */
export function AskNocturnBar() {
  const { msgs, input, setInput, loading, loadingLabel, send, retry } = useElVoidChat();
  const [dismissed, setDismissed] = useState(false);

  function ask(text: string) {
    setDismissed(false);
    send(text);
  }

  const hasAsked = msgs.length > 1;
  const lastMsg = msgs[msgs.length - 1];
  const showLast = hasAsked && !dismissed && lastMsg.role !== "user";

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2 rounded-full border border-line bg-bg-surface px-3.5 py-2.5">
        <TerminalSquare size={15} className="shrink-0 text-signal-glow" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="root@elvoid: analisa btc..."
          className="mono-num min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={() => ask(input)}
          disabled={loading}
          aria-label="Kirim"
          className="shrink-0 text-ink-muted hover:text-signal-glow disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>

      {!showLast && !loading && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:border-signal hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-2 rounded-lg border border-line bg-bg-raised p-3">
          <TerminalLoadingLine label={loadingLabel} />
        </div>
      )}

      {showLast && lastMsg.role === "error" && (
        <div className="mt-2">
          <TerminalErrorLine reason={`Gagal memproses "${lastMsg.text}".`} retrying={lastMsg.retrying} onRetry={() => retry(lastMsg.text)} />
        </div>
      )}

      {showLast && lastMsg.role === "assistant" && (
        <div className="relative mt-2">
          <button
            onClick={() => setDismissed(true)}
            aria-label="Tutup"
            className="absolute right-2.5 top-2.5 z-10 text-ink-muted hover:text-ink"
          >
            <X size={14} />
          </button>
          <TerminalReportView report={lastMsg.report} variant="inline" />
        </div>
      )}
    </div>
  );
}
