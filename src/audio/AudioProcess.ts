import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { BinaryMessage } from "../types.js";
import { BinaryError, PermissionDeniedError } from "../errors.js";
import { Logger } from "../util/logger.js";

export interface AudioProcessOptions {
  binaryPath: string;
  args: string[];
  name: string;
  readyTimeoutMs?: number;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}

export interface AudioProcessEvents {
  data: (chunk: Buffer) => void;
  ready: (message: BinaryMessage) => void;
  error: (error: Error) => void;
  exit: (code: number | null, signal: string | null) => void;
}

/**
 * Manages a child process that captures audio and streams PCM via stdout.
 * Parses stderr for JSON control messages (ready, error, stopped).
 */
export class AudioProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private readonly options: AudioProcessOptions;
  private readonly logger: Logger;
  private stderrBuffer = "";
  private stopping = false;

  constructor(options: AudioProcessOptions) {
    super();
    this.options = options;
    this.logger = new Logger(options.name, options.logLevel);
  }

  /** Start the binary and wait for the ready message */
  async start(): Promise<BinaryMessage> {
    if (this.process) {
      throw new BinaryError(this.options.name, "Process already running");
    }

    return new Promise<BinaryMessage>((resolve, reject) => {
      const timeoutMs = this.options.readyTimeoutMs ?? 10000;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.kill();
          reject(
            new BinaryError(
              this.options.name,
              `Binary did not send ready message within ${timeoutMs}ms`
            )
          );
        }
      }, timeoutMs);

      this.logger.debug("Spawning:", this.options.binaryPath, this.options.args);

      const child = spawn(this.options.binaryPath, this.options.args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.process = child;

      child.stdout!.on("data", (chunk: Buffer) => {
        this.emit("data", chunk);
      });

      child.stderr!.on("data", (data: Buffer) => {
        this.stderrBuffer += data.toString();
        this.processStderrMessages((message) => {
          this.logger.debug("Stderr message:", message);

          if (message.type === "ready" && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.emit("ready", message);
            resolve(message);
          } else if (message.type === "error") {
            const error =
              message.code === "PERMISSION_DENIED"
                ? new PermissionDeniedError(
                    this.options.name.includes("system")
                      ? "system_audio"
                      : "microphone",
                    message.message
                  )
                : new BinaryError(
                    this.options.name,
                    message.message ?? "Unknown binary error"
                  );

            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(error);
            } else {
              this.emit("error", error);
            }
          }
        });
      });

      child.on("error", (err) => {
        this.logger.error("Process error:", err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new BinaryError(this.options.name, err.message));
        } else {
          this.emit("error", new BinaryError(this.options.name, err.message));
        }
      });

      child.on("exit", (code, signal) => {
        this.logger.debug(`Process exited: code=${code}, signal=${signal}`);
        this.process = null;

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(
            new BinaryError(
              this.options.name,
              `Process exited before ready (code: ${code}, signal: ${signal})`,
              code ?? undefined
            )
          );
        }

        this.emit("exit", code, signal);
      });
    });
  }

  /** Gracefully stop the binary (SIGTERM, then SIGKILL after timeout) */
  async stop(): Promise<void> {
    if (!this.process || this.stopping) return;
    this.stopping = true;

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        this.logger.warn("Process did not exit after SIGTERM, sending SIGKILL");
        this.process?.kill("SIGKILL");
      }, 3000);

      this.process!.once("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        this.stopping = false;
        resolve();
      });

      this.process!.kill("SIGTERM");
    });
  }

  /** Force kill immediately */
  kill(): void {
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
    }
  }

  get isRunning(): boolean {
    return this.process !== null && !this.stopping;
  }

  private processStderrMessages(handler: (message: BinaryMessage) => void): void {
    const lines = this.stderrBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.stderrBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as BinaryMessage;
        handler(message);
      } catch {
        this.logger.debug("Non-JSON stderr:", trimmed);
      }
    }
  }
}
