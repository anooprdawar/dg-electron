# Audio Levels, Batch API, Mic Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add audio level feedback (RMS/peak/FFT with presets), Deepgram batch API mode, and mic device selection to dg-electron.

**Architecture:** Three independent features layered onto existing subprocess architecture. Audio analysis computed in Swift binaries via Accelerate framework, sent over stderr. Batch mode accumulates PCM in Node.js then POSTs to Deepgram REST API. Mic selection adds device enumeration/selection CLI args to dg-mic-audio.

**Tech Stack:** Swift 5.9 (Accelerate/vDSP for FFT), TypeScript, Node.js (https for batch REST), vitest for tests.

---

## Task 1: Add new types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`
- Test: `test/unit/TranscriptionManager.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/TranscriptionManager.test.ts`:

```typescript
it("AudioLevelEvent has required fields", () => {
  const event: AudioLevelEvent = {
    source: "system",
    rms: 0.42,
    peak: 0.87,
    fft: [{ freq: 125, magnitude: 0.4 }],
    timestamp: 1234567890.123,
  };
  expect(event.rms).toBe(0.42);
  expect(event.fft[0].freq).toBe(125);
});

it("InputDevice has required fields", () => {
  const device: InputDevice = {
    id: "abc123",
    name: "MacBook Pro Microphone",
    isDefault: true,
  };
  expect(device.id).toBe("abc123");
  expect(device.isDefault).toBe(true);
});

it("BatchProgressEvent has required fields", () => {
  const event: BatchProgressEvent = {
    phase: "uploading",
    bytesRecorded: 1024,
  };
  expect(event.phase).toBe("uploading");
});

it("config accepts mode and audioLevels", () => {
  const config: DeepgramElectronConfig = {
    deepgram: { apiKey: "test" },
    mode: "batch",
    audioLevels: { preset: "spectrogram" },
  };
  expect(config.mode).toBe("batch");
});
```

Import the new types at the top of the test file.

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/TranscriptionManager.test.ts`
Expected: FAIL — types don't exist yet.

**Step 3: Write the types**

Add to `src/types.ts`:

```typescript
/** FFT frequency bin with labeled frequency */
export interface FFTBin {
  freq: number;
  magnitude: number;
}

/** Audio level event for visualizations */
export interface AudioLevelEvent {
  source: AudioSource;
  rms: number;
  peak: number;
  fft: FFTBin[];
  timestamp: number;
}

/** Available audio input device */
export interface InputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Batch transcription progress */
export interface BatchProgressEvent {
  phase: "recording" | "uploading" | "processing";
  bytesRecorded?: number;
}

/** Audio level configuration presets */
export type AudioLevelPreset = "spectrogram" | "vu-meter" | "waveform";

/** Audio level configuration */
export interface AudioLevelsConfig {
  /** Use a preset (overrides other settings) */
  preset?: AudioLevelPreset;
  /** Enable audio levels (default: false) */
  enabled?: boolean;
  /** Number of FFT bins (default: 128) */
  fftBins?: number;
  /** Emission interval in ms (default: 50) */
  intervalMs?: number;
}

/** Transcription mode */
export type TranscriptionMode = "streaming" | "batch";
```

Update `MicOptions` — add `deviceId`:

```typescript
export interface MicOptions {
  enabled?: boolean;
  sampleRate?: number;
  chunkDurationMs?: number;
  /** Specific input device ID (from listInputDevices). Default: system default */
  deviceId?: string;
}
```

Update `DeepgramElectronConfig` — add `mode` and `audioLevels`:

```typescript
export interface DeepgramElectronConfig {
  deepgram: DeepgramOptions;
  /** Transcription mode (default: "streaming") */
  mode?: TranscriptionMode;
  systemAudio?: SystemAudioOptions;
  mic?: MicOptions;
  /** Audio level feedback for visualizations */
  audioLevels?: AudioLevelsConfig;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}
```

Update `DeepgramElectronEvents` — add new events:

```typescript
export interface DeepgramElectronEvents {
  transcript: (event: TranscriptEvent) => void;
  system_transcript: (event: TranscriptEvent) => void;
  mic_transcript: (event: TranscriptEvent) => void;
  utterance_end: (event: UtteranceEndEvent) => void;
  audio_level: (event: AudioLevelEvent) => void;
  batch_progress: (event: BatchProgressEvent) => void;
  started: () => void;
  stopped: () => void;
  error: (error: Error) => void;
}
```

Update `BinaryMessage` to include `audio_level` type:

```typescript
export interface BinaryMessage {
  type: "ready" | "error" | "stopped" | "audio_level";
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  chunkDurationMs?: number;
  frequencyBands?: number[];
  code?: string;
  message?: string;
  reason?: string;
  // audio_level fields
  rms?: number;
  peak?: number;
  fft?: { freq: number; magnitude: number }[];
  timestamp?: number;
}
```

Update `src/index.ts` to export new types.

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/TranscriptionManager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/index.ts test/unit/TranscriptionManager.test.ts
git commit -m "feat: add types for audio levels, batch API, and mic selection"
```

