import { EventEmitter } from "node:events";
import type { AudioProcess } from "../audio/AudioProcess.js";
import { FluxSocket } from "../deepgram/FluxSocket.js";
import type { FluxOptions, FluxTurnEvent, BinaryMessage } from "../types.js";
import { Logger } from "../util/logger.js";

/**
 * Connects one AudioProcess to one FluxSocket.
 * Forwards PCM data from the mic to Deepgram Flux (v2 API),
 * and emits turn_complete events when the speaker finishes a turn.
 */
export class FluxTranscriptionStream extends EventEmitter {
  private readonly source: AudioProcess;
  private readonly socket: FluxSocket;
  private readonly logger: Logger;
  private running = false;

  constructor(
    source: AudioProcess,
    options: FluxOptions,
    sampleRate: number,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    super();
    this.source = source;
    this.logger = new Logger("flux-stream", logLevel);
    this.socket = new FluxSocket(options, sampleRate, logLevel);
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.socket.connect();

    this.source.on("data", (chunk: Buffer) => {
      this.socket.send(chunk);
    });

    this.source.on("audio_level", (msg: BinaryMessage) => {
      this.emit("audio_level", msg);
    });

    this.socket.on("turn_complete", (event: FluxTurnEvent) => {
      this.emit("turn_complete", event);
    });

    this.socket.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.source.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.source.on("exit", (_code: number | null, _signal: string | null) => {
      if (this.running) {
        this.logger.warn("Audio source exited unexpectedly");
        this.running = false;
        this.emit("stopped");
      }
    });

    await this.source.start();
    this.running = true;
    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    await this.source.stop();
    await this.socket.close();

    this.source.removeAllListeners();
    this.socket.removeAllListeners();

    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }
}
