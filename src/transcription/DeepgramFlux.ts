import { EventEmitter } from "node:events";
import { MicAudioSource } from "../audio/MicAudioSource.js";
import { FluxTranscriptionStream } from "./FluxTranscriptionStream.js";
import { assertPlatform } from "../util/platform.js";
import type { FluxOptions, FluxTurnEvent } from "../types.js";
import { Logger } from "../util/logger.js";

export interface DeepgramFluxConfig {
  /** Deepgram API key */
  apiKey: string;
  /** Flux model (default: "flux-general-en") */
  model?: string;
  /** Language code (default: "en") */
  language?: string;
  /** Microphone device ID (omit to use default) */
  deviceId?: string;
  /** End-of-turn confidence threshold (0.1–0.99) */
  eotThreshold?: number;
  /** Eager end-of-turn threshold (0.3–0.9) */
  eagerEotThreshold?: number;
  /** Log level */
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}

export interface DeepgramFluxEvents {
  turn_complete: (event: FluxTurnEvent) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

/**
 * High-level class for Deepgram Flux continuous voice mode.
 * Captures microphone audio and emits turn_complete events when
 * Flux detects the speaker has finished talking — no fixed timer needed.
 *
 * Usage:
 *   const dg = new DeepgramFlux({ apiKey })
 *   dg.on("turn_complete", (turn) => console.log(turn.transcript))
 *   await dg.start()
 *   // ... speak ...
 *   await dg.stop()
 */
export class DeepgramFlux extends EventEmitter {
  private readonly config: DeepgramFluxConfig;
  private readonly logger: Logger;
  private stream: FluxTranscriptionStream | null = null;
  private running = false;

  constructor(config: DeepgramFluxConfig) {
    super();
    this.config = config;
    this.logger = new Logger("flux", config.logLevel);
  }

  async start(): Promise<void> {
    if (this.running) return;

    assertPlatform();

    const source = new MicAudioSource(
      { deviceId: this.config.deviceId },
      this.config.logLevel
    );

    const fluxOptions: FluxOptions = {
      apiKey: this.config.apiKey,
      model: this.config.model,
      language: this.config.language,
      eotThreshold: this.config.eotThreshold,
      eagerEotThreshold: this.config.eagerEotThreshold,
    };

    this.stream = new FluxTranscriptionStream(source, fluxOptions, 16000, this.config.logLevel);

    this.stream.on("turn_complete", (event: FluxTurnEvent) => {
      this.emit("turn_complete", event);
    });

    this.stream.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.stream.on("stopped", () => {
      if (this.running) {
        this.running = false;
        this.emit("stopped");
      }
    });

    try {
      await this.stream.start();
    } catch (err) {
      this.stream = null;
      throw err;
    }

    this.running = true;
    this.logger.info("Flux listening started");
    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.stream) {
      await this.stream.stop();
      this.stream = null;
    }

    this.logger.info("Flux listening stopped");
    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }

  declare on: <K extends keyof DeepgramFluxEvents>(
    event: K,
    listener: DeepgramFluxEvents[K]
  ) => this;

  declare emit: <K extends keyof DeepgramFluxEvents>(
    event: K,
    ...args: Parameters<DeepgramFluxEvents[K]>
  ) => boolean;

  declare once: <K extends keyof DeepgramFluxEvents>(
    event: K,
    listener: DeepgramFluxEvents[K]
  ) => this;
}