---

## Task 2: Swift — Create `AudioAnalyzer.swift` in Shared

**Files:**
- Create: `native/Sources/Shared/AudioAnalyzer.swift`

This computes RMS, peak, and FFT using the Accelerate framework's vDSP.

**Step 1: Write AudioAnalyzer.swift**

```swift
import Foundation
import Accelerate

/// Computes audio level metrics (RMS, peak, FFT) from PCM audio buffers.
/// Uses Apple's Accelerate framework (vDSP) for efficient signal processing.
public final class AudioAnalyzer {
    private let fftBins: Int
    private let sampleRate: Float64
    private let intervalMs: Int
    private let frequencyBands: [Double]

    // FFT setup (reused across calls)
    private let fftSetup: vDSP_DFTSetup?
    private let fftLength: Int

    // Timing
    private var lastEmitTime: TimeInterval = 0

    public init(sampleRate: Float64, fftBins: Int, intervalMs: Int) {
        self.sampleRate = sampleRate
        self.fftBins = fftBins
        self.intervalMs = intervalMs

        // FFT length must be power of 2, at least 2x fftBins
        self.fftLength = fftBins > 0 ? fftBins * 2 : 0

        if fftBins > 0 {
            self.fftSetup = vDSP_DFT_zop_CreateSetup(
                nil,
                vDSP_Length(fftLength),
                .FORWARD
            )
        } else {
            self.fftSetup = nil
        }

        // Precompute frequency bands
        if fftBins > 0 {
            let binWidth = sampleRate / Double(fftLength)
            self.frequencyBands = (0..<fftBins).map { Double($0) * binWidth }
        } else {
            self.frequencyBands = []
        }
    }

    deinit {
        if let setup = fftSetup {
            vDSP_DFT_DestroySetup(setup)
        }
    }

    /// Get precomputed frequency bands for the ready message
    public func getFrequencyBands() -> [Double] {
        return frequencyBands
    }

    /// Analyze a buffer of Int16 PCM samples.
    /// Returns nil if not enough time has elapsed since last emission.
    public func analyze(samples: UnsafePointer<Int16>, count: Int) -> AudioLevelResult? {
        let now = ProcessInfo.processInfo.systemUptime
        let elapsedMs = (now - lastEmitTime) * 1000.0
        guard elapsedMs >= Double(intervalMs) || lastEmitTime == 0 else {
            return nil
        }
        lastEmitTime = now

        // Convert Int16 to Float for analysis
        var floatSamples = [Float](repeating: 0, count: count)
        var scale = Float(1.0 / 32768.0)
        vDSP_vflt16(samples, 1, &floatSamples, 1, vDSP_Length(count))
        vDSP_vsmul(floatSamples, 1, &scale, &floatSamples, 1, vDSP_Length(count))

        // RMS
        var rms: Float = 0
        vDSP_rmsqv(floatSamples, 1, &rms, vDSP_Length(count))

        // Peak (absolute max)
        var peak: Float = 0
        vDSP_maxmgv(floatSamples, 1, &peak, vDSP_Length(count))

        // FFT
        var fftResult: [(freq: Double, magnitude: Double)] = []
        if fftBins > 0, let setup = fftSetup, count >= fftLength {
            fftResult = computeFFT(samples: floatSamples, setup: setup)
        }

        return AudioLevelResult(
            rms: Double(min(rms, 1.0)),
            peak: Double(min(peak, 1.0)),
            fft: fftResult,
            timestamp: now
        )
    }

    private func computeFFT(samples: [Float], setup: vDSP_DFTSetup) -> [(freq: Double, magnitude: Double)] {
        // Apply Hanning window
        var windowed = [Float](repeating: 0, count: fftLength)
        var window = [Float](repeating: 0, count: fftLength)
        vDSP_hann_window(&window, vDSP_Length(fftLength), Int32(vDSP_HANN_NORM))

        // Use only the last fftLength samples
        let offset = max(0, samples.count - fftLength)
        for i in 0..<fftLength {
            windowed[i] = samples[offset + i] * window[i]
        }

        // Split into real and imaginary parts for DFT
        var realInput = windowed
        var imagInput = [Float](repeating: 0, count: fftLength)
        var realOutput = [Float](repeating: 0, count: fftLength)
        var imagOutput = [Float](repeating: 0, count: fftLength)

        vDSP_DFT_Execute(setup, &realInput, &imagInput, &realOutput, &imagOutput)

        // Compute magnitudes for first half (positive frequencies)
        let binWidth = sampleRate / Double(fftLength)
        var result: [(freq: Double, magnitude: Double)] = []
        result.reserveCapacity(fftBins)

        for i in 0..<fftBins {
            let real = Double(realOutput[i])
            let imag = Double(imagOutput[i])
            let magnitude = sqrt(real * real + imag * imag) / Double(fftLength)
            let freq = Double(i) * binWidth
            result.append((freq: freq, magnitude: min(magnitude, 1.0)))
        }

        return result
    }
}

/// Result of audio level analysis
public struct AudioLevelResult {
    public let rms: Double
    public let peak: Double
    public let fft: [(freq: Double, magnitude: Double)]
    public let timestamp: TimeInterval
}
```

