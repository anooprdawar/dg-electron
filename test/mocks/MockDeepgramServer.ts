import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { DeepgramResponse } from "../../src/deepgram/DeepgramTypes.js";

/**
 * Mock Deepgram WebSocket server for unit testing.
 * Accepts connections and sends fake transcript responses.
 */
export class MockDeepgramServer {
  private server: WebSocketServer | null = null;
  private connections: WebSocket[] = [];
  private _port = 0;
  private bytesReceived = 0;

  get port(): number {
    return this._port;
  }

  get url(): string {
    return `ws://127.0.0.1:${this._port}`;
  }

  get totalBytesReceived(): number {
    return this.bytesReceived;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = new WebSocketServer({ port: 0 }, () => {
        this._port = (this.server!.address() as AddressInfo).port;
        resolve();
      });

      this.server.on("connection", (ws) => {
        this.connections.push(ws);

        ws.on("message", (data) => {
          const str = data.toString();

          // Handle JSON control messages
          try {
            const msg = JSON.parse(str);
            if (msg.type === "CloseStream") {
              ws.close(1000, "Normal closure");
              return;
            }
            if (msg.type === "KeepAlive") {
              return;
            }
          } catch {
            // Binary audio data
            this.bytesReceived += (data as Buffer).length;
          }
        });

        ws.on("close", () => {
          this.connections = this.connections.filter((c) => c !== ws);
        });
      });
    });
  }

  /** Send a transcript response to all connected clients */
  sendTranscript(
    transcript: string,
    options: {
      isFinal?: boolean;
      confidence?: number;
      speechFinal?: boolean;
    } = {}
  ): void {
    const response: DeepgramResponse = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.0,
      start: 0,
      is_final: options.isFinal ?? true,
      speech_final: options.speechFinal ?? false,
      channel: {
        alternatives: [
          {
            transcript,
            confidence: options.confidence ?? 0.95,
            words: transcript.split(" ").map((word, i) => ({
              word,
              start: i * 0.3,
              end: (i + 1) * 0.3,
              confidence: options.confidence ?? 0.95,
              punctuated_word: word,
            })),
          },
        ],
      },
    };

    this.broadcast(response);
  }

  /** Send an utterance end event to all connected clients */
  sendUtteranceEnd(lastWordEnd?: number): void {
    const response: DeepgramResponse = {
      type: "UtteranceEnd",
      last_word_end: lastWordEnd,
    };
    this.broadcast(response);
  }

  /** Send an error response to all connected clients */
  sendError(message: string): void {
    const response: DeepgramResponse = {
      type: "Error",
      error: message,
    };
    this.broadcast(response);
  }

  /** Close all connections and shut down */
  async stop(): Promise<void> {
    for (const ws of this.connections) {
      ws.close(1000);
    }
    this.connections = [];

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private broadcast(response: DeepgramResponse): void {
    const data = JSON.stringify(response);
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
