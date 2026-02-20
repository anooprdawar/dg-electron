# @deepgram/electron

Live system audio + microphone transcription for Electron apps on macOS. Uses Core Audio Taps (macOS 14+) and the Deepgram streaming API.

## Features

- Capture **system audio** (all apps or specific processes) via Core Audio Taps
- Capture **microphone** input via AVAudioEngine
- Real-time **transcription** powered by Deepgram Nova-3
- Labeled transcript events (`system` / `mic`)
- Zero native build step for consumers (prebuilt universal macOS binaries)
- Single runtime dependency (`ws`)

## Requirements

- macOS 14.2+ (Sonoma)
- Node.js 18+
- Electron 28+ (optional - works in plain Node.js too)
- [Deepgram API key](https://console.deepgram.com/)

## Installation

```bash
npm install @deepgram/electron
```

## Quick Start

```typescript
import { DeepgramElectron } from "@deepgram/electron";

const dg = new DeepgramElectron({
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY!,
  },
});

dg.on("transcript", (event) => {
  const prefix = event.source === "system" ? "[System]" : "[Mic]";
  if (event.is_final) {
    console.log(`${prefix} ${event.transcript}`);
  }
});

dg.on("error", (err) => {
  console.error("Error:", err);
});

await dg.start();

// Stop after 30 seconds
setTimeout(() => dg.stop(), 30000);
```

## API

### `new DeepgramElectron(config)`

Create a new transcription manager.

```typescript
const dg = new DeepgramElectron({
  deepgram: {
    apiKey: "your-api-key",
    model: "nova-3",         // default: "nova-3"
    language: "en",          // default: "en"
    punctuate: true,         // default: true
    smart_format: true,      // default: true
    interim_results: true,   // default: true
    utterances: true,        // optional
    utterance_end_ms: 1000,  // optional
  },
  systemAudio: {
    enabled: true,           // default: true
    sampleRate: 16000,       // default: 16000
    mute: false,             // default: false
    // includeProcesses: [pid],  // optional: capture specific apps
    // excludeProcesses: [pid],  // optional: exclude specific apps
  },
  mic: {
    enabled: true,           // default: true
    sampleRate: 16000,       // default: 16000
  },
  logLevel: "warn",          // "debug" | "info" | "warn" | "error" | "silent"
});
```

### `dg.start(): Promise<void>`

Start capturing audio and transcribing.

### `dg.stop(): Promise<void>`

Stop all capture and transcription.

### `dg.isRunning: boolean`

Whether transcription is currently active.

### Events

```typescript
// All transcripts (system + mic)
dg.on("transcript", (event) => {
  event.source;      // "system" | "mic"
  event.transcript;  // string
  event.is_final;    // boolean
  event.confidence;  // number (0-1)
  event.words;       // Array<{ word, start, end, confidence }>
});

// Source-specific transcripts
dg.on("system_transcript", (event) => { /* system audio only */ });
dg.on("mic_transcript", (event) => { /* mic only */ });

// Utterance boundaries
dg.on("utterance_end", (event) => {
  event.source;         // "system" | "mic"
  event.last_word_end;  // number | undefined
});

// Lifecycle
dg.on("started", () => { /* all streams active */ });
dg.on("stopped", () => { /* all streams stopped */ });
dg.on("error", (err) => { /* handle errors */ });
```

### `DeepgramElectron.checkPermissions(): Promise<PermissionResult>`

Check audio capture permissions without starting transcription.

```typescript
const perms = await DeepgramElectron.checkPermissions();
// { systemAudio: "granted"|"denied"|"unknown", microphone: "granted"|"denied"|"unknown" }
```

## Permissions

See [ENTITLEMENTS.md](./ENTITLEMENTS.md) for detailed setup instructions.

**TL;DR:** Your Electron app needs:
1. Code signing (even ad-hoc for development)
2. `NSMicrophoneUsageDescription` in Info.plist
3. Native binaries in `extraResources` (for packaged apps)

## Architecture

Two prebuilt Swift binaries capture audio and pipe PCM to stdout. The TypeScript layer spawns these binaries, pipes PCM to direct WebSocket connections to Deepgram, and emits labeled transcript events.

```
Swift binary (stdout: PCM) → Node.js → WebSocket → Deepgram → transcript events
```

This design provides:
- **Zero build step**: No native addons to compile
- **Crash isolation**: Binary crashes don't bring down Electron
- **CLI testable**: Binaries work standalone for debugging

## License

MIT