**Step 2: Verify it compiles**

Run: `cd native && swift build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add native/Sources/Shared/AudioAnalyzer.swift
git commit -m "feat(swift): add AudioAnalyzer with RMS, peak, and FFT via Accelerate"
```

---

## Task 3: Swift — Add `audio_level` message to MessageProtocol

**Files:**
- Modify: `native/Sources/Shared/MessageProtocol.swift`

**Step 1: Add audio_level case to Message enum**

Add a new case and update `send()`:

```swift
case audioLevel(rms: Double, peak: Double, fft: [[String: Double]], timestamp: Double)
```

In the `send()` switch, add:

```swift
case .audioLevel(let rms, let peak, let fft, let timestamp):
    json = [
        "type": "audio_level",
        "rms": rms,
        "peak": peak,
        "fft": fft,
        "timestamp": timestamp
    ]
```

Also extend `ready` to accept optional `frequencyBands`:

```swift
case ready(sampleRate: Int, channels: Int, bitDepth: Int, chunkDurationMs: Int, frequencyBands: [Double]? = nil)
```

And in the ready case of `send()`, add:

```swift
if let bands = frequencyBands {
    json["frequencyBands"] = bands
}
```

**Step 2: Verify it compiles**

Run: `cd native && swift build 2>&1 | tail -5`
Expected: Build succeeds (update callers of `.ready` with default param).

**Step 3: Commit**

```bash
git add native/Sources/Shared/MessageProtocol.swift
git commit -m "feat(swift): add audio_level message type and frequencyBands to ready"
```

---

## Task 4: Swift — Wire AudioAnalyzer into MicCaptureEngine + main.swift

**Files:**
- Modify: `native/Sources/MicAudio/MicCaptureEngine.swift`
- Modify: `native/Sources/MicAudio/main.swift`

**Step 1: Add analyzer to MicCaptureEngine**

In `MicCaptureEngine`:
- Add optional `analyzer: AudioAnalyzer?` property
- Accept `enableLevels: Bool`, `fftBins: Int`, `levelIntervalMs: Int` in init
- Create `AudioAnalyzer` if levels enabled
- In the tap callback, after converting PCM, call `analyzer.analyze()` on the int16 samples
- If result is non-nil, send `Message.audioLevel(...)` over stderr

Key change in the tap callback (after `let data = Data(bytes: int16Data[0], count: byteCount)`):

```swift
if let analyzer = self.analyzer {
    let sampleCount = Int(convertedBuffer.frameLength)
    if let result = analyzer.analyze(samples: int16Data[0], count: sampleCount) {
        let fftData = result.fft.map { ["freq": $0.freq, "magnitude": $0.magnitude] }
        Message.audioLevel(
            rms: result.rms,
            peak: result.peak,
            fft: fftData,
            timestamp: result.timestamp
        ).send()
    }
}
```

**Step 2: Add CLI args to main.swift**

Add parsing for:
- `--enable-levels` (bool flag)
- `--level-interval-ms` (int)
- `--fft-bins` (int)

Pass to `MicCaptureEngine` init. When sending ready message, include `frequencyBands` if levels enabled.

**Step 3: Verify it compiles**

Run: `cd native && swift build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add native/Sources/MicAudio/
git commit -m "feat(swift): wire audio level analysis into mic capture"
```

---

## Task 5: Swift — Wire AudioAnalyzer into AudioTapManager + main.swift

**Files:**
- Modify: `native/Sources/SystemAudio/AudioTapManager.swift`
- Modify: `native/Sources/SystemAudio/main.swift`

**Step 1: Add analyzer to AudioTapManager**

Similar to mic: add optional `analyzer: AudioAnalyzer?`, accept config in init.

In the `ioBlock` callback, the PCM data is raw bytes. Need to interpret as Int16 and pass to analyzer:

```swift
// Inside the ioBlock, after writing PCM:
if let analyzer = analyzerRef {
    let int16Ptr = data.bindMemory(to: Int16.self, capacity: Int(buffer.mDataByteSize) / 2)
    let sampleCount = Int(buffer.mDataByteSize) / MemoryLayout<Int16>.size
    if let result = analyzer.analyze(samples: int16Ptr, count: sampleCount) {
        let fftData = result.fft.map { ["freq": $0.freq, "magnitude": $0.magnitude] }
        Message.audioLevel(
            rms: result.rms,
            peak: result.peak,
            fft: fftData,
            timestamp: result.timestamp
        ).send()
    }
}
```

