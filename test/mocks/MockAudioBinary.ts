import { ChildProcess } from "node:child_process";
import { EventEmitter, Readable, Writable } from "node:stream";

/**
 * Mock audio binary that simulates a Swift binary's behavior.
 * Emits a ready message on stderr and PCM data on stdout.
 */
export class MockAudioBinary extends EventEmitter {
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly stdin: Writable;
  readonly pid = Math.floor(Math.random() * 100000);

  private _killed = false;
  private pcmInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.stdout = new Readable({ read() {} });
    this.stderr = new Readable({ read() {} });
    this.stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  }

  get killed(): boolean {
    return this._killed;
  }

  /** Simulate the binary becoming ready */
  emitReady(options: {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
    chunkDurationMs?: number;
  } = {}): void {
    const message = JSON.stringify({
      type: "ready",
      sampleRate: options.sampleRate ?? 16000,
      channels: options.channels ?? 1,
      bitDepth: options.bitDepth ?? 16,
      chunkDurationMs: options.chunkDurationMs ?? 200,
    });
    this.stderr.push(message + "\n");
  }

  /** Simulate an error message */
  emitError(code: string, message: string): void {
    const msg = JSON.stringify({ type: "error", code, message });
    this.stderr.push(msg + "\n");
  }

  /** Simulate sending PCM data */
  emitPCMData(bytes?: number): void {
    const size = bytes ?? 6400; // 200ms of 16kHz 16-bit mono
    const buffer = Buffer.alloc(size);
    // Fill with a simple sine wave pattern for realism
    for (let i = 0; i < size / 2; i++) {
      const sample = Math.floor(Math.sin(i * 0.1) * 1000);
      buffer.writeInt16LE(sample, i * 2);
    }
    this.stdout.push(buffer);
  }

  /** Start emitting PCM data at regular intervals */
  startPCMStream(intervalMs = 200, bytesPerChunk = 6400): void {
    this.pcmInterval = setInterval(() => {
      if (!this._killed) {
        this.emitPCMData(bytesPerChunk);
      }
    }, intervalMs);
  }

  /** Stop the PCM stream */
  stopPCMStream(): void {
    if (this.pcmInterval) {
      clearInterval(this.pcmInterval);
      this.pcmInterval = null;
    }
  }

  /** Simulate process kill */
  kill(signal?: string): boolean {
    if (this._killed) return false;
    this._killed = true;
    this.stopPCMStream();

    // Emit exit event asynchronously
    process.nextTick(() => {
      this.emit("exit", signal === "SIGKILL" ? null : 0, signal ?? "SIGTERM");
      this.emit("close", signal === "SIGKILL" ? null : 0, signal ?? "SIGTERM");
    });

    return true;
  }

  /** Simulate normal exit */
  simulateExit(code = 0): void {
    this._killed = true;
    this.stopPCMStream();
    this.stdout.push(null);
    this.stderr.push(null);

    process.nextTick(() => {
      this.emit("exit", code, null);
      this.emit("close", code, null);
    });
  }
}

/**
 * Create a mock spawn function that returns a MockAudioBinary.
 * Use this to replace child_process.spawn in tests.
 */
export function createMockSpawn(
  mock: MockAudioBinary
): (command: string, args: string[], options: unknown) => ChildProcess {
  return (_command: string, _args: string[], _options: unknown) => {
    return mock as unknown as ChildProcess;
  };
}
