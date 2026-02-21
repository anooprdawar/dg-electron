import { AudioProcess } from "./AudioProcess.js";
import { resolveBinaryPath } from "../util/binary.js";
import { resolveAudioLevels } from "./audioLevelPresets.js";
import type { SystemAudioOptions, AudioLevelsConfig } from "../types.js";

const BINARY_NAME = "dg-system-audio";

export class SystemAudioSource extends AudioProcess {
  constructor(
    options: SystemAudioOptions = {},
    logLevel?: "debug" | "info" | "warn" | "error" | "silent",
    audioLevels?: AudioLevelsConfig
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

    const levels = resolveAudioLevels(audioLevels);
    if (levels.enabled) {
      args.push("--enable-levels");
      args.push("--level-interval-ms", String(levels.intervalMs));
      args.push("--fft-bins", String(levels.fftBins));
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