Note: The analyzer reference must be captured in the ioBlock closure (use `let analyzerRef = self.analyzer` before the closure).

**Step 2: Add CLI args to SystemAudio/main.swift**

Same args as mic: `--enable-levels`, `--level-interval-ms`, `--fft-bins`.

**Step 3: Verify it compiles**

Run: `cd native && swift build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add native/Sources/SystemAudio/
git commit -m "feat(swift): wire audio level analysis into system audio capture"
```

---

## Task 6: Swift — Add device enumeration and selection to MicAudio

**Files:**
- Modify: `native/Sources/MicAudio/MicCaptureEngine.swift`
- Modify: `native/Sources/MicAudio/main.swift`

**Step 1: Add device enumeration**

Add to `MicCaptureEngine`:

```swift
struct AudioInputDevice {
    let id: String
    let name: String
    let isDefault: Bool
}

static func listDevices() -> [AudioInputDevice] {
    let defaultID = getDefaultInputDeviceID()

    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size)

    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceIDs)

    var devices: [AudioInputDevice] = []
    for deviceID in deviceIDs {
        // Check if device has input channels
        var inputAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var streamSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(deviceID, &inputAddress, 0, nil, &streamSize) == noErr else { continue }
        let bufferListData = UnsafeMutableRawPointer.allocate(byteCount: Int(streamSize), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { bufferListData.deallocate() }
        guard AudioObjectGetPropertyData(deviceID, &inputAddress, 0, nil, &streamSize, bufferListData) == noErr else { continue }
        let bufferList = bufferListData.assumingMemoryBound(to: AudioBufferList.self).pointee
        guard bufferList.mNumberBuffers > 0 else { continue }

        // Get device name
        var nameAddress = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var name: CFString = "" as CFString
        var nameSize = UInt32(MemoryLayout<CFString>.size)
        AudioObjectGetPropertyData(deviceID, &nameAddress, 0, nil, &nameSize, &name)

        // Get device UID
        var uidAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var uid: CFString = "" as CFString
        var uidSize = UInt32(MemoryLayout<CFString>.size)
        AudioObjectGetPropertyData(deviceID, &uidAddress, 0, nil, &uidSize, &uid)

        devices.append(AudioInputDevice(
            id: uid as String,
            name: name as String,
            isDefault: deviceID == defaultID
        ))
    }
    return devices
}

private static func getDefaultInputDeviceID() -> AudioDeviceID {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceID: AudioDeviceID = 0
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID)
    return deviceID
}
```

Note: This requires `import CoreAudio` in MicCaptureEngine.swift.

**Step 2: Add device selection**

Add `deviceId: String?` parameter to `MicCaptureEngine.init`. In `start()`, before creating the engine, if `deviceId` is set:

```swift
func start() throws {
    let engine = AVAudioEngine()
    self.audioEngine = engine

    // Select specific input device if requested
    if let deviceId = self.deviceId {
        let devices = MicCaptureEngine.listDevices()
        guard let _ = devices.first(where: { $0.id == deviceId }) else {
            throw NSError(domain: "MicCapture", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Device not found: \(deviceId). Available: \(devices.map { $0.name }.joined(separator: ", "))"])
        }
        try setInputDevice(engine: engine, uid: deviceId)
    }

    let inputNode = engine.inputNode
    // ... rest unchanged
}

private func setInputDevice(engine: AVAudioEngine, uid: String) throws {
    // Find the AudioDeviceID for this UID
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size)
    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceIDs)

    for deviceID in deviceIDs {
        var uidAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceUID: CFString = "" as CFString
        var uidSize = UInt32(MemoryLayout<CFString>.size)
        AudioObjectGetPropertyData(deviceID, &uidAddress, 0, nil, &uidSize, &deviceUID)

        if (deviceUID as String) == uid {
            // Set as input device via AudioUnit
            let audioUnit = engine.inputNode.audioUnit!
            var inputDeviceID = deviceID
            let status = AudioUnitSetProperty(
                audioUnit,
                kAudioOutputUnitProperty_CurrentDevice,
                kAudioUnitScope_Global,
                0,
                &inputDeviceID,
                UInt32(MemoryLayout<AudioDeviceID>.size)
            )
            guard status == noErr else {
                throw NSError(domain: "MicCapture", code: Int(status),
                    userInfo: [NSLocalizedDescriptionKey: "Failed to set input device (error \(status))"])
            }
            return
        }
    }
    throw NSError(domain: "MicCapture", code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Device UID not found: \(uid)"])
}
```

**Step 3: Add CLI args to main.swift**

Add parsing for:
- `--list-devices` — calls `MicCaptureEngine.listDevices()`, outputs JSON, exits
- `--device-id <id>` — passes to `MicCaptureEngine` init

