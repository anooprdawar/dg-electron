import WebSocket from "ws";
import { EventEmitter } from "node:events";
import type { DeepgramOptions } from "../types.js";
import type { DeepgramResponse } from "./DeepgramTypes.js";
import { ConnectionError } from "../errors.js";
import { Logger } from "../util/logger.js";

const DEFAULT_API_URL = "wss://api.deepgram.com/v1/listen";
const KEEPALIVE_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export interface DeepgramSocketEvents {
  response: (response: DeepgramResponse) => void;
  open: () => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

export class DeepgramSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly options: DeepgramOptions;
  private readonly sampleRate: number;
  private readonly logger: Logger;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private closing = false;
  private connected = false;

  constructor(
    options: DeepgramOptions,
    sampleRate: number,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    super();
    this.options = options;
    this.sampleRate = sampleRate;
    this.logger = new Logger("deepgram-ws", logLevel);
  }

  /** Connect to Deepgram WebSocket API */
  async connect(): Promise<void> {
    if (this.ws) {
      throw new ConnectionError("Already connected");
    }

    this.closing = false;
    this.reconnectAttempts = 0;

    return this.createConnection();
  }

  /** Send PCM audio data */
  send(data: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /** Close the connection gracefully */
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

      // Send CloseStream message to flush final transcripts
      try {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        this.ws.terminate();
        this.ws = null;
        clearTimeout(closeTimeout);
        resolve();
      }
    });
  }

  get isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  private createConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this.buildUrl();
      this.logger.debug("Connecting to:", url);

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.options.apiKey}`,
        },
      });

      this.ws = ws;

      ws.on("open", () => {
        this.logger.info("Connected");
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startKeepalive();
        this.emit("open");
        resolve();
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString()) as DeepgramResponse;
          this.emit("response", response);
        } catch (err) {
          this.logger.warn("Failed to parse response:", err);
        }
      });

      ws.on("close", (code, reason) => {
        this.logger.debug(`Connection closed: code=${code} reason=${reason.toString()}`);
        this.connected = false;
        this.stopKeepalive();
        this.emit("close", code, reason.toString());

        if (!this.closing && this.shouldReconnect(code)) {
          this.attemptReconnect();
        }
      });

      ws.on("error", (err) => {
        this.logger.error("WebSocket error:", err);
        this.connected = false;

        if (this.reconnectAttempts === 0) {
          // First connection attempt failed
          reject(new ConnectionError(`Failed to connect: ${err.message}`));
        } else {
          this.emit("error", new ConnectionError(err.message));
        }
      });
    });
  }

  private buildUrl(): string {
    const base = this.options.apiUrl ?? DEFAULT_API_URL;
    const params = new URLSearchParams();

    params.set("encoding", this.options.encoding ?? "linear16");
    params.set("sample_rate", String(this.sampleRate));
    params.set("channels", "1");
    params.set("model", this.options.model ?? "nova-3");
    params.set("language", this.options.language ?? "en");

    if (this.options.punctuate !== false) {
      params.set("punctuate", "true");
    }
    if (this.options.smart_format !== false) {
      params.set("smart_format", "true");
    }
    if (this.options.interim_results !== false) {
      params.set("interim_results", "true");
    }
    if (this.options.utterances) {
      params.set("utterances", "true");
    }
    if (this.options.utterance_end_ms) {
      params.set("utterance_end_ms", String(this.options.utterance_end_ms));
    }
    if (this.options.vad_events) {
      params.set("vad_events", "true");
    }

    return `${base}?${params.toString()}`;
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

  private shouldReconnect(code: number): boolean {
    // Don't reconnect on normal closure or auth failure
    if (code === 1000 || code === 1008 || code === 4001) return false;
    return this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS;
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    this.logger.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    );

    await new Promise((r) => setTimeout(r, delay));

    if (this.closing) return;

    try {
      await this.createConnection();
    } catch (err) {
      this.logger.error("Reconnection failed:", err);
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.emit(
          "error",
          new ConnectionError(
            `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
            undefined,
            false
          )
        );
      }
    }
  }
}
