import WebSocket from "ws";
import type { Holding } from "../shared/types";
import type { TossClient } from "./toss";
export class QuoteStream {
  socket: WebSocket | null = null;
  status = "disconnected";
  lastMessage: string | null = null;
  private ping: NodeJS.Timeout | null = null;
  private retry: NodeJS.Timeout | null = null;
  private failures = 0;
  private stopped = true;
  private holdings: Holding[] = [];
  constructor(
    private toss: TossClient,
    private onPrice: (
      symbol: string,
      currency: string,
      price: string,
      at: string,
    ) => void,
  ) {}
  async start(holdings: Holding[]) {
    this.holdings = holdings;
    this.stopped = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.subscribe();
      return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) return;
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    if (!holdings.length) return;
    try {
      const token = await this.toss.accessToken();
      if (this.stopped) return;
      this.status = "connecting";
      this.socket = new WebSocket("wss://openapi-ws.tossinvest.com/ws/v1", {
        headers: { Authorization: `Bearer ${token}` },
        handshakeTimeout: 15000,
        maxPayload: 1_000_000,
      });
      this.socket.on("open", () => {
        this.failures = 0;
        this.status = "connected";
        this.subscribe();
        this.ping = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN)
            this.socket.send("PING");
        }, 60000);
      });
      this.socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "subscriptions")
            this.status = message.rejected?.length ? "partial" : "live";
          if (
            message.type === "message" &&
            String(message.topic).startsWith("trade:")
          ) {
            const parts = message.topic.split(":");
            const t = message.data;
            const price = t.price ?? t.tradePrice;
            if (price != null && /^\d+(\.\d+)?$/.test(String(price))) {
              this.lastMessage = new Date().toISOString();
              this.onPrice(
                parts[2],
                parts[1] === "us" ? "USD" : "KRW",
                String(price),
                t.timestamp || this.lastMessage,
              );
            }
          }
          if (message.type === "error") this.status = "error";
        } catch {}
      });
      this.socket.on("error", () => {
        this.status = "error";
      });
      this.socket.on("close", () => {
        this.cleanup();
        this.socket = null;
        this.status = "disconnected";
        this.schedule();
      });
    } catch {
      this.status = "error";
      this.schedule();
    }
  }
  private subscribe() {
    const unique = [
      ...new Map(
        this.holdings.map((h) => [h.currency + ":" + h.symbol, h]),
      ).values(),
    ].slice(0, 100);
    this.socket?.send(
      JSON.stringify(
        ["USD", "KRW"]
          .map((currency) => ({
            type: currency === "USD" ? "trade:us" : "trade:kr",
            codes: unique
              .filter((h) => h.currency === currency)
              .map((h) => h.symbol),
          }))
          .filter((g) => g.codes.length),
      ),
    );
  }
  private cleanup() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }
  private schedule() {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(
      () => {
        this.retry = null;
        void this.start(this.holdings);
      },
      Math.min(60000, 1000 * 2 ** Math.min(this.failures++, 6)) +
        Math.random() * 500,
    );
  }
  close() {
    this.stopped = true;
    this.cleanup();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
  }
}