For `--list-devices`:
```swift
case "--list-devices":
    let devices = MicCaptureEngine.listDevices()
    let jsonArray = devices.map { [
        "id": $0.id,
        "name": $0.name,
        "isDefault": $0.isDefault
    ] as [String: Any] }
    if let data = try? JSONSerialization.data(withJSONObject: jsonArray),
       let string = String(data: data, encoding: .utf8) {
        print(string)
    }
    exit(0)
```

**Step 4: Verify it compiles**

Run: `cd native && swift build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add native/Sources/MicAudio/
git commit -m "feat(swift): add device enumeration and selection to mic capture"
```

---

## Task 7: Swift — Build universal binaries

**Files:**
- Run: `native/scripts/build-universal.sh`

**Step 1: Build**

Run: `cd /Users/anoopdawar/dg-electron && npm run build:native`
Expected: Universal binaries built in `bin/`.

**Step 2: Verify**

Run: `lipo -archs bin/dg-mic-audio && lipo -archs bin/dg-system-audio`
Expected: `x86_64 arm64` for both.

**Step 3: Quick smoke test for --list-devices**

Run: `./bin/dg-mic-audio --list-devices`
Expected: JSON array of input devices.

**Step 4: Commit**

```bash
git add bin/dg-system-audio bin/dg-mic-audio
git commit -m "build: rebuild universal binaries with audio levels + mic selection"
```

---

## Task 8: TypeScript — Parse `audio_level` messages in AudioProcess

**Files:**
- Modify: `src/audio/AudioProcess.ts`
- Modify: `test/mocks/MockAudioBinary.ts`
- Test: `test/unit/AudioProcess.test.ts`

**Step 1: Write the failing test**

Add to `test/unit/AudioProcess.test.ts`:

```typescript
it("emits audio_level events from stderr", async () => {
  const proc = new AudioProcess({
    binaryPath: "/fake/binary",
    args: [],
    name: "test-audio",
    logLevel: "silent",
  });

  const levels: any[] = [];
  proc.on("audio_level", (msg) => levels.push(msg));

  const startPromise = proc.start();
  setTimeout(() => {
    mockBinary.emitReady();
    mockBinary.emitAudioLevel({ rms: 0.5, peak: 0.8, fft: [{ freq: 125, magnitude: 0.4 }], timestamp: 123 });
  }, 10);

  await startPromise;
  await new Promise((r) => setTimeout(r, 50));

  expect(levels.length).toBe(1);
  expect(levels[0].rms).toBe(0.5);
  expect(levels[0].fft[0].freq).toBe(125);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/AudioProcess.test.ts`
Expected: FAIL — `emitAudioLevel` doesn't exist on mock, `audio_level` event not emitted.

**Step 3: Update MockAudioBinary**

Add to `test/mocks/MockAudioBinary.ts`:

```typescript
emitAudioLevel(data: { rms: number; peak: number; fft: { freq: number; magnitude: number }[]; timestamp: number }): void {
  const msg = JSON.stringify({ type: "audio_level", ...data });
  this.stderr.push(msg + "\n");
}
```

**Step 4: Update AudioProcess to emit audio_level**

In `src/audio/AudioProcess.ts`, in `processStderrMessages` handler (inside the stderr `on("data")` callback), add handling for `audio_level` messages:

After the existing `if (message.type === "ready"...)` and `else if (message.type === "error")` blocks, add:

```typescript
else if (message.type === "audio_level") {
  this.emit("audio_level", message);
}
```

Update `AudioProcessEvents` interface:

```typescript
export interface AudioProcessEvents {
  data: (chunk: Buffer) => void;
  ready: (message: BinaryMessage) => void;
  audio_level: (message: BinaryMessage) => void;
  error: (error: Error) => void;
  exit: (code: number | null, signal: string | null) => void;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/AudioProcess.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/audio/AudioProcess.ts test/mocks/MockAudioBinary.ts test/unit/AudioProcess.test.ts
git commit -m "feat: parse audio_level messages from Swift binaries"
```

---

## Task 9: TypeScript — Add preset resolution + pass audio level args to binaries

**Files:**
- Modify: `src/audio/SystemAudioSource.ts`
- Modify: `src/audio/MicAudioSource.ts`
- Create: `src/audio/audioLevelPresets.ts`

**Step 1: Create preset resolver**

Create `src/audio/audioLevelPresets.ts`:

```typescript
import type { AudioLevelsConfig } from "../types.js";

export interface ResolvedAudioLevels {
  enabled: boolean;
  fftBins: number;
  intervalMs: number;
}

const PRESETS: Record<string, ResolvedAudioLevels> = {
  spectrogram: { enabled: true, fftBins: 128, intervalMs: 50 },
  "vu-meter": { enabled: true, fftBins: 0, intervalMs: 100 },
  waveform: { enabled: true, fftBins: 0, intervalMs: 20 },
};

export function resolveAudioLevels(config?: AudioLevelsConfig): ResolvedAudioLevels {
  if (!config) return { enabled: false, fftBins: 0, intervalMs: 50 };

  if (config.preset) {
    return PRESETS[config.preset] ?? { enabled: false, fftBins: 0, intervalMs: 50 };
  }

  return {
    enabled: config.enabled ?? false,
    fftBins: config.fftBins ?? 128,
    intervalMs: config.intervalMs ?? 50,
  };
}
```

