import { EventEmitter } from "node:events";
import { TranscriptionStream } from "./TranscriptionStream.js";
import { SystemAudioSource } from "../audio/SystemAudioSource.js";
import { MicAudioSource } from "../audio/MicAudioSource.js";
import type {
  DeepgramElectronConfig,
  DeepgramElectronEvents,
  TranscriptEvent,
  UtteranceEndEvent,
  PermissionResult,
  PermissionStatus,
} from "../types.js";
import { assertPlatform } from "../util/platform.js";
import { Logger } from "../util/logger.js";

/**
 * Main public API class for @deepgram/electron.
 * Manages system audio and microphone transcription streams.
 */
export class DeepgramElectron extends EventEmitter {
  private readonly config: DeepgramElectronConfig;
  private readonly logger: Logger;
  private systemStream: TranscriptionStream | null = null;
  private micStream: TranscriptionStream | null = null;
  private running = false;

  constructor(config: DeepgramElectronConfig) {
    super();
    this.config = config;
    this.logger = new Logger("manager", config.logLevel);
  }

  /** Start transcription for enabled sources */
  async start(): Promise<void> {
    if (this.running) return;

    // Verify platform
    assertPlatform();

    const systemEnabled = this.config.systemAudio?.enabled !== false;
    const micEnabled = this.config.mic?.enabled !== false;

    if (!systemEnabled && !micEnabled) {
      throw new Error("At least one audio source must be enabled");
    }

    this.logger.info("Starting transcription", { systemEnabled, micEnabled });

    const startPromises: Promise<void>[] = [];

    // Set up system audio stream
    if (systemEnabled) {
      const source = new SystemAudioSource(
        this.config.systemAudio,
        this.config.logLevel
      );
      this.systemStream = new TranscriptionStream(
        source,
        this.config.deepgram,
        this.config.systemAudio?.sampleRate ?? 16000,
        "system",
        this.config.logLevel
      );
      this.wireStreamEvents(this.systemStream);
      startPromises.push(this.systemStream.start());
    }

    // Set up mic stream
    if (micEnabled) {
      const source = new MicAudioSource(this.config.mic, this.config.logLevel);
      this.micStream = new TranscriptionStream(
        source,
        this.config.deepgram,
        this.config.mic?.sampleRate ?? 16000,
        "mic",
        this.config.logLevel
      );
      this.wireStreamEvents(this.micStream);
      startPromises.push(this.micStream.start());
    }

    await Promise.all(startPromises);
    this.running = true;
    this.emit("started");
  }

  /** Stop all transcription streams */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    const stopPromises: Promise<void>[] = [];

    if (this.systemStream) {
      stopPromises.push(this.systemStream.stop());
    }
    if (this.micStream) {
      stopPromises.push(this.micStream.stop());
    }

    await Promise.all(stopPromises);

    this.systemStream = null;
    this.micStream = null;

    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Check permissions for system audio and microphone */
  static async checkPermissions(
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ): Promise<PermissionResult> {
    let systemAudio: PermissionStatus = "unknown";
    let microphone: PermissionStatus = "unknown";

    try {
      const hasSystemAudio = await SystemAudioSource.checkPermission(logLevel);
      systemAudio = hasSystemAudio ? "granted" : "denied";
    } catch {
      systemAudio = "unknown";
    }

    // Try Electron's API first, fall back to binary check
    try {
      // Dynamic import - electron is an optional peer dependency
      const electronModule: string = "electron";
      const electron: Record<string, any> | null = await import(electronModule).catch(() => null);
      if (electron?.systemPreferences) {
        const status =
          electron.systemPreferences.getMediaAccessStatus("microphone");
        microphone =
          status === "granted"
            ? "granted"
            : status === "denied"
              ? "denied"
              : "unknown";
      } else {
        const hasMic = await MicAudioSource.checkPermission(logLevel);
        microphone = hasMic ? "granted" : "denied";
      }
    } catch {
      try {
        const hasMic = await MicAudioSource.checkPermission(logLevel);
        microphone = hasMic ? "granted" : "denied";
      } catch {
        microphone = "unknown";
      }
    }

    return { systemAudio, microphone };
  }

  // Type-safe event emitter overrides
  declare on: <K extends keyof DeepgramElectronEvents>(
    event: K,
    listener: DeepgramElectronEvents[K]
  ) => this;

  declare emit: <K extends keyof DeepgramElectronEvents>(
    event: K,
    ...args: Parameters<DeepgramElectronEvents[K]>
  ) => boolean;

  declare off: <K extends keyof DeepgramElectronEvents>(
    event: K,
    listener: DeepgramElectronEvents[K]
  ) => this;

  declare once: <K extends keyof DeepgramElectronEvents>(
    event: K,
    listener: DeepgramElectronEvents[K]
  ) => this;

  private wireStreamEvents(stream: TranscriptionStream): void {
    stream.on("transcript", (event: TranscriptEvent) => {
      this.emit("transcript", event);
      if (event.source === "system") {
        this.emit("system_transcript", event);
      } else {
        this.emit("mic_transcript", event);
      }
    });

    stream.on("utterance_end", (event: UtteranceEndEvent) => {
      this.emit("utterance_end", event);
    });

    stream.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }
}
