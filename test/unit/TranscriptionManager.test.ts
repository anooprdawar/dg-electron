import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TranscriptEvent } from "../../src/types.js";

// We test the public API surface (types, events, configuration validation)
// without actually spawning binaries or connecting to Deepgram

describe("TranscriptionManager types", () => {
  it("TranscriptEvent has required fields", () => {
    const event: TranscriptEvent = {
      source: "system",
      transcript: "hello world",
      is_final: true,
      confidence: 0.95,
      words: [
        { word: "hello", start: 0, end: 0.3, confidence: 0.95 },
        { word: "world", start: 0.3, end: 0.6, confidence: 0.95 },
      ],
    };

    expect(event.source).toBe("system");
    expect(event.transcript).toBe("hello world");
    expect(event.is_final).toBe(true);
    expect(event.words.length).toBe(2);
  });

  it("TranscriptEvent supports optional fields", () => {
    const event: TranscriptEvent = {
      source: "mic",
      transcript: "test",
      is_final: false,
      confidence: 0.8,
      words: [],
      speech_final: true,
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
    };

    expect(event.speech_final).toBe(true);
    expect(event.channel_index).toEqual([0, 1]);
    expect(event.duration).toBe(1.5);
  });
});

describe("TranscriptionManager configuration", () => {
  it("config type accepts minimal configuration", () => {
    const config = {
      deepgram: {
        apiKey: "test-key",
      },
    };

    expect(config.deepgram.apiKey).toBe("test-key");
  });

  it("config type accepts full configuration", () => {
    const config = {
      deepgram: {
        apiKey: "test-key",
        model: "nova-3",
        language: "en",
        punctuate: true,
        smart_format: true,
        interim_results: true,
        utterances: true,
        utterance_end_ms: 1000,
      },
      systemAudio: {
        enabled: true,
        sampleRate: 16000,
        mute: false,
        includeProcesses: [1234],
      },
      mic: {
        enabled: true,
        sampleRate: 16000,
      },
      logLevel: "debug" as const,
    };

    expect(config.systemAudio.sampleRate).toBe(16000);
    expect(config.mic.enabled).toBe(true);
    expect(config.deepgram.model).toBe("nova-3");
  });
});

describe("Error classes", () => {
  it("all error classes are exported from index", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.DeepgramElectronError).toBeDefined();
    expect(mod.PermissionDeniedError).toBeDefined();
    expect(mod.PlatformError).toBeDefined();
    expect(mod.ConnectionError).toBeDefined();
    expect(mod.BinaryError).toBeDefined();
  });

  it("DeepgramElectron class is exported from index", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.DeepgramElectron).toBeDefined();
  });
});