**Step 2: Update SystemAudioSource**

In `SystemAudioSource` constructor, accept optional `AudioLevelsConfig` and add CLI args:

```typescript
constructor(
  options: SystemAudioOptions = {},
  logLevel?: "debug" | "info" | "warn" | "error" | "silent",
  audioLevels?: AudioLevelsConfig
) {
  const args: string[] = [];
  // ... existing args ...

  const levels = resolveAudioLevels(audioLevels);
  if (levels.enabled) {
    args.push("--enable-levels");
    args.push("--level-interval-ms", String(levels.intervalMs));
    args.push("--fft-bins", String(levels.fftBins));
  }

  super({ ... });
}
```

**Step 3: Update MicAudioSource**

Same pattern. Also add `deviceId` forwarding:

```typescript
constructor(
  options: MicOptions = {},
  logLevel?: "debug" | "info" | "warn" | "error" | "silent",
  audioLevels?: AudioLevelsConfig
) {
  const args: string[] = [];
  // ... existing args ...

  if (options.deviceId) {
    args.push("--device-id", options.deviceId);
  }

  const levels = resolveAudioLevels(audioLevels);
  if (levels.enabled) {
    args.push("--enable-levels");
    args.push("--level-interval-ms", String(levels.intervalMs));
    args.push("--fft-bins", String(levels.fftBins));
  }

  super({ ... });
}
```

Add static method for device listing:

```typescript
static async listDevices(
  logLevel?: "debug" | "info" | "warn" | "error" | "silent"
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
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/audio/audioLevelPresets.ts src/audio/SystemAudioSource.ts src/audio/MicAudioSource.ts
git commit -m "feat: add audio level presets and pass config to Swift binaries"
```

---

## Task 10: TypeScript — Wire audio levels through TranscriptionStream

**Files:**
- Modify: `src/transcription/TranscriptionStream.ts`

**Step 1: Forward audio_level from source to stream events**

In `TranscriptionStream.start()`, after the existing `this.source.on("data", ...)`:

```typescript
this.source.on("audio_level", (msg: BinaryMessage) => {
  this.emit("audio_level", msg);
});
```

Update `TranscriptionStreamEvents`:

```typescript
export interface TranscriptionStreamEvents {
  transcript: (event: TranscriptEvent) => void;
  utterance_end: (event: UtteranceEndEvent) => void;
  audio_level: (message: BinaryMessage) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/transcription/TranscriptionStream.ts
git commit -m "feat: forward audio_level events through TranscriptionStream"
```

---

## Task 11: TypeScript — Wire audio levels + mic selection in TranscriptionManager

**Files:**
- Modify: `src/transcription/TranscriptionManager.ts`

**Step 1: Update constructor and start() to pass audioLevels config**

Pass `this.config.audioLevels` when creating `SystemAudioSource` and `MicAudioSource`.

**Step 2: Wire audio_level events in wireStreamEvents**

```typescript
stream.on("audio_level", (msg: BinaryMessage) => {
  const event: AudioLevelEvent = {
    source: stream === this.systemStream ? "system" as const : "mic" as const,
    rms: msg.rms ?? 0,
    peak: msg.peak ?? 0,
    fft: msg.fft ?? [],
    timestamp: msg.timestamp ?? 0,
  };
  this.emit("audio_level", event);
});
```

Note: Need to pass the stream's label or compare stream references to determine source. Better approach: pass the label to `wireStreamEvents`:

```typescript
private wireStreamEvents(stream: TranscriptionStream, source: AudioSource): void {
```

**Step 3: Add listInputDevices static method**

```typescript
static async listInputDevices(
  logLevel?: "debug" | "info" | "warn" | "error" | "silent"
): Promise<InputDevice[]> {
  const json = await MicAudioSource.listDevices(logLevel);
  return JSON.parse(json) as InputDevice[];
}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/transcription/TranscriptionManager.ts
git commit -m "feat: wire audio levels and mic selection into TranscriptionManager"
```

---

## Task 12: TypeScript — Create DeepgramBatch class

**Files:**
- Create: `src/deepgram/DeepgramBatch.ts`
- Test: `test/unit/DeepgramBatch.test.ts`

**Step 1: Write the failing test**

