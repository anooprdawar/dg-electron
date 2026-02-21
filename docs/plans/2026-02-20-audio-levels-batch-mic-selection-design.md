# Design: Audio Levels, Batch API, Mic Selection

**Date:** 2026-02-20
**Status:** Approved

## Summary

Three features for dg-electron:

1. **Audio level feedback** — RMS, peak, and FFT computed in Swift binaries, emitted as events for visualizations (spectrograms, VU meters, waveforms)
2. **Deepgram batch mode** — developer chooses `streaming` or `batch` at init; batch accumulates audio then POSTs to Deepgram's pre-recorded API on `stop()`
3. **Mic selection** — enumerate available input devices and select one by ID

---

## Feature A: Audio Level Feedback

### Architecture

Audio analysis happens in the Swift binaries (both `dg-system-audio` and `dg-mic-audio`), using Apple's Accelerate framework for FFT. Metrics are sent as JSON over stderr alongside existing control messages.

### Swift Changes

**New file: `Shared/AudioAnalyzer.swift`**

Computes per-chunk:
- **RMS** (root mean square) — normalized 0–1
- **Peak** amplitude — normalized 0–1
- **FFT** — magnitude bins via vDSP, with Hanning window function

Called on each audio buffer before writing PCM to stdout. Configurable via CLI args:
- `--enable-levels` — turns on audio level emission (off by default, zero overhead when disabled)
- `--level-interval-ms <ms>` — emission interval (default depends on preset)
- `--fft-bins <n>` — number of FFT bins (default 128)

### Stderr Message Format

```json
{
  "type": "audio_level",
  "rms": 0.42,
  "peak": 0.87,
  "fft": [{"freq": 125, "magnitude": 0.4}, {"freq": 187.5, "magnitude": 0.6}],
  "timestamp": 1234567890.123
}
```

The `ready` message is extended to include frequency band metadata:
```json
{
  "type": "ready",
  "sampleRate": 16000,
  "channels": 1,
  "bitDepth": 16,
  "frequencyBands": [0, 62.5, 125, 187.5, ...]
}
```

### Presets

| Preset | FFT Bins | Interval | Use Case |
|--------|----------|----------|----------|
| `spectrogram` | 128 | 50ms | Spectrogram visualizations |
| `vu-meter` | 0 (none) | 100ms | Simple volume meters (RMS + peak only) |
| `waveform` | 0 (none) | 20ms | High-rate RMS for waveform drawing |
| custom | configurable | configurable | Developer specifies all values |

### TypeScript API

**Config:**
```typescript
audioLevels: { preset: "spectrogram" }
// or
audioLevels: { enabled: true, fftBins: 256, intervalMs: 30 }
```

**Event:**
```typescript
dg.on("audio_level", (event: AudioLevelEvent) => { ... })

interface AudioLevelEvent {
  source: "system" | "mic"
  rms: number       // 0–1
  peak: number      // 0–1
  fft: { freq: number; magnitude: number }[]
  timestamp: number
}
```

---

## Feature B: Deepgram Batch (Pre-recorded) API

### Architecture

When `mode: "batch"`, audio capture works identically (same Swift binaries, same PCM flow). The difference is on the TypeScript side — instead of streaming PCM over a WebSocket, chunks accumulate in memory (or a temp file for large recordings). On `stop()`, the audio is POSTed to Deepgram's REST API.

### Config

```typescript
const dg = new DeepgramElectron({
  mode: "streaming" | "batch",  // default: "streaming"
  deepgram: { apiKey, model, language, ... },
  // ... rest unchanged
});
```

### New Class: `DeepgramBatch.ts`

- Accumulates PCM chunks in a Buffer (recordings < 50MB) or temp file (larger)
- On `transcribe()`: POSTs to `POST /v1/listen` with `Content-Type: audio/raw` and encoding/sample-rate query params
- Maps Deepgram pre-recorded response to same `TranscriptEvent` shape
- Same Deepgram options apply (model, language, punctuate, smart_format, etc.)

### Event API (same interface as streaming)

```typescript
// Works identically in both modes
dg.on("transcript", (event: TranscriptEvent) => { ... })

// Batch-specific progress
dg.on("batch_progress", (event: BatchProgressEvent) => { ... })

interface BatchProgressEvent {
  phase: "recording" | "uploading" | "processing"
  bytesRecorded?: number
}
```

### Behavior

- `start()` — begins audio capture, audio levels emit in real-time if enabled
- `stop()` — stops capture, uploads audio, emits transcript(s) with `is_final: true`
- No audio captured → error, no API call
- Network failure on upload → error event
- Long recordings → temp file to avoid memory pressure

---

## Feature C: Mic Selection

### Swift Changes (`dg-mic-audio`)

**New CLI commands:**
- `--list-devices` — enumerates input devices via `AVCaptureDevice.DiscoverySession`, outputs JSON to stdout, exits
- `--device-id <id>` — selects a specific input device instead of system default

**Device enumeration output:**
```json
[
  {"id": "AppleHDAEngineInput:1B,0,1,0:1", "name": "MacBook Pro Microphone", "isDefault": true},
  {"id": "0x1234abcd", "name": "Blue Yeti", "isDefault": false}
]
```

**Device selection:** Set audio input device on `AVAudioEngine` via Core Audio `AudioHardware` API.

### TypeScript API

**Static method:**
```typescript
const devices = await DeepgramElectron.listInputDevices();
// InputDevice[]
```

**Config:**
```typescript
const dg = new DeepgramElectron({
  mic: { enabled: true, deviceId: "0x1234abcd" },
  // ...
});
```

**Types:**
```typescript
interface InputDevice {
  id: string
  name: string
  isDefault: boolean
}
```

### Edge Cases

- Device ID not found → error with available devices listed
- Device disconnected mid-capture → error event (same as existing capture error flow)
- No `deviceId` specified → system default (backward compatible)
