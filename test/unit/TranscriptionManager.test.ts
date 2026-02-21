import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  TranscriptEvent,
  AudioLevelEvent,
  InputDevice,
  BatchProgressEvent,
  DeepgramElectronConfig,
  AudioLevelsConfig,
  TranscriptionMode,
  FFTBin,
} from "../../src/types.js";

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

describe("AudioLevelEvent type", () => {
  it("AudioLevelEvent has required fields", () => {
    const event: AudioLevelEvent = {
      source: "mic",
      rms: 0.5,
      peak: 0.9,
      fft: [
        { freq: 440, magnitude: 0.8 },
        { freq: 880, magnitude: 0.3 },
      ],
      timestamp: Date.now(),
    };

    expect(event.source).toBe("mic");
    expect(event.rms).toBe(0.5);
    expect(event.peak).toBe(0.9);
    expect(event.fft.length).toBe(2);
    expect(event.fft[0].freq).toBe(440);
    expect(event.fft[0].magnitude).toBe(0.8);
    expect(typeof event.timestamp).toBe("number");
  });
});

describe("InputDevice type", () => {
  it("InputDevice has required fields", () => {
    const device: InputDevice = {
      id: "device-1",
      name: "Built-in Microphone",
      isDefault: true,
    };

    expect(device.id).toBe("device-1");
    expect(device.name).toBe("Built-in Microphone");
    expect(device.isDefault).toBe(true);
  });
});

describe("BatchProgressEvent type", () => {
  it("BatchProgressEvent has required fields", () => {
    const event: BatchProgressEvent = {
      phase: "recording",
    };

    expect(event.phase).toBe("recording");
    expect(event.bytesRecorded).toBeUndefined();
  });

  it("BatchProgressEvent supports optional bytesRecorded", () => {
    const event: BatchProgressEvent = {
      phase: "uploading",
      bytesRecorded: 1024000,
    };

    expect(event.phase).toBe("uploading");
    expect(event.bytesRecorded).toBe(1024000);
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

  it("config accepts mode and audioLevels", () => {
    const config: DeepgramElectronConfig = {
      deepgram: {
        apiKey: "test-key",
      },
      mode: "batch",
      audioLevels: {
        preset: "spectrogram",
        enabled: true,
        fftBins: 64,
        intervalMs: 50,
      },
    };

    expect(config.mode).toBe("batch");
    expect(config.audioLevels?.preset).toBe("spectrogram");
    expect(config.audioLevels?.enabled).toBe(true);
    expect(config.audioLevels?.fftBins).toBe(64);
    expect(config.audioLevels?.intervalMs).toBe(50);
  });

  it("config accepts mic deviceId", () => {
    const config: DeepgramElectronConfig = {
      deepgram: {
        apiKey: "test-key",
      },
      mic: {
        enabled: true,
        deviceId: "custom-device-id",
      },
    };

    expect(config.mic?.deviceId).toBe("custom-device-id");
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