Create `test/unit/DeepgramBatch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepgramBatch } from "../../src/deepgram/DeepgramBatch.js";

describe("DeepgramBatch", () => {
  it("accumulates audio chunks", () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key", model: "nova-3" },
      16000,
      "silent"
    );

    batch.addChunk(Buffer.alloc(640));
    batch.addChunk(Buffer.alloc(640));
    expect(batch.bytesRecorded).toBe(1280);
  });

  it("builds correct URL with query params", () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key", model: "nova-3", language: "en", punctuate: true },
      16000,
      "silent"
    );

    const url = (batch as any).buildUrl();
    expect(url).toContain("/v1/listen");
    expect(url).toContain("model=nova-3");
    expect(url).toContain("sample_rate=16000");
    expect(url).toContain("encoding=linear16");
  });

  it("rejects transcribe() with no audio", async () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key" },
      16000,
      "silent"
    );

    await expect(batch.transcribe()).rejects.toThrow("No audio");
  });

  it("resets after clear()", () => {
    const batch = new DeepgramBatch(
      { apiKey: "test-key" },
      16000,
      "silent"
    );

    batch.addChunk(Buffer.alloc(640));
    batch.clear();
    expect(batch.bytesRecorded).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/DeepgramBatch.test.ts`
Expected: FAIL — module doesn't exist.

**Step 3: Implement DeepgramBatch**

Create `src/deepgram/DeepgramBatch.ts`:

```typescript
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";
import type { DeepgramOptions, TranscriptEvent, TranscriptWord } from "../types.js";
import { ConnectionError } from "../errors.js";
import { Logger } from "../util/logger.js";

const DEFAULT_API_URL = "https://api.deepgram.com/v1/listen";

export class DeepgramBatch {
  private readonly options: DeepgramOptions;
  private readonly sampleRate: number;
  private readonly logger: Logger;
  private chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(
    options: DeepgramOptions,
    sampleRate: number,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    this.options = options;
    this.sampleRate = sampleRate;
    this.logger = new Logger("deepgram-batch", logLevel);
  }

  get bytesRecorded(): number {
    return this.totalBytes;
  }

  addChunk(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }

  async transcribe(): Promise<TranscriptEvent[]> {
    if (this.totalBytes === 0) {
      throw new Error("No audio data recorded");
    }

    const audioBuffer = Buffer.concat(this.chunks);
    const url = this.buildUrl();
    this.logger.info(`Uploading ${audioBuffer.length} bytes to ${url}`);

    const response = await this.postAudio(url, audioBuffer);
    return this.parseResponse(response);
  }

  private buildUrl(): string {
    const base = this.options.apiUrl?.replace("wss://", "https://").replace("ws://", "http://")
      ?? DEFAULT_API_URL;
    const params = new URLSearchParams();

    params.set("encoding", this.options.encoding ?? "linear16");
    params.set("sample_rate", String(this.sampleRate));
    params.set("channels", "1");
    params.set("model", this.options.model ?? "nova-3");
    params.set("language", this.options.language ?? "en");

    if (this.options.punctuate !== false) {
      params.set("punctuate", "true");
    }
    if (this.options.smart_format !== false) {
      params.set("smart_format", "true");
    }
    if (this.options.utterances) {
      params.set("utterances", "true");
    }

    return `${base}?${params.toString()}`;
  }

  private postAudio(urlStr: string, audio: Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === "https:";
      const reqFn = isHttps ? request : httpRequest;

      const req = reqFn(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers: {
            Authorization: `Token ${this.options.apiKey}`,
            "Content-Type": "audio/raw",
            "Content-Length": audio.length,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch {
                reject(new ConnectionError(`Invalid JSON response from Deepgram`));
              }
            } else {
              reject(
                new ConnectionError(
                  `Deepgram batch API error (${res.statusCode}): ${body}`,
                  res.statusCode
                )
              );
            }
          });
        }
      );

      req.on("error", (err) => {
        reject(new ConnectionError(`Batch upload failed: ${err.message}`));
      });

      req.write(audio);
      req.end();
    });
  }

  private parseResponse(response: any): TranscriptEvent[] {
    const events: TranscriptEvent[] = [];
    const channels = response.results?.channels ?? [];

    for (const channel of channels) {
      for (const alt of channel.alternatives ?? []) {
        if (!alt.transcript) continue;

        const words: TranscriptWord[] = (alt.words ?? []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          punctuated_word: w.punctuated_word,
        }));

        events.push({
          source: "system", // source will be set by the caller
          transcript: alt.transcript,
          is_final: true,
          confidence: alt.confidence ?? 0,
          words,
          duration: response.metadata?.duration,
        });
      }
    }

    return events;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/DeepgramBatch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deepgram/DeepgramBatch.ts test/unit/DeepgramBatch.test.ts
git commit -m "feat: add DeepgramBatch class for pre-recorded API"
```

---

## Task 13: TypeScript — Create BatchTranscriptionStream

**Files:**
- Create: `src/transcription/BatchTranscriptionStream.ts`

**Step 1: Implement BatchTranscriptionStream**

