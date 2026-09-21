import { request as httpsRequest } from "node:https";
import { splitTelegram } from "./format";

// This host advertises IPv6 for api.telegram.org but cannot connect over it. Node's default
// fetch then fails getUpdates with a bare "fetch failed" and never replies with the chat ID.
export function telegramFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = init.method || "GET";
  const body =
    typeof init.body === "string"
      ? init.body
      : init.body == null
        ? ""
        : String(init.body);
  const headers = new Headers(init.headers);
  if (body && !headers.has("content-length"))
    headers.set("content-length", String(Buffer.byteLength(body)));
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method,
        family: 4,
        headers: Object.fromEntries(headers.entries()),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 0,
              headers: res.headers as HeadersInit,
            }),
          ),
        );
      },
    );
    const abort = () =>
      req.destroy(
        Object.assign(new Error("This operation was aborted"), {
          name: "AbortError",
        }),
      );
    req.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) {
        abort();
        return;
      }
      init.signal.addEventListener("abort", abort, { once: true });
      req.on("close", () =>
        init.signal?.removeEventListener("abort", abort),
      );
    }
    req.end(body);
  });
}

// Telegram Bot API over long polling: the server only makes outbound HTTPS requests, so no public
// port, webhook or domain is needed and OMS keeps listening on 127.0.0.1 only.
export type TelegramConfig = { token: string; chatId: string };
export function telegramConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))
    throw new Error("TELEGRAM_BOT_TOKEN 형식을 확인해 주세요.");
  const chatId = env.TELEGRAM_CHAT_ID?.trim() || "";
  if (chatId && !/^-?\d+$/.test(chatId))
    throw new Error("TELEGRAM_CHAT_ID는 숫자여야 합니다.");
  return { token, chatId };
}

export type IncomingMessage = {
  chatId: string;
  text: string;
  from: string;
};
function describeFetchError(e: unknown): string {
  const parts: string[] = [];
  let current: unknown = e;
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) {
      const extra = current as Error & { code?: string; errno?: number };
      parts.push(
        [current.name, extra.code, extra.message].filter(Boolean).join(" "),
      );
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" → ");
}
type Fetch = typeof fetch;

export class TelegramBot {
  private offset = 0;
  private stopped = true;
  private loop: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private strangerWarned = new Set<string>();
  lastPollAt: string | null = null;
  lastError: string | null = null;
  username: string | null = null;
  constructor(
    readonly config: TelegramConfig,
    private onMessage: (message: IncomingMessage) => Promise<void>,
    private fetchImpl: Fetch = telegramFetch,
    private log: (message: string) => void = (m) =>
      console.error("[telegram] " + m),
  ) {}
  get running() {
    return !this.stopped;
  }
  private async api<T = unknown>(
    method: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.fetchImpl(
      `https://api.telegram.org/bot${this.config.token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    );
    const data = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!data.ok)
      throw new Error(
        `Telegram ${method} 실패: ${data.description || res.status}`,
      );
    return data.result as T;
  }
  // Sends HTML-formatted text to the configured chat, splitting at Telegram's message limit.
  async send(text: string, chatId = this.config.chatId) {
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID가 설정되지 않았어요.");
    for (const chunk of splitTelegram(text)) {
      try {
        await this.api("sendMessage", {
          chat_id: chatId,
          text: chunk,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      } catch (e) {
        // Broken markup (unbalanced tags after splitting) falls back to plain text rather than losing the message.
        if (!/parse entities/i.test(String(e))) throw e;
        await this.api("sendMessage", {
          chat_id: chatId,
          text: chunk.replace(/<[^>]+>/g, ""),
          link_preview_options: { is_disabled: true },
        });
      }
    }
  }
  async verify() {
    const me = await this.api<{ username?: string }>("getMe");
    this.username = me.username || null;
    return this.username;
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.loop = this.poll();
  }
  async stop() {
    this.stopped = true;
    this.abort?.abort();
    await this.loop?.catch(() => {});
  }
  private async poll() {
    let backoff = 2_000;
    while (!this.stopped) {
      this.abort = new AbortController();
      const timer = setTimeout(() => this.abort?.abort(), 45_000);
      try {
        const updates = await this.api<
          {
            update_id: number;
            message?: {
              text?: string;
              chat: { id: number; type: string };
              from?: { first_name?: string; username?: string };
            };
          }[]
        >(
          "getUpdates",
          { offset: this.offset, timeout: 30, allowed_updates: ["message"] },
          this.abort.signal,
        );
        this.lastPollAt = new Date().toISOString();
        this.lastError = null;
        backoff = 2_000;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          const message = update.message;
          if (!message?.text) continue;
          const chatId = String(message.chat.id);
          if (!this.config.chatId) {
            // Setup mode: tell the owner their chat id once, then ignore until it is configured.
            if (!this.strangerWarned.has(chatId)) {
              this.strangerWarned.add(chatId);
              await this.api("sendMessage", {
                chat_id: chatId,
                text: `이 채팅의 ID는 ${chatId} 입니다. OMS 서버 .env의 TELEGRAM_CHAT_ID에 넣고 서버를 재시작하면 연결됩니다. 그 전까지는 명령을 처리하지 않아요.`,
              }).catch(() => {});
            }
            continue;
          }
          if (chatId !== this.config.chatId) {
            // Anyone else who finds the bot is ignored; the owner is told once so the attempt is visible.
            if (!this.strangerWarned.has(chatId)) {
              this.strangerWarned.add(chatId);
              this.log(`허용되지 않은 채팅(${chatId})의 메시지를 무시했어요.`);
            }
            continue;
          }
          try {
            await this.onMessage({
              chatId,
              text: message.text.trim(),
              from: message.from?.username || message.from?.first_name || "",
            });
          } catch (e) {
            this.log(e instanceof Error ? e.message : String(e));
            await this.send(
              "요청을 처리하지 못했어요: " +
                (e instanceof Error ? e.message : "알 수 없는 오류"),
            ).catch(() => {});
          }
        }
      } catch (e) {
        if (this.stopped) break;
        this.lastError = describeFetchError(e);
        // A second bot instance with the same token makes getUpdates fail with 409; wait longer then.
        if (/409|Conflict/i.test(this.lastError)) backoff = 30_000;
        this.log(this.lastError);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
