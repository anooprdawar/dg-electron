import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAudioBinary, createMockSpawn } from "../mocks/MockAudioBinary.js";
import { BinaryError, PermissionDeniedError } from "../../src/errors.js";

let mockBinary: MockAudioBinary;

vi.mock("node:child_process", () => {
  return {
    spawn: (...args: any[]) => {
      // Delegate to the current mockBinary via createMockSpawn
      return mockBinary as any;
    },
    // Re-export the ChildProcess type placeholder
    ChildProcess: class {},
  };
});

// Import AudioProcess AFTER the mock is set up
import { AudioProcess } from "../../src/audio/AudioProcess.js";

describe("AudioProcess", () => {
  beforeEach(() => {
    mockBinary = new MockAudioBinary();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts and resolves when ready message received", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: ["--sample-rate", "16000"],
      name: "test-audio",
      logLevel: "silent",
    });

    const startPromise = proc.start();

    // Simulate binary sending ready message
    setTimeout(() => mockBinary.emitReady(), 10);

    const readyMsg = await startPromise;
    expect(readyMsg.type).toBe("ready");
    expect(readyMsg.sampleRate).toBe(16000);
    expect(proc.isRunning).toBe(true);
  });

  it("emits data events when binary sends PCM on stdout", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      logLevel: "silent",
    });

    const chunks: Buffer[] = [];
    proc.on("data", (chunk) => chunks.push(chunk));

    const startPromise = proc.start();
    setTimeout(() => {
      mockBinary.emitReady();
      mockBinary.emitPCMData(640);
    }, 10);

    await startPromise;

    // Wait for PCM data to arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].length).toBe(640);
  });

  it("rejects with PermissionDeniedError on PERMISSION_DENIED", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "system-audio-test",
      logLevel: "silent",
    });

    const startPromise = proc.start();
    setTimeout(() => {
      mockBinary.emitError("PERMISSION_DENIED", "Not granted");
    }, 10);

    await expect(startPromise).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("rejects with BinaryError on non-permission error", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      logLevel: "silent",
    });

    const startPromise = proc.start();
    setTimeout(() => {
      mockBinary.emitError("CAPTURE_ERROR", "Device not found");
    }, 10);

    await expect(startPromise).rejects.toBeInstanceOf(BinaryError);
  });

  it("rejects when binary exits before ready", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      logLevel: "silent",
    });

    const startPromise = proc.start();
    setTimeout(() => mockBinary.simulateExit(1), 10);

    await expect(startPromise).rejects.toBeInstanceOf(BinaryError);
  });

  it("rejects on ready timeout", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      readyTimeoutMs: 50,
      logLevel: "silent",
    });

    // Never send ready message
    await expect(proc.start()).rejects.toThrow("ready message");
  });

  it("emits audio_level events from stderr", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      logLevel: "silent",
    });

    const levels: any[] = [];
    proc.on("audio_level", (msg: any) => levels.push(msg));

    const startPromise = proc.start();
    setTimeout(() => {
      mockBinary.emitReady();
      setTimeout(() => {
        mockBinary.emitAudioLevel({ rms: 0.5, peak: 0.8, fft: [{ freq: 125, magnitude: 0.4 }], timestamp: 123 });
      }, 10);
    }, 10);

    await startPromise;
    await new Promise((r) => setTimeout(r, 100));

    expect(levels.length).toBe(1);
    expect(levels[0].rms).toBe(0.5);
    expect(levels[0].fft[0].freq).toBe(125);
  });

  it("stops gracefully with SIGTERM", async () => {
    const proc = new AudioProcess({
      binaryPath: "/fake/binary",
      args: [],
      name: "test-audio",
      logLevel: "silent",
    });

    const startPromise = proc.start();
    setTimeout(() => mockBinary.emitReady(), 10);
    await startPromise;

    const stopPromise = proc.stop();
    expect(proc.isRunning).toBe(false);
    await stopPromise;
  });
});