```typescript
import { EventEmitter } from "node:events";
import type { AudioProcess } from "../audio/AudioProcess.js";
import { DeepgramBatch } from "../deepgram/DeepgramBatch.js";
import type {
  AudioSource,
  DeepgramOptions,
  TranscriptEvent,
  BatchProgressEvent,
  BinaryMessage,
} from "../types.js";
import { Logger } from "../util/logger.js";

export class BatchTranscriptionStream extends EventEmitter {
  private readonly source: AudioProcess;
  private readonly batch: DeepgramBatch;
  private readonly label: AudioSource;
  private readonly logger: Logger;
  private running = false;

  constructor(
    source: AudioProcess,
    deepgramOptions: DeepgramOptions,
    sampleRate: number,
    label: AudioSource,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    super();
    this.source = source;
    this.label = label;
    this.logger = new Logger(`batch-stream-${label}`, logLevel);
    this.batch = new DeepgramBatch(deepgramOptions, sampleRate, logLevel);
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.source.on("data", (chunk: Buffer) => {
      this.batch.addChunk(chunk);
    });

    this.source.on("audio_level", (msg: BinaryMessage) => {
      this.emit("audio_level", msg);
    });

    this.source.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.source.on("exit", () => {
      if (this.running) {
        this.logger.warn("Audio source exited unexpectedly");
        this.running = false;
        this.emit("stopped");
      }
    });

    await this.source.start();
    this.running = true;
    this.emit("started");

    const progress: BatchProgressEvent = { phase: "recording", bytesRecorded: 0 };
    this.emit("batch_progress", progress);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    await this.source.stop();
    this.source.removeAllListeners();

    this.emit("batch_progress", { phase: "uploading", bytesRecorded: this.batch.bytesRecorded });

    try {
      this.emit("batch_progress", { phase: "processing", bytesRecorded: this.batch.bytesRecorded });
      const events = await this.batch.transcribe();

      for (const event of events) {
        event.source = this.label;
        this.emit("transcript", event);
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }

    this.batch.clear();
    this.emit("stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/transcription/BatchTranscriptionStream.ts
git commit -m "feat: add BatchTranscriptionStream for batch mode"
```

---

## Task 14: TypeScript — Wire batch mode into TranscriptionManager

**Files:**
- Modify: `src/transcription/TranscriptionManager.ts`

**Step 1: Update start() to choose stream type based on mode**

Import `BatchTranscriptionStream`. In `start()`, check `this.config.mode`:

```typescript
const mode = this.config.mode ?? "streaming";

if (systemEnabled) {
  const source = new SystemAudioSource(this.config.systemAudio, this.config.logLevel, this.config.audioLevels);

  if (mode === "batch") {
    this.systemStream = new BatchTranscriptionStream(
      source, this.config.deepgram,
      this.config.systemAudio?.sampleRate ?? 16000,
      "system", this.config.logLevel
    ) as any; // shares same event interface
  } else {
    this.systemStream = new TranscriptionStream(
      source, this.config.deepgram,
      this.config.systemAudio?.sampleRate ?? 16000,
      "system", this.config.logLevel
    );
  }
  this.wireStreamEvents(this.systemStream, "system");
  startPromises.push(this.systemStream.start());
}
```

Same pattern for mic stream.

**Step 2: Wire batch_progress events in wireStreamEvents**

```typescript
stream.on("batch_progress", (event: BatchProgressEvent) => {
  this.emit("batch_progress", event);
});
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/transcription/TranscriptionManager.ts
git commit -m "feat: wire batch mode into TranscriptionManager"
```

---

## Task 15: TypeScript — Update exports in index.ts

**Files:**
- Modify: `src/index.ts`

**Step 1: Add new type exports**

```typescript
export type {
  AudioSource,
  PermissionStatus,
  PermissionResult,
  TranscriptWord,
  TranscriptEvent,
  UtteranceEndEvent,
  AudioLevelEvent,
  AudioLevelPreset,
  AudioLevelsConfig,
  BatchProgressEvent,
  InputDevice,
  FFTBin,
  TranscriptionMode,
  DeepgramOptions,
  SystemAudioOptions,
  MicOptions,
  DeepgramElectronConfig,
  DeepgramElectronEvents,
} from "./types.js";
```

**Step 2: Verify TypeScript compiles and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export new types for audio levels, batch, and mic selection"
```

---

## Task 16: Run all tests and fix any issues

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Run lint**

Run: `npm run lint`
Expected: Clean or only pre-existing warnings.

**Step 4: Fix any failures found in steps 1-3**

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test and lint issues from new features"
```

---

## Task 17: Build and integration smoke test

**Step 1: Build TypeScript**

Run: `npm run build`
Expected: dist/ output generated.

**Step 2: Build native binaries**

Run: `npm run build:native`
Expected: Universal binaries in bin/.

**Step 3: Smoke test device listing**

Run: `./bin/dg-mic-audio --list-devices`
Expected: JSON array with at least one device.

**Step 4: Final commit**

```bash
git add -A
git commit -m "build: final build with all three features"
```
