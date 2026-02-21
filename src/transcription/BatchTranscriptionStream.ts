import { EventEmitter } from "node:events";
import type { AudioProcess } from "../audio/AudioProcess.js";
import { DeepgramBatch } from "../deepgram/DeepgramBatch.js";
import type {
  AudioSource,
  DeepgramOptions,
  TranscriptEvent,
  UtteranceEndEvent,
  BatchProgressEvent,
  BinaryMessage,
} from "../types.js";
import { Logger } from "../util/logger.js";

export interface BatchTranscriptionStreamEvents {
  transcript: (event: TranscriptEvent) => void;
  utterance_end: (event: UtteranceEndEvent) => void;
  audio_level: (message: BinaryMessage) => void;
  batch_progress: (event: BatchProgressEvent) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

/**
 * Batch-mode transcription stream.
 * Accumulates PCM audio during capture, then transcribes via Deepgram's
 * pre-recorded REST API when stop() is called.
 */
export class BatchTranscriptionStream extends EventEmitter {
  private readonly source: AudioProcess;
  private readonly batch: DeepgramBatch;
  private readonly label: AudioSource;
  private readonly logger: Logger;
  private running = false;

  constructor(
    source: AudioProcess,
    deepgramOptions: DeepgramOptions,
    sampleRate: number,
    label: AudioSource,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    super();
    this.source = source;
    this.label = label;
    this.logger = new Logger(`batch-stream-${label}`, logLevel);
    this.batch = new DeepgramBatch(deepgramOptions, sampleRate, logLevel);
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Accumulate PCM data instead of streaming
    this.source.on("data", (chunk: Buffer) => {
      this.batch.addChunk(chunk);
    });

    this.source.on("audio_level", (msg: BinaryMessage) => {
      this.emit("audio_level", msg);
    });

    this.source.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.source.on("exit", () => {
      if (this.running) {
        this.logger.warn("Audio source exited unexpectedly");
        this.running = false;
        this.emit("stopped");
      }
    });

    await this.source.start();
    this.running = true;
    this.emit("started");

    this.emit("batch_progress", { phase: "recording", bytesRecorded: 0 } as BatchProgressEvent);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Stop audio capture
    await this.source.stop();
    this.source.removeAllListeners();

    const bytes = this.batch.bytesRecorded;

    if (bytes === 0) {
      this.logger.warn("No audio data recorded, skipping transcription");
      this.emit("stopped");
      return;
    }

    // Upload and transcribe
    this.emit("batch_progress", { phase: "uploading", bytesRecorded: bytes } as BatchProgressEvent);

    try {
      this.emit("batch_progress", { phase: "processing", bytesRecorded: bytes } as BatchProgressEvent);
      const events = await this.batch.transcribe();

      for (const event of events) {
        event.source = this.label;
        this.emit("transcript", event);
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }

    this.batch.clear();
    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }
}
