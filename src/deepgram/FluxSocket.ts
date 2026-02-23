import WebSocket from "ws";
import { EventEmitter } from "node:events";
import type { FluxOptions, FluxTurnEvent } from "../types.js";
import type { FluxTurnInfo } from "./DeepgramTypes.js";
import { ConnectionError } from "../errors.js";
import { Logger } from "../util/logger.js";

const FLUX_API_URL = "wss://api.deepgram.com/v2/listen";
const KEEPALIVE_INTERVAL_MS = 5000;

export class FluxSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly options: FluxOptions;
  private readonly sampleRate: number;
  private readonly logger: Logger;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private closing = false;

  constructor(
    options: FluxOptions,
    sampleRate: number,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    super();
    this.options = options;
    this.sampleRate = sampleRate;
    this.logger = new Logger("flux-ws", logLevel);
  }

  async connect(): Promise<void> {
    if (this.ws) {
      throw new ConnectionError("Already connected");
    }
    this.closing = false;
    return this.createConnection();
  }

  send(data: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    this.stopKeepalive();

    if (!this.ws) return;

    return new Promise<void>((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.ws = null;
        resolve();
        return;
      }

      const closeTimeout = setTimeout(() => {
        this.ws?.terminate();
        this.ws = null;
        resolve();
      }, 3000);

      this.ws.once("close", () => {
        clearTimeout(closeTimeout);
        this.ws = null;
        resolve();
      });

      this.ws.close();
    });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private createConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this.buildUrl();
      this.logger.debug("Connecting to Flux:", url);

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.options.apiKey}`,
        },
      });

      this.ws = ws;

      ws.on("open", () => {
        this.logger.info("Flux connected");
        this.startKeepalive();
        this.emit("open");
        resolve();
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as FluxTurnInfo;
          this.handleMessage(msg);
        } catch (err) {
          this.logger.warn("Failed to parse Flux response:", err);
        }
      });

      ws.on("close", (code, reason) => {
        this.logger.debug(`Flux closed: code=${code} reason=${reason.toString()}`);
        this.stopKeepalive();
        if (!this.closing) {
          this.emit(
            "error",
            new ConnectionError(`Flux connection closed unexpectedly (code: ${code})`)
          );
        }
      });

      ws.on("error", (err) => {
        this.logger.error("Flux WebSocket error:", err);
        reject(new ConnectionError(`Failed to connect to Flux: ${err.message}`));
      });
    });
  }

  private handleMessage(msg: FluxTurnInfo): void {
    if (msg.type === "Error") {
      this.emit("error", new ConnectionError(msg.error ?? "Flux API error"));
      return;
    }

    if (msg.type !== "TurnInfo") return;

    const event = msg.event;

    if (event === "EndOfTurn" && msg.transcript) {
      const turnEvent: FluxTurnEvent = {
        transcript: msg.transcript,
        words: msg.words ?? [],
        end_of_turn_confidence: msg.end_of_turn_confidence ?? 1,
        turn_index: msg.turn_index ?? 0,
        event: "EndOfTurn",
      };
      this.emit("turn_complete", turnEvent);
    } else if (event === "EagerEndOfTurn" && msg.transcript) {
      const turnEvent: FluxTurnEvent = {
        transcript: msg.transcript,
        words: msg.words ?? [],
        end_of_turn_confidence: msg.end_of_turn_confidence ?? 0.5,
        turn_index: msg.turn_index ?? 0,
        event: "EagerEndOfTurn",
      };
      this.emit("eager_end_of_turn", turnEvent);
    } else if (event === "TurnResumed") {
      this.emit("turn_resumed");
    }
  }

  private buildUrl(): string {
    const params = new URLSearchParams();
    params.set("encoding", "linear16");
    params.set("sample_rate", String(this.sampleRate));
    params.set("channels", "1");
    params.set("model", this.options.model ?? "flux-general-en");

    if (this.options.language) {
      params.set("language", this.options.language);
    }
    if (this.options.eotThreshold !== undefined) {
      params.set("eot_threshold", String(this.options.eotThreshold));
    }
    if (this.options.eagerEotThreshold !== undefined) {
      params.set("eager_eot_threshold", String(this.options.eagerEotThreshold));
    }

    return `${FLUX_API_URL}?${params.toString()}`;
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
          this.logger.warn("Failed to send keepalive");
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
