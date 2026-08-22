"use client";
import { useState } from "react";
import { TerminalSquare, X, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useElVoidChat } from "@/lib/hooks/useElVoidChat";
import { LiveDot } from "@/components/ui/LiveDot";
import { TerminalReportView } from "@/components/ui/TerminalReportView";
import { TerminalPromptLine, TerminalLoadingLine, TerminalErrorLine } from "@/components/ui/TerminalChatUI";

/** Floating dock, every page. V3: terminal prompt/response instead of chat bubbles — see lib/terminalReport.ts. */
export function AIChatDock() {
  const [open, setOpen] = useState(false);
  const { msgs, input, setInput, loading, loadingLabel, send, retry } = useElVoidChat();

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mb-3 flex h-[32rem] w-[24rem] max-w-[90vw] flex-col rounded-xl border border-line bg-bg-raised shadow-2xl shadow-black/50"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="flex items-center gap-1.5">
                <TerminalSquare size={13} className="text-signal-glow" />
                <span className="mono-num text-[11px] font-bold tracking-widest text-ink">ELVOID AI</span>
                <LiveDot tone="signal" />
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-ink-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
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

            <div className="flex items-center gap-2 border-t border-line p-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="analisa btc, whale activity..."
                className="mono-num flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-signal"
              />
              <button
                onClick={() => send()}
                aria-label="Send"
                disabled={loading}
                className="rounded-md bg-signal p-1.5 text-white hover:bg-signal-glow disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-signal/40 bg-bg-raised px-4 py-2.5 shadow-lg shadow-signal/10 hover:border-signal"
        >
          <TerminalSquare size={15} className="text-signal-glow" />
          <span className="mono-num text-[12px] font-semibold tracking-wide text-ink">root@elvoid</span>
          <LiveDot tone="signal" />
        </button>
      )}
    </div>
  );
}
