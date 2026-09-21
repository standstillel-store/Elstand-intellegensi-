// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, Telegram client (Phase 8.6.7)
//
// The ONLY place that talks to Telegram, and the only place the bot token is
// used. Three calls: send an approval request, answer a button press, and
// remove a button keyboard once a decision exists.
//
// SECRET HANDLING: the token appears in the request URL and nowhere else.
// Every method catches EVERYTHING and returns `{ ok: false }` — no error, URL
// or upstream response body is ever propagated, so the token cannot reach a
// log, a response or a thrown error from here. Nothing in this file logs.
//
// This client can only send messages. It cannot change trading behavior,
// call the exchange, deploy, or read anything from the decision path.
// ---------------------------------------------------------------------------

import type { InlineKeyboard } from "./telegramPayload";
import type { TelegramConfig } from "./security";

export interface TelegramSendResult {
  readonly ok: boolean;
}

export interface TelegramClient {
  sendMessage(chatId: number, text: string, keyboard: InlineKeyboard | null): Promise<TelegramSendResult>;
  answerCallbackQuery(callbackQueryId: string, text: string): Promise<TelegramSendResult>;
  clearInlineKeyboard(chatId: number, messageId: number): Promise<TelegramSendResult>;
}

const REQUEST_TIMEOUT_MS = 8000;

export function createTelegramClient(config: TelegramConfig, fetchImpl: typeof fetch = fetch): TelegramClient {
  async function call(method: string, payload: Record<string, unknown>): Promise<TelegramSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false };
      const json: unknown = await response.json();
      return { ok: typeof json === "object" && json !== null && (json as { ok?: unknown }).ok === true };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    sendMessage: (chatId, text, keyboard) => call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...(keyboard === null ? {} : { reply_markup: keyboard }) }),
    answerCallbackQuery: (callbackQueryId, text) => call("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false }),
    clearInlineKeyboard: (chatId, messageId) => call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  };
}
