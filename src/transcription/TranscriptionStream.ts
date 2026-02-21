import { EventEmitter } from "node:events";
import type { AudioProcess } from "../audio/AudioProcess.js";
import { DeepgramSocket } from "../deepgram/DeepgramSocket.js";
import type { DeepgramResponse } from "../deepgram/DeepgramTypes.js";
import type {
  AudioSource,
  DeepgramOptions,
  TranscriptEvent,
  UtteranceEndEvent,
  BinaryMessage,
} from "../types.js";
import { Logger } from "../util/logger.js";

export interface TranscriptionStreamEvents {
  transcript: (event: TranscriptEvent) => void;
  utterance_end: (event: UtteranceEndEvent) => void;
  audio_level: (message: BinaryMessage) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

/**
 * Connects one AudioProcess to one DeepgramSocket.
 * Forwards PCM data from the audio source to Deepgram,
 * and emits labeled transcript events.
 */
export class TranscriptionStream extends EventEmitter {
  private readonly source: AudioProcess;
  private readonly socket: DeepgramSocket;
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
    this.logger = new Logger(`stream-${label}`, logLevel);
    this.socket = new DeepgramSocket(deepgramOptions, sampleRate, logLevel);
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Connect to Deepgram first
    await this.socket.connect();

    // Set up audio data forwarding
    this.source.on("data", (chunk: Buffer) => {
      this.socket.send(chunk);
    });

    this.source.on("audio_level", (msg: BinaryMessage) => {
      this.emit("audio_level", msg);
    });

    // Set up transcript event handling
    this.socket.on("response", (response: DeepgramResponse) => {
      this.handleResponse(response);
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

    // Start audio capture
    await this.source.start();
    this.running = true;
    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Stop audio source first, then close Deepgram connection
    await this.source.stop();
    await this.socket.close();

    this.source.removeAllListeners();
    this.socket.removeAllListeners();

    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }

  private handleResponse(response: DeepgramResponse): void {
    if (response.type === "Results" && response.channel?.alternatives?.length) {
      const alt = response.channel.alternatives[0];
      if (!alt.transcript) return;

      const event: TranscriptEvent = {
        source: this.label,
        transcript: alt.transcript,
        is_final: response.is_final ?? false,
        confidence: alt.confidence,
        words: alt.words.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          punctuated_word: w.punctuated_word,
        })),
        speech_final: response.speech_final,
        channel_index: response.channel_index,
        duration: response.duration,
        start: response.start,
      };

      this.emit("transcript", event);
    } else if (response.type === "UtteranceEnd") {
      const event: UtteranceEndEvent = {
        source: this.label,
        last_word_end: response.last_word_end,
      };
      this.emit("utterance_end", event);
    }
  }
}
