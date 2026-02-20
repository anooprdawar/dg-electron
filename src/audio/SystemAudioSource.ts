import { AudioProcess } from "./AudioProcess.js";
import { resolveBinaryPath } from "../util/binary.js";
import type { SystemAudioOptions } from "../types.js";

const BINARY_NAME = "dg-system-audio";

export class SystemAudioSource extends AudioProcess {
  constructor(
    options: SystemAudioOptions = {},
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    const args: string[] = [];

    const sampleRate = options.sampleRate ?? 16000;
    args.push("--sample-rate", String(sampleRate));

    const chunkDuration = options.chunkDurationMs ?? 200;
    args.push("--chunk-duration", String(chunkDuration));

    if (options.mute) {
      args.push("--mute");
    }

    if (options.includeProcesses?.length) {
      args.push("--include-processes", options.includeProcesses.join(","));
    }

    if (options.excludeProcesses?.length) {
      args.push("--exclude-processes", options.excludeProcesses.join(","));
    }

    super({
      binaryPath: resolveBinaryPath(BINARY_NAME),
      args,
      name: "system-audio",
      logLevel,
    });
  }

  /** Check system audio permission without starting capture */
  static async checkPermission(
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ): Promise<boolean> {
    const proc = new AudioProcess({
      binaryPath: resolveBinaryPath(BINARY_NAME),
      args: ["--check-permission"],
      name: "system-audio-permission-check",
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
