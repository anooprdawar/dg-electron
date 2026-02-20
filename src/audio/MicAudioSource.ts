import { AudioProcess } from "./AudioProcess.js";
import { resolveBinaryPath } from "../util/binary.js";
import type { MicOptions } from "../types.js";

const BINARY_NAME = "dg-mic-audio";

export class MicAudioSource extends AudioProcess {
  constructor(
    options: MicOptions = {},
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    const args: string[] = [];

    const sampleRate = options.sampleRate ?? 16000;
    args.push("--sample-rate", String(sampleRate));

    const chunkDuration = options.chunkDurationMs ?? 200;
    args.push("--chunk-duration", String(chunkDuration));

    super({
      binaryPath: resolveBinaryPath(BINARY_NAME),
      args,
      name: "mic-audio",
      logLevel,
    });
  }

  /** Check microphone permission without starting capture */
  static async checkPermission(
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ): Promise<boolean> {
    const proc = new AudioProcess({
      binaryPath: resolveBinaryPath(BINARY_NAME),
      args: ["--check-permission"],
      name: "mic-permission-check",
      readyTimeoutMs: 5000,
      logLevel,
    });

    try {
      await proc.start();
      return true;
    } catch {
      return false;
    }
  }
}
