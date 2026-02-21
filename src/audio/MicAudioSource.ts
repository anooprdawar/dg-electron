import { spawn } from "node:child_process";
import { AudioProcess } from "./AudioProcess.js";
import { resolveBinaryPath } from "../util/binary.js";
import { resolveAudioLevels } from "./audioLevelPresets.js";
import type { MicOptions, AudioLevelsConfig } from "../types.js";

const BINARY_NAME = "dg-mic-audio";

export class MicAudioSource extends AudioProcess {
  constructor(
    options: MicOptions = {},
    logLevel?: "debug" | "info" | "warn" | "error" | "silent",
    audioLevels?: AudioLevelsConfig
  ) {
    const args: string[] = [];

    const sampleRate = options.sampleRate ?? 16000;
    args.push("--sample-rate", String(sampleRate));

    const chunkDuration = options.chunkDurationMs ?? 200;
    args.push("--chunk-duration", String(chunkDuration));

    if (options.deviceId) {
      args.push("--device-id", options.deviceId);
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

  /** List available input devices */
  static async listDevices(
    _logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(resolveBinaryPath(BINARY_NAME), ["--list-devices"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout!.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Failed to list devices (exit code ${code})`));
        }
      });

      proc.on("error", reject);
    });
  }
}
